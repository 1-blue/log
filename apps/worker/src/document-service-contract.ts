import {
  type AbortDocumentUploadRequest,
  type CompleteDocumentUploadRequest,
  DOCUMENT_RESUMABLE_THRESHOLD,
  type DocumentEvidenceReview,
  type DocumentExtractionCallback,
  type DocumentType,
  type DocumentUploadMetadata,
  type DocumentVersion,
  type N8nDocumentExtractionDispatchPayload,
  type PublicDocumentDisposition,
  type SaveDocumentEvidenceReviewRequest,
  type UpdateDocumentVersionRequest,
} from "@workspace/contracts";
import type { Database } from "@workspace/contracts/database";

export type DocumentRow =
  Database["public"]["Tables"]["document_versions"]["Row"];
export type EvidenceReviewRow =
  Database["public"]["Tables"]["document_evidence_reviews"]["Row"];

export type DocumentListFilters = {
  archived: "exclude" | "include" | "only";
  documentType?: DocumentType;
};

export type PreparedDocumentUpload = {
  documentVersionId: string;
  expiresAt: string | null;
  resumableEndpoint: string | null;
  storagePath: string;
  uploadMethod: "standard" | "tus";
  uploadToken: string | null;
};

export type DocumentDownloadUrl = {
  expiresAt: string;
  url: string;
};

export type PublicDocumentAccess = DocumentDownloadUrl & {
  documentType: DocumentType;
};

export function getDocumentUploadMethod(fileSize: number): "standard" | "tus" {
  return fileSize > DOCUMENT_RESUMABLE_THRESHOLD ? "tus" : "standard";
}

export class DocumentServiceError extends Error {
  constructor(
    readonly kind: "conflict" | "not_found" | "unavailable" | "validation",
    readonly details: Record<string, string> | null = null,
  ) {
    super(kind);
    this.name = "DocumentServiceError";
  }
}

export interface DocumentService {
  clearPublication(ownerId: string, documentType: DocumentType): Promise<void>;
  cleanupOrphanedUploads(ownerId: string): Promise<void>;
  completeUpload(
    ownerId: string,
    documentVersionId: string,
    input: CompleteDocumentUploadRequest,
  ): Promise<DocumentVersion>;
  completeExtraction(
    ownerId: string,
    input: DocumentExtractionCallback,
  ): Promise<DocumentVersion>;
  createDownloadUrl(
    ownerId: string,
    documentVersionId: string,
    disposition: PublicDocumentDisposition,
  ): Promise<DocumentDownloadUrl>;
  createPublicAccessUrl(
    ownerId: string,
    documentType: DocumentType,
    disposition: PublicDocumentDisposition,
  ): Promise<PublicDocumentAccess>;
  get(ownerId: string, documentVersionId: string): Promise<DocumentVersion>;
  listEvidenceReviews(
    ownerId: string,
    documentVersionId: string,
  ): Promise<DocumentEvidenceReview[]>;
  list(
    ownerId: string,
    filters: DocumentListFilters,
  ): Promise<DocumentVersion[]>;
  prepareUpload(
    ownerId: string,
    metadata: DocumentUploadMetadata,
  ): Promise<PreparedDocumentUpload>;
  prepareExtraction(
    ownerId: string,
    documentVersionId: string,
    requestId: string,
  ): Promise<N8nDocumentExtractionDispatchPayload | null>;
  failExtraction(
    ownerId: string,
    documentVersionId: string,
    errorCode: string,
    eventId: string,
  ): Promise<void>;
  abortUpload(
    ownerId: string,
    documentVersionId: string,
    input: AbortDocumentUploadRequest,
  ): Promise<"removed" | "preserved" | "not_found">;
  setPublication(
    ownerId: string,
    documentType: DocumentType,
    documentVersionId: string,
  ): Promise<DocumentVersion>;
  update(
    ownerId: string,
    documentVersionId: string,
    input: UpdateDocumentVersionRequest,
  ): Promise<DocumentVersion>;
  saveEvidenceReview(
    ownerId: string,
    documentVersionId: string,
    input: SaveDocumentEvidenceReviewRequest,
  ): Promise<DocumentEvidenceReview>;
}
