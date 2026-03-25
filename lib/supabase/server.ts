import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env";

let dbClient: ReturnType<typeof createClient> | null = null;

export function getServerSupabase() {
  if (!dbClient) {
    const env = getServerEnv();
    dbClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return dbClient;
}
