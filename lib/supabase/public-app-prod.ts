import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/errors";

let prodClient: SupabaseClient | null = null;

/** Target DB for public-app post migration (Prod). Set PROD_PUBLIC_SUPABASE_* in env. */
export function getPublicAppProdSupabase(): SupabaseClient {
  const url = process.env.PROD_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.PROD_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new ApiError(
      503,
      "Prod 이전 미설정: PROD_PUBLIC_SUPABASE_URL 과 PROD_PUBLIC_SUPABASE_SERVICE_ROLE_KEY 를 .env.local 에 넣으세요.",
    );
  }
  try {
    new URL(url);
  } catch {
    throw new ApiError(503, "PROD_PUBLIC_SUPABASE_URL 이 올바른 URL이 아닙니다.");
  }
  if (!prodClient) {
    prodClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return prodClient;
}

/** All `public.posts.id` on Prod. Empty set if Prod env missing or query fails. */
export async function fetchProdPublicPostIdSet(): Promise<Set<string>> {
  let client: SupabaseClient;
  try {
    client = getPublicAppProdSupabase();
  } catch {
    return new Set();
  }
  const ids = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await (client as any)
      .schema("public")
      .from("posts")
      .select("id")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return new Set();
    const rows = (data ?? []) as { id: string }[];
    if (!rows.length) break;
    for (const r of rows) ids.add(r.id);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}
