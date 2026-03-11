import { failure, success } from "@/lib/api-response";
import { setCandidateReviewStatus } from "@/lib/candidates";
import { toApiError } from "@/lib/errors";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const actor = request.headers.get("x-ops-user") || "ops_user";
    const result = await setCandidateReviewStatus(id, "approved", actor);
    return success(result);
  } catch (error) {
    const apiError = toApiError(error);
    return failure("CANDIDATE_APPROVE_FAILED", apiError.message, apiError.status);
  }
}
