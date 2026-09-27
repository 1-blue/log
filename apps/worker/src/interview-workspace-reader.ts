import {
  type AnalysisHistoryItem,
  AnalysisResultSchema,
  type InterviewQuestion,
  summarizeAnalysisExecutions,
} from "@workspace/contracts";
import type { Database } from "@workspace/contracts/database";

import type { SupabaseClient } from "@supabase/supabase-js";

import { mapAnalysisJob } from "./analysis-jobs.js";
import { getAnalysisHistory } from "./interview-workspace-history.js";
import {
  enrichResultEvidence,
  evidenceCoverage,
  mapAnswer,
  mapChecklist,
  mapExecution,
  mapInputAudit,
  mapNote,
  mapReview,
  reviewedScore,
} from "./interview-workspace-mappers.js";
import { mapWorkspaceSources } from "./interview-workspace-sources.js";
import {
  type AnswerRow,
  InterviewWorkspaceServiceError,
  type QuestionRow,
} from "./interview-workspace-types.js";

export async function getInterviewWorkspace(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  analysisJobId: string,
  compareTo?: string,
) {
  const { data: job, error: jobError } = await supabase
    .from("analysis_jobs")
    .select("*")
    .eq("id", analysisJobId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (jobError) throw new InterviewWorkspaceServiceError("unavailable");
  if (!job) throw new InterviewWorkspaceServiceError("not_found");

  const [
    resultQuery,
    applicationQuery,
    postingQuery,
    snapshotQuery,
    documentQuery,
    executionQuery,
    reviewQuery,
    requirementReviewQuery,
    questionQuery,
    checklistQuery,
    noteQuery,
  ] = await Promise.all([
    supabase
      .from("analysis_results")
      .select("*")
      .eq("analysis_job_id", job.id)
      .eq("owner_id", ownerId)
      .maybeSingle(),
    supabase
      .from("applications")
      .select("*")
      .eq("id", job.application_id)
      .eq("owner_id", ownerId)
      .maybeSingle(),
    supabase
      .from("job_postings")
      .select("*")
      .eq("id", job.job_posting_id)
      .eq("owner_id", ownerId)
      .maybeSingle(),
    supabase
      .from("job_posting_snapshots")
      .select("*")
      .eq("id", job.job_posting_snapshot_id)
      .eq("owner_id", ownerId)
      .maybeSingle(),
    supabase
      .from("document_versions")
      .select("*")
      .eq("owner_id", ownerId)
      .in("id", [job.resume_version_id, job.portfolio_version_id]),
    supabase
      .from("analysis_step_executions")
      .select("*")
      .eq("analysis_job_id", job.id)
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true }),
    supabase
      .from("analysis_reviews")
      .select("*")
      .eq("analysis_job_id", job.id)
      .eq("owner_id", ownerId)
      .maybeSingle(),
    supabase
      .from("analysis_requirement_reviews")
      .select("*")
      .eq("analysis_job_id", job.id)
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true }),
    supabase
      .from("interview_questions")
      .select("*")
      .eq("analysis_job_id", job.id)
      .eq("owner_id", ownerId)
      .order("source_index", { ascending: true }),
    supabase
      .from("interview_checklist_items")
      .select("*")
      .eq("analysis_job_id", job.id)
      .eq("owner_id", ownerId)
      .is("archived_at", null)
      .order("position", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("interview_notes")
      .select("*")
      .eq("application_id", job.application_id)
      .eq("owner_id", ownerId)
      .is("archived_at", null)
      .order("interviewed_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  const queries = [
    resultQuery,
    applicationQuery,
    postingQuery,
    snapshotQuery,
    documentQuery,
    executionQuery,
    reviewQuery,
    requirementReviewQuery,
    questionQuery,
    checklistQuery,
    noteQuery,
  ];
  if (queries.some((query) => query.error)) {
    throw new InterviewWorkspaceServiceError("unavailable");
  }
  const application = applicationQuery.data;
  const posting = postingQuery.data;
  const snapshot = snapshotQuery.data;
  const resume = documentQuery.data?.find(
    (document) => document.id === job.resume_version_id,
  );
  const portfolio = documentQuery.data?.find(
    (document) => document.id === job.portfolio_version_id,
  );
  if (!application || !posting || !snapshot || !resume || !portfolio) {
    throw new InterviewWorkspaceServiceError("unavailable");
  }

  const questionIds = (questionQuery.data ?? []).map((question) => question.id);
  const answerQuery =
    questionIds.length === 0
      ? { data: [] as AnswerRow[], error: null }
      : await supabase
          .from("interview_answers")
          .select("*")
          .eq("owner_id", ownerId)
          .in("question_id", questionIds)
          .order("revision", { ascending: false });
  if (answerQuery.error)
    throw new InterviewWorkspaceServiceError("unavailable");
  const answersByQuestion = new Map<string, AnswerRow[]>();
  for (const answer of answerQuery.data) {
    const current = answersByQuestion.get(answer.question_id) ?? [];
    current.push(answer);
    answersByQuestion.set(answer.question_id, current);
  }

  const resultRow = resultQuery.data;
  const parsedResult = resultRow
    ? AnalysisResultSchema.safeParse(resultRow.result)
    : null;
  if (parsedResult && !parsedResult.success) {
    throw new InterviewWorkspaceServiceError("unavailable");
  }
  const executions = (executionQuery.data ?? []).map(mapExecution);
  const workspaceJob = mapAnalysisJob(job, resultRow);
  if (workspaceJob.result) {
    workspaceJob.result = enrichResultEvidence(workspaceJob.result, job);
  }
  const resultQuestionsByIndex = new Map(
    (parsedResult?.data.comparison.interviewQuestions ?? []).map(
      (item, index) => [index, item] as const,
    ),
  );
  const history = await getAnalysisHistory(
    supabase,
    ownerId,
    job.application_id,
  );
  let comparison: AnalysisHistoryItem | null = null;
  if (compareTo) {
    if (compareTo === job.id) {
      throw new InterviewWorkspaceServiceError("validation", {
        reason: "comparison_self",
      });
    }
    comparison =
      history.find((item) => item.analysisJobId === compareTo) ?? null;
    if (!comparison) {
      throw new InterviewWorkspaceServiceError("not_found", {
        reason: "comparison_not_found",
      });
    }
  }

  const requirements = requirementReviewQuery.data ?? [];
  return {
    application: {
      attemptNumber: application.attempt_number,
      companyName: posting.company_name,
      id: application.id,
      interviewAt: application.interview_at,
      status: application.status,
      title: posting.title,
    },
    checklist: (checklistQuery.data ?? []).map(mapChecklist),
    comparison,
    history,
    interviewNotes: (noteQuery.data ?? []).map(mapNote),
    job: workspaceJob,
    questions: (questionQuery.data ?? []).map(
      (question: QuestionRow): InterviewQuestion => {
        const answers = answersByQuestion.get(question.id) ?? [];
        const guidance = resultQuestionsByIndex.get(question.source_index);
        return {
          analysisJobId: question.analysis_job_id,
          answerRevisionCount: answers.length,
          answerEvidence: guidance?.answerEvidence ?? [],
          answerOutline: guidance?.answerOutline ?? null,
          category: question.category,
          createdAt: question.created_at,
          currentAnswer: answers[0] ? mapAnswer(answers[0]) : null,
          id: question.id,
          intent: question.intent,
          priority: question.priority,
          question: question.question,
          requirementIds: question.requirement_ids,
          sourceIndex: question.source_index,
          modelAnswer: guidance?.modelAnswer ?? null,
        };
      },
    ),
    resultMetadata: resultRow
      ? {
          createdAt: resultRow.created_at,
          executions,
          schemaVersion: resultRow.schema_version,
          usageSummary: summarizeAnalysisExecutions(executions),
          inputAudit: mapInputAudit(job, snapshot, resume, portfolio),
        }
      : null,
    review: mapReview(reviewQuery.data, requirements),
    reviewedFitScore: reviewedScore(resultRow, requirements),
    evidenceCoverage: evidenceCoverage(parsedResult?.data ?? null),
    sources: mapWorkspaceSources(job, snapshot, resume, portfolio),
  };
}
