import { z } from "zod";

import { failure, success } from "@/lib/api-response";
import { setCandidateReviewStatus } from "@/lib/candidates";
import { toApiError } from "@/lib/errors";

const bodySchema = z.object({
  reason: z.string().min(1, "reason is required"),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = bodySchema.parse(body);
    const actor = request.headers.get("x-ops-user") || "ops_user";
    const result = await setCandidateReviewStatus(id, "rejected", actor, parsed.reason);
    return success(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return failure("INVALID_BODY", error.issues[0]?.message ?? "Invalid request body", 400);
    }
    const apiError = toApiError(error);
    return failure("CANDIDATE_REJECT_FAILED", apiError.message, apiError.status);
  }
}
