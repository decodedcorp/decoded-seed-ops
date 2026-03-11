import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env";

let client: ReturnType<typeof createClient> | null = null;

export function getServerSupabase() {
  if (!client) {
    const env = getServerEnv();
    client = createClient(env.WAREHOUSE_SUPABASE_URL, env.WAREHOUSE_SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return client;
}
