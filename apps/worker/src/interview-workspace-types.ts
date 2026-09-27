import type {
  AnalysisReview,
  AnalysisWorkspace,
  CreateInterviewChecklistItemRequest,
  CreateInterviewNoteRequest,
  InterviewAnswerRevision,
  InterviewChecklistItem,
  InterviewNote,
  PatchInterviewChecklistItemRequest,
  PatchInterviewNoteRequest,
  SaveInterviewAnswerRequest,
  UpdateAnalysisReviewRequest,
} from "@workspace/contracts";
import type { Database } from "@workspace/contracts/database";

export type AnalysisJobRow =
  Database["public"]["Tables"]["analysis_jobs"]["Row"];
export type AnalysisResultRow =
  Database["public"]["Tables"]["analysis_results"]["Row"];
export type AnalysisReviewRow =
  Database["public"]["Tables"]["analysis_reviews"]["Row"];
export type RequirementReviewRow =
  Database["public"]["Tables"]["analysis_requirement_reviews"]["Row"];
export type AnswerRow =
  Database["public"]["Tables"]["interview_answers"]["Row"];
export type ChecklistRow =
  Database["public"]["Tables"]["interview_checklist_items"]["Row"];
export type ChecklistUpdate =
  Database["public"]["Tables"]["interview_checklist_items"]["Update"];
export type NoteRow = Database["public"]["Tables"]["interview_notes"]["Row"];
export type QuestionRow =
  Database["public"]["Tables"]["interview_questions"]["Row"];
export type ExecutionRow =
  Database["public"]["Tables"]["analysis_step_executions"]["Row"];
export type DocumentRow =
  Database["public"]["Tables"]["document_versions"]["Row"];
export type SnapshotRow =
  Database["public"]["Tables"]["job_posting_snapshots"]["Row"];

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
