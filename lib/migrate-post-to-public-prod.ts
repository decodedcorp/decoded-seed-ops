import "server-only";

import { ApiError } from "@/lib/errors";
import { getServerSupabase } from "@/lib/supabase/server";
import { getPublicAppProdSupabase } from "@/lib/supabase/public-app-prod";

const SCHEMA = "public";

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export type MigratePostToProdResult = {
  postId: string;
  upserted: {
    post_magazines: number;
    posts: number;
    magazines: number;
    magazine_posts: number;
    spots: number;
    solutions: number;
  };
};

/**
 * Dev(소스)의 단일 post와 연결된 데이터를 Prod(타깃)에 upsert.
 * 순서: post_magazines → posts → magazines → magazine_posts → spots → solutions
 */
export async function migratePostToPublicProd(postId: string): Promise<MigratePostToProdResult> {
  const src = getServerSupabase() as any;
  const dst = getPublicAppProdSupabase() as any;

  const { data: post, error: postErr } = await src
    .schema(SCHEMA)
    .from("posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle();

  if (postErr) throw new ApiError(500, `소스 posts: ${postErr.message}`);
  if (!post) throw new ApiError(404, "post 없음");

  const counts = {
    post_magazines: 0,
    posts: 0,
    magazines: 0,
    magazine_posts: 0,
    spots: 0,
    solutions: 0,
  };

  const pmId = post.post_magazine_id as string | null | undefined;
  if (pmId) {
    const { data: pmRow, error: pmErr } = await src
      .schema(SCHEMA)
      .from("post_magazines")
      .select("*")
      .eq("id", pmId)
      .maybeSingle();
    if (pmErr) throw new ApiError(500, `소스 post_magazines: ${pmErr.message}`);
    if (pmRow) {
      const { error: upErr } = await dst.schema(SCHEMA).from("post_magazines").upsert(pmRow, { onConflict: "id" });
      if (upErr) throw new ApiError(500, `타깃 post_magazines upsert: ${upErr.message}`);
      counts.post_magazines = 1;
    }
  }

  const { error: postUpErr } = await dst.schema(SCHEMA).from("posts").upsert(post, { onConflict: "id" });
  if (postUpErr) throw new ApiError(500, `타깃 posts upsert: ${postUpErr.message}`);
  counts.posts = 1;

  const { data: magPostRows, error: mpListErr } = await src
    .schema(SCHEMA)
    .from("magazine_posts")
    .select("*")
    .eq("post_id", postId);
  if (mpListErr) throw new ApiError(500, `소스 magazine_posts: ${mpListErr.message}`);

  const magIds = [...new Set((magPostRows ?? []).map((r: { magazine_id: string }) => r.magazine_id))];
  for (const mid of magIds) {
    const { data: mag, error: magErr } = await src
      .schema(SCHEMA)
      .from("magazines")
      .select("*")
      .eq("id", mid)
      .maybeSingle();
    if (magErr) throw new ApiError(500, `소스 magazines: ${magErr.message}`);
    if (mag) {
      const { error: magUp } = await dst.schema(SCHEMA).from("magazines").upsert(mag, { onConflict: "id" });
      if (magUp) throw new ApiError(500, `타깃 magazines upsert: ${magUp.message}`);
      counts.magazines += 1;
    }
  }

  for (const row of magPostRows ?? []) {
    const { error: mpu } = await dst
      .schema(SCHEMA)
      .from("magazine_posts")
      .upsert(row, { onConflict: "magazine_id,post_id" });
    if (mpu) throw new ApiError(500, `타깃 magazine_posts upsert: ${mpu.message}`);
    counts.magazine_posts += 1;
  }

  const { data: spotRows, error: spotErr } = await src
    .schema(SCHEMA)
    .from("spots")
    .select("*")
    .eq("post_id", postId);
  if (spotErr) throw new ApiError(500, `소스 spots: ${spotErr.message}`);

  const subIds = [
    ...new Set(
      (spotRows ?? [])
        .map((s: { subcategory_id: string | null }) => s.subcategory_id)
        .filter((id: string | null | undefined): id is string => Boolean(id)),
    ),
  ];
  for (const sid of subIds) {
    const { data: sub, error: subErr } = await src
      .schema(SCHEMA)
      .from("subcategories")
      .select("*")
      .eq("id", sid)
      .maybeSingle();
    if (subErr) throw new ApiError(500, `소스 subcategories: ${subErr.message}`);
    if (sub) {
      const { error: subUp } = await dst.schema(SCHEMA).from("subcategories").upsert(sub, { onConflict: "id" });
      if (subUp) throw new ApiError(500, `타깃 subcategories upsert: ${subUp.message}`);
    }
  }

  for (const spot of spotRows ?? []) {
    const { error: su } = await dst.schema(SCHEMA).from("spots").upsert(spot, { onConflict: "id" });
    if (su) throw new ApiError(500, `타깃 spots upsert: ${su.message}`);
    counts.spots += 1;
  }

  const spotIds = (spotRows ?? []).map((s: { id: string }) => s.id);
  for (const chunk of chunkArray(spotIds, 100)) {
    if (!chunk.length) break;
    const { data: sols, error: solErr } = await src.schema(SCHEMA).from("solutions").select("*").in("spot_id", chunk);
    if (solErr) throw new ApiError(500, `소스 solutions: ${solErr.message}`);
    for (const sol of sols ?? []) {
      const { error: solUp } = await dst.schema(SCHEMA).from("solutions").upsert(sol, { onConflict: "id" });
      if (solUp) throw new ApiError(500, `타깃 solutions upsert: ${solUp.message}`);
      counts.solutions += 1;
    }
  }

  return { postId, upserted: counts };
}
