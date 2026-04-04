import { failure, success } from "@/lib/api-response";
import { toApiError } from "@/lib/errors";
import { listPostsForSpotsDashboardHidingProd } from "@/lib/post-spots-solutions";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? "80") || 80));
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
    const rawArtist = url.searchParams.get("artist_id")?.trim() ?? "";
    const artistId = uuidRe.test(rawArtist) ? rawArtist : null;

    const { items, prodPostIdCount, hidingProd } = await listPostsForSpotsDashboardHidingProd({
      limit,
      offset,
      artistId,
    });
    return success({ items, limit, offset, artistId, prodPostIdCount, hidingProd });
  } catch (error) {
    const apiError = toApiError(error);
    return failure("POST_SPOTS_LIST_FAILED", apiError.message, apiError.status);
  }
}
