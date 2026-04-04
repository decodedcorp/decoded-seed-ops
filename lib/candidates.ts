import { createHash } from "node:crypto";

import { ApiError } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import { uploadBufferToR2 } from "@/lib/storage/r2";
import { getServerSupabase } from "@/lib/supabase/server";
import { extFromMimeType, getDomainFromUrl, sanitizeFileName } from "@/lib/utils";
import type { AlternativeImage, GroupArtistOptions, SeedLook, SeedPostStatus } from "@/types";

type RawPost = {
  id: string;
  posted_at: string;
  tagged_account_ids?: unknown;
};
type RawImage = { id: string; post_id: string; image_url: string; image_hash: string; with_items: boolean };
type RawSeedPostInsertResult = { id: string; source_image_id: string | null; image_url: string };
type SeedPostSourceRow = { source_image_id: string | null };
type DbErrorLike = { message: string; code?: string; details?: string; hint?: string };
type RawInstagramAccount = {
  id: string;
  username: string | null;
  name_en: string | null;
  name_ko: string | null;
  account_type: string | null;
};
type RawGroupMember = { group_id: string; artist_id: string; is_active: boolean };
type RawArtistEntity = { id: string; primary_instagram_account_id: string | null };

type SourceSelectInput =
  | { mode: "alternative"; alternativeImageId: string }
  | { mode: "url"; sourceUrl: string }
  | { mode: "image_url"; imageUrl: string; sourceUrl?: string }
  | {
      mode: "group_artist";
      groupAccountId: string | null;
      artistAccountId: string | null;
      context?: string | null;
    }
  | {
      mode: "upload";
      fileName: string;
      mimeType?: string;
      fileBase64: string;
    };

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function mergeMediaSource(
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = asObjectRecord(existing) ?? {};
  return { ...base, ...patch };
}

function mergeMetadata(
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = asObjectRecord(existing) ?? {};
  return { ...base, ...patch };
}

function step1SourceUrlFromMedia(media: unknown): string | null {
  const m = asObjectRecord(media);
  if (!m) return null;
  const u = m.source_url;
  return typeof u === "string" && u.length > 0 ? u : null;
}

function mapLookFromRow(row: Record<string, unknown>, accountById: Map<string, RawInstagramAccount>): SeedLook {
  const gid = (row.group_account_id as string | null) ?? null;
  const aid = (row.artist_account_id as string | null) ?? null;
  const gAcc = gid ? accountById.get(gid) : undefined;
  const aAcc = aid ? accountById.get(aid) : undefined;

  return {
    id: String(row.id),
    source_post_id: (row.source_post_id as string | null) ?? null,
    source_image_id: (row.source_image_id as string | null) ?? null,
    image_url: String(row.image_url),
    media_source: asObjectRecord(row.media_source),
    context: (row.context as string | null) ?? null,
    group_account_id: gid,
    artist_account_id: aid,
    group_label: gAcc ? accountDisplayName(gAcc) : null,
    artist_label: aAcc ? accountDisplayName(aAcc) : null,
    status: row.status as SeedPostStatus,
    publish_error: (row.publish_error as string | null) ?? null,
    metadata: asObjectRecord(row.metadata),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function toComparableTime(value: string): number | null {
  if (/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(value)) {
    const [datePart, timePart] = value.split("_");
    const normalized = `${datePart}T${timePart.replace(/-/g, ":")}Z`;
    const time = Date.parse(normalized);
    return Number.isNaN(time) ? null : time;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function isPostAfterStart(postTs: string, startTs: string): boolean {
  const postTime = toComparableTime(postTs);
  const startTime = toComparableTime(startTs);

  if (postTime !== null && startTime !== null) {
    return postTime >= startTime;
  }

  return postTs >= startTs;
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

function accountDisplayName(account: RawInstagramAccount): string | null {
  return account.name_en || account.name_ko || account.username || null;
}

function parseTaggedAccountIds(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v.length > 0);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
    }
    try {
      const parsed = JSON.parse(trimmed);
      return parseTaggedAccountIds(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

/** REQUIREMENT 2-1a: single group / single artist auto; multiple artists -> artist null */
function resolveAutoGroupArtist(
  taggedIds: string[],
  accountById: Map<string, RawInstagramAccount>,
): { groupAccountId: string | null; artistAccountId: string | null } {
  const taggedAccounts = taggedIds
    .map((id) => accountById.get(id))
    .filter((v): v is RawInstagramAccount => Boolean(v));
  const groupAccounts = taggedAccounts.filter((a) => a.account_type === "group");
  const artistAccounts = taggedAccounts.filter((a) => a.account_type === "artist");

  const groupAccountId = groupAccounts.length === 1 ? groupAccounts[0].id : null;
  let artistAccountId: string | null =
    artistAccounts.length === 1 ? artistAccounts[0].id : null;
  if (artistAccounts.length > 1) {
    artistAccountId = null;
  }

  return { groupAccountId, artistAccountId };
}

async function fetchAccountsByIds(
  db: any,
  ids: string[],
): Promise<Map<string, RawInstagramAccount>> {
  if (!ids.length) return new Map();

  const rows: RawInstagramAccount[] = [];
  for (const idChunk of chunkArray([...new Set(ids)], 200)) {
    const { data, error } = await db
      .from("instagram_accounts")
      .select("id,username,name_en,name_ko,account_type")
      .in("id", idChunk);
    if (error) throw new ApiError(500, dbErrorMessage("instagram_accounts query failed", error));
    rows.push(...((data ?? []) as RawInstagramAccount[]));
  }

  return new Map(rows.map((row) => [row.id, row]));
}

async function attachLabelsToLooks(looks: SeedLook[]): Promise<SeedLook[]> {
  const ids = new Set<string>();
  for (const look of looks) {
    if (look.group_account_id) ids.add(look.group_account_id);
    if (look.artist_account_id) ids.add(look.artist_account_id);
  }
  if (!ids.size) return looks;

  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);
  const accountById = await fetchAccountsByIds(db, [...ids]);

  return looks.map((look) =>
    mapLookFromRow(
      {
        id: look.id,
        source_post_id: look.source_post_id,
        source_image_id: look.source_image_id,
        image_url: look.image_url,
        media_source: look.media_source,
        context: look.context,
        group_account_id: look.group_account_id,
        artist_account_id: look.artist_account_id,
        status: look.status,
        publish_error: look.publish_error,
        metadata: look.metadata,
        created_at: look.created_at,
        updated_at: look.updated_at,
      },
      accountById,
    ),
  );
}

const SEED_POST_SELECT =
  "id,source_post_id,source_image_id,image_url,media_source,context,group_account_id,artist_account_id,metadata,status,publish_error,created_at,updated_at";

export async function buildDraftCandidates(): Promise<{ created: number; skipped: number }> {
  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);

  const { data: withItemsImages, error: imagesError } = await db
    .from("images")
    .select("id,post_id,image_url,image_hash,with_items")
    .eq("with_items", true);

  if (imagesError) throw new ApiError(500, dbErrorMessage("images query failed", imagesError));
  const images = (withItemsImages ?? []) as RawImage[];
  if (!images.length) return { created: 0, skipped: 0 };

  const postIds = [...new Set(images.map((img) => img.post_id))];

  const postRows: RawPost[] = [];
  for (const idChunk of chunkArray(postIds, 200)) {
    const { data: posts, error: postsError } = await db
      .from("posts")
      .select("id,posted_at,tagged_account_ids")
      .in("id", idChunk);

    if (postsError) throw new ApiError(500, dbErrorMessage("posts query failed", postsError));
    postRows.push(...((posts ?? []) as RawPost[]));
  }

  const postById = new Map(postRows.map((post) => [post.id, post]));
  const sourcePosts = postRows.filter((post) => isPostAfterStart(post.posted_at, env.CANDIDATE_START_TS));
  if (!sourcePosts.length) return { created: 0, skipped: images.length };

  const taggedAccountIds = sourcePosts.flatMap((post) => parseTaggedAccountIds(post.tagged_account_ids));
  const accountById = await fetchAccountsByIds(db, taggedAccountIds);

  const imageById = new Map(images.map((image: RawImage) => [image.id, image]));

  const candidateRows = images
    .map((image: RawImage) => {
      const post = postById.get(image.post_id);
      if (!post) return null;
      if (!isPostAfterStart(post.posted_at, env.CANDIDATE_START_TS)) return null;

      const taggedIds = parseTaggedAccountIds(post.tagged_account_ids);
      const { groupAccountId, artistAccountId } = resolveAutoGroupArtist(taggedIds, accountById);

      return {
        source_post_id: post.id,
        source_image_id: image.id,
        image_url: image.image_url,
        media_source: {
          source_url: image.image_url,
          source_domain: getDomainFromUrl(image.image_url),
        },
        context: null,
        group_account_id: groupAccountId,
        artist_account_id: artistAccountId,
        status: "draft" as const,
        metadata: { source_posted_at: post.posted_at },
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (!candidateRows.length) return { created: 0, skipped: images.length };

  const targetImageIds = [...new Set(candidateRows.map((row) => row.source_image_id))];

  const existingRows: SeedPostSourceRow[] = [];
  for (const idChunk of chunkArray(targetImageIds, 200)) {
    const { data: existing, error: existingError } = await db
      .from("seed_posts")
      .select("source_image_id")
      .in("source_image_id", idChunk);

    if (existingError) {
      throw new ApiError(500, dbErrorMessage("seed_posts existing query failed", existingError));
    }
    existingRows.push(...((existing ?? []) as SeedPostSourceRow[]));
  }
  const existingImageIds = new Set(
    existingRows
      .map((row: SeedPostSourceRow) => row.source_image_id)
      .filter((value): value is string => Boolean(value)),
  );

  const rowsToInsert = candidateRows.filter((row) => !existingImageIds.has(row.source_image_id));

  if (!rowsToInsert.length) {
    return { created: 0, skipped: candidateRows.length };
  }

  const { data: insertedPosts, error: insertError } = await db
    .from("seed_posts")
    .insert(rowsToInsert)
    .select("id,source_image_id,image_url");

  if (insertError) throw new ApiError(500, dbErrorMessage("seed_posts insert failed", insertError));

  const assetRows = ((insertedPosts ?? []) as RawSeedPostInsertResult[])
    .map((sp: RawSeedPostInsertResult) => {
      const image = sp.source_image_id ? imageById.get(sp.source_image_id) : undefined;
      if (!image) return null;
      return {
        seed_post_id: sp.id,
        source_url: image.image_url,
        source_domain: getDomainFromUrl(image.image_url),
        archived_url: image.image_url,
        image_hash: image.image_hash,
        metadata: null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (assetRows.length) {
    const { error: assetError } = await db
      .from("seed_asset")
      .upsert(assetRows, { onConflict: "image_hash", ignoreDuplicates: true });
    if (assetError) throw new ApiError(500, dbErrorMessage("seed_asset upsert failed", assetError));
  }

  return {
    created: rowsToInsert.length,
    skipped: candidateRows.length - rowsToInsert.length,
  };
}

export async function getCandidatesByStatus(
  status: SeedPostStatus = "draft",
  accountFilter?: string,
): Promise<SeedLook[]> {
  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);

  let query = db.from("seed_posts").select(SEED_POST_SELECT).eq("status", status);

  if (accountFilter && accountFilter.trim()) {
    const term = accountFilter.trim();
    const pattern = `%${term}%`;
    const { data: matchAccounts, error: accError } = await db
      .from("instagram_accounts")
      .select("id")
      .or(`username.ilike.${pattern},name_en.ilike.${pattern},name_ko.ilike.${pattern}`);

    if (accError) {
      throw new ApiError(500, dbErrorMessage("instagram_accounts filter query failed", accError));
    }
    const matchIds = ((matchAccounts ?? []) as { id: string }[]).map((r) => r.id);
    if (!matchIds.length) {
      return [];
    }
    const orParts = matchIds.flatMap((id) => [
      `group_account_id.eq.${id}`,
      `artist_account_id.eq.${id}`,
    ]);
    query = query.or(orParts.join(","));
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) throw new ApiError(500, `Failed to fetch candidates: ${error.message}`);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const looks = rows.map((row) => mapLookFromRow(row, new Map()));
  return attachLabelsToLooks(looks);
}

export async function getCandidateById(id: string): Promise<SeedLook> {
  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);

  const { data, error } = await db
    .from("seed_posts")
    .select(SEED_POST_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, "Candidate not found");

  const [withLabel] = await attachLabelsToLooks([mapLookFromRow(data as Record<string, unknown>, new Map())]);
  return withLabel;
}

export async function getAlternativesForCandidate(id: string): Promise<AlternativeImage[]> {
  const candidate = await getCandidateById(id);
  if (!candidate.source_post_id) return [];

  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);

  const { data: imgs, error: imagesError } = await db
    .from("images")
    .select("id,image_url,image_hash,with_items")
    .eq("post_id", candidate.source_post_id)
    .eq("with_items", false);

  if (imagesError) throw new ApiError(500, imagesError.message);

  return ((imgs ?? []) as RawImage[]).map((image: RawImage) => ({
    image_id: image.id,
    image_url: image.image_url,
    image_hash: image.image_hash,
  }));
}

async function upsertAssetForLook(
  seedPostId: string,
  values: {
    sourceUrl: string;
    sourceDomain: string | null;
    imageHash: string;
    archivedUrl?: string;
    metadata?: Record<string, unknown> | null;
  },
) {
  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);

  const { error } = await db.from("seed_asset").upsert(
    {
      seed_post_id: seedPostId,
      source_url: values.sourceUrl,
      source_domain: values.sourceDomain,
      archived_url: values.archivedUrl ?? values.sourceUrl,
      image_hash: values.imageHash,
      metadata: values.metadata ?? null,
    },
    { onConflict: "image_hash", ignoreDuplicates: true },
  );

  if (error) throw new ApiError(500, error.message);
}

export async function selectCandidateSource(
  candidateId: string,
  input: SourceSelectInput,
): Promise<Record<string, string | null>> {
  const candidate = await getCandidateById(candidateId);
  if (candidate.status !== "draft") {
    throw new ApiError(409, "Source can be changed only in draft status");
  }

  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);
  const now = new Date().toISOString();

  if (input.mode === "alternative") {
    const alternatives = await getAlternativesForCandidate(candidateId);
    const chosen = alternatives.find((alt) => alt.image_id === input.alternativeImageId);
    if (!chosen) throw new ApiError(404, "Alternative image not found");

    const { error } = await db
      .from("seed_posts")
      .update({
        image_url: chosen.image_url,
        source_image_id: input.alternativeImageId,
        media_source: mergeMediaSource(candidate.media_source, {
          source_url: chosen.image_url,
          source_domain: getDomainFromUrl(chosen.image_url),
        }),
        updated_at: now,
      })
      .eq("id", candidateId);

    if (error) throw new ApiError(500, error.message);

    await upsertAssetForLook(candidateId, {
      sourceUrl: chosen.image_url,
      sourceDomain: getDomainFromUrl(chosen.image_url),
      imageHash: chosen.image_hash,
      archivedUrl: chosen.image_url,
      metadata: null,
    });

    return { selected: "alternative", image_url: chosen.image_url };
  }

  if (input.mode === "url") {
    const sourceDomain = getDomainFromUrl(input.sourceUrl);
    const nextMedia = mergeMediaSource(candidate.media_source, {
      source_url: input.sourceUrl,
      source_domain: sourceDomain,
    });

    const { error } = await db
      .from("seed_posts")
      .update({
        media_source: nextMedia,
        updated_at: now,
      })
      .eq("id", candidateId);

    if (error) throw new ApiError(500, error.message);

    return { selected: "url", source_url: input.sourceUrl };
  }

  if (input.mode === "group_artist") {
    const { error } = await db
      .from("seed_posts")
      .update({
        group_account_id: input.groupAccountId,
        artist_account_id: input.artistAccountId,
        context: input.context?.trim() ? input.context.trim() : null,
        updated_at: now,
      })
      .eq("id", candidateId);
    if (error) throw new ApiError(500, error.message);
    return {
      selected: "group_artist",
      group_account_id: input.groupAccountId,
      artist_account_id: input.artistAccountId,
    };
  }

  if (input.mode === "image_url") {
    const resolvedSourceUrl = input.sourceUrl ?? step1SourceUrlFromMedia(candidate.media_source);
    if (!resolvedSourceUrl) {
      throw new ApiError(400, "Save Step1 source URL before image_url ingest, or pass sourceUrl in body");
    }

    const sourceDomain = getDomainFromUrl(resolvedSourceUrl);
    const nextMedia = mergeMediaSource(candidate.media_source, {
      source_url: resolvedSourceUrl,
      source_domain: sourceDomain,
    });

    const response = await fetch(input.imageUrl);
    if (!response.ok) {
      throw new ApiError(400, `Failed to fetch image URL: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    if (!fileBuffer.length) {
      throw new ApiError(400, "Fetched image is empty");
    }

    const contentType = response.headers.get("content-type");
    const ext = extFromMimeType(contentType);
    const r2Key = `${env.CLOUDFLARE_R2_PREFIX}/${candidateId}/${Date.now()}-source.${ext}`;
    const { publicUrl } = await uploadBufferToR2(r2Key, fileBuffer, contentType ?? "application/octet-stream");
    const imageHash = createHash("sha256").update(fileBuffer).digest("hex");

    const { error } = await db
      .from("seed_posts")
      .update({
        image_url: publicUrl,
        media_source: nextMedia,
        updated_at: now,
      })
      .eq("id", candidateId);
    if (error) throw new ApiError(500, error.message);

    await upsertAssetForLook(candidateId, {
      sourceUrl: resolvedSourceUrl,
      sourceDomain,
      imageHash,
      archivedUrl: publicUrl,
      metadata: {
        ingest: "image_url",
        storage_provider: "cloudflare_r2",
        r2_bucket: env.CLOUDFLARE_R2_BUCKET,
        r2_key: r2Key,
        storage_bucket: env.CLOUDFLARE_R2_BUCKET,
        storage_path: r2Key,
        mime_type: contentType,
        file_size_bytes: fileBuffer.byteLength,
      },
    });

    return { selected: "image_url", image_url: publicUrl };
  }

  const fileBuffer = Buffer.from(input.fileBase64, "base64");
  if (!fileBuffer.length) throw new ApiError(400, "Upload file is empty");

  const fileName = sanitizeFileName(input.fileName || "upload.bin");
  const r2Key = `${env.CLOUDFLARE_R2_PREFIX}/${candidateId}/${Date.now()}-${fileName}`;
  const { publicUrl } = await uploadBufferToR2(r2Key, fileBuffer, input.mimeType ?? "application/octet-stream");
  const sourceUrl = step1SourceUrlFromMedia(candidate.media_source) ?? publicUrl;
  const sourceDomain = getDomainFromUrl(sourceUrl);
  const nextMedia = mergeMediaSource(candidate.media_source, {
    source_url: sourceUrl,
    source_domain: sourceDomain,
  });

  const { error } = await db
    .from("seed_posts")
    .update({
      image_url: publicUrl,
      media_source: nextMedia,
      updated_at: now,
    })
    .eq("id", candidateId);

  if (error) throw new ApiError(500, error.message);

  await upsertAssetForLook(candidateId, {
    sourceUrl,
    sourceDomain,
    imageHash: `${candidateId}:upload:${r2Key}`,
    archivedUrl: publicUrl,
    metadata: {
      ingest: "upload",
      storage_provider: "cloudflare_r2",
      r2_bucket: env.CLOUDFLARE_R2_BUCKET,
      r2_key: r2Key,
      storage_bucket: env.CLOUDFLARE_R2_BUCKET,
      storage_path: r2Key,
      mime_type: input.mimeType ?? null,
      file_size_bytes: fileBuffer.byteLength,
    },
  });

  return { selected: "upload", image_url: publicUrl, storage_path: r2Key };
}

function toAccountOption(account: RawInstagramAccount): { id: string; label: string } {
  const label = accountDisplayName(account) ?? account.username ?? account.id;
  return { id: account.id, label };
}

export async function getGroupArtistOptionsForCandidate(candidateId: string): Promise<GroupArtistOptions> {
  const candidate = await getCandidateById(candidateId);
  if (!candidate.source_post_id) {
    return { groupCandidates: [], artistCandidates: [] };
  }

  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);

  const { data: postRow, error: postError } = await db
    .from("posts")
    .select("id,tagged_account_ids")
    .eq("id", candidate.source_post_id)
    .maybeSingle();
  if (postError) throw new ApiError(500, dbErrorMessage("posts tagged accounts query failed", postError));
  if (!postRow) return { groupCandidates: [], artistCandidates: [] };

  const taggedIds = parseTaggedAccountIds(postRow.tagged_account_ids);
  const accountById = await fetchAccountsByIds(db, taggedIds);
  const taggedAccounts = taggedIds
    .map((id) => accountById.get(id))
    .filter((v): v is RawInstagramAccount => Boolean(v));

  const groupAccounts = taggedAccounts.filter((a) => a.account_type === "group");
  const taggedArtists = taggedAccounts.filter((a) => a.account_type === "artist");
  const groupCandidates = groupAccounts.map((a) => toAccountOption(a));

  const selectedGroupId = candidate.group_account_id;

  let groupMemberArtists: RawInstagramAccount[] = [];
  if (selectedGroupId) {
    const { data: groupEntity, error: groupEntityError } = await db
      .from("groups")
      .select("id")
      .eq("primary_instagram_account_id", selectedGroupId)
      .limit(1)
      .maybeSingle();
    if (groupEntityError) {
      throw new ApiError(500, dbErrorMessage("groups lookup failed", groupEntityError));
    }

    if (groupEntity?.id) {
      const { data: members, error: membersError } = await db
        .from("group_members")
        .select("group_id,artist_id,is_active")
        .eq("group_id", groupEntity.id)
        .eq("is_active", true);
      if (membersError) {
        throw new ApiError(500, dbErrorMessage("group_members query failed", membersError));
      } else {
        const artistEntityIds = ((members ?? []) as RawGroupMember[]).map((row) => row.artist_id);
        if (artistEntityIds.length) {
          const { data: artists, error: artistsError } = await db
            .from("artists")
            .select("id,primary_instagram_account_id")
            .in("id", artistEntityIds);
          if (artistsError) {
            throw new ApiError(500, dbErrorMessage("artists query failed", artistsError));
          }
          const artistAccountIds = ((artists ?? []) as RawArtistEntity[])
            .map((row) => row.primary_instagram_account_id)
            .filter((value): value is string => Boolean(value));
          const artistById = await fetchAccountsByIds(db, artistAccountIds);
          groupMemberArtists = artistAccountIds
            .map((id) => artistById.get(id))
            .filter((v): v is RawInstagramAccount => Boolean(v));
        }
      }
    }
  }

  const byId = new Map<string, RawInstagramAccount>();
  for (const a of [...groupMemberArtists, ...taggedArtists]) {
    byId.set(a.id, a);
  }
  const artistCandidates = [...byId.values()].map((a) => toAccountOption(a));

  return {
    groupCandidates,
    artistCandidates,
  };
}

export async function setCandidateReviewStatus(
  candidateId: string,
  outcome: "approved" | "rejected",
  actor: string,
  rejectedReason?: string,
): Promise<{ id: string; status: SeedPostStatus }> {
  const candidate = await getCandidateById(candidateId);

  if (candidate.status !== "draft") {
    throw new ApiError(409, "Only draft candidates can be transitioned");
  }

  const dbSupabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = dbSupabase.schema(env.SUPABASE_DB_SCHEMA);
  const now = new Date().toISOString();

  if (outcome === "approved") {
    const nextMetadata = mergeMetadata(candidate.metadata, {
      ops_approved_by: actor,
      ops_approved_at: now,
    });
    const { error } = await db
      .from("seed_posts")
      .update({
        status: "approved",
        publish_error: null,
        metadata: nextMetadata,
        updated_at: now,
      })
      .eq("id", candidateId);
    if (error) throw new ApiError(500, error.message);
    return { id: candidateId, status: "approved" };
  }

  const { error } = await db
    .from("seed_posts")
    .update({
      status: "failed",
      publish_error: rejectedReason?.trim() || "rejected",
      metadata: mergeMetadata(candidate.metadata, {
        ops_rejected_by: actor,
        ops_rejected_at: now,
      }),
      updated_at: now,
    })
    .eq("id", candidateId);
  if (error) throw new ApiError(500, error.message);

  return { id: candidateId, status: "failed" };
}
