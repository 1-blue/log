"use client";

import {
  type AdminSessionResponse,
  AdminSessionResponseSchema,
  ApiErrorResponseSchema,
} from "@workspace/contracts";

import { getWorkerApiUrl } from "#/libs/env";
import { createClient } from "#/libs/supabase/client";

export class WorkerApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WorkerApiError";
  }
}

async function readWorkerError(response: Response): Promise<WorkerApiError> {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = ApiErrorResponseSchema.safeParse(payload);

  if (parsed.success) {
    return new WorkerApiError(
      parsed.data.error.code,
      parsed.data.error.message,
      response.status,
      parsed.data.error.retryable,
    );
  }

  return new WorkerApiError(
    "INVALID_RESPONSE",
    "Worker 응답을 처리하지 못했습니다.",
    response.status,
    response.status >= 500,
  );
}

async function requestAdminSession(
  accessToken: string,
): Promise<AdminSessionResponse> {
  const response = await fetch(new URL("/v1/auth/me", getWorkerApiUrl()), {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw await readWorkerError(response);
  }

  const payload: unknown = await response.json();
  const parsed = AdminSessionResponseSchema.safeParse(payload);

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

export async function getWorkerAdminSession(): Promise<AdminSessionResponse> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (error || !accessToken) {
    throw new WorkerApiError(
      "UNAUTHORIZED",
      "로그인 세션이 없습니다.",
      401,
      false,
    );
  }

  try {
    return await requestAdminSession(accessToken);
  } catch (error) {
    if (!(error instanceof WorkerApiError) || error.status !== 401) {
      throw error;
    }

    const refreshed = await supabase.auth.refreshSession();
    const refreshedToken = refreshed.data.session?.access_token;

    if (refreshed.error || !refreshedToken) {
      throw error;
    }

    return requestAdminSession(refreshedToken);
  }
}
