import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { getServerEnv } from "@/lib/env";
import { ApiError } from "@/lib/errors";

let r2Client: S3Client | null = null;

function getR2Client() {
  if (!r2Client) {
    const env = getServerEnv();
    r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
        secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
  }
  return r2Client;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function uploadBufferToR2(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<{ key: string; publicUrl: string }> {
  const env = getServerEnv();
  const client = getR2Client();

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: env.CLOUDFLARE_R2_BUCKET,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "R2 upload failed";
    throw new ApiError(500, `R2 upload failed: ${message}`);
  }

  const publicUrl = `${trimTrailingSlash(env.CLOUDFLARE_R2_PUBLIC_BASE_URL)}/${key}`;
  return { key, publicUrl };
}
