import {
  type AnalysisHistoryItem,
  AnalysisResultSchema,
  type CreateInterviewChecklistItemRequest,
  type CreateInterviewNoteRequest,
  type InterviewQuestion,
  type PatchInterviewChecklistItemRequest,
  type PatchInterviewNoteRequest,
  type SaveInterviewAnswerRequest,
  summarizeAnalysisExecutions,
  type UpdateAnalysisReviewRequest,
} from "@workspace/contracts";
import type { Database, Json } from "@workspace/contracts/database";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { mapAnalysisJob } from "./analysis-jobs.js";
import {
  countMatches,
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
import {
  type AnalysisJobRow,
  type AnswerRow,
  type ChecklistUpdate,
  type DocumentRow,
  type InterviewWorkspaceService,
  InterviewWorkspaceServiceError,
  type QuestionRow,
  type SnapshotRow,
} from "./interview-workspace-types.js";

export type { InterviewWorkspaceService } from "./interview-workspace-types.js";
export { InterviewWorkspaceServiceError } from "./interview-workspace-types.js";

function createSupabaseAdminClient(env: CloudflareBindings) {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

class SupabaseInterviewWorkspaceService implements InterviewWorkspaceService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  private async getJob(ownerId: string, analysisJobId: string) {
    const { data, error } = await this.supabase
      .from("analysis_jobs")
      .select("*")
      .eq("id", analysisJobId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) throw new InterviewWorkspaceServiceError("unavailable");
    if (!data) throw new InterviewWorkspaceServiceError("not_found");
    return data;
  }

  private async getQuestion(ownerId: string, questionId: string) {
    const { data, error } = await this.supabase
      .from("interview_questions")
      .select("*")
      .eq("id", questionId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) throw new InterviewWorkspaceServiceError("unavailable");
    if (!data) throw new InterviewWorkspaceServiceError("not_found");
    return data;
  }

  private async getChecklist(ownerId: string, itemId: string) {
    const { data, error } = await this.supabase
      .from("interview_checklist_items")
      .select("*")
      .eq("id", itemId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) throw new InterviewWorkspaceServiceError("unavailable");
    if (!data) throw new InterviewWorkspaceServiceError("not_found");
    return data;
  }

  private async getNote(ownerId: string, noteId: string) {
    const { data, error } = await this.supabase
      .from("interview_notes")
      .select("*")
      .eq("id", noteId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) throw new InterviewWorkspaceServiceError("unavailable");
    if (!data) throw new InterviewWorkspaceServiceError("not_found");
    return data;
  }

  private async history(
    ownerId: string,
    applicationId: string,
  ): Promise<AnalysisHistoryItem[]> {
    const { data: jobs, error } = await this.supabase
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
        this.supabase
          .from("analysis_results")
          .select("*")
          .eq("owner_id", ownerId)
          .in("analysis_job_id", jobIds),
        this.supabase
          .from("job_posting_snapshots")
          .select("*")
          .eq("owner_id", ownerId)
          .in("id", snapshotIds),
        this.supabase
          .from("document_versions")
          .select("*")
          .eq("owner_id", ownerId)
          .in("id", documentIds),
        this.supabase
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
      if (
        !resultRow ||
        !snapshot ||
        !resume ||
        !portfolio ||
        !job.finished_at
      ) {
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
        sources: this.mapSources(job, snapshot, resume, portfolio),
        usageSummary: summarizeAnalysisExecutions(executions),
        inputAudit: mapInputAudit(job, snapshot, resume, portfolio),
      };
    });
  }

  private mapSources(
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

  async getWorkspace(
    ownerId: string,
    analysisJobId: string,
    compareTo?: string,
  ) {
    const job = await this.getJob(ownerId, analysisJobId);
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
      this.supabase
        .from("analysis_results")
        .select("*")
        .eq("analysis_job_id", job.id)
        .eq("owner_id", ownerId)
        .maybeSingle(),
      this.supabase
        .from("applications")
        .select("*")
        .eq("id", job.application_id)
        .eq("owner_id", ownerId)
        .maybeSingle(),
      this.supabase
        .from("job_postings")
        .select("*")
        .eq("id", job.job_posting_id)
        .eq("owner_id", ownerId)
        .maybeSingle(),
      this.supabase
        .from("job_posting_snapshots")
        .select("*")
        .eq("id", job.job_posting_snapshot_id)
        .eq("owner_id", ownerId)
        .maybeSingle(),
      this.supabase
        .from("document_versions")
        .select("*")
        .eq("owner_id", ownerId)
        .in("id", [job.resume_version_id, job.portfolio_version_id]),
      this.supabase
        .from("analysis_step_executions")
        .select("*")
        .eq("analysis_job_id", job.id)
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: true }),
      this.supabase
        .from("analysis_reviews")
        .select("*")
        .eq("analysis_job_id", job.id)
        .eq("owner_id", ownerId)
        .maybeSingle(),
      this.supabase
        .from("analysis_requirement_reviews")
        .select("*")
        .eq("analysis_job_id", job.id)
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: true }),
      this.supabase
        .from("interview_questions")
        .select("*")
        .eq("analysis_job_id", job.id)
        .eq("owner_id", ownerId)
        .order("source_index", { ascending: true }),
      this.supabase
        .from("interview_checklist_items")
        .select("*")
        .eq("analysis_job_id", job.id)
        .eq("owner_id", ownerId)
        .is("archived_at", null)
        .order("position", { ascending: true })
        .order("id", { ascending: true }),
      this.supabase
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

    const questionIds = (questionQuery.data ?? []).map(
      (question) => question.id,
    );
    const answerQuery =
      questionIds.length === 0
        ? { data: [] as AnswerRow[], error: null }
        : await this.supabase
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
    const history = await this.history(ownerId, job.application_id);
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
      sources: this.mapSources(job, snapshot, resume, portfolio),
    };
  }

  async saveReview(
    ownerId: string,
    analysisJobId: string,
    input: UpdateAnalysisReviewRequest,
  ) {
    const { data, error } = await this.supabase.rpc("save_analysis_review", {
      p_analysis_job_id: analysisJobId,
      p_expected_updated_at: input.expectedUpdatedAt as string,
      p_overall_note: input.overallNote as string,
      p_owner_id: ownerId,
      p_requirements: input.requirements as unknown as Json,
    });
    if (error || !data) {
      if (error?.code === "P0002")
        throw new InterviewWorkspaceServiceError("not_found");
      if (error?.code === "40001") {
        throw new InterviewWorkspaceServiceError("conflict", {
          reason: "stale_update",
        });
      }
      if (error?.code === "23514")
        throw new InterviewWorkspaceServiceError("validation");
      throw new InterviewWorkspaceServiceError("unavailable");
    }
    const { data: requirements, error: requirementError } = await this.supabase
      .from("analysis_requirement_reviews")
      .select("*")
      .eq("analysis_job_id", analysisJobId)
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true });
    const { data: result, error: resultError } = await this.supabase
      .from("analysis_results")
      .select("*")
      .eq("analysis_job_id", analysisJobId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (requirementError || resultError)
      throw new InterviewWorkspaceServiceError("unavailable");
    return {
      review: mapReview(data, requirements),
      reviewedFitScore: reviewedScore(result, requirements),
    };
  }

  async listAnswers(ownerId: string, questionId: string) {
    await this.getQuestion(ownerId, questionId);
    const { data, error } = await this.supabase
      .from("interview_answers")
      .select("*")
      .eq("question_id", questionId)
      .eq("owner_id", ownerId)
      .order("revision", { ascending: false })
      .limit(100);
    if (error) throw new InterviewWorkspaceServiceError("unavailable");
    return data.map(mapAnswer);
  }

  async saveAnswer(
    ownerId: string,
    questionId: string,
    input: SaveInterviewAnswerRequest,
  ) {
    const { error } = await this.supabase.rpc("save_interview_answer", {
      p_answer: input.answer as string,
      p_owner_id: ownerId,
      p_question_id: questionId,
    });
    if (error) {
      if (error.code === "P0002")
        throw new InterviewWorkspaceServiceError("not_found");
      if (error.code === "23514")
        throw new InterviewWorkspaceServiceError("validation");
      throw new InterviewWorkspaceServiceError("unavailable");
    }
    const answers = await this.listAnswers(ownerId, questionId);
    return {
      currentAnswer: answers[0] ?? null,
      revisionCount: answers.length,
    };
  }

  async createChecklist(
    ownerId: string,
    analysisJobId: string,
    input: CreateInterviewChecklistItemRequest,
  ) {
    const job = await this.getJob(ownerId, analysisJobId);
    if (job.status !== "succeeded") {
      throw new InterviewWorkspaceServiceError("conflict", {
        reason: "analysis_not_completed",
      });
    }
    const { data: last, error: lastError } = await this.supabase
      .from("interview_checklist_items")
      .select("position")
      .eq("analysis_job_id", analysisJobId)
      .eq("owner_id", ownerId)
      .is("archived_at", null)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) throw new InterviewWorkspaceServiceError("unavailable");
    const { data, error } = await this.supabase
      .from("interview_checklist_items")
      .insert({
        analysis_job_id: analysisJobId,
        content: input.content,
        owner_id: ownerId,
        position: (last?.position ?? -1) + 1,
        priority: input.priority,
        source: "custom",
      })
      .select("*")
      .single();
    if (error || !data) throw new InterviewWorkspaceServiceError("unavailable");
    return mapChecklist(data);
  }

  async patchChecklist(
    ownerId: string,
    itemId: string,
    input: PatchInterviewChecklistItemRequest,
  ) {
    const current = await this.getChecklist(ownerId, itemId);
    if (current.archived_at) {
      throw new InterviewWorkspaceServiceError("conflict", {
        reason: "item_archived",
      });
    }
    const updates: ChecklistUpdate = {};
    if (input.content !== undefined) updates.content = input.content;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.completed !== undefined) {
      updates.completed_at = input.completed ? new Date().toISOString() : null;
    }
    const { data, error } = await this.supabase
      .from("interview_checklist_items")
      .update(updates)
      .eq("id", itemId)
      .eq("owner_id", ownerId)
      .eq("updated_at", input.expectedUpdatedAt)
      .is("archived_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw new InterviewWorkspaceServiceError("unavailable");
    if (!data) {
      throw new InterviewWorkspaceServiceError("conflict", {
        reason: "stale_update",
      });
    }
    return mapChecklist(data);
  }

  async archiveChecklist(
    ownerId: string,
    itemId: string,
    expectedUpdatedAt: string,
  ) {
    await this.getChecklist(ownerId, itemId);
    const { data, error } = await this.supabase
      .from("interview_checklist_items")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", itemId)
      .eq("owner_id", ownerId)
      .eq("updated_at", expectedUpdatedAt)
      .is("archived_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw new InterviewWorkspaceServiceError("unavailable");
    if (!data) {
      throw new InterviewWorkspaceServiceError("conflict", {
        reason: "stale_update",
      });
    }
    return mapChecklist(data);
  }

  async reorderChecklist(
    ownerId: string,
    analysisJobId: string,
    itemIds: string[],
  ) {
    const { data, error } = await this.supabase.rpc(
      "reorder_interview_checklist",
      {
        p_analysis_job_id: analysisJobId,
        p_item_ids: itemIds,
        p_owner_id: ownerId,
      },
    );
    if (error) {
      if (error.code === "P0002")
        throw new InterviewWorkspaceServiceError("not_found");
      if (error.code === "23514") {
        throw new InterviewWorkspaceServiceError("conflict", {
          reason: "checklist_changed",
        });
      }
      throw new InterviewWorkspaceServiceError("unavailable");
    }
    return data.map(mapChecklist);
  }

  async createNote(
    ownerId: string,
    applicationId: string,
    input: CreateInterviewNoteRequest,
  ) {
    const job = await this.getJob(ownerId, input.analysisJobId);
    if (job.application_id !== applicationId) {
      throw new InterviewWorkspaceServiceError("validation");
    }
    const { data, error } = await this.supabase
      .from("interview_notes")
      .insert({
        analysis_job_id: input.analysisJobId,
        application_id: applicationId,
        content: input.content,
        follow_up_actions: input.followUpActions,
        improvements: input.improvements,
        interviewed_at: input.interviewedAt,
        owner_id: ownerId,
        questions_asked: input.questionsAsked,
        round_label: input.roundLabel,
        went_well: input.wentWell,
      })
      .select("*")
      .single();
    if (error || !data) {
      if (error?.code === "23514" || error?.code === "23503")
        throw new InterviewWorkspaceServiceError("validation");
      throw new InterviewWorkspaceServiceError("unavailable");
    }
    return mapNote(data);
  }

  async patchNote(
    ownerId: string,
    noteId: string,
    input: PatchInterviewNoteRequest,
  ) {
    const current = await this.getNote(ownerId, noteId);
    if (current.archived_at) {
      throw new InterviewWorkspaceServiceError("conflict", {
        reason: "note_archived",
      });
    }
    const { data, error } = await this.supabase
      .from("interview_notes")
      .update({
        content: input.content,
        follow_up_actions: input.followUpActions,
        improvements: input.improvements,
        interviewed_at: input.interviewedAt,
        questions_asked: input.questionsAsked,
        round_label: input.roundLabel,
        went_well: input.wentWell,
      })
      .eq("id", noteId)
      .eq("owner_id", ownerId)
      .eq("updated_at", input.expectedUpdatedAt)
      .is("archived_at", null)
      .select("*")
      .maybeSingle();
    if (error) {
      if (error.code === "23514")
        throw new InterviewWorkspaceServiceError("validation");
      throw new InterviewWorkspaceServiceError("unavailable");
    }
    if (!data) {
      throw new InterviewWorkspaceServiceError("conflict", {
        reason: "stale_update",
      });
    }
    return mapNote(data);
  }

  async archiveNote(
    ownerId: string,
    noteId: string,
    expectedUpdatedAt: string,
  ) {
    await this.getNote(ownerId, noteId);
    const { data, error } = await this.supabase
      .from("interview_notes")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", noteId)
      .eq("owner_id", ownerId)
      .eq("updated_at", expectedUpdatedAt)
      .is("archived_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw new InterviewWorkspaceServiceError("unavailable");
    if (!data) {
      throw new InterviewWorkspaceServiceError("conflict", {
        reason: "stale_update",
      });
    }
    return mapNote(data);
  }
}

export function createInterviewWorkspaceService(
  env: CloudflareBindings,
): InterviewWorkspaceService {
  return new SupabaseInterviewWorkspaceService(createSupabaseAdminClient(env));
}
