import { failure, success } from "@/lib/api-response";
import { toApiError } from "@/lib/errors";
import { deletePublicSolutionById } from "@/lib/post-spots-solutions";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(_request: Request, context: { params: Promise<{ solutionId: string }> }) {
  try {
    const { solutionId } = await context.params;
    if (!uuidRe.test(solutionId)) {
      return failure("INVALID_SOLUTION_ID", "solutionId must be a UUID", 400);
    }
    await deletePublicSolutionById(solutionId);
    return success({ deleted: true, solutionId });
  } catch (error) {
    const apiError = toApiError(error);
    return failure("POST_SPOTS_DELETE_SOLUTION_FAILED", apiError.message, apiError.status);
  }
}
