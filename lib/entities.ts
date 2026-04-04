import { randomUUID } from "node:crypto";

import { getServerEnv } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { uploadEntityProfileToSupabaseStorage } from "@/lib/storage/supabase-profile";
import { getServerSupabase } from "@/lib/supabase/server";
import { extFromMimeType } from "@/lib/utils";
import type {
  ArtistSummary,
  BrandSummary,
  GroupMemberAddArtistOption,
  GroupMemberAddGroupOption,
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
  group_id: string;
  artist_id: string;
  is_active: boolean | null;
};

type EligibleGroupRow = {
  id: string;
  group_username: string;
  group_label: string;
  primary_instagram_account_id: string;
};

async function fetchEligibleGroupRows(db: any): Promise<EligibleGroupRow[]> {
  const { data: groupsData, error: groupsError } = await db
    .from("groups")
    .select("id,name_en,name_ko,primary_instagram_account_id")
    .order("updated_at", { ascending: false });
  if (groupsError) {
    throw new ApiError(500, dbErrorMessage("groups query failed", groupsError));
  }

  const groupsRaw = (groupsData ?? []) as Array<{
    id: string;
    name_en: string | null;
    name_ko: string | null;
    primary_instagram_account_id: string | null;
  }>;
  const primaryAccountIds = groupsRaw
    .map((row) => row.primary_instagram_account_id)
    .filter((value): value is string => Boolean(value));
  const primaryAccountsMap = await getAccountMapByIds(db, primaryAccountIds);

  const groups = groupsRaw
    .map((row) => {
      const primaryAccount = row.primary_instagram_account_id
        ? primaryAccountsMap.get(row.primary_instagram_account_id)
        : undefined;
      if (!primaryAccount) return null;
      if (
        primaryAccount.account_type !== "group" ||
        !primaryAccount.id ||
        !primaryAccount.username
      ) {
        return null;
      }
      return {
        id: row.id,
        group_username: primaryAccount.username,
        group_label: row.name_en || row.name_ko || accountLabel(primaryAccount) || row.id,
        primary_instagram_account_id: primaryAccount.id,
      };
    })
    .filter(
      (
        value,
      ): value is {
        id: string;
        group_username: string;
        group_label: string;
        primary_instagram_account_id: string;
      } => Boolean(value),
    );

  if (!groups.length) return [];

  const validPrimaryIds = groups.map((group) => group.primary_instagram_account_id);
  const { data: validPrimaryRows, error: primaryFilterError } = await db
    .from("instagram_accounts")
    .select("id,needs_review,entity_ig_role,account_type,is_active")
    .in("id", validPrimaryIds)
    .eq("account_type", "group")
    .eq("needs_review", false)
    .eq("entity_ig_role", "primary")
    .eq("is_active", true);
  if (primaryFilterError) {
    throw new ApiError(500, dbErrorMessage("primary group account filter failed", primaryFilterError));
  }
  const validPrimarySet = new Set(((validPrimaryRows ?? []) as Array<{ id: string }>).map((row) => row.id));
  return groups.filter((group) => validPrimarySet.has(group.primary_instagram_account_id));
}

async function assertGroupEligibleForMemberAdd(db: any, groupId: string): Promise<void> {
  const { data: group, error: groupError } = await db
    .from("groups")
    .select("id,name_en,name_ko,primary_instagram_account_id")
    .eq("id", groupId)
    .maybeSingle();
  if (groupError) {
    throw new ApiError(500, dbErrorMessage("groups lookup failed", groupError));
  }
  if (!group?.primary_instagram_account_id) {
    throw new ApiError(400, "그룹에 승인된 대표 Instagram 계정이 없습니다.");
  }

  const { data: ig, error: igError } = await db
    .from("instagram_accounts")
    .select("id,username,account_type,needs_review,entity_ig_role,is_active")
    .eq("id", group.primary_instagram_account_id)
    .maybeSingle();
  if (igError) {
    throw new ApiError(500, dbErrorMessage("instagram_accounts lookup failed", igError));
  }

  if (
    !ig ||
    ig.account_type !== "group" ||
    ig.needs_review !== false ||
    ig.entity_ig_role !== "primary" ||
    ig.is_active !== true ||
    !ig.username
  ) {
    throw new ApiError(
      400,
      "이 그룹에는 멤버를 추가할 수 없습니다. 대표 계정이 검수 완료·활성 상태인지 확인하세요.",
    );
  }
}

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

const ENTITY_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_ENTITY_IMAGE_BYTES = 8 * 1024 * 1024;

export async function createManualBrand(input: {
  nameEn: string | null;
  nameKo: string | null;
  imageBuffer: Buffer;
  contentType: string;
}): Promise<BrandSummary> {
  const nameEn = input.nameEn?.trim() || null;
  const nameKo = input.nameKo?.trim() || null;
  if (!nameEn && !nameKo) {
    throw new ApiError(400, "name_en 또는 name_ko 중 하나는 필요합니다.");
  }
  if (!ENTITY_IMAGE_MIME.has(input.contentType)) {
    throw new ApiError(400, "로고 이미지는 JPEG, PNG, WebP만 허용됩니다.");
  }
  if (input.imageBuffer.byteLength === 0) {
    throw new ApiError(400, "이미지 파일이 비어 있습니다.");
  }
  if (input.imageBuffer.byteLength > MAX_ENTITY_IMAGE_BYTES) {
    throw new ApiError(400, "이미지 크기는 8MB 이하여야 합니다.");
  }

  const env = getServerEnv();
  const dbSupabase = getServerSupabase() as any;
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);
  const id = randomUUID();
  const ext = extFromMimeType(input.contentType);
  const publicUrl = await uploadEntityProfileToSupabaseStorage({
    kind: "brand",
    entityId: id,
    ext,
    buffer: input.imageBuffer,
    contentType: input.contentType,
  });
  const now = new Date().toISOString();

  const { data, error } = await db
    .from("brands")
    .insert({
      id,
      name_en: nameEn,
      name_ko: nameKo,
      logo_image_url: publicUrl,
      primary_instagram_account_id: null,
      updated_at: now,
    })
    .select("id,name_en,name_ko,logo_image_url,primary_instagram_account_id,created_at,updated_at")
    .single();

  if (error) {
    throw new ApiError(500, dbErrorMessage("brands insert failed", error));
  }

  const row = data as RawBrandRow;
  return {
    id: row.id,
    name_en: row.name_en,
    name_ko: row.name_ko,
    logo_image_url: row.logo_image_url,
    primary_instagram_account_id: row.primary_instagram_account_id,
    primary_account_username: null,
    primary_account_label: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createManualArtist(input: {
  nameEn: string | null;
  nameKo: string | null;
  imageBuffer: Buffer;
  contentType: string;
}): Promise<ArtistSummary> {
  const nameEn = input.nameEn?.trim() || null;
  const nameKo = input.nameKo?.trim() || null;
  if (!nameEn && !nameKo) {
    throw new ApiError(400, "name_en 또는 name_ko 중 하나는 필요합니다.");
  }
  if (!ENTITY_IMAGE_MIME.has(input.contentType)) {
    throw new ApiError(400, "프로필 이미지는 JPEG, PNG, WebP만 허용됩니다.");
  }
  if (input.imageBuffer.byteLength === 0) {
    throw new ApiError(400, "이미지 파일이 비어 있습니다.");
  }
  if (input.imageBuffer.byteLength > MAX_ENTITY_IMAGE_BYTES) {
    throw new ApiError(400, "이미지 크기는 8MB 이하여야 합니다.");
  }

  const env = getServerEnv();
  const dbSupabase = getServerSupabase() as any;
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);
  const id = randomUUID();
  const ext = extFromMimeType(input.contentType);
  const publicUrl = await uploadEntityProfileToSupabaseStorage({
    kind: "artist",
    entityId: id,
    ext,
    buffer: input.imageBuffer,
    contentType: input.contentType,
  });
  const now = new Date().toISOString();

  const { data, error } = await db
    .from("artists")
    .insert({
      id,
      name_en: nameEn,
      name_ko: nameKo,
      profile_image_url: publicUrl,
      primary_instagram_account_id: null,
      updated_at: now,
    })
    .select("id,name_en,name_ko,profile_image_url,primary_instagram_account_id,created_at,updated_at")
    .single();

  if (error) {
    throw new ApiError(500, dbErrorMessage("artists insert failed", error));
  }

  const row = data as RawArtistRow;
  return {
    id: row.id,
    name_en: row.name_en,
    name_ko: row.name_ko,
    profile_image_url: row.profile_image_url,
    primary_instagram_account_id: row.primary_instagram_account_id,
    primary_account_username: null,
    primary_account_label: null,
    group_names: [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
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
  const artistEntityIds = artists.map((row) => row.id);
  const memberRows: RawGroupMemberRow[] = [];
  for (const chunk of chunkArray(artistEntityIds, 100)) {
    const { data: members, error: membersError } = await db
      .from("group_members")
      .select("group_id,artist_id,is_active")
      .in("artist_id", chunk)
      .eq("is_active", true);
    if (membersError) {
      throw new ApiError(500, dbErrorMessage("group_members query failed", membersError));
    }
    memberRows.push(...((members ?? []) as RawGroupMemberRow[]));
  }
  const groupIds = [...new Set(memberRows.map((row) => row.group_id))];
  const { data: groupsData, error: groupsError } = await db
    .from("groups")
    .select("id,name_en,name_ko")
    .in("id", groupIds);
  if (groupsError) throw new ApiError(500, dbErrorMessage("groups query failed", groupsError));
  const groupLabelById = new Map(
    ((groupsData ?? []) as Array<{ id: string; name_en: string | null; name_ko: string | null }>).map((row) => [
      row.id,
      row.name_en || row.name_ko || row.id,
    ]),
  );

  const groupNamesByArtistAccountId = new Map<string, string[]>();
  for (const member of memberRows) {
    const label = groupLabelById.get(member.group_id);
    if (!label) continue;
    const prev = groupNamesByArtistAccountId.get(member.artist_id) ?? [];
    if (!prev.includes(label)) prev.push(label);
    groupNamesByArtistAccountId.set(member.artist_id, prev);
  }

  const mapped = artists.map((row) => {
    const account = row.primary_instagram_account_id
      ? accountById.get(row.primary_instagram_account_id)
      : undefined;
    const groupNames = groupNamesByArtistAccountId.get(row.id) ?? [];
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

  const filteredGroups = await fetchEligibleGroupRows(db);
  if (!filteredGroups.length) return [];

  const groupIds = filteredGroups.map((group) => group.id);
  const memberRows: RawGroupMemberRow[] = [];
  for (const chunk of chunkArray(groupIds, 100)) {
    const { data: members, error: membersError } = await db
      .from("group_members")
      .select("group_id,artist_id,is_active")
      .in("group_id", chunk)
      .eq("is_active", true);
    if (membersError) {
      throw new ApiError(500, dbErrorMessage("group_members by group query failed", membersError));
    }
    memberRows.push(...((members ?? []) as RawGroupMemberRow[]));
  }

  const memberIds = [...new Set(memberRows.map((row) => row.artist_id))];
  const { data: artistRows, error: artistsError } = await db
    .from("artists")
    .select("id,name_en,name_ko,profile_image_url,primary_instagram_account_id")
    .in("id", memberIds);
  if (artistsError) throw new ApiError(500, dbErrorMessage("artists lookup failed", artistsError));
  const artists = (artistRows ?? []) as Array<{
    id: string;
    name_en: string | null;
    name_ko: string | null;
    profile_image_url: string | null;
    primary_instagram_account_id: string | null;
  }>;
  const artistPrimaryIds = artists
    .map((row) => row.primary_instagram_account_id)
    .filter((value): value is string => Boolean(value));
  const artistPrimaryById = await getAccountMapByIds(db, artistPrimaryIds);
  const artistById = new Map(artists.map((row) => [row.id, row]));

  const membersByGroup = new Map<string, GroupMemberSummary[]>();
  for (const row of memberRows) {
    const member = artistById.get(row.artist_id);
    if (!member) continue;
    const primary = member.primary_instagram_account_id
      ? artistPrimaryById.get(member.primary_instagram_account_id)
      : undefined;
    const arr = membersByGroup.get(row.group_id) ?? [];
    arr.push({
      id: member.id,
      username: primary?.username ?? null,
      display_name: primary?.display_name ?? null,
      name_en: member.name_en ?? null,
      name_ko: member.name_ko ?? null,
      account_type: "artist",
      profile_image_url: member.profile_image_url ?? null,
    });
    membersByGroup.set(row.group_id, arr);
  }

  let mapped: GroupMembersByGroup[] = filteredGroups.map((group) => ({
    group_id: group.id,
    group_username: group.group_username,
    group_label: group.group_label,
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

export async function listEligibleGroupsForMemberAdd(): Promise<GroupMemberAddGroupOption[]> {
  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);
  const rows = await fetchEligibleGroupRows(db);
  return rows.map((g) => ({
    id: g.id,
    label: g.group_label,
    group_username: g.group_username,
  }));
}

export async function getArtistPickOptionsForGroupMember(): Promise<GroupMemberAddArtistOption[]> {
  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);

  const { data, error } = await db
    .from("artists")
    .select("id,name_en,name_ko,primary_instagram_account_id")
    .order("updated_at", { ascending: false });
  if (error) {
    throw new ApiError(500, dbErrorMessage("artists list for picker failed", error));
  }

  const rows = (data ?? []) as Array<{
    id: string;
    name_en: string | null;
    name_ko: string | null;
    primary_instagram_account_id: string | null;
  }>;
  const primaryIds = rows
    .map((row) => row.primary_instagram_account_id)
    .filter((value): value is string => Boolean(value));
  const accountById = await getAccountMapByIds(db, primaryIds);

  return rows.map((row) => {
    const primary = row.primary_instagram_account_id
      ? accountById.get(row.primary_instagram_account_id)
      : undefined;
    const label =
      [row.name_en, row.name_ko].filter(Boolean).join(" · ") ||
      primary?.username ||
      primary?.display_name ||
      row.id;
    return { id: row.id, label };
  });
}

export async function addGroupMember(
  groupId: string,
  artistId: string,
): Promise<{ group_id: string; member: GroupMemberSummary }> {
  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);

  await assertGroupEligibleForMemberAdd(db, groupId);

  const { data: artistRow, error: artistError } = await db
    .from("artists")
    .select("id,name_en,name_ko,profile_image_url,primary_instagram_account_id")
    .eq("id", artistId)
    .maybeSingle();
  if (artistError) {
    throw new ApiError(500, dbErrorMessage("artist lookup failed", artistError));
  }
  if (!artistRow) {
    throw new ApiError(404, "아티스트를 찾을 수 없습니다.");
  }

  const now = new Date().toISOString();
  const { error: upsertError } = await db.from("group_members").upsert(
    {
      group_id: groupId,
      artist_id: artistId,
      is_active: true,
      updated_at: now,
    },
    { onConflict: "group_id,artist_id" },
  );
  if (upsertError) {
    throw new ApiError(500, dbErrorMessage("group_members upsert failed", upsertError));
  }

  const artist = artistRow as RawArtistRow;
  const artistPrimaryById = await getAccountMapByIds(
    db,
    artist.primary_instagram_account_id ? [artist.primary_instagram_account_id] : [],
  );
  const primary = artist.primary_instagram_account_id
    ? artistPrimaryById.get(artist.primary_instagram_account_id)
    : undefined;

  const member: GroupMemberSummary = {
    id: artist.id,
    username: primary?.username ?? null,
    display_name: primary?.display_name ?? null,
    name_en: artist.name_en ?? null,
    name_ko: artist.name_ko ?? null,
    account_type: "artist",
    profile_image_url: artist.profile_image_url ?? null,
  };

  return { group_id: groupId, member };
}

export async function reverifyBrand(brandId: string): Promise<{ id: string; instagram_accounts_updated: number }> {
  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await db
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .maybeSingle();
  if (existingError) throw new ApiError(500, dbErrorMessage("brand lookup failed", existingError));
  if (!existing) throw new ApiError(404, "Brand not found");

  const { data: updatedAccounts, error: accountUpdateError } = await db
    .from("instagram_accounts")
    .update({
      needs_review: true,
      brand_id: null,
      artist_id: null,
      entity_ig_role: null,
      entity_region_code: null,
      updated_at: now,
    })
    .eq("brand_id", brandId)
    .select("id");
  if (accountUpdateError) {
    throw new ApiError(500, dbErrorMessage("instagram_accounts brand reset failed", accountUpdateError));
  }

  const { error: deleteError } = await db.from("brands").delete().eq("id", brandId);
  if (deleteError) throw new ApiError(500, dbErrorMessage("brand delete failed", deleteError));

  return { id: brandId, instagram_accounts_updated: (updatedAccounts ?? []).length };
}

export async function reverifyArtist(
  artistId: string,
): Promise<{ id: string; instagram_accounts_updated: number }> {
  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await db
    .from("artists")
    .select("id")
    .eq("id", artistId)
    .maybeSingle();
  if (existingError) throw new ApiError(500, dbErrorMessage("artist lookup failed", existingError));
  if (!existing) throw new ApiError(404, "Artist not found");

  const { data: updatedAccounts, error: accountUpdateError } = await db
    .from("instagram_accounts")
    .update({
      needs_review: true,
      brand_id: null,
      artist_id: null,
      entity_ig_role: null,
      entity_region_code: null,
      updated_at: now,
    })
    .eq("artist_id", artistId)
    .select("id");
  if (accountUpdateError) {
    throw new ApiError(500, dbErrorMessage("instagram_accounts artist reset failed", accountUpdateError));
  }

  const { error: deleteError } = await db.from("artists").delete().eq("id", artistId);
  if (deleteError) throw new ApiError(500, dbErrorMessage("artist delete failed", deleteError));

  return { id: artistId, instagram_accounts_updated: (updatedAccounts ?? []).length };
}
