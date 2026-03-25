import { z } from "zod";

import { failure, success } from "@/lib/api-response";
import { toApiError } from "@/lib/errors";
import { approveInstagramAccount } from "@/lib/instagram-accounts";

const bodySchema = z.object({
  account_type: z.enum(["artist", "group", "brand", "source", "influencer", "place", "other"]),
  entity_ig_role: z.enum(["primary", "regional", "secondary"]).default("primary"),
  group_account_id: z.string().uuid().nullable().optional(),
  name_en: z.string().trim().nullable(),
  name_ko: z.string().trim().nullable(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = bodySchema.parse(body);
    const result = await approveInstagramAccount(id, parsed);
    return success(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return failure("INVALID_BODY", error.issues[0]?.message ?? "Invalid request body", 400);
    }
    const apiError = toApiError(error);
    return failure("INSTAGRAM_ACCOUNT_APPROVE_FAILED", apiError.message, apiError.status);
  }
}
