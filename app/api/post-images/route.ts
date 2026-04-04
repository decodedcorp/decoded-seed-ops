import { z } from "zod";

import { failure, success } from "@/lib/api-response";
import { toApiError } from "@/lib/errors";
import { deletePublicPostsByIds, listPublicPostsForDashboard } from "@/lib/post-images";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseListParams(url: URL): {
  limit: number;
  offset: number;
  sort: "created_desc" | "priority_asc";
  artistId: string | null;
} {
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? "240") || 240));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  const sortParam = url.searchParams.get("sort") ?? "priority_asc";
  const sort: "created_desc" | "priority_asc" =
    sortParam === "created_desc" ? "created_desc" : "priority_asc";
  const rawArtist = url.searchParams.get("artist_id")?.trim() ?? "";
  const artistId = uuidRe.test(rawArtist) ? rawArtist : null;
  return { limit, offset, sort, artistId };
}

const deleteBodySchema = z.object({
  ids: z.array(z.string().regex(uuidRe)).min(1).max(200),
});

export async function GET(request: Request) {
  try {
    const { limit, offset, sort, artistId } = parseListParams(new URL(request.url));
    const { items } = await listPublicPostsForDashboard({ limit, offset, sort, artistId });
    return success({ items, limit, offset, sort, artistId });
  } catch (error) {
    const apiError = toApiError(error);
    return failure("POST_IMAGES_LIST_FAILED", apiError.message, apiError.status);
  }
}

export async function DELETE(request: Request) {
  try {
    const json = await request.json();
    const parsed = deleteBodySchema.safeParse(json);
    if (!parsed.success) {
      return failure("INVALID_BODY", "ids must be 1–200 UUID strings", 400);
    }
    const deleted = await deletePublicPostsByIds(parsed.data.ids);
    return success({ deleted });
  } catch (error) {
    const apiError = toApiError(error);
    return failure("POST_IMAGES_DELETE_FAILED", apiError.message, apiError.status);
  }
}
