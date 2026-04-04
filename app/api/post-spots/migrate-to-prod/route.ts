import { z } from "zod";

import { failure, success } from "@/lib/api-response";
import { toApiError } from "@/lib/errors";
import { migratePostToPublicProd } from "@/lib/migrate-post-to-public-prod";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  postId: z.string().regex(uuidRe),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return failure("INVALID_BODY", "postId(UUID)가 필요합니다.", 400);
    }
    const result = await migratePostToPublicProd(parsed.data.postId);
    return success(result);
  } catch (error) {
    const apiError = toApiError(error);
    return failure("MIGRATE_POST_TO_PROD_FAILED", apiError.message, apiError.status);
  }
}
