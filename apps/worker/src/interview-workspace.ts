import {
  type CreateInterviewChecklistItemRequest,
  type CreateInterviewNoteRequest,
  type PatchInterviewChecklistItemRequest,
  type PatchInterviewNoteRequest,
  type SaveInterviewAnswerRequest,
  type UpdateAnalysisReviewRequest,
} from "@workspace/contracts";
import type { Database, Json } from "@workspace/contracts/database";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  mapAnswer,
  mapChecklist,
  mapNote,
  mapReview,
  reviewedScore,
} from "./interview-workspace-mappers.js";
import { getInterviewWorkspace } from "./interview-workspace-reader.js";
import {
  type ChecklistUpdate,
  type InterviewWorkspaceService,
  InterviewWorkspaceServiceError,
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

  async getWorkspace(
    ownerId: string,
    analysisJobId: string,
    compareTo?: string,
  ) {
    return getInterviewWorkspace(
      this.supabase,
      ownerId,
      analysisJobId,
      compareTo,
    );
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
