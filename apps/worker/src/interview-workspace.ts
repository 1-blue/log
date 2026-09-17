import {
  type AnalysisHistoryItem,
  type AnalysisMatchCounts,
  type AnalysisRequirementReview,
  type AnalysisResult,
  AnalysisResultSchema,
  type AnalysisReview,
  AnalysisStepSchema,
  type AnalysisWorkspace,
  calculateAnalysisFitScore,
  type CreateInterviewChecklistItemRequest,
  type CreateInterviewNoteRequest,
  type InterviewAnswerRevision,
  type InterviewChecklistItem,
  type InterviewNote,
  type InterviewQuestion,
  type PatchInterviewChecklistItemRequest,
  type PatchInterviewNoteRequest,
  type SaveInterviewAnswerRequest,
  type UpdateAnalysisReviewRequest,
} from "@workspace/contracts";
import type { Database, Json } from "@workspace/contracts/database";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { mapAnalysisJob } from "./analysis-jobs.js";

type AnalysisJobRow = Database["public"]["Tables"]["analysis_jobs"]["Row"];
type AnalysisResultRow =
  Database["public"]["Tables"]["analysis_results"]["Row"];
type AnalysisReviewRow =
  Database["public"]["Tables"]["analysis_reviews"]["Row"];
type RequirementReviewRow =
  Database["public"]["Tables"]["analysis_requirement_reviews"]["Row"];
type AnswerRow = Database["public"]["Tables"]["interview_answers"]["Row"];
type ChecklistRow =
  Database["public"]["Tables"]["interview_checklist_items"]["Row"];
type ChecklistUpdate =
  Database["public"]["Tables"]["interview_checklist_items"]["Update"];
type NoteRow = Database["public"]["Tables"]["interview_notes"]["Row"];
type QuestionRow = Database["public"]["Tables"]["interview_questions"]["Row"];
type ExecutionRow =
  Database["public"]["Tables"]["analysis_step_executions"]["Row"];
type DocumentRow = Database["public"]["Tables"]["document_versions"]["Row"];
type SnapshotRow = Database["public"]["Tables"]["job_posting_snapshots"]["Row"];

function evidenceContext(sourceText: string, excerpt: string): string | null {
  const needle = excerpt.trim();
  const index = sourceText.indexOf(needle);
  if (index < 0) return null;

  const start = Math.max(0, index - 180);
  const end = Math.min(sourceText.length, index + needle.length + 260);
  const context = sourceText.slice(start, end).replace(/\s+/g, " ").trim();
  return context || null;
}

function enrichResultEvidence(
  result: AnalysisResult,
  job: AnalysisJobRow,
): AnalysisResult {
  const sourceText = {
    job_posting: job.job_posting_text,
    portfolio: job.portfolio_text,
    resume: job.resume_text,
  } as const;
  const enrich = (
    evidence: AnalysisResult["job"]["requirements"][number]["evidence"][number],
  ) => ({
    ...evidence,
    context: evidenceContext(sourceText[evidence.source], evidence.excerpt),
  });

  return {
    ...result,
    comparison: {
      ...result.comparison,
      gaps: result.comparison.gaps.map((gap) => ({
        ...gap,
        evidence: gap.evidence.map(enrich),
      })),
      interviewQuestions: result.comparison.interviewQuestions.map(
        (question) => ({
          ...question,
          answerEvidence: question.answerEvidence.map(enrich),
        }),
      ),
      matches: result.comparison.matches.map((match) => ({
        ...match,
        profileEvidence: match.profileEvidence.map(enrich),
      })),
    },
    job: {
      ...result.job,
      requirements: result.job.requirements.map((requirement) => ({
        ...requirement,
        evidence: requirement.evidence.map(enrich),
      })),
      technologies: result.job.technologies.map((technology) => ({
        ...technology,
        evidence: technology.evidence.map(enrich),
      })),
      traits: result.job.traits.map((trait) => ({
        ...trait,
        evidence: trait.evidence.map(enrich),
      })),
    },
  };
}

export class InterviewWorkspaceServiceError extends Error {
  constructor(
    readonly kind: "conflict" | "not_found" | "unavailable" | "validation",
    readonly details: Record<string, string> | null = null,
  ) {
    super(kind);
    this.name = "InterviewWorkspaceServiceError";
  }
}

export interface InterviewWorkspaceService {
  archiveChecklist(
    ownerId: string,
    itemId: string,
    expectedUpdatedAt: string,
  ): Promise<InterviewChecklistItem>;
  archiveNote(
    ownerId: string,
    noteId: string,
    expectedUpdatedAt: string,
  ): Promise<InterviewNote>;
  createChecklist(
    ownerId: string,
    analysisJobId: string,
    input: CreateInterviewChecklistItemRequest,
  ): Promise<InterviewChecklistItem>;
  createNote(
    ownerId: string,
    applicationId: string,
    input: CreateInterviewNoteRequest,
  ): Promise<InterviewNote>;
  getWorkspace(
    ownerId: string,
    analysisJobId: string,
    compareTo?: string,
  ): Promise<AnalysisWorkspace>;
  listAnswers(
    ownerId: string,
    questionId: string,
  ): Promise<InterviewAnswerRevision[]>;
  patchChecklist(
    ownerId: string,
    itemId: string,
    input: PatchInterviewChecklistItemRequest,
  ): Promise<InterviewChecklistItem>;
  patchNote(
    ownerId: string,
    noteId: string,
    input: PatchInterviewNoteRequest,
  ): Promise<InterviewNote>;
  reorderChecklist(
    ownerId: string,
    analysisJobId: string,
    itemIds: string[],
  ): Promise<InterviewChecklistItem[]>;
  saveAnswer(
    ownerId: string,
    questionId: string,
    input: SaveInterviewAnswerRequest,
  ): Promise<{
    currentAnswer: InterviewAnswerRevision | null;
    revisionCount: number;
  }>;
  saveReview(
    ownerId: string,
    analysisJobId: string,
    input: UpdateAnalysisReviewRequest,
  ): Promise<{ review: AnalysisReview; reviewedFitScore: number | null }>;
}

function createSupabaseAdminClient(env: CloudflareBindings) {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function mapAnswer(row: AnswerRow): InterviewAnswerRevision {
  return {
    answer: row.answer,
    createdAt: row.created_at,
    id: row.id,
    questionId: row.question_id,
    revision: row.revision,
  };
}

function mapChecklist(row: ChecklistRow): InterviewChecklistItem {
  return {
    analysisJobId: row.analysis_job_id,
    archivedAt: row.archived_at,
    completedAt: row.completed_at,
    content: row.content,
    createdAt: row.created_at,
    id: row.id,
    position: row.position,
    priority: row.priority,
    source: row.source,
    sourceKey: row.source_key,
    updatedAt: row.updated_at,
  };
}

function mapNote(row: NoteRow): InterviewNote {
  return {
    analysisJobId: row.analysis_job_id,
    applicationId: row.application_id,
    archivedAt: row.archived_at,
    content: row.content,
    createdAt: row.created_at,
    followUpActions: row.follow_up_actions,
    id: row.id,
    improvements: row.improvements,
    interviewedAt: row.interviewed_at,
    questionsAsked: row.questions_asked,
    roundLabel: row.round_label,
    updatedAt: row.updated_at,
    wentWell: row.went_well,
  };
}

function mapExecution(row: ExecutionRow) {
  const parsed = AnalysisStepSchema.safeParse({
    attemptCount: row.attempt_count,
    inputTokens: row.input_tokens,
    latencyMs: row.latency_ms,
    model: row.model,
    outputTokens: row.output_tokens,
    promptVersion: row.prompt_version,
    responseId: row.response_id,
    step: row.step,
  });
  if (!parsed.success) throw new InterviewWorkspaceServiceError("unavailable");
  return parsed.data;
}

function countMatches(
  matches: { status: "matched" | "missing" | "partial" | "unknown" }[],
): AnalysisMatchCounts {
  const counts: AnalysisMatchCounts = {
    matched: 0,
    missing: 0,
    partial: 0,
    unknown: 0,
  };
  for (const match of matches) counts[match.status] += 1;
  return counts;
}

function mapReview(
  review: AnalysisReviewRow | null,
  requirements: RequirementReviewRow[],
): AnalysisReview {
  return {
    overallNote: review?.overall_note ?? null,
    requirements: requirements.map(
      (item): AnalysisRequirementReview => ({
        note: item.note,
        overrideStatus: item.override_status,
        requirementId: item.requirement_id,
      }),
    ),
    updatedAt: review?.updated_at ?? null,
  };
}

function reviewedScore(
  resultRow: AnalysisResultRow | null,
  reviews: RequirementReviewRow[],
): number | null {
  if (!resultRow) return null;
  const parsed = AnalysisResultSchema.safeParse(resultRow.result);
  if (!parsed.success) throw new InterviewWorkspaceServiceError("unavailable");
  const overrides = new Map(
    reviews
      .filter((review) => review.override_status !== null)
      .map((review) => [review.requirement_id, review.override_status!]),
  );
  return calculateAnalysisFitScore(
    parsed.data.job.requirements,
    parsed.data.comparison.matches.map((match) => ({
      ...match,
      status: overrides.get(match.requirementId) ?? match.status,
    })),
  );
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
      return {
        analysisJobId: job.id,
        completedAt: job.finished_at,
        createdAt: job.created_at,
        executions: executionQuery.data
          .filter((execution) => execution.analysis_job_id === job.id)
          .map(mapExecution),
        fitScore: parsed.data.fitScore,
        gapCount: parsed.data.comparison.gaps.length,
        matchCounts: countMatches(parsed.data.comparison.matches),
        questionCount: parsed.data.comparison.interviewQuestions.length,
        sources: this.mapSources(job, snapshot, resume, portfolio),
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
            executions: (executionQuery.data ?? []).map(mapExecution),
            schemaVersion: resultRow.schema_version,
          }
        : null,
      review: mapReview(reviewQuery.data, requirements),
      reviewedFitScore: reviewedScore(resultRow, requirements),
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
