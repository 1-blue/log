"use client";

import {
  type AdminSessionResponse,
  AdminSessionResponseSchema,
  ApiErrorResponseSchema,
  type ApplicationJobPostingResponse,
  ApplicationJobPostingResponseSchema,
  type ApplicationListQuery,
  type ApplicationListResponse,
  ApplicationListResponseSchema,
  type ApplicationResponse,
  ApplicationResponseSchema,
  type ApplicationStateInput,
  type CompleteDocumentUploadRequest,
  type CreateApplicationRequest,
  type CreateDocumentDownloadUrlRequest,
  type DocumentDownloadUrlResponse,
  DocumentDownloadUrlResponseSchema,
  type DocumentType,
  type DocumentVersion,
  type DocumentVersionListResponse,
  DocumentVersionListResponseSchema,
  type DocumentVersionResponse,
  DocumentVersionResponseSchema,
  type PatchApplicationRequest,
  type PatchJobPostingRequest,
  type PrepareDocumentUploadRequest,
  type PrepareDocumentUploadResponse,
  PrepareDocumentUploadResponseSchema,
  type SetDocumentPublicationRequest,
  type UpdateDocumentVersionRequest,
} from "@workspace/contracts";

import { getWorkerApiUrl } from "#/libs/env";
import { createClient } from "#/libs/supabase/client";

type ResponseSchema<T> = {
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

async function readWorkerError(response: Response): Promise<WorkerApiError> {
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

async function fetchWorker(
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

async function requestWorker<T>(
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

export function getWorkerAdminSession(): Promise<AdminSessionResponse> {
  return requestWorker("/v1/auth/me", AdminSessionResponseSchema);
}

export function createApplication(
  input: CreateApplicationRequest,
): Promise<ApplicationResponse> {
  return requestWorker(
    "/v1/applications",
    ApplicationResponseSchema,
    {
      body: JSON.stringify(input),
      method: "POST",
    },
    true,
  );
}

export function createApplicationAttempt(
  jobPostingId: string,
  input: ApplicationStateInput,
): Promise<ApplicationResponse> {
  return requestWorker(
    `/v1/job-postings/${jobPostingId}/applications`,
    ApplicationResponseSchema,
    { body: JSON.stringify(input), method: "POST" },
    true,
  );
}

export function listApplications(
  filters: Partial<ApplicationListQuery> = {},
): Promise<ApplicationListResponse> {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.status) query.set("status", filters.status);
  if (filters.archived) query.set("archived", filters.archived);
  if (filters.sort) query.set("sort", filters.sort);
  if (filters.page) query.set("page", String(filters.page));
  if (filters.pageSize) query.set("pageSize", String(filters.pageSize));
  const suffix = query.size ? `?${query.toString()}` : "";
  return requestWorker(
    `/v1/applications${suffix}`,
    ApplicationListResponseSchema,
  );
}

export function getApplication(
  applicationId: string,
): Promise<ApplicationResponse> {
  return requestWorker(
    `/v1/applications/${applicationId}`,
    ApplicationResponseSchema,
  );
}

export function updateApplication(
  applicationId: string,
  input: PatchApplicationRequest,
): Promise<ApplicationResponse> {
  return requestWorker(
    `/v1/applications/${applicationId}`,
    ApplicationResponseSchema,
    { body: JSON.stringify(input), method: "PATCH" },
  );
}

export function updateJobPosting(
  jobPostingId: string,
  input: PatchJobPostingRequest,
): Promise<ApplicationJobPostingResponse> {
  return requestWorker(
    `/v1/job-postings/${jobPostingId}`,
    ApplicationJobPostingResponseSchema,
    { body: JSON.stringify(input), method: "PATCH" },
  );
}

export function prepareDocumentUpload(
  input: PrepareDocumentUploadRequest,
): Promise<PrepareDocumentUploadResponse> {
  return requestWorker(
    "/v1/document-versions/uploads",
    PrepareDocumentUploadResponseSchema,
    { body: JSON.stringify(input), method: "POST" },
    true,
  );
}

export function completeDocumentUpload(
  documentVersionId: string,
  input: CompleteDocumentUploadRequest,
): Promise<DocumentVersionResponse> {
  return requestWorker(
    `/v1/document-versions/${documentVersionId}/complete`,
    DocumentVersionResponseSchema,
    { body: JSON.stringify(input), method: "POST" },
    true,
  );
}

export function listDocumentVersions(
  filters: {
    archived?: "exclude" | "include" | "only";
    documentType?: DocumentType;
  } = {},
): Promise<DocumentVersionListResponse> {
  const query = new URLSearchParams();
  if (filters.archived) query.set("archived", filters.archived);
  if (filters.documentType) query.set("documentType", filters.documentType);
  const suffix = query.size ? `?${query.toString()}` : "";
  return requestWorker(
    `/v1/document-versions${suffix}`,
    DocumentVersionListResponseSchema,
  );
}

export function getDocumentVersion(
  documentVersionId: string,
): Promise<DocumentVersionResponse> {
  return requestWorker(
    `/v1/document-versions/${documentVersionId}`,
    DocumentVersionResponseSchema,
  );
}

export function updateDocumentVersion(
  documentVersionId: string,
  input: UpdateDocumentVersionRequest,
): Promise<DocumentVersionResponse> {
  return requestWorker(
    `/v1/document-versions/${documentVersionId}`,
    DocumentVersionResponseSchema,
    { body: JSON.stringify(input), method: "PATCH" },
  );
}

export function publishDocumentVersion(
  documentType: DocumentType,
  input: SetDocumentPublicationRequest,
): Promise<DocumentVersionResponse> {
  return requestWorker(
    `/v1/document-publications/${documentType}`,
    DocumentVersionResponseSchema,
    { body: JSON.stringify(input), method: "PUT" },
  );
}

export async function unpublishDocumentVersion(
  documentType: DocumentType,
): Promise<void> {
  const response = await fetchWorker(
    `/v1/document-publications/${documentType}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw await readWorkerError(response);
}

export function createDocumentDownloadUrl(
  documentVersionId: string,
  input: CreateDocumentDownloadUrlRequest,
): Promise<DocumentDownloadUrlResponse> {
  return requestWorker(
    `/v1/document-versions/${documentVersionId}/download-url`,
    DocumentDownloadUrlResponseSchema,
    { body: JSON.stringify(input), method: "POST" },
  );
}

export type { DocumentVersion };
