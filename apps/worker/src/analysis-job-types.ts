import type {
  AnalysisDiagnostics,
  AnalysisEventCallback,
  AnalysisJobResponse,
  AnalysisResultCallback,
  N8nDispatchPayload,
} from "@workspace/contracts";
import type { Database } from "@workspace/contracts/database";

export type AnalysisJobRow =
  Database["public"]["Tables"]["analysis_jobs"]["Row"];
export type AnalysisResultRow =
  Database["public"]["Tables"]["analysis_results"]["Row"];
export type ApplicationRow =
  Database["public"]["Tables"]["applications"]["Row"];
export type DocumentRow =
  Database["public"]["Tables"]["document_versions"]["Row"];
export type PostingRow = Database["public"]["Tables"]["job_postings"]["Row"];
export type SnapshotRow =
  Database["public"]["Tables"]["job_posting_snapshots"]["Row"];
export type DocumentProfileRow =
  Database["public"]["Tables"]["document_analysis_profiles"]["Row"];
export type DocumentEvidenceReviewRow =
  Database["public"]["Tables"]["document_evidence_reviews"]["Row"];
export type JobPostingProfileRow =
  Database["public"]["Tables"]["job_posting_analysis_profiles"]["Row"];

export type Dispatch = (
  payload: N8nDispatchPayload,
  env: CloudflareBindings,
) => Promise<void>;

export class AnalysisJobServiceError extends Error {
  constructor(
    readonly kind: "conflict" | "not_found" | "unavailable" | "validation",
    readonly details: Record<string, string> | null = null,
  ) {
    super(kind);
    this.name = "AnalysisJobServiceError";
  }
}

export interface AnalysisJobService {
  cancel(ownerId: string, analysisJobId: string): Promise<AnalysisJobResponse>;
  complete(input: AnalysisResultCallback): Promise<AnalysisJobResponse>;
  create(
    ownerId: string,
    applicationId: string,
    requestId: string,
  ): Promise<AnalysisJobResponse>;
  event(input: AnalysisEventCallback): Promise<AnalysisJobResponse>;
  failStale(cutoff: string, limit: number): Promise<string[]>;
  get(ownerId: string, analysisJobId: string): Promise<AnalysisJobResponse>;
  diagnostics(
    ownerId: string,
    analysisJobId: string,
  ): Promise<AnalysisDiagnostics>;
  list(ownerId: string, applicationId: string): Promise<AnalysisJobResponse[]>;
  retry(ownerId: string, analysisJobId: string): Promise<AnalysisJobResponse>;
  recoverStale(
    ownerId: string,
    analysisJobId: string,
  ): Promise<AnalysisJobResponse>;
}
