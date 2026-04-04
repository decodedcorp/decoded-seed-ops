import { failure, success } from "@/lib/api-response";
import { toApiError } from "@/lib/errors";
import { registerPendingInstagramUsername } from "@/lib/instagram-accounts";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string };
    const username = typeof body.username === "string" ? body.username : "";
    const result = await registerPendingInstagramUsername(username);
    return success(result, 201);
  } catch (error) {
    const apiError = toApiError(error);
    return failure("INSTAGRAM_ACCOUNT_REGISTER_FAILED", apiError.message, apiError.status);
  }
}
