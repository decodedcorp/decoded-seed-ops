import { ApiError } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";
import type { GroupOption, InstagramReviewAccount } from "@/types";

type DbErrorLike = { message: string; code?: string; details?: string; hint?: string };

type RawInstagramAccountReviewRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  name_en: string | null;
  name_ko: string | null;
  account_type: string | null;
  entity_ig_role: "primary" | "regional" | "secondary" | null;
  profile_image_url: string | null;
  needs_review: boolean | null;
  brand_id: string | null;
  artist_id: string | null;
};
type RawGroupMemberRow = {
  group_account_id: string;
  artist_account_id: string;
  is_active: boolean | null;
};
type RawGroupAccountRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  name_en: string | null;
  name_ko: string | null;
};

type ApprovalAccountType =
  | "artist"
  | "group"
  | "brand"
  | "source"
  | "influencer"
  | "place"
  | "other";

type ApproveInstagramAccountInput = {
  account_type: ApprovalAccountType;
  entity_ig_role: "primary" | "regional" | "secondary";
  group_account_id?: string | null;
  name_en: string | null;
  name_ko: string | null;
};

function dbErrorMessage(context: string, error: DbErrorLike): string {
  const parts = [
    `${context}: ${error.message}`,
    error.code ? `code=${error.code}` : null,
    error.details ? `details=${error.details}` : null,
    error.hint ? `hint=${error.hint}` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.join(" | ");
}

function mapReviewAccount(row: RawInstagramAccountReviewRow): InstagramReviewAccount {
  return {
    id: row.id,
    account_id: row.username,
    group_account_id: null,
    group_name: null,
    display_name: row.display_name,
    name_en: row.name_en,
    name_ko: row.name_ko,
    account_type: row.account_type,
    entity_ig_role: row.entity_ig_role,
    profile_image_url: row.profile_image_url,
    needs_review: row.needs_review,
    brand_id: row.brand_id,
    artist_id: row.artist_id,
  };
}

function groupDisplayName(account: RawGroupAccountRow): string {
  return account.display_name || account.name_en || account.name_ko || account.username || account.id;
}

export async function getApprovedGroupOptions(): Promise<GroupOption[]> {
  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);

  const { data, error } = await db
    .from("instagram_accounts")
    .select("id,username,display_name,name_en,name_ko")
    .eq("account_type", "group")
    .eq("needs_review", false)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new ApiError(500, dbErrorMessage("approved group options query failed", error));
  }

  return ((data ?? []) as RawGroupAccountRow[]).map((row) => ({
    id: row.id,
    label: groupDisplayName(row),
  }));
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function ensureBrandPrimaryEntity(
  db: any,
  account: RawInstagramAccountReviewRow,
  nameEn: string | null,
  nameKo: string | null,
  now: string,
): Promise<string> {
  const payload = {
    name_en: nameEn,
    name_ko: nameKo,
    logo_image_url: account.profile_image_url,
    primary_instagram_account_id: account.id,
    updated_at: now,
  };

  const { data: existing, error: lookupError } = await db
    .from("brands")
    .select("id")
    .eq("primary_instagram_account_id", account.id)
    .limit(1)
    .maybeSingle();
  if (lookupError) {
    throw new ApiError(500, dbErrorMessage("brands lookup failed", lookupError));
  }

  if (existing?.id) {
    const { error: updateError } = await db.from("brands").update(payload).eq("id", existing.id);
    if (updateError) {
      throw new ApiError(500, dbErrorMessage("brands update failed", updateError));
    }
    return existing.id as string;
  }

  const { data: inserted, error: insertError } = await db.from("brands").insert(payload).select("id").single();
  if (insertError) {
    throw new ApiError(500, dbErrorMessage("brands insert failed", insertError));
  }
  return (inserted as { id: string }).id;
}

async function ensureArtistPrimaryEntity(
  db: any,
  account: RawInstagramAccountReviewRow,
  nameEn: string | null,
  nameKo: string | null,
  now: string,
): Promise<string> {
  const payload = {
    name_en: nameEn,
    name_ko: nameKo,
    profile_image_url: account.profile_image_url,
    primary_instagram_account_id: account.id,
    updated_at: now,
  };

  const { data: existing, error: lookupError } = await db
    .from("artists")
    .select("id")
    .eq("primary_instagram_account_id", account.id)
    .limit(1)
    .maybeSingle();
  if (lookupError) {
    throw new ApiError(500, dbErrorMessage("artists lookup failed", lookupError));
  }

  if (existing?.id) {
    const { error: updateError } = await db.from("artists").update(payload).eq("id", existing.id);
    if (updateError) {
      throw new ApiError(500, dbErrorMessage("artists update failed", updateError));
    }
    return existing.id as string;
  }

  const { data: inserted, error: insertError } = await db
    .from("artists")
    .insert(payload)
    .select("id")
    .single();
  if (insertError) {
    throw new ApiError(500, dbErrorMessage("artists insert failed", insertError));
  }
  return (inserted as { id: string }).id;
}

export async function getInstagramAccountsForReview(): Promise<InstagramReviewAccount[]> {
  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);

  const { data, error } = await db
    .from("instagram_accounts")
    .select(
      "id,username,display_name,name_en,name_ko,account_type,entity_ig_role,profile_image_url,needs_review,brand_id,artist_id",
    )
    .eq("needs_review", true)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new ApiError(500, dbErrorMessage("instagram_accounts review query failed", error));
  }

  const reviewAccounts = ((data ?? []) as RawInstagramAccountReviewRow[]).map((row) => mapReviewAccount(row));
  if (!reviewAccounts.length) return reviewAccounts;

  const artistAccountIds = [...new Set(reviewAccounts.map((account) => account.id))];
  const memberRows: RawGroupMemberRow[] = [];
  for (const artistIdChunk of chunkArray(artistAccountIds, 100)) {
    const { data: groupMembers, error: membersError } = await db
      .from("group_members")
      .select("group_account_id,artist_account_id,is_active")
      .in("artist_account_id", artistIdChunk)
      .eq("is_active", true);
    if (membersError) {
      throw new ApiError(500, dbErrorMessage("group_members query failed", membersError));
    }
    memberRows.push(...((groupMembers ?? []) as RawGroupMemberRow[]));
  }
  if (!memberRows.length) return reviewAccounts;

  const groupIds = [...new Set(memberRows.map((row) => row.group_account_id))];
  const groupRows: RawGroupAccountRow[] = [];
  for (const groupIdChunk of chunkArray(groupIds, 100)) {
    const { data: groups, error: groupsError } = await db
      .from("instagram_accounts")
      .select("id,username,display_name,name_en,name_ko")
      .in("id", groupIdChunk);
    if (groupsError) {
      throw new ApiError(500, dbErrorMessage("group account query failed", groupsError));
    }
    groupRows.push(...((groups ?? []) as RawGroupAccountRow[]));
  }

  const groupLabelById = new Map(groupRows.map((row) => [row.id, groupDisplayName(row)]));
  const groupNamesByArtistId = new Map<string, Set<string>>();

  for (const member of memberRows) {
    const groupName = groupLabelById.get(member.group_account_id);
    if (!groupName) continue;
    const set = groupNamesByArtistId.get(member.artist_account_id) ?? new Set<string>();
    set.add(groupName);
    groupNamesByArtistId.set(member.artist_account_id, set);
  }

  return reviewAccounts.map((account) => {
    const groups = groupNamesByArtistId.get(account.id);
    const matched = memberRows.find((row) => row.artist_account_id === account.id);
    return {
      ...account,
      group_account_id: matched?.group_account_id ?? null,
      group_name: groups && groups.size > 0 ? [...groups].join(", ") : null,
    };
  });
}

export async function approveInstagramAccount(
  accountId: string,
  input: ApproveInstagramAccountInput,
): Promise<{ id: string; needs_review: false; brand_id: string | null; artist_id: string | null }> {
  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);

  const { data: accountRow, error: accountError } = await db
    .from("instagram_accounts")
    .select(
      "id,username,display_name,name_en,name_ko,account_type,entity_ig_role,profile_image_url,needs_review,brand_id,artist_id",
    )
    .eq("id", accountId)
    .maybeSingle();

  if (accountError) {
    throw new ApiError(500, dbErrorMessage("instagram_accounts get failed", accountError));
  }
  if (!accountRow) {
    throw new ApiError(404, "Instagram account not found");
  }

  const account = accountRow as RawInstagramAccountReviewRow;
  const now = new Date().toISOString();
  const accountType: ApprovalAccountType = input.account_type;
  const entityIgRole = input.entity_ig_role;
  const selectedGroupAccountId = input.group_account_id ?? null;
  const nameEn = input.name_en;
  const nameKo = input.name_ko;

  let brandId = account.brand_id;
  let artistId = account.artist_id;
  const isPrimaryBrand = accountType === "brand" && entityIgRole === "primary";
  const isPrimaryArtist = accountType === "artist" && entityIgRole === "primary";

  const updatePayload: Record<string, unknown> = {
    account_type: accountType,
    entity_ig_role: entityIgRole,
    name_en: nameEn,
    name_ko: nameKo,
    needs_review: false,
    updated_at: now,
  };

  if (isPrimaryBrand) {
    brandId = await ensureBrandPrimaryEntity(db, account, nameEn, nameKo, now);
    artistId = null;
    updatePayload.brand_id = brandId;
    updatePayload.artist_id = null;
  } else if (isPrimaryArtist) {
    artistId = await ensureArtistPrimaryEntity(db, account, nameEn, nameKo, now);
    brandId = null;
    updatePayload.artist_id = artistId;
    updatePayload.brand_id = null;
  } else {
    brandId = account.brand_id;
    artistId = account.artist_id;
  }

  const { error: updateError } = await db.from("instagram_accounts").update(updatePayload).eq("id", account.id);
  if (updateError) {
    throw new ApiError(500, dbErrorMessage("instagram_accounts approve update failed", updateError));
  }

  if (accountType === "artist" && selectedGroupAccountId) {
    const { error: memberError } = await db.from("group_members").upsert(
      {
        group_account_id: selectedGroupAccountId,
        artist_account_id: account.id,
        is_active: true,
        updated_at: now,
      },
      { onConflict: "group_account_id,artist_account_id" },
    );
    if (memberError) {
      throw new ApiError(500, dbErrorMessage("group_members upsert failed", memberError));
    }
  }

  return {
    id: account.id,
    needs_review: false,
    brand_id: brandId,
    artist_id: artistId,
  };
}
