"use client";

import { ApiErrorResponseSchema } from "@workspace/contracts";

import { getWorkerApiUrl } from "#/libs/env";
import { createClient } from "#/libs/supabase/client";

export type ResponseSchema<T> = {
  safeParse(
    input: unknown,
  ): { data: T; success: true } | { error: unknown; success: false };
};

export class WorkerApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly details: Record<string, string> | null = null,
  ) {
    super(message);
    this.name = "WorkerApiError";
  }
}

export async function readWorkerError(
  response: Response,
): Promise<WorkerApiError> {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = ApiErrorResponseSchema.safeParse(payload);

  if (parsed.success) {
    return new WorkerApiError(
      parsed.data.error.code,
      parsed.data.error.message,
      response.status,
      parsed.data.error.retryable,
      parsed.data.error.details,
    );
  }

  return new WorkerApiError(
    "INVALID_RESPONSE",
    "Worker 응답을 처리하지 못했습니다.",
    response.status,
    response.status >= 500,
  );
}

async function getAccessToken(refresh = false): Promise<string> {
  const supabase = createClient();
  const result = refresh
    ? await supabase.auth.refreshSession()
    : await supabase.auth.getSession();
  const accessToken = result.data.session?.access_token;

  if (result.error || !accessToken) {
    throw new WorkerApiError(
      "UNAUTHORIZED",
      "로그인 세션이 없습니다.",
      401,
      false,
    );
  }

  return accessToken;
}

export function getSupabaseAccessToken(): Promise<string> {
  return getAccessToken();
}

export async function fetchWorker(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const accessToken = await getAccessToken(!retry);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(new URL(path, getWorkerApiUrl()), {
    ...init,
    cache: "no-store",
    headers,
  });

  if (response.status === 401 && retry) {
    return fetchWorker(path, init, false);
  }
  return response;
}

export async function requestWorker<T>(
  path: string,
  schema: ResponseSchema<T>,
  init: RequestInit = {},
  idempotent = false,
): Promise<T> {
  const requestInit = idempotent ? createIdempotentRequestInit(init) : init;
  const response = await fetchWorker(path, requestInit);
  if (!response.ok) throw await readWorkerError(response);

  const payload: unknown = await response.json();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new WorkerApiError(
      "INVALID_RESPONSE",
      "Worker 응답 형식이 올바르지 않습니다.",
      response.status,
      false,
    );
  }

  return parsed.data;
}

export function createIdempotentRequestInit(
  init: RequestInit,
  createKey: () => string = () => crypto.randomUUID(),
): RequestInit {
  const headers = new Headers(init.headers);
  if (!headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", createKey());
  }
  return { ...init, headers };
}
