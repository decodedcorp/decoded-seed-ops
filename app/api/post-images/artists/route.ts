import { failure, success } from "@/lib/api-response";
import { toApiError } from "@/lib/errors";
import { listPublicPostArtistFilterOptions } from "@/lib/post-images";

export async function GET() {
  try {
    const artists = await listPublicPostArtistFilterOptions();
    return success({ artists });
  } catch (error) {
    const apiError = toApiError(error);
    return failure("POST_IMAGES_ARTISTS_FAILED", apiError.message, apiError.status);
  }
}
