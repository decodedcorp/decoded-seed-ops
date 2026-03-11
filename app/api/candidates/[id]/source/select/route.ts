import { z } from "zod";

import { failure, success } from "@/lib/api-response";
import { selectCandidateSource } from "@/lib/candidates";
import { ApiError, toApiError } from "@/lib/errors";

const bodySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("alternative"), alternativeImageId: z.string().uuid() }),
  z.object({ mode: z.literal("url"), sourceUrl: z.string().url() }),
  z.object({
    mode: z.literal("group_artist"),
    groupName: z.string().min(1).nullable(),
    artistName: z.string().min(1).nullable(),
  }),
  z.object({
    mode: z.literal("image_url"),
    imageUrl: z.string().url(),
    sourceUrl: z.string().url().optional(),
  }),
  z.object({
    mode: z.literal("upload"),
    fileName: z.string().min(1),
    mimeType: z.string().optional(),
    fileBase64: z.string().min(1),
  }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = bodySchema.parse(body);

    const result = await selectCandidateSource(id, input);
    return success(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return failure("INVALID_BODY", error.issues[0]?.message ?? "Invalid request body", 400);
    }

    const apiError = toApiError(error);
    const status = error instanceof ApiError ? apiError.status : 500;
    return failure("SOURCE_SELECT_FAILED", apiError.message, status);
  }
}
