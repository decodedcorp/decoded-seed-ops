import { failure, success } from "@/lib/api-response";
import { getAlternativesForCandidate } from "@/lib/candidates";
import { toApiError } from "@/lib/errors";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const alternatives = await getAlternativesForCandidate(id);
    return success({ alternatives });
  } catch (error) {
    const apiError = toApiError(error);
    return failure("ALTERNATIVES_FETCH_FAILED", apiError.message, apiError.status);
  }
}
