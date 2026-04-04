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
  group_id: string;
  artist_id: string;
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
  group_id?: string | null;
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
    group_id: null,
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

const IG_USERNAME_RE = /^[a-zA-Z0-9._]{1,30}$/;

export function normalizeInstagramUsername(raw: string): string {
  const trimmed = raw.trim().replace(/^@+/, "");
  return trimmed.toLowerCase();
}

/**
 * 워크플로 백필 전용: username만 등록. needs_review=null 이므로 검수 대기 목록에는 나오지 않음.
 * 백필로 name_en/name_ko/profile_image_url 채운 뒤 needs_review=true 가 되면 검수 큐에 표시됨.
 */
export async function registerPendingInstagramUsername(
  rawUsername: string,
): Promise<{ id: string; username: string }> {
  const username = normalizeInstagramUsername(rawUsername);
  if (!username) {
    throw new ApiError(400, "Instagram username을 입력해 주세요.");
  }
  if (!IG_USERNAME_RE.test(username)) {
    throw new ApiError(400, "유효하지 않은 Instagram username입니다. (영문/숫자/._ 최대 30자)");
  }

  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await db
    .from("instagram_accounts")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existingError) {
    throw new ApiError(500, dbErrorMessage("instagram_accounts duplicate check failed", existingError));
  }
  if (existing?.id) {
    throw new ApiError(409, "이미 등록된 Instagram username입니다.");
  }

  const { data: inserted, error: insertError } = await db
    .from("instagram_accounts")
    .insert({
      username,
      account_type: "other",
      needs_review: null,
      is_active: true,
      updated_at: now,
    })
    .select("id,username")
    .single();

  if (insertError) {
    throw new ApiError(500, dbErrorMessage("instagram_accounts insert failed", insertError));
  }

  const row = inserted as { id: string; username: string };
  return { id: row.id, username: row.username };
}

export async function getApprovedGroupOptions(): Promise<GroupOption[]> {
  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);

  const { data: groupRows, error: groupsError } = await db
    .from("groups")
    .select("id,primary_instagram_account_id,name_en,name_ko")
    .order("updated_at", { ascending: false });
  if (groupsError) {
    throw new ApiError(500, dbErrorMessage("groups query failed", groupsError));
  }

  const groups = (groupRows ?? []) as Array<{
    id: string;
    primary_instagram_account_id: string | null;
    name_en: string | null;
    name_ko: string | null;
  }>;
  const primaryIds = groups
    .map((row) => row.primary_instagram_account_id)
    .filter((value): value is string => Boolean(value));
  if (!primaryIds.length) return [];

  const primaryAccounts: RawGroupAccountRow[] = [];
  for (const idChunk of chunkArray([...new Set(primaryIds)], 100)) {
    const { data, error } = await db
      .from("instagram_accounts")
      .select("id,username,display_name,name_en,name_ko")
      .in("id", idChunk)
      .eq("account_type", "group")
      .eq("needs_review", false)
      .eq("is_active", true);
    if (error) {
      throw new ApiError(500, dbErrorMessage("approved group accounts query failed", error));
    }
    primaryAccounts.push(...((data ?? []) as RawGroupAccountRow[]));
  }

  const primaryById = new Map(primaryAccounts.map((row) => [row.id, row]));
  return groups
    .map((group) => {
      const account = group.primary_instagram_account_id
        ? primaryById.get(group.primary_instagram_account_id)
        : undefined;
      if (!account) return null;
      return {
        id: group.id,
        label: group.name_en || group.name_ko || groupDisplayName(account),
      };
    })
    .filter((value): value is GroupOption => Boolean(value));
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

  const artistEntityIds = [
    ...new Set(
      reviewAccounts
        .map((account) => account.artist_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  if (!artistEntityIds.length) return reviewAccounts;

  const memberRows: RawGroupMemberRow[] = [];
  for (const artistIdChunk of chunkArray(artistEntityIds, 100)) {
    const { data: groupMembers, error: membersError } = await db
      .from("group_members")
      .select("group_id,artist_id,is_active")
      .in("artist_id", artistIdChunk)
      .eq("is_active", true);
    if (membersError) {
      throw new ApiError(500, dbErrorMessage("group_members query failed", membersError));
    }
    memberRows.push(...((groupMembers ?? []) as RawGroupMemberRow[]));
  }
  if (!memberRows.length) return reviewAccounts;

  const groupIds = [...new Set(memberRows.map((row) => row.group_id))];
  const groupRows: Array<{ id: string; name_en: string | null; name_ko: string | null }> = [];
  for (const groupIdChunk of chunkArray(groupIds, 100)) {
    const { data: groups, error: groupsError } = await db
      .from("groups")
      .select("id,name_en,name_ko")
      .in("id", groupIdChunk);
    if (groupsError) {
      throw new ApiError(500, dbErrorMessage("group account query failed", groupsError));
    }
    groupRows.push(...((groups ?? []) as Array<{ id: string; name_en: string | null; name_ko: string | null }>));
  }

  const groupLabelById = new Map(
    groupRows.map((row) => [row.id, row.name_en || row.name_ko || row.id]),
  );
  const groupNamesByArtistId = new Map<string, Set<string>>();

  for (const member of memberRows) {
    const groupName = groupLabelById.get(member.group_id);
    if (!groupName) continue;
    const set = groupNamesByArtistId.get(member.artist_id) ?? new Set<string>();
    set.add(groupName);
    groupNamesByArtistId.set(member.artist_id, set);
  }

  return reviewAccounts.map((account) => {
    const groups = account.artist_id ? groupNamesByArtistId.get(account.artist_id) : undefined;
    const matched = account.artist_id ? memberRows.find((row) => row.artist_id === account.artist_id) : undefined;
    return {
      ...account,
      group_id: matched?.group_id ?? null,
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
  const selectedGroupId = input.group_id ?? null;
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

  if (accountType === "group" && entityIgRole === "primary") {
    const { data: existing, error: lookupError } = await db
      .from("groups")
      .select("id")
      .eq("primary_instagram_account_id", account.id)
      .limit(1)
      .maybeSingle();
    if (lookupError) throw new ApiError(500, dbErrorMessage("groups lookup failed", lookupError));

    const payload = {
      name_en: nameEn,
      name_ko: nameKo,
      profile_image_url: account.profile_image_url,
      primary_instagram_account_id: account.id,
      updated_at: now,
    };

    if (existing?.id) {
      const { error: updateError } = await db.from("groups").update(payload).eq("id", existing.id);
      if (updateError) throw new ApiError(500, dbErrorMessage("groups update failed", updateError));
    } else {
      const { error: insertError } = await db.from("groups").insert(payload);
      if (insertError) throw new ApiError(500, dbErrorMessage("groups insert failed", insertError));
    }
  }

  const targetArtistId = artistId ?? account.artist_id;
  if (accountType === "artist" && selectedGroupId && targetArtistId) {
    const { error: memberError } = await db.from("group_members").upsert(
      {
        group_id: selectedGroupId,
        artist_id: targetArtistId,
        is_active: true,
        updated_at: now,
      },
      { onConflict: "group_id,artist_id" },
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
