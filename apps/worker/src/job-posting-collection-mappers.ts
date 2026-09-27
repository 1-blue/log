import {
  type JobPostingBodySections,
  type JobPostingCollectionErrorCode,
  type JobPostingCollectionRun,
  type JobPostingSnapshot,
  type JobPostingSourceMetadata,
} from "@workspace/contracts";
import type { Database } from "@workspace/contracts/database";

export type CollectionRow =
  Database["public"]["Tables"]["job_posting_collection_runs"]["Row"];
export type SnapshotRow =
  Database["public"]["Tables"]["job_posting_snapshots"]["Row"];

function mapSnapshot(row: SnapshotRow): JobPostingSnapshot {
  const sections: JobPostingBodySections = {
    companyIntroduction: null,
    positionIntroduction: null,
    expectations: null,
    mainResponsibilities: null,
    requirements: null,
    preferred: null,
    employmentConditions: null,
    process: null,
    benefits: null,
    technologies: null,
    traits: null,
    deadline: null,
    location: null,
    other: null,
    ...((row.sections ?? {}) as Partial<JobPostingBodySections>),
  };
  return {
    contentHash: row.content_hash,
    createdAt: row.created_at,
    fetchedAt: row.fetched_at,
    id: row.id,
    jobPostingId: row.job_posting_id,
    normalizedContent: row.normalized_content,
    parserVersion: row.parser_version,
    rawContent: row.raw_content,
    source: row.source,
    sourceMetadata: row.source_metadata as JobPostingSourceMetadata,
    sections,
  };
}

export function mapJobPostingCollectionRun(
  row: CollectionRow,
  snapshot: SnapshotRow | null,
): JobPostingCollectionRun {
  return {
    createdAt: row.created_at,
    errorCode: row.error_code,
    finishedAt: row.finished_at,
    httpStatus: row.http_status,
    id: row.id,
    jobPostingId: row.job_posting_id,
    mode: row.mode,
    requestId: row.request_id,
    retryable: row.retryable,
    snapshot: snapshot ? mapSnapshot(snapshot) : null,
    startedAt: row.started_at,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export function terminalForHttpStatus(status: number): {
  code: JobPostingCollectionErrorCode;
  retryable: boolean;
  status: "failed" | "needs_input";
} | null {
  if (status >= 200 && status < 300) return null;
  if (status >= 300 && status < 400) {
    return {
      code: "REDIRECT_NOT_ALLOWED",
      retryable: false,
      status: "needs_input",
    };
  }
  if (status === 401 || status === 403) {
    return { code: "ACCESS_BLOCKED", retryable: false, status: "needs_input" };
  }
  if (status === 404 || status === 410) {
    return { code: "JOB_EXPIRED", retryable: false, status: "needs_input" };
  }
  if (status === 429) {
    return { code: "RATE_LIMITED", retryable: true, status: "failed" };
  }
  if (status >= 500) {
    return { code: "UPSTREAM_ERROR", retryable: true, status: "failed" };
  }
  return {
    code: "INVALID_JOB_POSTING",
    retryable: false,
    status: "needs_input",
  };
}
