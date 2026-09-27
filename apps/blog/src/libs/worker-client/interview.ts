"use client";

import {
  type CreateInterviewChecklistItemRequest,
  type CreateInterviewNoteRequest,
  type InterviewAnswerHistoryResponse,
  InterviewAnswerHistoryResponseSchema,
  type InterviewAnswerResponse,
  InterviewAnswerResponseSchema,
  type InterviewChecklistItemResponse,
  InterviewChecklistItemResponseSchema,
  type InterviewChecklistListResponse,
  InterviewChecklistListResponseSchema,
  type InterviewNoteResponse,
  InterviewNoteResponseSchema,
  type PatchInterviewChecklistItemRequest,
  type PatchInterviewNoteRequest,
  type SaveInterviewAnswerRequest,
} from "@workspace/contracts";

import { requestWorker } from "./core";

export function saveInterviewAnswer(
  questionId: string,
  input: SaveInterviewAnswerRequest,
): Promise<InterviewAnswerResponse> {
  return requestWorker(
    `/v1/interview-questions/${questionId}/answer`,
    InterviewAnswerResponseSchema,
    { body: JSON.stringify(input), method: "PUT" },
  );
}

export function listInterviewAnswerRevisions(
  questionId: string,
): Promise<InterviewAnswerHistoryResponse> {
  return requestWorker(
    `/v1/interview-questions/${questionId}/answers`,
    InterviewAnswerHistoryResponseSchema,
  );
}

export function createInterviewChecklistItem(
  analysisJobId: string,
  input: CreateInterviewChecklistItemRequest,
): Promise<InterviewChecklistItemResponse> {
  return requestWorker(
    `/v1/analysis-jobs/${analysisJobId}/checklist-items`,
    InterviewChecklistItemResponseSchema,
    { body: JSON.stringify(input), method: "POST" },
    true,
  );
}

export function patchInterviewChecklistItem(
  itemId: string,
  input: PatchInterviewChecklistItemRequest,
): Promise<InterviewChecklistItemResponse> {
  return requestWorker(
    `/v1/interview-checklist-items/${itemId}`,
    InterviewChecklistItemResponseSchema,
    { body: JSON.stringify(input), method: "PATCH" },
  );
}

export function archiveInterviewChecklistItem(
  itemId: string,
  expectedUpdatedAt: string,
): Promise<InterviewChecklistItemResponse> {
  return requestWorker(
    `/v1/interview-checklist-items/${itemId}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`,
    InterviewChecklistItemResponseSchema,
    { method: "DELETE" },
  );
}

export function reorderInterviewChecklist(
  analysisJobId: string,
  itemIds: string[],
): Promise<InterviewChecklistListResponse> {
  return requestWorker(
    `/v1/analysis-jobs/${analysisJobId}/checklist-order`,
    InterviewChecklistListResponseSchema,
    { body: JSON.stringify({ itemIds }), method: "PUT" },
  );
}

export function createInterviewNote(
  applicationId: string,
  input: CreateInterviewNoteRequest,
): Promise<InterviewNoteResponse> {
  return requestWorker(
    `/v1/applications/${applicationId}/interview-notes`,
    InterviewNoteResponseSchema,
    { body: JSON.stringify(input), method: "POST" },
    true,
  );
}

export function patchInterviewNote(
  noteId: string,
  input: PatchInterviewNoteRequest,
): Promise<InterviewNoteResponse> {
  return requestWorker(
    `/v1/interview-notes/${noteId}`,
    InterviewNoteResponseSchema,
    { body: JSON.stringify(input), method: "PATCH" },
  );
}

export function archiveInterviewNote(
  noteId: string,
  expectedUpdatedAt: string,
): Promise<InterviewNoteResponse> {
  return requestWorker(
    `/v1/interview-notes/${noteId}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`,
    InterviewNoteResponseSchema,
    { method: "DELETE" },
  );
}
