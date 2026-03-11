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
