import { failure, success } from "@/lib/api-response";
import { toApiError } from "@/lib/errors";
import { deletePublicSpotById } from "@/lib/post-spots-solutions";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(_request: Request, context: { params: Promise<{ spotId: string }> }) {
  try {
    const { spotId } = await context.params;
    if (!uuidRe.test(spotId)) {
      return failure("INVALID_SPOT_ID", "spotId must be a UUID", 400);
    }
    await deletePublicSpotById(spotId);
    return success({ deleted: true, spotId });
  } catch (error) {
    const apiError = toApiError(error);
    return failure("POST_SPOTS_DELETE_SPOT_FAILED", apiError.message, apiError.status);
  }
}
