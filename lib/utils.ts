export function getDomainFromUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.hostname;
  } catch {
    return null;
  }
}

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function extFromMimeType(mimeType: string | null): string {
  if (!mimeType) return "bin";
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "bin";
}
