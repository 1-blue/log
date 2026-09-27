import {
  type AnalysisHistoryItem,
  AnalysisResultSchema,
  summarizeAnalysisExecutions,
} from "@workspace/contracts";
import type { Database } from "@workspace/contracts/database";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  countMatches,
  mapExecution,
  mapInputAudit,
} from "./interview-workspace-mappers.js";
import { mapWorkspaceSources } from "./interview-workspace-sources.js";
import { InterviewWorkspaceServiceError } from "./interview-workspace-types.js";

export async function getAnalysisHistory(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  applicationId: string,
): Promise<AnalysisHistoryItem[]> {
  const { data: jobs, error } = await supabase
    .from("analysis_jobs")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("application_id", applicationId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new InterviewWorkspaceServiceError("unavailable");
  if (jobs.length === 0) return [];

  const jobIds = jobs.map((job) => job.id);
  const snapshotIds = jobs.map((job) => job.job_posting_snapshot_id);
  const documentIds = jobs.flatMap((job) => [
    job.resume_version_id,
    job.portfolio_version_id,
  ]);
  const [resultQuery, snapshotQuery, documentQuery, executionQuery] =
    await Promise.all([
      supabase
        .from("analysis_results")
        .select("*")
        .eq("owner_id", ownerId)
        .in("analysis_job_id", jobIds),
      supabase
        .from("job_posting_snapshots")
        .select("*")
        .eq("owner_id", ownerId)
        .in("id", snapshotIds),
      supabase
        .from("document_versions")
        .select("*")
        .eq("owner_id", ownerId)
        .in("id", documentIds),
      supabase
        .from("analysis_step_executions")
        .select("*")
        .eq("owner_id", ownerId)
        .in("analysis_job_id", jobIds)
        .order("created_at", { ascending: true }),
    ]);
  if (
    resultQuery.error ||
    snapshotQuery.error ||
    documentQuery.error ||
    executionQuery.error
  ) {
    throw new InterviewWorkspaceServiceError("unavailable");
  }

  const results = new Map(
    resultQuery.data.map((result) => [result.analysis_job_id, result]),
  );
  const snapshots = new Map(
    snapshotQuery.data.map((snapshot) => [snapshot.id, snapshot]),
  );
  const documents = new Map(
    documentQuery.data.map((document) => [document.id, document]),
  );

  return jobs.map((job) => {
    const resultRow = results.get(job.id);
    const snapshot = snapshots.get(job.job_posting_snapshot_id);
    const resume = documents.get(job.resume_version_id);
    const portfolio = documents.get(job.portfolio_version_id);
    if (!resultRow || !snapshot || !resume || !portfolio || !job.finished_at) {
      throw new InterviewWorkspaceServiceError("unavailable");
    }
    const parsed = AnalysisResultSchema.safeParse(resultRow.result);
    if (!parsed.success)
      throw new InterviewWorkspaceServiceError("unavailable");
    const executions = executionQuery.data
      .filter((execution) => execution.analysis_job_id === job.id)
      .map(mapExecution);
    return {
      analysisJobId: job.id,
      completedAt: job.finished_at,
      createdAt: job.created_at,
      executions,
      fitScore: parsed.data.fitScore,
      gapCount: parsed.data.comparison.gaps.length,
      matchCounts: countMatches(parsed.data.comparison.matches),
      questionCount: parsed.data.comparison.interviewQuestions.length,
      sources: mapWorkspaceSources(job, snapshot, resume, portfolio),
      usageSummary: summarizeAnalysisExecutions(executions),
      inputAudit: mapInputAudit(job, snapshot, resume, portfolio),
    };
  });
}
