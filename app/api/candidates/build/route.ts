import { failure, success } from "@/lib/api-response";
import { buildDraftCandidates } from "@/lib/candidates";
import { toApiError } from "@/lib/errors";

export async function POST() {
  try {
    const result = await buildDraftCandidates();
    return success(result);
  } catch (error) {
    const apiError = toApiError(error);
    return failure("CANDIDATE_BUILD_FAILED", apiError.message, apiError.status);
  }
}
