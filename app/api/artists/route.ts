import { failure, success } from "@/lib/api-response";
import { createManualArtist } from "@/lib/entities";
import { toApiError } from "@/lib/errors";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const nameEnRaw = formData.get("name_en");
    const nameKoRaw = formData.get("name_ko");
    const file = formData.get("image");

    const nameEn = typeof nameEnRaw === "string" ? nameEnRaw : null;
    const nameKo = typeof nameKoRaw === "string" ? nameKoRaw : null;

    if (!(file instanceof File) || file.size === 0) {
      return failure("ARTIST_IMAGE_REQUIRED", "프로필 이미지 파일이 필요합니다.", 400);
    }

    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED.has(contentType)) {
      return failure("ARTIST_IMAGE_TYPE", "프로필 이미지는 JPEG, PNG, WebP만 업로드할 수 있습니다.", 400);
    }

    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const artist = await createManualArtist({
      nameEn,
      nameKo,
      imageBuffer,
      contentType,
    });
    return success(artist, 201);
  } catch (error) {
    const apiError = toApiError(error);
    return failure("ARTIST_CREATE_FAILED", apiError.message, apiError.status);
  }
}
