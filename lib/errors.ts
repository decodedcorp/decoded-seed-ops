export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ErrorWithSupabaseFields = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
};

function hasSupabaseFields(error: unknown): error is ErrorWithSupabaseFields {
  return typeof error === "object" && error !== null;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (hasSupabaseFields(error)) {
    const status =
      typeof error.status === "number" && Number.isFinite(error.status) ? error.status : 500;
    const parts = [
      typeof error.message === "string" ? error.message : "Unexpected server error",
      error.code ? `code=${error.code}` : null,
      error.details ? `details=${error.details}` : null,
      error.hint ? `hint=${error.hint}` : null,
    ].filter((value): value is string => Boolean(value));

    return new ApiError(status, parts.join(" | "));
  }

  if (error instanceof Error) {
    return new ApiError(500, error.message);
  }

  return new ApiError(500, "Unexpected server error");
}
