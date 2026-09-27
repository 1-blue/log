"use client";

import {
  type AnalysisDiagnosticsResponse,
  AnalysisDiagnosticsResponseSchema,
  type AnalysisJobListResponse,
  AnalysisJobListResponseSchema,
  type AnalysisJobStatusResponse,
  AnalysisJobStatusResponseSchema,
  type AnalysisReviewResponse,
  AnalysisReviewResponseSchema,
  type AnalysisWorkspaceResponse,
  AnalysisWorkspaceResponseSchema,
  type CreateAnalysisJobResponse,
  CreateAnalysisJobResponseSchema,
  type UpdateAnalysisReviewRequest,
} from "@workspace/contracts";

import { requestWorker } from "./core";

export function createAnalysisJob(
  applicationId: string,
): Promise<CreateAnalysisJobResponse> {
  return requestWorker(
    `/v1/applications/${applicationId}/analysis-jobs`,
    CreateAnalysisJobResponseSchema,
    { body: JSON.stringify({}), method: "POST" },
    true,
  );
}

export function listAnalysisJobs(
  applicationId: string,
): Promise<AnalysisJobListResponse> {
  return requestWorker(
    `/v1/applications/${applicationId}/analysis-jobs`,
    AnalysisJobListResponseSchema,
  );
}

export function getAnalysisJob(
  analysisJobId: string,
): Promise<AnalysisJobStatusResponse> {
  return requestWorker(
    `/v1/analysis-jobs/${analysisJobId}`,
    AnalysisJobStatusResponseSchema,
  );
}

export function getAnalysisDiagnostics(
  analysisJobId: string,
): Promise<AnalysisDiagnosticsResponse> {
  return requestWorker(
    `/v1/analysis-jobs/${analysisJobId}/diagnostics`,
    AnalysisDiagnosticsResponseSchema,
  );
}

export function recoverStaleAnalysisJob(
  analysisJobId: string,
): Promise<CreateAnalysisJobResponse> {
  return requestWorker(
    `/v1/analysis-jobs/${analysisJobId}/recover-stale`,
    CreateAnalysisJobResponseSchema,
    { body: JSON.stringify({}), method: "POST" },
    true,
  );
}

export function getAnalysisWorkspace(
  analysisJobId: string,
  compareTo?: string,
): Promise<AnalysisWorkspaceResponse> {
  const query = compareTo ? `?compareTo=${encodeURIComponent(compareTo)}` : "";
  return requestWorker(
    `/v1/analysis-jobs/${analysisJobId}/workspace${query}`,
    AnalysisWorkspaceResponseSchema,
  );
}

export function updateAnalysisReview(
  analysisJobId: string,
  input: UpdateAnalysisReviewRequest,
): Promise<AnalysisReviewResponse> {
  return requestWorker(
    `/v1/analysis-jobs/${analysisJobId}/review`,
    AnalysisReviewResponseSchema,
    { body: JSON.stringify(input), method: "PUT" },
  );
}

export function retryAnalysisJob(
  analysisJobId: string,
): Promise<CreateAnalysisJobResponse> {
  return requestWorker(
    `/v1/analysis-jobs/${analysisJobId}/retry`,
    CreateAnalysisJobResponseSchema,
    { body: JSON.stringify({}), method: "POST" },
    true,
  );
}

export function cancelAnalysisJob(
  analysisJobId: string,
): Promise<CreateAnalysisJobResponse> {
  return requestWorker(
    `/v1/analysis-jobs/${analysisJobId}/cancel`,
    CreateAnalysisJobResponseSchema,
    { body: JSON.stringify({}), method: "POST" },
    true,
  );
}
