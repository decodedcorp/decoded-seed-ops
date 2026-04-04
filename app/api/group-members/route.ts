import { failure, success } from "@/lib/api-response";
import { addGroupMember } from "@/lib/entities";
import { toApiError } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { group_id?: string; artist_id?: string };
    const groupId = typeof body.group_id === "string" ? body.group_id.trim() : "";
    const artistId = typeof body.artist_id === "string" ? body.artist_id.trim() : "";
    if (!groupId || !artistId) {
      return failure("GROUP_MEMBER_INPUT", "group_id와 artist_id가 필요합니다.", 400);
    }
    const result = await addGroupMember(groupId, artistId);
    return success(result, 201);
  } catch (error) {
    const apiError = toApiError(error);
    return failure("GROUP_MEMBER_ADD_FAILED", apiError.message, apiError.status);
  }
}
