import { ApiError } from "@/lib/errors";
import { getServerSupabase } from "@/lib/supabase/server";

/** App DB: one row per post, thumbnail in `image_url` */
export type PublicPostDashboardRow = {
  id: string;
  image_url: string | null;
  created_at: string;
  spot_count: number;
  solution_count: number;
};

const APP_SCHEMA = "public";

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function emptyStatsMap(postIds: string[]): Map<string, { spots: number; solutions: number }> {
  const m = new Map<string, { spots: number; solutions: number }>();
  for (const id of postIds) {
    m.set(id, { spots: 0, solutions: 0 });
  }
  return m;
}

/** Counts from `public.spots` / `public.solutions` */
export async function getSpotSolutionCountsForPublicPosts(
  postIds: string[],
): Promise<Map<string, { spots: number; solutions: number }>> {
  const stats = emptyStatsMap(postIds);
  if (!postIds.length) return stats;

  const db = getServerSupabase() as any;

  const spotRows: { id: string; post_id: string }[] = [];
  for (const chunk of chunkArray(postIds, 150)) {
    const { data: spots, error } = await db
      .schema(APP_SCHEMA)
      .from("spots")
      .select("id,post_id")
      .in("post_id", chunk);
    if (error) throw new ApiError(500, `spots: ${error.message}`);
    spotRows.push(...((spots ?? []) as { id: string; post_id: string }[]));
  }

  const spotIdToPostId = new Map<string, string>();
  for (const s of spotRows) {
    spotIdToPostId.set(s.id, s.post_id);
    const cur = stats.get(s.post_id);
    if (cur) cur.spots += 1;
  }

  const spotIds = [...spotIdToPostId.keys()];
  if (!spotIds.length) return stats;

  for (const chunk of chunkArray(spotIds, 150)) {
    const { data: sols, error } = await db
      .schema(APP_SCHEMA)
      .from("solutions")
      .select("spot_id")
      .in("spot_id", chunk);
    if (error) throw new ApiError(500, `solutions: ${error.message}`);
    for (const row of (sols ?? []) as { spot_id: string }[]) {
      const pid = spotIdToPostId.get(row.spot_id);
      if (pid) {
        stats.get(pid)!.solutions += 1;
      }
    }
  }

  return stats;
}

export type PublicPostArtistOption = {
  id: string;
  label: string;
  post_count: number;
};

/** Distinct `artist_id` values on posts, with label from `artist_name` and counts. */
export async function listPublicPostArtistFilterOptions(): Promise<PublicPostArtistOption[]> {
  const db = getServerSupabase() as any;
  const { data, error } = await db
    .schema(APP_SCHEMA)
    .from("posts")
    .select("artist_id,artist_name")
    .not("artist_id", "is", null);

  if (error) throw new ApiError(500, `public.posts (artists): ${error.message}`);

  const byId = new Map<string, { label: string; post_count: number }>();
  for (const row of (data ?? []) as { artist_id: string | null; artist_name: string | null }[]) {
    if (!row.artist_id) continue;
    const cur = byId.get(row.artist_id);
    const piece = (row.artist_name ?? "").trim();
    if (cur) {
      cur.post_count += 1;
      if (piece && piece.length > (cur.label?.length ?? 0)) {
        cur.label = piece;
      }
    } else {
      byId.set(row.artist_id, {
        label: piece || row.artist_id.slice(0, 8),
        post_count: 1,
      });
    }
  }

  return [...byId.entries()]
    .map(([id, v]) => ({ id, label: v.label, post_count: v.post_count }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko", { sensitivity: "base" }));
}

export type ListPublicPostsOptions = {
  limit: number;
  offset: number;
  sort: "created_desc" | "priority_asc";
  /** When set, only posts for this `public.posts.artist_id` */
  artistId: string | null;
};

export async function listPublicPostsForDashboard(
  options: ListPublicPostsOptions,
): Promise<{ items: PublicPostDashboardRow[] }> {
  const db = getServerSupabase() as any;
  const { limit, offset, sort, artistId } = options;

  let q = db
    .schema(APP_SCHEMA)
    .from("posts")
    .select("id,image_url,created_at")
    .order("created_at", { ascending: false });

  if (artistId) {
    q = q.eq("artist_id", artistId);
  }

  const { data: posts, error } = await q.range(offset, offset + limit - 1);

  if (error) throw new ApiError(500, `public.posts: ${error.message}`);

  const rows = (posts ?? []) as { id: string; image_url: string | null; created_at: string }[];
  const postIds = rows.map((r) => r.id);
  const counts = await getSpotSolutionCountsForPublicPosts(postIds);

  let items: PublicPostDashboardRow[] = rows.map((r) => {
    const c = counts.get(r.id) ?? { spots: 0, solutions: 0 };
    return {
      id: r.id,
      image_url: r.image_url,
      created_at: r.created_at,
      spot_count: c.spots,
      solution_count: c.solutions,
    };
  });

  if (sort === "priority_asc") {
    items = [...items].sort((a, b) => {
      const sa = a.spot_count + a.solution_count;
      const sb = b.spot_count + b.solution_count;
      if (sa !== sb) return sa - sb;
      return a.id.localeCompare(b.id);
    });
  }

  return { items };
}

export async function deletePublicPostsByIds(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const db = getServerSupabase() as any;

  let deleted = 0;
  for (const chunk of chunkArray(ids, 50)) {
    const { error } = await db.schema(APP_SCHEMA).from("posts").delete().in("id", chunk);
    if (error) throw new ApiError(500, `delete public.posts: ${error.message}`);
    deleted += chunk.length;
  }
  return deleted;
}
