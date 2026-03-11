import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url(),
  WAREHOUSE_SUPABASE_URL: z.string().url(),
  WAREHOUSE_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  WAREHOUSE_DB_SCHEMA: z.string().min(1).default("public"),
  WAREHOUSE_STORAGE_BUCKET: z.string().min(1),
  WAREHOUSE_STORAGE_PREFIX: z.string().min(1).default("ops-seed"),
  CANDIDATE_START_TS: z.string().default("2025-01-01_00-00-00"),
  NEXT_PUBLIC_APP_ENV: z.string().default("development"),
  NEXT_PUBLIC_APP_NAME: z.string().default("decoded-seed-ops"),
  OPS_AUTH_PROVIDER: z.string().default("supabase"),
  OPS_AUDIT_ENABLED: z.coerce.boolean().default(true),
});

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_ENV: z.string(),
  NEXT_PUBLIC_APP_NAME: z.string(),
});

let cachedServerEnv: z.infer<typeof serverEnvSchema> | null = null;

export function getServerEnv() {
  if (!cachedServerEnv) {
    cachedServerEnv = serverEnvSchema.parse(process.env);
  }

  return cachedServerEnv;
}

export function getPublicEnv() {
  return publicEnvSchema.parse(process.env);
}
