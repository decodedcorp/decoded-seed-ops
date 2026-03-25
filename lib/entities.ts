import { getServerEnv } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { getServerSupabase } from "@/lib/supabase/server";
import type {
  ArtistSummary,
  BrandSummary,
  GroupMemberSummary,
  GroupMembersByGroup,
} from "@/types";

type DbErrorLike = { message: string; code?: string; details?: string; hint?: string };

type RawBrandRow = {
  id: string;
  name_en: string | null;
  name_ko: string | null;
  logo_image_url: string | null;
  primary_instagram_account_id: string | null;
  created_at: string;
  updated_at: string;
};

type RawArtistRow = {
  id: string;
  name_en: string | null;
  name_ko: string | null;
  profile_image_url: string | null;
  primary_instagram_account_id: string | null;
  created_at: string;
  updated_at: string;
};

type RawInstagramAccountLite = {
  id: string;
  username: string | null;
  display_name: string | null;
  name_en: string | null;
  name_ko: string | null;
  account_type?: string | null;
  profile_image_url?: string | null;
};

type RawGroupMemberRow = {
  group_account_id: string;
  artist_account_id: string;
  is_active: boolean | null;
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

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function accountLabel(account: RawInstagramAccountLite): string | null {
  return account.display_name || account.name_en || account.name_ko || account.username || null;
}

function containsTerm(value: string | null | undefined, term: string): boolean {
  if (!value) return false;
  return value.toLowerCase().includes(term);
}

async function getAccountMapByIds(db: any, ids: string[]): Promise<Map<string, RawInstagramAccountLite>> {
  if (!ids.length) return new Map();
  const rows: RawInstagramAccountLite[] = [];
  for (const chunk of chunkArray([...new Set(ids)], 100)) {
    const { data, error } = await db
      .from("instagram_accounts")
      .select("id,username,display_name,name_en,name_ko,account_type,profile_image_url")
      .in("id", chunk);
    if (error) {
      throw new ApiError(500, dbErrorMessage("instagram_accounts lookup failed", error));
    }
    rows.push(...((data ?? []) as RawInstagramAccountLite[]));
  }
  return new Map(rows.map((row) => [row.id, row]));
}

export async function getBrandsSummary(searchTerm?: string): Promise<BrandSummary[]> {
  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);

  const { data, error } = await db
    .from("brands")
    .select("id,name_en,name_ko,logo_image_url,primary_instagram_account_id,created_at,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new ApiError(500, dbErrorMessage("brands query failed", error));

  const brands = (data ?? []) as RawBrandRow[];
  const primaryIds = brands
    .map((row) => row.primary_instagram_account_id)
    .filter((id): id is string => Boolean(id));
  const accountById = await getAccountMapByIds(db, primaryIds);

  const mapped = brands.map((row) => {
    const account = row.primary_instagram_account_id
      ? accountById.get(row.primary_instagram_account_id)
      : undefined;
    return {
      id: row.id,
      name_en: row.name_en,
      name_ko: row.name_ko,
      logo_image_url: row.logo_image_url,
      primary_instagram_account_id: row.primary_instagram_account_id,
      primary_account_username: account?.username ?? null,
      primary_account_label: account ? accountLabel(account) : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  const term = searchTerm?.trim().toLowerCase();
  if (!term) return mapped;

  return mapped.filter(
    (row) =>
      containsTerm(row.name_en, term) ||
      containsTerm(row.name_ko, term) ||
      containsTerm(row.primary_account_username, term) ||
      containsTerm(row.primary_account_label, term),
  );
}

export async function getArtistsSummary(searchTerm?: string): Promise<ArtistSummary[]> {
  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);

  const { data, error } = await db
    .from("artists")
    .select("id,name_en,name_ko,profile_image_url,primary_instagram_account_id,created_at,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new ApiError(500, dbErrorMessage("artists query failed", error));

  const artists = (data ?? []) as RawArtistRow[];
  const primaryIds = artists
    .map((row) => row.primary_instagram_account_id)
    .filter((id): id is string => Boolean(id));
  const accountById = await getAccountMapByIds(db, primaryIds);
  const memberRows: RawGroupMemberRow[] = [];
  for (const chunk of chunkArray(primaryIds, 100)) {
    const { data: members, error: membersError } = await db
      .from("group_members")
      .select("group_account_id,artist_account_id,is_active")
      .in("artist_account_id", chunk)
      .eq("is_active", true);
    if (membersError) {
      throw new ApiError(500, dbErrorMessage("group_members query failed", membersError));
    }
    memberRows.push(...((members ?? []) as RawGroupMemberRow[]));
  }
  const groupIds = [...new Set(memberRows.map((row) => row.group_account_id))];
  const groupById = await getAccountMapByIds(db, groupIds);

  const groupNamesByArtistAccountId = new Map<string, string[]>();
  for (const member of memberRows) {
    const group = groupById.get(member.group_account_id);
    const label = group ? accountLabel(group) : null;
    if (!label) continue;
    const prev = groupNamesByArtistAccountId.get(member.artist_account_id) ?? [];
    if (!prev.includes(label)) prev.push(label);
    groupNamesByArtistAccountId.set(member.artist_account_id, prev);
  }

  const mapped = artists.map((row) => {
    const account = row.primary_instagram_account_id
      ? accountById.get(row.primary_instagram_account_id)
      : undefined;
    const groupNames = row.primary_instagram_account_id
      ? (groupNamesByArtistAccountId.get(row.primary_instagram_account_id) ?? [])
      : [];
    return {
      id: row.id,
      name_en: row.name_en,
      name_ko: row.name_ko,
      profile_image_url: row.profile_image_url,
      primary_instagram_account_id: row.primary_instagram_account_id,
      primary_account_username: account?.username ?? null,
      primary_account_label: account ? accountLabel(account) : null,
      group_names: groupNames,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  const term = searchTerm?.trim().toLowerCase();
  if (!term) return mapped;

  return mapped.filter(
    (row) =>
      containsTerm(row.name_en, term) ||
      containsTerm(row.name_ko, term) ||
      containsTerm(row.primary_account_username, term) ||
      containsTerm(row.primary_account_label, term) ||
      row.group_names.some((name) => containsTerm(name, term)),
  );
}

export async function getGroupMembersByGroup(searchTerm?: string): Promise<GroupMembersByGroup[]> {
  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);

  const { data: groupsData, error: groupsError } = await db
    .from("instagram_accounts")
    .select("id,username,display_name,name_en,name_ko")
    .eq("account_type", "group")
    .eq("needs_review", false)
    .eq("entity_ig_role", "primary")
    .eq("is_active", true)
    .order("updated_at", { ascending: false });
  if (groupsError) {
    throw new ApiError(500, dbErrorMessage("group accounts query failed", groupsError));
  }

  const groups = (groupsData ?? []) as RawInstagramAccountLite[];
  if (!groups.length) return [];

  const groupIds = groups.map((group) => group.id);
  const memberRows: RawGroupMemberRow[] = [];
  for (const chunk of chunkArray(groupIds, 100)) {
    const { data: members, error: membersError } = await db
      .from("group_members")
      .select("group_account_id,artist_account_id,is_active")
      .in("group_account_id", chunk)
      .eq("is_active", true);
    if (membersError) {
      throw new ApiError(500, dbErrorMessage("group_members by group query failed", membersError));
    }
    memberRows.push(...((members ?? []) as RawGroupMemberRow[]));
  }

  const memberIds = [...new Set(memberRows.map((row) => row.artist_account_id))];
  const memberById = await getAccountMapByIds(db, memberIds);

  const membersByGroup = new Map<string, GroupMemberSummary[]>();
  for (const row of memberRows) {
    const member = memberById.get(row.artist_account_id);
    if (!member) continue;
    const arr = membersByGroup.get(row.group_account_id) ?? [];
    arr.push({
      id: member.id,
      username: member.username ?? null,
      display_name: member.display_name ?? null,
      name_en: member.name_en ?? null,
      name_ko: member.name_ko ?? null,
      account_type: member.account_type ?? null,
      profile_image_url: member.profile_image_url ?? null,
    });
    membersByGroup.set(row.group_account_id, arr);
  }

  let mapped: GroupMembersByGroup[] = groups.map((group) => ({
    group_id: group.id,
    group_username: group.username ?? null,
    group_label: accountLabel(group) || group.id,
    members: membersByGroup.get(group.id) ?? [],
  }));

  const term = searchTerm?.trim().toLowerCase();
  if (term) {
    mapped = mapped.filter(
      (group) =>
        containsTerm(group.group_username, term) ||
        containsTerm(group.group_label, term) ||
        group.members.some(
          (member) =>
            containsTerm(member.username, term) ||
            containsTerm(member.display_name, term) ||
            containsTerm(member.name_en, term) ||
            containsTerm(member.name_ko, term),
        ),
    );
  }

  return mapped;
}
