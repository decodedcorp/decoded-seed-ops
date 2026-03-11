import { NextResponse } from "next/server";

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

export function success<T>(data: T, status = 200) {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data }, { status });
}

export function failure(code: string, message: string, status = 500) {
  return NextResponse.json<ApiFailure>(
    {
      ok: false,
      error: { code, message },
    },
    { status },
  );
}
