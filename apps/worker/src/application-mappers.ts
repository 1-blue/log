import {
  type ApplicationDocumentSelection,
  type ApplicationSummary,
} from "@workspace/contracts";
import type { Database } from "@workspace/contracts/database";

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];
type DocumentRow = Database["public"]["Tables"]["document_versions"]["Row"];
type JobPostingRow = Database["public"]["Tables"]["job_postings"]["Row"];

export function mapApplicationDocument(
  row: DocumentRow,
): ApplicationDocumentSelection {
  return {
    archivedAt: row.archived_at,
    documentType: row.document_type,
    id: row.id,
    label: row.label,
    originalFilename: row.original_filename,
  };
}

export function getJobPostingMetadataStatus(
  posting: JobPostingRow,
): "pending" | "confirmed" {
  return posting.company_name === "확인 중" ||
    posting.title === `Wanted 공고 ${posting.external_id}`
    ? "pending"
    : "confirmed";
}

export function mapApplicationSummary(
  application: ApplicationRow,
  posting: JobPostingRow,
  documents: ApplicationDocumentSelection[],
): ApplicationSummary {
  return {
    appliedOn: application.applied_on,
    archivedAt: application.archived_at,
    attemptNumber: application.attempt_number,
    createdAt: application.created_at,
    documents: {
      portfolio:
        documents.find((item) => item.documentType === "portfolio") ?? null,
      resume: documents.find((item) => item.documentType === "resume") ?? null,
    },
    documentsLockedAt: application.documents_locked_at,
    id: application.id,
    interviewAt: application.interview_at,
    jobPosting: {
      companyName: posting.company_name,
      createdAt: posting.created_at,
      externalId: posting.external_id,
      id: posting.id,
      metadataStatus: getJobPostingMetadataStatus(posting),
      source: posting.source,
      title: posting.title,
      updatedAt: posting.updated_at,
      url: posting.canonical_url,
    },
    note: application.note,
    status: application.status,
    updatedAt: application.updated_at,
  };
}
