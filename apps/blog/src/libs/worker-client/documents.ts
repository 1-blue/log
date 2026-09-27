"use client";

import {
  type AbortDocumentUploadRequest,
  type AbortDocumentUploadResponse,
  AbortDocumentUploadResponseSchema,
  type CompleteDocumentUploadRequest,
  type CreateDocumentDownloadUrlRequest,
  type DocumentDownloadUrlResponse,
  DocumentDownloadUrlResponseSchema,
  type DocumentEvidenceReviewListResponse,
  DocumentEvidenceReviewListResponseSchema,
  type DocumentEvidenceReviewResponse,
  DocumentEvidenceReviewResponseSchema,
  type DocumentType,
  type DocumentVersion,
  type DocumentVersionListResponse,
  DocumentVersionListResponseSchema,
  type DocumentVersionResponse,
  DocumentVersionResponseSchema,
  type PrepareDocumentUploadRequest,
  type PrepareDocumentUploadResponse,
  PrepareDocumentUploadResponseSchema,
  type SaveDocumentEvidenceReviewRequest,
  type SetDocumentPublicationRequest,
  type UpdateDocumentVersionRequest,
} from "@workspace/contracts";

import { fetchWorker, readWorkerError, requestWorker } from "./core";

export function listDocumentEvidenceReviews(
  documentVersionId: string,
): Promise<DocumentEvidenceReviewListResponse> {
  return requestWorker(
    `/v1/document-versions/${documentVersionId}/evidence-reviews`,
    DocumentEvidenceReviewListResponseSchema,
  );
}

export function saveDocumentEvidenceReview(
  documentVersionId: string,
  input: SaveDocumentEvidenceReviewRequest,
): Promise<DocumentEvidenceReviewResponse> {
  return requestWorker(
    `/v1/document-versions/${documentVersionId}/evidence-reviews`,
    DocumentEvidenceReviewResponseSchema,
    { body: JSON.stringify(input), method: "PUT" },
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

export function extractDocumentVersion(
  documentVersionId: string,
): Promise<DocumentVersionResponse> {
  return requestWorker(
    `/v1/document-versions/${documentVersionId}/extract`,
    DocumentVersionResponseSchema,
    { method: "POST" },
    true,
  );
}

export function abortDocumentUpload(
  documentVersionId: string,
  input: AbortDocumentUploadRequest,
): Promise<AbortDocumentUploadResponse> {
  return requestWorker(
    `/v1/document-versions/${documentVersionId}/abort-upload`,
    AbortDocumentUploadResponseSchema,
    { body: JSON.stringify(input), method: "POST" },
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
