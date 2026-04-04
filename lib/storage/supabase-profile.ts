import "server-only";

import { getServerEnv } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { getServerSupabase } from "@/lib/supabase/server";

/** SCHEMA.md: Supabase Storage `instagram-profile-images/{...}` */
const PROFILE_OBJECT_PREFIX = "instagram-profile-images";

export async function uploadEntityProfileToSupabaseStorage(input: {
  kind: "brand" | "artist";
  entityId: string;
  ext: string;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  const env = getServerEnv();
  const bucket = env.SUPABASE_PROFILE_BUCKET;
  const objectPath = `${PROFILE_OBJECT_PREFIX}/${input.kind}-${input.entityId}.${input.ext}`;
  const supabase = getServerSupabase();

  const { error } = await supabase.storage.from(bucket).upload(objectPath, input.buffer, {
    contentType: input.contentType,
    upsert: true,
  });

  if (error) {
    throw new ApiError(500, `Supabase profile storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}
