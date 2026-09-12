"use client";

import {
  ApiErrorResponseSchema,
  type DocumentType,
  type PublicDocumentAccessResponse,
  PublicDocumentAccessResponseSchema,
  type PublicDocumentDisposition,
} from "@workspace/contracts";

import { getWorkerApiUrl } from "#/libs/env";

export class PublicDocumentApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PublicDocumentApiError";
  }
}

async function readPublicDocumentError(
  response: Response,
): Promise<PublicDocumentApiError> {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = ApiErrorResponseSchema.safeParse(payload);

  if (parsed.success) {
    return new PublicDocumentApiError(
      parsed.data.error.code,
      parsed.data.error.message,
      response.status,
      parsed.data.error.retryable,
    );
  }

  return new PublicDocumentApiError(
    "INVALID_RESPONSE",
    "공개 문서 응답을 처리하지 못했습니다.",
    response.status,
    response.status >= 500,
  );
}

export async function getPublicDocumentAccess(
  documentType: DocumentType,
  disposition: PublicDocumentDisposition = "inline",
  signal?: AbortSignal,
): Promise<PublicDocumentAccessResponse> {
  const query = new URLSearchParams({ disposition });
  const response = await fetch(
    new URL(
      `/v1/public/document-publications/${documentType}?${query.toString()}`,
      getWorkerApiUrl(),
    ),
    {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    },
  );

  if (!response.ok) throw await readPublicDocumentError(response);

  const payload: unknown = await response.json().catch(() => null);
  const parsed = PublicDocumentAccessResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new PublicDocumentApiError(
      "INVALID_RESPONSE",
      "공개 문서 응답 형식이 올바르지 않습니다.",
      response.status,
      false,
    );
  }

  return parsed.data;
}
