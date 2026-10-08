import type { Context } from "hono";

import { AnalysisJobServiceError } from "./analysis-jobs.js";
import { errorResponse } from "./app-response.js";
import type { WorkerAppEnv } from "./app-types.js";
import { ApplicationServiceError } from "./applications.js";
import { DocumentServiceError } from "./documents.js";
import { InterviewWorkspaceServiceError } from "./interview-workspace.js";
import { JobPostingCollectionServiceError } from "./job-posting-collections.js";
import { SlackNotificationServiceError } from "./slack-notifications.js";

export function applicationServiceErrorResponse(
  c: Context<WorkerAppEnv>,
  error: unknown,
): Response {
  if (!(error instanceof ApplicationServiceError)) throw error;

  if (error.kind === "not_found") {
    return errorResponse(c, 404, "NOT_FOUND", "지원 정보를 찾을 수 없습니다.");
  }
  if (error.kind === "validation") {
    return errorResponse(
      c,
      400,
      "VALIDATION_ERROR",
      "지원 상태와 문서 선택을 확인해 주세요.",
      false,
      error.details,
    );
  }
  if (error.kind === "conflict") {
    return errorResponse(
      c,
      409,
      "CONFLICT",
      error.details?.reason === "duplicate_job_posting"
        ? "이미 등록된 공고입니다. 기존 공고에서 재지원을 추가해 주세요."
        : "현재 지원 상태에서는 요청을 처리할 수 없습니다.",
      false,
      error.details,
    );
  }

  return errorResponse(
    c,
    503,
    "UPSTREAM_UNAVAILABLE",
    "지원 정보를 불러올 수 없습니다.",
    true,
  );
}

export function documentServiceErrorResponse(
  c: Context<WorkerAppEnv>,
  error: unknown,
): Response {
  if (!(error instanceof DocumentServiceError)) throw error;

  if (error.kind === "not_found") {
    return errorResponse(
      c,
      404,
      "NOT_FOUND",
      error.details?.reason === "publication_not_found"
        ? "현재 공개된 문서가 없습니다."
        : "문서 버전을 찾을 수 없습니다.",
    );
  }
  if (error.kind === "validation") {
    return errorResponse(
      c,
      400,
      "VALIDATION_ERROR",
      "업로드한 파일을 검증하지 못했습니다.",
      false,
      error.details,
    );
  }
  if (error.kind === "conflict") {
    return errorResponse(
      c,
      409,
      "CONFLICT",
      error.details?.reason === "upload_incomplete"
        ? "파일 업로드가 아직 완료되지 않았습니다."
        : "현재 문서 상태에서는 요청을 처리할 수 없습니다.",
      error.details?.reason === "upload_incomplete",
      error.details,
    );
  }

  return errorResponse(
    c,
    503,
    "UPSTREAM_UNAVAILABLE",
    "문서 저장소를 사용할 수 없습니다.",
    true,
  );
}

export function collectionServiceErrorResponse(
  c: Context<WorkerAppEnv>,
  error: unknown,
): Response {
  if (!(error instanceof JobPostingCollectionServiceError)) throw error;
  if (error.kind === "not_found") {
    return errorResponse(
      c,
      404,
      "NOT_FOUND",
      "공고 수집 정보를 찾을 수 없습니다.",
    );
  }
  if (error.kind === "validation") {
    return errorResponse(
      c,
      400,
      "VALIDATION_ERROR",
      "공고 수집 결과가 올바르지 않습니다.",
    );
  }
  if (error.kind === "conflict") {
    return errorResponse(
      c,
      409,
      "CONFLICT",
      error.details?.reason === "collection_in_progress"
        ? "이 공고를 이미 수집하고 있습니다."
        : "이미 완료되었거나 현재 처리할 수 없는 수집 요청입니다.",
      false,
      error.details,
    );
  }
  return errorResponse(
    c,
    503,
    "UPSTREAM_UNAVAILABLE",
    "공고 수집 저장소를 사용할 수 없습니다.",
    true,
  );
}

export function analysisServiceErrorResponse(
  c: Context<WorkerAppEnv>,
  error: unknown,
): Response {
  if (!(error instanceof AnalysisJobServiceError)) throw error;
  if (error.kind === "not_found") {
    return errorResponse(c, 404, "NOT_FOUND", "분석 작업을 찾을 수 없습니다.");
  }
  if (error.kind === "validation") {
    return errorResponse(
      c,
      400,
      "VALIDATION_ERROR",
      "분석 결과가 계약 또는 원문 근거와 일치하지 않습니다.",
      false,
      error.details,
    );
  }
  if (error.kind === "conflict") {
    const reason = error.details?.reason;
    const messages: Record<string, string> = {
      analysis_in_progress: "이 지원 공고를 이미 분석하고 있습니다.",
      analysis_attempt_mismatch:
        "현재 분석 실행 회차와 요청이 일치하지 않습니다.",
      analysis_attempts_exhausted:
        "이 분석 작업은 재시도 횟수를 모두 사용했습니다.",
      analysis_not_active: "진행 중인 분석 작업만 취소할 수 있습니다.",
      analysis_not_failed: "실패한 분석 작업만 재시도할 수 있습니다.",
      collection_required: "먼저 채용공고 원문 수집을 완료해 주세요.",
      job_structure_required:
        "공고의 AI 구조화가 필요합니다. 채용공고 탭에서 다시 수집하거나 원문을 입력해 주세요.",
      document_selection_required: "이력서와 포트폴리오를 모두 선택해 주세요.",
      document_text_required:
        "선택한 문서의 분석용 텍스트를 먼저 등록해 주세요.",
    };
    return errorResponse(
      c,
      409,
      "CONFLICT",
      (reason && messages[reason]) ??
        "현재 상태에서는 분석을 시작할 수 없습니다.",
      false,
      error.details,
    );
  }
  return errorResponse(
    c,
    503,
    "UPSTREAM_UNAVAILABLE",
    "분석 서비스를 사용할 수 없습니다.",
    true,
  );
}

export function slackNotificationServiceErrorResponse(
  c: Context<WorkerAppEnv>,
  error: unknown,
): Response {
  if (!(error instanceof SlackNotificationServiceError)) throw error;
  if (error.kind === "not_found") {
    return errorResponse(c, 404, "NOT_FOUND", "Slack 알림을 찾을 수 없습니다.");
  }
  if (error.kind === "conflict") {
    return errorResponse(
      c,
      409,
      "CONFLICT",
      "이미 완료되었거나 현재 처리할 수 없는 Slack 알림입니다.",
    );
  }
  return errorResponse(
    c,
    503,
    "UPSTREAM_UNAVAILABLE",
    "Slack 알림 저장소를 사용할 수 없습니다.",
    true,
  );
}

export function interviewWorkspaceErrorResponse(
  c: Context<WorkerAppEnv>,
  error: unknown,
): Response {
  if (!(error instanceof InterviewWorkspaceServiceError)) throw error;
  if (error.kind === "not_found") {
    return errorResponse(
      c,
      404,
      "NOT_FOUND",
      error.details?.reason === "comparison_not_found"
        ? "비교할 이전 분석을 찾을 수 없습니다."
        : "면접 준비 정보를 찾을 수 없습니다.",
    );
  }
  if (error.kind === "validation") {
    return errorResponse(
      c,
      400,
      "VALIDATION_ERROR",
      "면접 준비 요청 형식이나 연결된 분석 정보가 올바르지 않습니다.",
      false,
      error.details,
    );
  }
  if (error.kind === "conflict") {
    const stale = error.details?.reason === "stale_update";
    return errorResponse(
      c,
      409,
      "CONFLICT",
      stale
        ? "다른 화면에서 내용이 변경되었습니다. 새로고침 후 다시 시도해 주세요."
        : "현재 면접 준비 상태에서는 요청을 처리할 수 없습니다.",
      false,
      error.details,
    );
  }
  return errorResponse(
    c,
    503,
    "UPSTREAM_UNAVAILABLE",
    "면접 준비 정보를 사용할 수 없습니다.",
    true,
  );
}
