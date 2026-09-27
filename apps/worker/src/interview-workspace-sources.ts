import type {
  AnalysisJobRow,
  DocumentRow,
  SnapshotRow,
} from "./interview-workspace-types.js";

export function mapWorkspaceSources(
  job: AnalysisJobRow,
  snapshot: SnapshotRow,
  resume: DocumentRow,
  portfolio: DocumentRow,
) {
  return {
    jobPostingSnapshot: {
      contentHash: job.job_posting_content_hash,
      fetchedAt: snapshot.fetched_at,
      id: snapshot.id,
      source: snapshot.source,
    },
    portfolio: {
      archivedAt: portfolio.archived_at,
      contentHash: job.portfolio_content_hash,
      id: portfolio.id,
      label: portfolio.label,
    },
    resume: {
      archivedAt: resume.archived_at,
      contentHash: job.resume_content_hash,
      id: resume.id,
      label: resume.label,
    },
  };
}
