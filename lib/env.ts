import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_DB_SCHEMA: z.string().min(1).default("warehouse"),
  CLOUDFLARE_R2_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().min(1),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().min(1),
  CLOUDFLARE_R2_BUCKET: z.string().min(1),
  CLOUDFLARE_R2_PUBLIC_BASE_URL: z.string().url(),
  CLOUDFLARE_R2_PREFIX: z.string().min(1).default("ops-seed"),
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

type ParsedServerEnv = z.infer<typeof serverEnvSchema>;
type ServerEnv = ParsedServerEnv;

let cachedServerEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (!cachedServerEnv) {
    cachedServerEnv = serverEnvSchema.parse(process.env);
  }

  return cachedServerEnv;
}

export function getPublicEnv() {
  return publicEnvSchema.parse(process.env);
}
