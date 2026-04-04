import { ApiError } from "@/lib/errors";
import { getSpotSolutionCountsForPublicPosts } from "@/lib/post-images";
import { getServerSupabase } from "@/lib/supabase/server";
import { fetchProdPublicPostIdSet } from "@/lib/supabase/public-app-prod";

const APP_SCHEMA = "public";

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export type PostForSpotsListRow = {
  id: string;
  image_url: string | null;
  artist_name: string | null;
  title: string | null;
  created_at: string;
  spot_count: number;
  solution_count: number;
};

export type SpotSolutionTreeSolution = {
  id: string;
  spot_id: string;
  title: string | null;
  /** Product / crop thumbnail for review */
  thumbnail_url: string | null;
  original_url: string | null;
  status: string | null;
  link_type: string | null;
  created_at: string;
};

export type SpotSolutionTreeSpot = {
  id: string;
  post_id: string;
  position_left: string | null;
  position_top: string | null;
  subcategory_id: string | null;
  status: string | null;
  created_at: string;
  solutions: SpotSolutionTreeSolution[];
};

export type PostSpotSolutionTree = {
  post: {
    id: string;
    image_url: string | null;
    title: string | null;
    artist_name: string | null;
    created_at: string;
    post_magazine_id: string | null;
    magazine_post_link_count: number;
  };
  spots: SpotSolutionTreeSpot[];
};

export async function listPostsForSpotsDashboard(options: {
  limit: number;
  offset: number;
  artistId: string | null;
}): Promise<{ items: PostForSpotsListRow[] }> {
  const db = getServerSupabase() as any;
  const { limit, offset, artistId } = options;

  let q = db
    .schema(APP_SCHEMA)
    .from("posts")
    .select("id,image_url,created_at,artist_name,title")
    .order("created_at", { ascending: false });

  if (artistId) {
    q = q.eq("artist_id", artistId);
  }

  const { data: posts, error } = await q.range(offset, offset + limit - 1);
  if (error) throw new ApiError(500, `public.posts: ${error.message}`);

  const rows = (posts ?? []) as {
    id: string;
    image_url: string | null;
    created_at: string;
    artist_name: string | null;
    title: string | null;
  }[];
  const postIds = rows.map((r) => r.id);
  const counts = await getSpotSolutionCountsForPublicPosts(postIds);

  const items: PostForSpotsListRow[] = rows.map((r) => {
    const c = counts.get(r.id) ?? { spots: 0, solutions: 0 };
    return {
      id: r.id,
      image_url: r.image_url,
      artist_name: r.artist_name,
      title: r.title,
      created_at: r.created_at,
      spot_count: c.spots,
      solution_count: c.solutions,
    };
  });

  return { items };
}

const EXCLUDE_PROD_SCAN_BATCH = 80;
const EXCLUDE_PROD_MAX_DEV_ROWS = 50_000;

/** Same ordering as `listPostsForSpotsDashboard`, but skips rows whose id exists on Prod `public.posts`. */
export async function listPostsForSpotsDashboardExcludingProd(options: {
  limit: number;
  offset: number;
  artistId: string | null;
  prodPostIds: Set<string>;
}): Promise<{ items: PostForSpotsListRow[] }> {
  const { limit, offset, artistId, prodPostIds } = options;
  if (prodPostIds.size === 0) {
    return listPostsForSpotsDashboard({ limit, offset, artistId });
  }
  const need = offset + limit;
  const acc: PostForSpotsListRow[] = [];
  let devOffset = 0;
  let scanned = 0;

  while (acc.length < need && scanned < EXCLUDE_PROD_MAX_DEV_ROWS) {
    const { items: chunk } = await listPostsForSpotsDashboard({
      limit: EXCLUDE_PROD_SCAN_BATCH,
      offset: devOffset,
      artistId,
    });
    if (!chunk.length) break;
    scanned += chunk.length;
    devOffset += chunk.length;
    for (const row of chunk) {
      if (!prodPostIds.has(row.id)) acc.push(row);
    }
  }

  return { items: acc.slice(offset, offset + limit) };
}

/** Fetches Prod post ids (if configured) and returns the spots-dashboard list with those rows removed. */
export async function listPostsForSpotsDashboardHidingProd(options: {
  limit: number;
  offset: number;
  artistId: string | null;
}): Promise<{ items: PostForSpotsListRow[]; prodPostIdCount: number; hidingProd: boolean }> {
  const prodPostIds = await fetchProdPublicPostIdSet();
  const hidingProd = prodPostIds.size > 0;
  const { items } = hidingProd
    ? await listPostsForSpotsDashboardExcludingProd({ ...options, prodPostIds })
    : await listPostsForSpotsDashboard(options);
  return { items, prodPostIdCount: prodPostIds.size, hidingProd };
}

export async function getPostSpotSolutionTree(postId: string): Promise<PostSpotSolutionTree> {
  const db = getServerSupabase() as any;

  const { data: postRow, error: postErr } = await db
    .schema(APP_SCHEMA)
    .from("posts")
    .select("id,image_url,title,artist_name,created_at,post_magazine_id")
    .eq("id", postId)
    .maybeSingle();

  if (postErr) throw new ApiError(500, `public.posts: ${postErr.message}`);
  if (!postRow) throw new ApiError(404, "post not found");

  const { count: magPostCount, error: mpcErr } = await db
    .schema(APP_SCHEMA)
    .from("magazine_posts")
    .select("post_id", { count: "exact", head: true })
    .eq("post_id", postId);
  if (mpcErr) throw new ApiError(500, `magazine_posts count: ${mpcErr.message}`);

  const { data: spotRows, error: spotErr } = await db
    .schema(APP_SCHEMA)
    .from("spots")
    .select("id,post_id,position_left,position_top,subcategory_id,status,created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (spotErr) throw new ApiError(500, `spots: ${spotErr.message}`);

  const spots = (spotRows ?? []) as Omit<SpotSolutionTreeSpot, "solutions">[];
  const spotIds = spots.map((s) => s.id);

  const allSolutions: SpotSolutionTreeSolution[] = [];
  for (const chunk of chunkArray(spotIds, 150)) {
    if (!chunk.length) break;
    const { data: solRows, error: solErr } = await db
      .schema(APP_SCHEMA)
      .from("solutions")
      .select("id,spot_id,title,thumbnail_url,original_url,status,link_type,created_at")
      .in("spot_id", chunk)
      .order("created_at", { ascending: true });
    if (solErr) throw new ApiError(500, `solutions: ${solErr.message}`);
    allSolutions.push(...((solRows ?? []) as SpotSolutionTreeSolution[]));
  }

  const bySpot = new Map<string, SpotSolutionTreeSolution[]>();
  for (const sol of allSolutions) {
    const list = bySpot.get(sol.spot_id) ?? [];
    list.push(sol);
    bySpot.set(sol.spot_id, list);
  }

  const basePost = postRow as Record<string, unknown>;
  const postOut: PostSpotSolutionTree["post"] = {
    id: String(basePost.id),
    image_url: (basePost.image_url as string | null) ?? null,
    title: (basePost.title as string | null) ?? null,
    artist_name: (basePost.artist_name as string | null) ?? null,
    created_at: String(basePost.created_at),
    post_magazine_id: (basePost.post_magazine_id as string | null) ?? null,
    magazine_post_link_count: magPostCount ?? 0,
  };

  return {
    post: postOut,
    spots: spots.map((s) => ({
      ...s,
      solutions: bySpot.get(s.id) ?? [],
    })),
  };
}

export async function deletePublicPostById(postId: string): Promise<void> {
  const db = getServerSupabase() as any;
  const { error } = await db.schema(APP_SCHEMA).from("posts").delete().eq("id", postId);
  if (error) throw new ApiError(500, `delete post: ${error.message}`);
}

export async function deletePublicSpotById(spotId: string): Promise<void> {
  const db = getServerSupabase() as any;
  const { error } = await db.schema(APP_SCHEMA).from("spots").delete().eq("id", spotId);
  if (error) throw new ApiError(500, `delete spot: ${error.message}`);
}

export async function deletePublicSolutionById(solutionId: string): Promise<void> {
  const db = getServerSupabase() as any;
  const { error } = await db.schema(APP_SCHEMA).from("solutions").delete().eq("id", solutionId);
  if (error) throw new ApiError(500, `delete solution: ${error.message}`);
}
