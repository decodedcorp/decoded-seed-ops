import { createHash } from "node:crypto";

import { ApiError } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";
import { getDomainFromUrl, sanitizeFileName } from "@/lib/utils";
import type { AlternativeImage, GroupArtistOptions, ReviewStatus, SeedLook } from "@/types";

type RawPost = {
  id: string;
  ts: string;
  caption_text?: string | null;
  tagged_account_ids?: unknown;
};
type RawImage = { id: string; image_url: string; image_hash: string; with_items: boolean };
type RawPostImageLink = { post_id: string; image_id: string };
type RawSeedPostInsertResult = { id: string; source_with_items_image_id: string | null; image_url: string };
type SeedPostSourceRow = { source_with_items_image_id: string | null };
type DbErrorLike = { message: string; code?: string; details?: string; hint?: string };
type RawInstagramAccount = {
  id: string;
  username: string | null;
  name_en: string | null;
  name_ko: string | null;
  account_type: string | null;
};
type RawGroupMember = { group_account_id: string; artist_account_id: string; is_active: boolean };

type SourceSelectInput =
  | { mode: "alternative"; alternativeImageId: string }
  | { mode: "url"; sourceUrl: string }
  | { mode: "image_url"; imageUrl: string; sourceUrl?: string }
  | { mode: "group_artist"; groupName: string | null; artistName: string | null }
  | {
      mode: "upload";
      fileName: string;
      mimeType?: string;
      fileBase64: string;
    };

function mapLook(row: Record<string, unknown>): SeedLook {
  return {
    id: String(row.id),
    source_post_id: (row.source_post_id as string | null) ?? null,
    source_with_items_image_id: (row.source_with_items_image_id as string | null) ?? null,
    group_name: (row.group_name as string | null) ?? null,
    artist_name: (row.artist_name as string | null) ?? null,
    image_url: String(row.image_url),
    title: (row.title as string | null) ?? null,
    source_url: (row.source_url as string | null) ?? null,
    source_domain: (row.source_domain as string | null) ?? null,
    review_status: row.review_status as ReviewStatus,
    ready_for_backend: Boolean(row.ready_for_backend),
    approved_by: (row.approved_by as string | null) ?? null,
    approved_at: (row.approved_at as string | null) ?? null,
    rejected_reason: (row.rejected_reason as string | null) ?? null,
    exported_to_backend_at: (row.exported_to_backend_at as string | null) ?? null,
    export_error: (row.export_error as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function toComparableTime(value: string): number | null {
  // Supports both "2025-01-01_00-00-00" and ISO-like timestamps.
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

  // Fallback for legacy string formats.
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

function inferSourceTypeFromUrl(url: string): "instagram" | "web" {
  const domain = getDomainFromUrl(url) ?? "";
  if (domain.includes("instagram.com")) {
    return "instagram";
  }
  return "web";
}

function extFromMimeType(mimeType: string | null): string {
  if (!mimeType) return "bin";
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "bin";
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

function resolveAutoGroupArtist(
  taggedIds: string[],
  accountById: Map<string, RawInstagramAccount>,
): { groupName: string | null; artistName: string | null } {
  const taggedAccounts = taggedIds
    .map((id) => accountById.get(id))
    .filter((v): v is RawInstagramAccount => Boolean(v));
  const groupAccounts = taggedAccounts.filter((a) => a.account_type === "artist_group");
  const artistAccounts = taggedAccounts.filter((a) => a.account_type === "artist");

  const groupName =
    groupAccounts.length === 1 ? accountDisplayName(groupAccounts[0]) : null;
  const artistName =
    artistAccounts.length === 1 ? accountDisplayName(artistAccounts[0]) : null;

  return {
    groupName: groupName ?? null,
    artistName: artistAccounts.length > 1 ? null : artistName ?? null,
  };
}

async function fetchAccountsByIds(
  db: any,
  ids: string[],
): Promise<Map<string, RawInstagramAccount>> {
  if (!ids.length) return new Map();

  const rows: RawInstagramAccount[] = [];
  for (const idChunk of chunkArray([...new Set(ids)], 200)) {
    const { data, error } = await db
      .from("instagram_account")
      .select("id,username,name_en,name_ko,account_type")
      .in("id", idChunk);
    if (error) throw new ApiError(500, dbErrorMessage("instagram_account query failed", error));
    rows.push(...((data ?? []) as RawInstagramAccount[]));
  }

  return new Map(rows.map((row) => [row.id, row]));
}

export async function buildDraftCandidates(): Promise<{ created: number; skipped: number }> {
  const supabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = supabase.schema(env.WAREHOUSE_DB_SCHEMA);

  const { data: withItemsImages, error: imagesError } = await db
    .from("image")
    .select("id,image_url,image_hash,with_items")
    .eq("with_items", true);

  if (imagesError) throw new ApiError(500, dbErrorMessage("image query failed", imagesError));
  const images = (withItemsImages ?? []) as RawImage[];
  if (!images.length) return { created: 0, skipped: 0 };

  const imageIds = images.map((image: RawImage) => image.id);

  const imageIdChunks = chunkArray(imageIds, 200);
  const links: RawPostImageLink[] = [];
  for (const idChunk of imageIdChunks) {
    const { data: postLinks, error: linksError } = await db
      .from("post_image")
      .select("post_id,image_id")
      .in("image_id", idChunk);

    if (linksError) throw new ApiError(500, dbErrorMessage("post_image query failed", linksError));
    links.push(...((postLinks ?? []) as RawPostImageLink[]));
  }

  if (!links.length) return { created: 0, skipped: imageIds.length };

  const postIds = [...new Set(links.map((link: RawPostImageLink) => link.post_id))];

  const postRows: RawPost[] = [];
  for (const idChunk of chunkArray(postIds, 200)) {
    const { data: posts, error: postsError } = await db
      .from("post")
      .select("id,ts,tagged_account_ids")
      .in("id", idChunk);

    if (postsError) throw new ApiError(500, dbErrorMessage("post query failed", postsError));
    postRows.push(...((posts ?? []) as RawPost[]));
  }

  const sourcePosts = postRows.filter((post) => isPostAfterStart(post.ts, env.CANDIDATE_START_TS));
  if (!sourcePosts.length) return { created: 0, skipped: imageIds.length };

  const taggedAccountIds = sourcePosts.flatMap((post) => parseTaggedAccountIds(post.tagged_account_ids));
  const accountById = await fetchAccountsByIds(db, taggedAccountIds);

  const postById = new Map(sourcePosts.map((post) => [post.id, post]));
  const imageById = new Map(images.map((image: RawImage) => [image.id, image]));

  const candidateRows = links
    .map((link: RawPostImageLink) => {
      const post = postById.get(link.post_id);
      const image = imageById.get(link.image_id);
      if (!post || !image) return null;
      const taggedIds = parseTaggedAccountIds(post.tagged_account_ids);
      const { groupName, artistName } = resolveAutoGroupArtist(taggedIds, accountById);

      return {
        source_post_id: post.id,
        source_with_items_image_id: image.id,
        image_url: image.image_url,
        title: null,
        group_name: groupName,
        artist_name: artistName,
        source_type: "instagram",
        source_url: image.image_url,
        source_domain: getDomainFromUrl(image.image_url),
        created_with_solutions: true,
        review_status: "draft",
        ready_for_backend: false,
        metadata: { source_ts: post.ts },
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (!candidateRows.length) return { created: 0, skipped: imageIds.length };

  const targetImageIds = [...new Set(candidateRows.map((row: (typeof candidateRows)[number]) => row.source_with_items_image_id))];

  const existingRows: SeedPostSourceRow[] = [];
  for (const idChunk of chunkArray(targetImageIds, 200)) {
    const { data: existing, error: existingError } = await db
      .from("seed_posts")
      .select("source_with_items_image_id")
      .in("source_with_items_image_id", idChunk);

    if (existingError) {
      throw new ApiError(500, dbErrorMessage("seed_posts existing query failed", existingError));
    }
    existingRows.push(...((existing ?? []) as SeedPostSourceRow[]));
  }
  const existingImageIds = new Set(
    existingRows
      .map((row: SeedPostSourceRow) => row.source_with_items_image_id)
      .filter((value): value is string => Boolean(value)),
  );

  const rowsToInsert = candidateRows.filter(
    (row) => !existingImageIds.has(row.source_with_items_image_id),
  );

  if (!rowsToInsert.length) {
    return { created: 0, skipped: candidateRows.length };
  }

  const { data: insertedPosts, error: insertError } = await db
    .from("seed_posts")
    .insert(rowsToInsert)
    .select("id,source_with_items_image_id,image_url");

  if (insertError) throw new ApiError(500, dbErrorMessage("seed_posts insert failed", insertError));

  const assetRows = ((insertedPosts ?? []) as RawSeedPostInsertResult[])
    .map((post: RawSeedPostInsertResult) => {
      const image = post.source_with_items_image_id
        ? imageById.get(post.source_with_items_image_id)
        : undefined;
      if (!image) return null;
      return {
        post_id: post.id,
        source_type: "instagram",
        source_url: image.image_url,
        source_domain: getDomainFromUrl(image.image_url),
        archived_url: image.image_url,
        image_hash: image.image_hash,
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
  status: ReviewStatus = "draft",
  accountFilter?: string,
): Promise<SeedLook[]> {
  const supabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = supabase.schema(env.WAREHOUSE_DB_SCHEMA);

  let query = db
    .from("seed_posts")
    .select(
      "id,source_post_id,source_with_items_image_id,group_name,artist_name,image_url,title,source_url,source_domain,review_status,ready_for_backend,approved_by,approved_at,rejected_reason,exported_to_backend_at,export_error,created_at,updated_at",
    )
    .eq("review_status", status);

  if (accountFilter && accountFilter.trim()) {
    query = query.ilike("group_name", `%${accountFilter.trim()}%`);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) throw new ApiError(500, `Failed to fetch candidates: ${error.message}`);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row: Record<string, unknown>) =>
    mapLook(row),
  );
}

export async function getCandidateById(id: string): Promise<SeedLook> {
  const supabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = supabase.schema(env.WAREHOUSE_DB_SCHEMA);

  const { data, error } = await db
    .from("seed_posts")
    .select(
      "id,source_post_id,source_with_items_image_id,group_name,artist_name,image_url,title,source_url,source_domain,review_status,ready_for_backend,approved_by,approved_at,rejected_reason,exported_to_backend_at,export_error,created_at,updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, "Candidate not found");

  return mapLook(data);
}

export async function getAlternativesForCandidate(id: string): Promise<AlternativeImage[]> {
  const candidate = await getCandidateById(id);
  if (!candidate.source_post_id) return [];

  const supabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = supabase.schema(env.WAREHOUSE_DB_SCHEMA);

  const { data: links, error: linksError } = await db
    .from("post_image")
    .select("image_id")
    .eq("post_id", candidate.source_post_id);

  if (linksError) throw new ApiError(500, linksError.message);
  const imageIds = ((links ?? []) as RawPostImageLink[]).map((link: RawPostImageLink) => link.image_id);
  if (!imageIds.length) return [];

  const { data: images, error: imagesError } = await db
    .from("image")
    .select("id,image_url,image_hash,with_items")
    .in("id", imageIds)
    .eq("with_items", false);

  if (imagesError) throw new ApiError(500, imagesError.message);

  return ((images ?? []) as RawImage[]).map((image: RawImage) => ({
    image_id: image.id,
    image_url: image.image_url,
    image_hash: image.image_hash,
  }));
}

async function upsertAssetForLook(
  postId: string,
  values: {
    sourceType: "instagram" | "web" | "manual_upload";
    sourceUrl: string;
    sourceDomain: string | null;
    imageHash: string;
    archivedUrl?: string;
    storagePath?: string;
    mimeType?: string;
    fileSizeBytes?: number;
  },
) {
  const supabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = supabase.schema(env.WAREHOUSE_DB_SCHEMA);

  const { error } = await db.from("seed_asset").upsert(
    {
      post_id: postId,
      source_type: values.sourceType,
      source_url: values.sourceUrl,
      source_domain: values.sourceDomain,
      archived_url: values.archivedUrl ?? values.sourceUrl,
      storage_bucket: values.storagePath ? env.WAREHOUSE_STORAGE_BUCKET : null,
      storage_path: values.storagePath ?? null,
      image_hash: values.imageHash,
      mime_type: values.mimeType ?? null,
      file_size_bytes: values.fileSizeBytes ?? null,
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
  if (candidate.review_status !== "draft") {
    throw new ApiError(409, "Source can be changed only in draft status");
  }

  const supabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = supabase.schema(env.WAREHOUSE_DB_SCHEMA);

  if (input.mode === "alternative") {
    const alternatives = await getAlternativesForCandidate(candidateId);
    const chosen = alternatives.find((alt) => alt.image_id === input.alternativeImageId);
    if (!chosen) throw new ApiError(404, "Alternative image not found");

    const { error } = await db
      .from("seed_posts")
      .update({
        image_url: chosen.image_url,
        source_type: "instagram",
        source_url: chosen.image_url,
        source_domain: getDomainFromUrl(chosen.image_url),
        ready_for_backend: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);

    if (error) throw new ApiError(500, error.message);

    await upsertAssetForLook(candidateId, {
      sourceType: "instagram",
      sourceUrl: chosen.image_url,
      sourceDomain: getDomainFromUrl(chosen.image_url),
      imageHash: chosen.image_hash,
      archivedUrl: chosen.image_url,
    });

    return { selected: "alternative", image_url: chosen.image_url };
  }

  if (input.mode === "url") {
    const sourceDomain = getDomainFromUrl(input.sourceUrl);
    const sourceType = inferSourceTypeFromUrl(input.sourceUrl);
    const { error } = await db
      .from("seed_posts")
      .update({
        source_type: sourceType,
        source_url: input.sourceUrl,
        source_domain: sourceDomain,
        // URL save step only stores provenance link; image is ingested separately.
        ready_for_backend: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);

    if (error) throw new ApiError(500, error.message);

    return { selected: "url", source_url: input.sourceUrl };
  }

  if (input.mode === "group_artist") {
    const { error } = await db
      .from("seed_posts")
      .update({
        group_name: input.groupName,
        artist_name: input.artistName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
    if (error) throw new ApiError(500, error.message);
    return { selected: "group_artist", group_name: input.groupName, artist_name: input.artistName };
  }

  if (input.mode === "image_url") {
    const resolvedSourceUrl = input.sourceUrl ?? candidate.source_url;
    if (!resolvedSourceUrl) {
      throw new ApiError(400, "sourceUrl is required before image_url ingest");
    }

    const sourceDomain = getDomainFromUrl(resolvedSourceUrl);
    const sourceType = inferSourceTypeFromUrl(resolvedSourceUrl);

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
    const storagePath = `${env.WAREHOUSE_STORAGE_PREFIX}/${candidateId}/${Date.now()}-source.${ext}`;

    const upload = await supabase.storage.from(env.WAREHOUSE_STORAGE_BUCKET).upload(storagePath, fileBuffer, {
      contentType: contentType ?? "application/octet-stream",
      upsert: false,
    });
    if (upload.error) throw new ApiError(500, upload.error.message);

    const publicUrl = `${env.WAREHOUSE_SUPABASE_URL}/storage/v1/object/public/${env.WAREHOUSE_STORAGE_BUCKET}/${storagePath}`;
    const imageHash = createHash("sha256").update(fileBuffer).digest("hex");

    const { error } = await db
      .from("seed_posts")
      .update({
        image_url: publicUrl,
        source_type: sourceType,
        source_url: resolvedSourceUrl,
        source_domain: sourceDomain,
        ready_for_backend: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
    if (error) throw new ApiError(500, error.message);

    await upsertAssetForLook(candidateId, {
      sourceType,
      sourceUrl: resolvedSourceUrl,
      sourceDomain,
      imageHash,
      archivedUrl: publicUrl,
      storagePath,
      mimeType: contentType ?? undefined,
      fileSizeBytes: fileBuffer.byteLength,
    });

    return { selected: "image_url", image_url: publicUrl };
  }

  const fileBuffer = Buffer.from(input.fileBase64, "base64");
  if (!fileBuffer.length) throw new ApiError(400, "Upload file is empty");

  const fileName = sanitizeFileName(input.fileName || "upload.bin");
  const storagePath = `${env.WAREHOUSE_STORAGE_PREFIX}/${candidateId}/${Date.now()}-${fileName}`;

  const upload = await supabase.storage
    .from(env.WAREHOUSE_STORAGE_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: input.mimeType ?? "application/octet-stream",
      upsert: false,
    });

  if (upload.error) throw new ApiError(500, upload.error.message);

  const publicUrl = `${env.WAREHOUSE_SUPABASE_URL}/storage/v1/object/public/${env.WAREHOUSE_STORAGE_BUCKET}/${storagePath}`;
  const sourceUrl = candidate.source_url ?? publicUrl;
  const sourceDomain = getDomainFromUrl(sourceUrl);
  const sourceType = sourceUrl === publicUrl ? "manual_upload" : inferSourceTypeFromUrl(sourceUrl);

  const { error } = await db
    .from("seed_posts")
    .update({
      image_url: publicUrl,
      source_type: sourceType,
      source_url: sourceUrl,
      source_domain: sourceDomain,
      ready_for_backend: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId);

  if (error) throw new ApiError(500, error.message);

  await upsertAssetForLook(candidateId, {
    sourceType: sourceType === "manual_upload" ? "manual_upload" : sourceType,
    sourceUrl,
    sourceDomain,
    imageHash: `${candidateId}:upload:${storagePath}`,
    archivedUrl: publicUrl,
    storagePath,
    mimeType: input.mimeType,
    fileSizeBytes: fileBuffer.byteLength,
  });

  return { selected: "upload", image_url: publicUrl, storage_path: storagePath };
}

export async function getGroupArtistOptionsForCandidate(candidateId: string): Promise<GroupArtistOptions> {
  const candidate = await getCandidateById(candidateId);
  if (!candidate.source_post_id) {
    return { groupCandidates: [], artistCandidates: [] };
  }

  const supabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = supabase.schema(env.WAREHOUSE_DB_SCHEMA);

  const { data: postRow, error: postError } = await db
    .from("post")
    .select("id,tagged_account_ids")
    .eq("id", candidate.source_post_id)
    .maybeSingle();
  if (postError) throw new ApiError(500, dbErrorMessage("post tagged accounts query failed", postError));
  if (!postRow) return { groupCandidates: [], artistCandidates: [] };

  const taggedIds = parseTaggedAccountIds(postRow.tagged_account_ids);
  const accountById = await fetchAccountsByIds(db, taggedIds);
  const taggedAccounts = taggedIds
    .map((id) => accountById.get(id))
    .filter((v): v is RawInstagramAccount => Boolean(v));

  const groupAccounts = taggedAccounts.filter((a) => a.account_type === "artist_group");
  const taggedArtists = taggedAccounts.filter((a) => a.account_type === "artist");
  const groupCandidates = groupAccounts
    .map((a) => accountDisplayName(a))
    .filter((v): v is string => Boolean(v));

  const taggedArtistNames = taggedArtists
    .map((a) => accountDisplayName(a))
    .filter((v): v is string => Boolean(v));

  const selectedGroupAccount = groupAccounts.find(
    (a) => accountDisplayName(a) === candidate.group_name,
  );

  let groupMemberArtistNames: string[] = [];
  if (selectedGroupAccount) {
    const { data: members, error: membersError } = await db
      .from("group_member")
      .select("group_account_id,artist_account_id,is_active")
      .eq("group_account_id", selectedGroupAccount.id)
      .eq("is_active", true);
    if (membersError) {
      throw new ApiError(500, dbErrorMessage("group_member query failed", membersError));
    } else {
      const artistIds = ((members ?? []) as RawGroupMember[]).map((row) => row.artist_account_id);
      const artistById = await fetchAccountsByIds(db, artistIds);
      groupMemberArtistNames = artistIds
        .map((id) => artistById.get(id))
        .filter((v): v is RawInstagramAccount => Boolean(v))
        .map((a) => accountDisplayName(a))
        .filter((v): v is string => Boolean(v));
    }
  }

  const artistCandidates = [...new Set([...groupMemberArtistNames, ...taggedArtistNames])];
  return {
    groupCandidates: [...new Set(groupCandidates)],
    artistCandidates,
  };
}

export async function setCandidateReviewStatus(
  candidateId: string,
  status: "approved" | "rejected",
  actor: string,
  rejectedReason?: string,
): Promise<{ id: string; review_status: "approved" | "rejected" }> {
  const candidate = await getCandidateById(candidateId);

  if (candidate.review_status !== "draft") {
    throw new ApiError(409, "Only draft candidates can be transitioned");
  }

  const supabase = getServerSupabase() as any;
  const env = getServerEnv();
  const db = supabase.schema(env.WAREHOUSE_DB_SCHEMA);
  const now = new Date().toISOString();

  const updatePayload =
    status === "approved"
      ? {
          review_status: "approved",
          approved_by: actor,
          approved_at: now,
          rejected_reason: null,
          ready_for_backend: true,
          updated_at: now,
        }
      : {
          review_status: "rejected",
          approved_by: null,
          approved_at: null,
          rejected_reason: rejectedReason?.trim() || null,
          ready_for_backend: false,
          updated_at: now,
        };

  const { error } = await db.from("seed_posts").update(updatePayload).eq("id", candidateId);
  if (error) throw new ApiError(500, error.message);

  return { id: candidateId, review_status: status };
}
