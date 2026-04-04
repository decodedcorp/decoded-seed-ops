import { failure, success } from "@/lib/api-response";
import { toApiError } from "@/lib/errors";
import { getPostSpotSolutionTree } from "@/lib/post-spots-solutions";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: { params: Promise<{ postId: string }> }) {
  try {
    const { postId } = await context.params;
    if (!uuidRe.test(postId)) {
      return failure("INVALID_POST_ID", "postId must be a UUID", 400);
    }
    const tree = await getPostSpotSolutionTree(postId);
    return success(tree);
  } catch (error) {
    const apiError = toApiError(error);
    return failure("POST_SPOTS_TREE_FAILED", apiError.message, apiError.status);
  }
}
