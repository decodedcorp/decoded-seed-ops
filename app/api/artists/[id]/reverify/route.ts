import { failure, success } from "@/lib/api-response";
import { reverifyArtist } from "@/lib/entities";
import { toApiError } from "@/lib/errors";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await reverifyArtist(id);
    return success(result);
  } catch (error) {
    const apiError = toApiError(error);
    return failure("ARTIST_REVERIFY_FAILED", apiError.message, apiError.status);
  }
}
