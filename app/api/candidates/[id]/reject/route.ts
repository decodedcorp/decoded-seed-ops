import { failure, success } from "@/lib/api-response";
import { setCandidateReviewStatus } from "@/lib/candidates";
import { toApiError } from "@/lib/errors";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await setCandidateReviewStatus(id, "rejected", "ops_user");
    return success(result);
  } catch (error) {
    const apiError = toApiError(error);
    return failure("CANDIDATE_REJECT_FAILED", apiError.message, apiError.status);
  }
}
