import { failure, success } from "@/lib/api-response";
import { getCandidatesByStatus } from "@/lib/candidates";
import { toApiError } from "@/lib/errors";
import type { SeedPostStatus } from "@/types";

const allowedStatuses = new Set<SeedPostStatus>(["draft", "approved", "failed", "queued", "published"]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = (searchParams.get("status") || "draft") as SeedPostStatus;
    const accountParam = searchParams.get("account") || undefined;

    if (!allowedStatuses.has(statusParam)) {
      return failure(
        "INVALID_STATUS",
        "status must be draft|approved|failed|queued|published",
        400,
      );
    }

    const candidates = await getCandidatesByStatus(statusParam, accountParam);
    return success({ candidates });
  } catch (error) {
    const apiError = toApiError(error);
    return failure("CANDIDATE_LIST_FAILED", apiError.message, apiError.status);
  }
}
