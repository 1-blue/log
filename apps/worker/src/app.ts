import {
  AbortDocumentUploadRequestSchema,
  AnalysisEventCallbackSchema,
  AnalysisJobActionRequestSchema,
  AnalysisResultCallbackSchema,
  AnalysisWorkspaceQuerySchema,
  ApiErrorCodeSchema,
  ApplicationListQuerySchema,
  ApplicationStateInputSchema,
  CompleteDocumentUploadRequestSchema,
  CreateAnalysisJobRequestSchema,
  CreateApplicationRequestSchema,
  CreateDocumentDownloadUrlRequestSchema,
  CreateInterviewChecklistItemRequestSchema,
  CreateInterviewNoteRequestSchema,
  CreateJobPostingCollectionRequestSchema,
  DocumentExtractionCallbackSchema,
  DocumentTypeSchema,
  ExpectedUpdatedAtQuerySchema,
  IdempotencyKeySchema,
  JobPostingCollectionCallbackSchema,
  PatchApplicationRequestSchema,
  PatchInterviewChecklistItemRequestSchema,
  PatchInterviewNoteRequestSchema,
  PatchJobPostingRequestSchema,
  PrepareDocumentUploadRequestSchema,
  PublicDocumentDispositionSchema,
  ReorderInterviewChecklistRequestSchema,
  SaveInterviewAnswerRequestSchema,
  SetDocumentPublicationRequestSchema,
  SlackNotificationResultCallbackSchema,
  UpdateAnalysisReviewRequestSchema,
  UpdateDocumentVersionRequestSchema,
} from "@workspace/contracts";

import type { Context } from "hono";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import * as z from "zod";

import {
  type AnalysisJobService,
  AnalysisJobServiceError,
  createAnalysisJobService,
} from "./analysis-jobs.js";
import {
  type ApplicationService,
  ApplicationServiceError,
  createApplicationService,
} from "./applications.js";
import {
  type JwtVerificationKey,
  verifySupabaseAdminToken,
  WorkerAuthError,
} from "./auth.js";
import {
  createDocumentService,
  type DocumentService,
  DocumentServiceError,
} from "./documents.js";
import {
  createIdempotencyService,
  createRequestFingerprint,
  type IdempotencyService,
} from "./idempotency.js";
import {
  createInterviewWorkspaceService,
  type InterviewWorkspaceService,
  InterviewWorkspaceServiceError,
} from "./interview-workspace.js";
import {
  createJobPostingCollectionService,
  type JobPostingCollectionService,
  JobPostingCollectionServiceError,
} from "./job-posting-collections.js";
import { logError, logInfo } from "./logger.js";
import { dispatchToN8n, verifySignedRequest } from "./n8n.js";
import {
  createSlackNotificationService,
  type SlackNotificationService,
  SlackNotificationServiceError,
} from "./slack-notifications.js";

type WorkerAppEnv = {
  Bindings: CloudflareBindings;
  Variables: {
    adminUserId: string;
    requestId: string;
    signedEventId: string;
  };
};

const INTERNAL_CALLBACK_MAX_BYTES = 1_250_000;

const SERVICE_NAME = "bluelog-career-ops-api" as const;

function getRequestId(c: { get: (key: "requestId") => string }): string {
  return c.get("requestId");
}

function scheduleBackground(
  c: Context<WorkerAppEnv>,
  task: () => Promise<void>,
): void {
  const promise = task();
  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    // Hono's app.request() test context has no Cloudflare ExecutionContext.
    void promise;
  }
}

function errorResponse(
  c: Context<WorkerAppEnv>,
  status: 400 | 401 | 403 | 404 | 405 | 409 | 429 | 500 | 502 | 503 | 504,
  code: z.infer<typeof ApiErrorCodeSchema>,
  message: string,
  retryable = false,
  details: Record<string, string> | null = null,
): Response {
  const requestId = getRequestId(c);
  const response = c.json(
    {
      error: {
        code,
        message,
        retryable,
        requestId,
        details,
      },
    },
    status,
  );

  response.headers.set("X-Request-Id", requestId);
  return response;
}

type AppDependencies = {
  analysisJobServiceFactory?: (env: CloudflareBindings) => AnalysisJobService;
  applicationServiceFactory?: (env: CloudflareBindings) => ApplicationService;
  documentServiceFactory?: (env: CloudflareBindings) => DocumentService;
  idempotencyServiceFactory?: (env: CloudflareBindings) => IdempotencyService;
  jobPostingCollectionServiceFactory?: (
    env: CloudflareBindings,
  ) => JobPostingCollectionService;
  interviewWorkspaceServiceFactory?: (
    env: CloudflareBindings,
  ) => InterviewWorkspaceService;
  slackNotificationServiceFactory?: (
    env: CloudflareBindings,
  ) => SlackNotificationService;
  jwtVerificationKey?: JwtVerificationKey;
};

const DocumentVersionIdSchema = z.uuid();
const ResourceIdSchema = z.uuid();
const DocumentListQuerySchema = z.strictObject({
  archived: z.enum(["exclude", "include", "only"]).default("exclude"),
  documentType: DocumentTypeSchema.optional(),
});
const PublicDocumentAccessQuerySchema = z.strictObject({
  disposition: PublicDocumentDispositionSchema.default("inline"),
});

async function parseJsonBody<T>(
  c: Context<WorkerAppEnv>,
  schema: z.ZodType<T>,
  maxBytes = 600_000,
): Promise<T | Response> {
  const contentType = c.req.header("Content-Type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return errorResponse(
      c,
      400,
      "VALIDATION_ERROR",
      "Content-Type은 application/json이어야 합니다.",
    );
  }

  const contentLength = Number(c.req.header("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return errorResponse(
      c,
      400,
      "VALIDATION_ERROR",
      "요청 본문이 허용된 크기를 초과했습니다.",
    );
  }

  const rawBody = await c.req.text().catch(() => "");
  if (new TextEncoder().encode(rawBody).byteLength > maxBytes) {
    return errorResponse(
      c,
      400,
      "VALIDATION_ERROR",
      "요청 본문이 허용된 크기를 초과했습니다.",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = undefined;
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse(
      c,
      400,
      "VALIDATION_ERROR",
      "요청 형식이 올바르지 않습니다.",
    );
  }

  return parsed.data;
}

function parseDocumentVersionId(c: Context<WorkerAppEnv>): string | Response {
  const parsed = DocumentVersionIdSchema.safeParse(c.req.param("id"));
  return parsed.success
    ? parsed.data
    : errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "문서 버전 ID가 올바르지 않습니다.",
      );
}

function parseResourceId(
  c: Context<WorkerAppEnv>,
  label: string,
): string | Response {
  const parsed = ResourceIdSchema.safeParse(c.req.param("id"));
  return parsed.success
    ? parsed.data
    : errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        `${label} ID가 올바르지 않습니다.`,
      );
}

function applicationServiceErrorResponse(
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

function documentServiceErrorResponse(
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

function collectionServiceErrorResponse(
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

function analysisServiceErrorResponse(
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

function slackNotificationServiceErrorResponse(
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

function interviewWorkspaceErrorResponse(
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

function jsonData<T>(
  c: Context<WorkerAppEnv>,
  data: T,
  status: 200 | 201 | 202 = 200,
) {
  const requestId = getRequestId(c);
  const response = c.json({ data, meta: { requestId } }, status);
  response.headers.set("X-Request-Id", requestId);
  return response;
}

async function enforceRateLimit(
  c: Context<WorkerAppEnv>,
  limiter: RateLimit,
  key: string,
): Promise<Response | null> {
  try {
    const result = await limiter.limit({ key });
    if (result.success) return null;

    const response = errorResponse(
      c,
      429,
      "RATE_LIMITED",
      "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      true,
    );
    response.headers.set("Retry-After", "60");
    return response;
  } catch {
    return errorResponse(
      c,
      503,
      "UPSTREAM_UNAVAILABLE",
      "요청 제한 서비스를 사용할 수 없습니다.",
      true,
    );
  }
}

async function executeIdempotently(
  c: Context<WorkerAppEnv>,
  service: IdempotencyService,
  body: unknown,
  action: () => Promise<Response>,
): Promise<Response> {
  const parsedKey = IdempotencyKeySchema.safeParse(
    c.req.header("Idempotency-Key"),
  );
  if (!parsedKey.success) {
    return errorResponse(
      c,
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Idempotency-Key에는 UUID가 필요합니다.",
    );
  }

  const ownerId = c.get("adminUserId");
  const executionId = crypto.randomUUID();
  const requestFingerprint = await createRequestFingerprint({
    body,
    method: c.req.method,
    path: c.req.path,
  });
  let claim;
  try {
    claim = await service.claim({
      executionId,
      idempotencyKey: parsedKey.data,
      method: c.req.method,
      ownerId,
      path: c.req.path,
      requestFingerprint,
      requestId: getRequestId(c),
    });
  } catch {
    return errorResponse(
      c,
      503,
      "UPSTREAM_UNAVAILABLE",
      "중복 요청 확인 서비스를 사용할 수 없습니다.",
      true,
    );
  }

  if (claim.kind === "conflict") {
    return errorResponse(
      c,
      409,
      "IDEMPOTENCY_CONFLICT",
      "같은 Idempotency-Key가 다른 요청에 사용되었습니다.",
    );
  }
  if (claim.kind === "in_progress") {
    const response = errorResponse(
      c,
      409,
      "IDEMPOTENCY_IN_PROGRESS",
      "같은 요청이 이미 처리 중입니다.",
      true,
    );
    response.headers.set("Retry-After", "2");
    return response;
  }
  if (claim.kind === "replay") {
    return new Response(JSON.stringify(claim.body), {
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Idempotency-Replayed": "true",
        "X-Request-Id": claim.requestId,
      },
      status: claim.status,
    });
  }

  let response: Response;
  try {
    response = await action();
  } catch (error) {
    await service
      .release({
        executionId: claim.executionId,
        idempotencyKey: parsedKey.data,
        ownerId,
      })
      .catch(() => undefined);
    throw error;
  }

  if (response.ok) {
    const responseBody: unknown = await response.clone().json();
    try {
      await service.complete({
        body: responseBody,
        executionId: claim.executionId,
        idempotencyKey: parsedKey.data,
        ownerId,
        status: response.status,
      });
    } catch {
      return errorResponse(
        c,
        503,
        "UPSTREAM_UNAVAILABLE",
        "요청 결과를 안전하게 확정하지 못했습니다.",
        true,
      );
    }
  } else {
    await service
      .release({
        executionId: claim.executionId,
        idempotencyKey: parsedKey.data,
        ownerId,
      })
      .catch(() => undefined);
  }

  return response;
}

function createRequireAdmin(
  dependencies: AppDependencies,
): MiddlewareHandler<WorkerAppEnv> {
  return async (c, next) => {
    const authorization = c.req.header("Authorization");
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);

    if (!match?.[1]) {
      return errorResponse(c, 401, "UNAUTHORIZED", "로그인이 필요합니다.");
    }

    let userId: string;
    try {
      const verified = await verifySupabaseAdminToken(
        match[1],
        c.env,
        dependencies.jwtVerificationKey,
      );
      userId = verified.userId;
    } catch (error) {
      if (error instanceof WorkerAuthError) {
        if (error.kind === "forbidden") {
          return errorResponse(c, 403, "FORBIDDEN", "관리자 권한이 없습니다.");
        }

        if (error.kind === "unavailable") {
          return errorResponse(
            c,
            503,
            "UPSTREAM_UNAVAILABLE",
            "인증 서비스를 사용할 수 없습니다.",
            true,
          );
        }
      }

      return errorResponse(
        c,
        401,
        "UNAUTHORIZED",
        "로그인 세션이 유효하지 않습니다.",
      );
    }

    c.set("adminUserId", userId);
    const rateLimitResponse = await enforceRateLimit(
      c,
      c.env.ADMIN_API_RATE_LIMITER,
      `admin:${userId}`,
    );
    if (rateLimitResponse) return rateLimitResponse;
    await next();
  };
}

export function createApp(dependencies?: AppDependencies) {
  const resolvedDependencies = dependencies ?? {};
  const app = new Hono<WorkerAppEnv>();
  const requireAdmin = createRequireAdmin(resolvedDependencies);
  const getApplicationService = (env: CloudflareBindings) =>
    resolvedDependencies.applicationServiceFactory?.(env) ??
    createApplicationService(env);
  const getAnalysisJobService = (env: CloudflareBindings) =>
    resolvedDependencies.analysisJobServiceFactory?.(env) ??
    createAnalysisJobService(env);
  const getDocumentService = (env: CloudflareBindings) =>
    resolvedDependencies.documentServiceFactory?.(env) ??
    createDocumentService(env);
  const getIdempotencyService = (env: CloudflareBindings) =>
    resolvedDependencies.idempotencyServiceFactory?.(env) ??
    createIdempotencyService(env);
  const getJobPostingCollectionService = (env: CloudflareBindings) =>
    resolvedDependencies.jobPostingCollectionServiceFactory?.(env) ??
    createJobPostingCollectionService(env);
  const getInterviewWorkspaceService = (env: CloudflareBindings) =>
    resolvedDependencies.interviewWorkspaceServiceFactory?.(env) ??
    createInterviewWorkspaceService(env);
  const getSlackNotificationService = dependencies
    ? (resolvedDependencies.slackNotificationServiceFactory ?? null)
    : createSlackNotificationService;

  app.use("*", async (c, next) => {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();

    c.set("requestId", requestId);
    c.header("X-Request-Id", requestId);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cache-Control", "no-store");

    const origin = c.req.header("Origin");
    if (origin) {
      let allowedOrigin: string | null = null;

      try {
        allowedOrigin = new URL(c.env.APP_BASE_URL).origin;
      } catch {
        return errorResponse(
          c,
          500,
          "INTERNAL_ERROR",
          "Worker 환경 설정이 올바르지 않습니다.",
        );
      }

      if (origin !== allowedOrigin) {
        return errorResponse(
          c,
          403,
          "FORBIDDEN",
          "허용되지 않은 Origin입니다.",
        );
      }

      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
      c.header(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, Idempotency-Key",
      );
      c.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      c.header(
        "Access-Control-Expose-Headers",
        "X-Request-Id, Idempotency-Replayed, Retry-After",
      );
      c.header("Vary", "Origin");

      if (c.req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: c.res.headers });
      }
    }

    await next();

    logInfo({
      event: "worker_request",
      requestId: getRequestId(c),
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      durationMs: Date.now() - startedAt,
    });
  });

  app.use("/v1/internal/*", async (c, next) => {
    if (c.req.method !== "POST") {
      return errorResponse(
        c,
        405,
        "METHOD_NOT_ALLOWED",
        "내부 API는 POST 요청만 허용합니다.",
      );
    }

    const contentType = c.req.header("Content-Type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("application/json")) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "Content-Type은 application/json이어야 합니다.",
      );
    }

    const contentLength = Number(c.req.header("Content-Length") ?? "0");
    if (
      Number.isFinite(contentLength) &&
      contentLength > INTERNAL_CALLBACK_MAX_BYTES
    ) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "요청 본문이 허용된 크기를 초과했습니다.",
      );
    }

    const verified = await verifySignedRequest({
      request: c.req.raw,
      secret: c.env.N8N_CALLBACK_SECRET,
    }).catch(() => null);
    if (
      !verified ||
      verified.body.byteLength > INTERNAL_CALLBACK_MAX_BYTES ||
      !ResourceIdSchema.safeParse(verified.eventId).success ||
      !ResourceIdSchema.safeParse(verified.requestId).success
    ) {
      return errorResponse(
        c,
        401,
        "INVALID_SIGNATURE",
        "내부 요청 서명이 유효하지 않습니다.",
      );
    }

    c.set("requestId", verified.requestId);
    c.set("signedEventId", verified.eventId);
    c.header("X-Request-Id", verified.requestId);
    await next();
  });

  app.use("/v1/*", async (c, next) => {
    await next();
    if (
      !getSlackNotificationService ||
      !["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method) ||
      !c.res.ok
    ) {
      return;
    }

    const drain = getSlackNotificationService(c.env)
      .drain(2)
      .catch(() => {
        logError({
          event: "slack_notification_drain_failed",
          requestId: getRequestId(c),
        });
      });
    try {
      c.executionCtx.waitUntil(drain);
    } catch {
      await drain;
    }
  });

  app.get("/health", (c) => {
    const requestId = getRequestId(c);
    const response = c.json({
      data: {
        status: "ok" as const,
        service: SERVICE_NAME,
        timestamp: new Date().toISOString(),
      },
      meta: { requestId },
    });

    response.headers.set("X-Request-Id", requestId);
    return response;
  });

  app.get("/v1/auth/me", requireAdmin, (c) => {
    const requestId = getRequestId(c);
    const response = c.json({
      data: { userId: c.get("adminUserId") },
      meta: { requestId },
    });

    response.headers.set("X-Request-Id", requestId);
    return response;
  });

  app.post("/v1/applications", requireAdmin, async (c) => {
    const input = await parseJsonBody(c, CreateApplicationRequestSchema);
    if (input instanceof Response) return input;

    return executeIdempotently(
      c,
      getIdempotencyService(c.env),
      input,
      async () => {
        try {
          const data = await getApplicationService(c.env).create(
            c.get("adminUserId"),
            input,
          );
          return jsonData(c, data, 201);
        } catch (error) {
          return applicationServiceErrorResponse(c, error);
        }
      },
    );
  });

  app.post("/v1/job-postings/:id/applications", requireAdmin, async (c) => {
    const jobPostingId = parseResourceId(c, "채용공고");
    if (jobPostingId instanceof Response) return jobPostingId;
    const input = await parseJsonBody(c, ApplicationStateInputSchema);
    if (input instanceof Response) return input;

    return executeIdempotently(
      c,
      getIdempotencyService(c.env),
      input,
      async () => {
        try {
          const data = await getApplicationService(c.env).createAttempt(
            c.get("adminUserId"),
            jobPostingId,
            input,
          );
          return jsonData(c, data, 201);
        } catch (error) {
          return applicationServiceErrorResponse(c, error);
        }
      },
    );
  });

  app.get("/v1/applications", requireAdmin, async (c) => {
    const query = ApplicationListQuerySchema.safeParse({
      archived: c.req.query("archived"),
      page: c.req.query("page"),
      pageSize: c.req.query("pageSize"),
      q: c.req.query("q"),
      sort: c.req.query("sort"),
      status: c.req.query("status"),
    });
    if (!query.success) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "지원 목록 조회 조건이 올바르지 않습니다.",
      );
    }

    try {
      const result = await getApplicationService(c.env).list(
        c.get("adminUserId"),
        query.data,
      );
      const requestId = getRequestId(c);
      const response = c.json({
        data: { items: result.items },
        meta: { requestId },
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (error) {
      return applicationServiceErrorResponse(c, error);
    }
  });

  app.get("/v1/applications/:id", requireAdmin, async (c) => {
    const applicationId = parseResourceId(c, "지원");
    if (applicationId instanceof Response) return applicationId;

    try {
      const data = await getApplicationService(c.env).get(
        c.get("adminUserId"),
        applicationId,
      );
      return jsonData(c, data);
    } catch (error) {
      return applicationServiceErrorResponse(c, error);
    }
  });

  app.post("/v1/applications/:id/analysis-jobs", requireAdmin, async (c) => {
    const applicationId = parseResourceId(c, "지원");
    if (applicationId instanceof Response) return applicationId;
    const input = await parseJsonBody(c, CreateAnalysisJobRequestSchema);
    if (input instanceof Response) return input;

    return executeIdempotently(
      c,
      getIdempotencyService(c.env),
      input,
      async () => {
        try {
          const job = await getAnalysisJobService(c.env).create(
            c.get("adminUserId"),
            applicationId,
            getRequestId(c),
          );
          return jsonData(c, { job }, 202);
        } catch (error) {
          return analysisServiceErrorResponse(c, error);
        }
      },
    );
  });

  app.get("/v1/applications/:id/analysis-jobs", requireAdmin, async (c) => {
    const applicationId = parseResourceId(c, "지원");
    if (applicationId instanceof Response) return applicationId;
    try {
      const items = await getAnalysisJobService(c.env).list(
        c.get("adminUserId"),
        applicationId,
      );
      return jsonData(c, { items });
    } catch (error) {
      return analysisServiceErrorResponse(c, error);
    }
  });

  app.get("/v1/analysis-jobs/:id", requireAdmin, async (c) => {
    const analysisJobId = parseResourceId(c, "분석 작업");
    if (analysisJobId instanceof Response) return analysisJobId;
    try {
      const data = await getAnalysisJobService(c.env).get(
        c.get("adminUserId"),
        analysisJobId,
      );
      return jsonData(c, data);
    } catch (error) {
      return analysisServiceErrorResponse(c, error);
    }
  });

  app.post("/v1/analysis-jobs/:id/retry", requireAdmin, async (c) => {
    const analysisJobId = parseResourceId(c, "분석 작업");
    if (analysisJobId instanceof Response) return analysisJobId;
    const input = await parseJsonBody(c, AnalysisJobActionRequestSchema);
    if (input instanceof Response) return input;

    return executeIdempotently(
      c,
      getIdempotencyService(c.env),
      input,
      async () => {
        try {
          const job = await getAnalysisJobService(c.env).retry(
            c.get("adminUserId"),
            analysisJobId,
          );
          return jsonData(c, { job }, 202);
        } catch (error) {
          return analysisServiceErrorResponse(c, error);
        }
      },
    );
  });

  app.post("/v1/analysis-jobs/:id/cancel", requireAdmin, async (c) => {
    const analysisJobId = parseResourceId(c, "분석 작업");
    if (analysisJobId instanceof Response) return analysisJobId;
    const input = await parseJsonBody(c, AnalysisJobActionRequestSchema);
    if (input instanceof Response) return input;

    return executeIdempotently(
      c,
      getIdempotencyService(c.env),
      input,
      async () => {
        try {
          const job = await getAnalysisJobService(c.env).cancel(
            c.get("adminUserId"),
            analysisJobId,
          );
          return jsonData(c, { job });
        } catch (error) {
          return analysisServiceErrorResponse(c, error);
        }
      },
    );
  });

  app.get("/v1/analysis-jobs/:id/workspace", requireAdmin, async (c) => {
    const analysisJobId = parseResourceId(c, "분석 작업");
    if (analysisJobId instanceof Response) return analysisJobId;
    const query = AnalysisWorkspaceQuerySchema.safeParse({
      compareTo: c.req.query("compareTo"),
    });
    if (!query.success) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "분석 비교 조건이 올바르지 않습니다.",
      );
    }
    try {
      const data = await getInterviewWorkspaceService(c.env).getWorkspace(
        c.get("adminUserId"),
        analysisJobId,
        query.data.compareTo,
      );
      return jsonData(c, data);
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.put("/v1/analysis-jobs/:id/review", requireAdmin, async (c) => {
    const analysisJobId = parseResourceId(c, "분석 작업");
    if (analysisJobId instanceof Response) return analysisJobId;
    const input = await parseJsonBody(c, UpdateAnalysisReviewRequestSchema);
    if (input instanceof Response) return input;
    try {
      const data = await getInterviewWorkspaceService(c.env).saveReview(
        c.get("adminUserId"),
        analysisJobId,
        input,
      );
      return jsonData(c, data);
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.get("/v1/interview-questions/:id/answers", requireAdmin, async (c) => {
    const questionId = parseResourceId(c, "면접 질문");
    if (questionId instanceof Response) return questionId;
    try {
      const items = await getInterviewWorkspaceService(c.env).listAnswers(
        c.get("adminUserId"),
        questionId,
      );
      return jsonData(c, { items });
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.put("/v1/interview-questions/:id/answer", requireAdmin, async (c) => {
    const questionId = parseResourceId(c, "면접 질문");
    if (questionId instanceof Response) return questionId;
    const input = await parseJsonBody(c, SaveInterviewAnswerRequestSchema);
    if (input instanceof Response) return input;
    try {
      const data = await getInterviewWorkspaceService(c.env).saveAnswer(
        c.get("adminUserId"),
        questionId,
        input,
      );
      return jsonData(c, data);
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.post("/v1/analysis-jobs/:id/checklist-items", requireAdmin, async (c) => {
    const analysisJobId = parseResourceId(c, "분석 작업");
    if (analysisJobId instanceof Response) return analysisJobId;
    const input = await parseJsonBody(
      c,
      CreateInterviewChecklistItemRequestSchema,
    );
    if (input instanceof Response) return input;
    return executeIdempotently(
      c,
      getIdempotencyService(c.env),
      input,
      async () => {
        try {
          const data = await getInterviewWorkspaceService(
            c.env,
          ).createChecklist(c.get("adminUserId"), analysisJobId, input);
          return jsonData(c, data, 201);
        } catch (error) {
          return interviewWorkspaceErrorResponse(c, error);
        }
      },
    );
  });

  app.patch("/v1/interview-checklist-items/:id", requireAdmin, async (c) => {
    const itemId = parseResourceId(c, "체크리스트 항목");
    if (itemId instanceof Response) return itemId;
    const input = await parseJsonBody(
      c,
      PatchInterviewChecklistItemRequestSchema,
    );
    if (input instanceof Response) return input;
    try {
      const data = await getInterviewWorkspaceService(c.env).patchChecklist(
        c.get("adminUserId"),
        itemId,
        input,
      );
      return jsonData(c, data);
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.delete("/v1/interview-checklist-items/:id", requireAdmin, async (c) => {
    const itemId = parseResourceId(c, "체크리스트 항목");
    if (itemId instanceof Response) return itemId;
    const query = ExpectedUpdatedAtQuerySchema.safeParse({
      expectedUpdatedAt: c.req.query("expectedUpdatedAt"),
    });
    if (!query.success) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "체크리스트 수정 시각이 올바르지 않습니다.",
      );
    }
    try {
      const data = await getInterviewWorkspaceService(c.env).archiveChecklist(
        c.get("adminUserId"),
        itemId,
        query.data.expectedUpdatedAt,
      );
      return jsonData(c, data);
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.put("/v1/analysis-jobs/:id/checklist-order", requireAdmin, async (c) => {
    const analysisJobId = parseResourceId(c, "분석 작업");
    if (analysisJobId instanceof Response) return analysisJobId;
    const input = await parseJsonBody(
      c,
      ReorderInterviewChecklistRequestSchema,
    );
    if (input instanceof Response) return input;
    try {
      const items = await getInterviewWorkspaceService(c.env).reorderChecklist(
        c.get("adminUserId"),
        analysisJobId,
        input.itemIds,
      );
      return jsonData(c, { items });
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.post("/v1/applications/:id/interview-notes", requireAdmin, async (c) => {
    const applicationId = parseResourceId(c, "지원");
    if (applicationId instanceof Response) return applicationId;
    const input = await parseJsonBody(c, CreateInterviewNoteRequestSchema);
    if (input instanceof Response) return input;
    return executeIdempotently(
      c,
      getIdempotencyService(c.env),
      input,
      async () => {
        try {
          const data = await getInterviewWorkspaceService(c.env).createNote(
            c.get("adminUserId"),
            applicationId,
            input,
          );
          return jsonData(c, data, 201);
        } catch (error) {
          return interviewWorkspaceErrorResponse(c, error);
        }
      },
    );
  });

  app.patch("/v1/interview-notes/:id", requireAdmin, async (c) => {
    const noteId = parseResourceId(c, "면접 회고");
    if (noteId instanceof Response) return noteId;
    const input = await parseJsonBody(c, PatchInterviewNoteRequestSchema);
    if (input instanceof Response) return input;
    try {
      const data = await getInterviewWorkspaceService(c.env).patchNote(
        c.get("adminUserId"),
        noteId,
        input,
      );
      return jsonData(c, data);
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.delete("/v1/interview-notes/:id", requireAdmin, async (c) => {
    const noteId = parseResourceId(c, "면접 회고");
    if (noteId instanceof Response) return noteId;
    const query = ExpectedUpdatedAtQuerySchema.safeParse({
      expectedUpdatedAt: c.req.query("expectedUpdatedAt"),
    });
    if (!query.success) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "면접 회고 수정 시각이 올바르지 않습니다.",
      );
    }
    try {
      const data = await getInterviewWorkspaceService(c.env).archiveNote(
        c.get("adminUserId"),
        noteId,
        query.data.expectedUpdatedAt,
      );
      return jsonData(c, data);
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.patch("/v1/applications/:id", requireAdmin, async (c) => {
    const applicationId = parseResourceId(c, "지원");
    if (applicationId instanceof Response) return applicationId;
    const input = await parseJsonBody(c, PatchApplicationRequestSchema);
    if (input instanceof Response) return input;

    try {
      const data = await getApplicationService(c.env).update(
        c.get("adminUserId"),
        applicationId,
        input,
      );
      return jsonData(c, data);
    } catch (error) {
      return applicationServiceErrorResponse(c, error);
    }
  });

  app.patch("/v1/job-postings/:id", requireAdmin, async (c) => {
    const jobPostingId = parseResourceId(c, "채용공고");
    if (jobPostingId instanceof Response) return jobPostingId;
    const input = await parseJsonBody(c, PatchJobPostingRequestSchema);
    if (input instanceof Response) return input;

    try {
      const data = await getApplicationService(c.env).updateJobPosting(
        c.get("adminUserId"),
        jobPostingId,
        input,
      );
      return jsonData(c, data);
    } catch (error) {
      return applicationServiceErrorResponse(c, error);
    }
  });

  app.post("/v1/job-postings/:id/collections", requireAdmin, async (c) => {
    const jobPostingId = parseResourceId(c, "채용공고");
    if (jobPostingId instanceof Response) return jobPostingId;
    const input = await parseJsonBody(
      c,
      CreateJobPostingCollectionRequestSchema,
    );
    if (input instanceof Response) return input;

    return executeIdempotently(
      c,
      getIdempotencyService(c.env),
      input,
      async () => {
        try {
          const data = await getJobPostingCollectionService(c.env).create(
            c.get("adminUserId"),
            jobPostingId,
            getRequestId(c),
            input,
          );
          return jsonData(c, data, 202);
        } catch (error) {
          return collectionServiceErrorResponse(c, error);
        }
      },
    );
  });

  app.get("/v1/job-postings/:id/collections", requireAdmin, async (c) => {
    const jobPostingId = parseResourceId(c, "채용공고");
    if (jobPostingId instanceof Response) return jobPostingId;
    try {
      const items = await getJobPostingCollectionService(c.env).list(
        c.get("adminUserId"),
        jobPostingId,
      );
      return jsonData(c, { items });
    } catch (error) {
      return collectionServiceErrorResponse(c, error);
    }
  });

  app.get(
    "/v1/job-postings/:id/collections/:collectionId",
    requireAdmin,
    async (c) => {
      const jobPostingId = parseResourceId(c, "채용공고");
      const collectionRunId = ResourceIdSchema.safeParse(
        c.req.param("collectionId"),
      );
      if (jobPostingId instanceof Response) return jobPostingId;
      if (!collectionRunId.success) {
        return errorResponse(
          c,
          400,
          "VALIDATION_ERROR",
          "수집 실행 ID가 올바르지 않습니다.",
        );
      }
      try {
        const data = await getJobPostingCollectionService(c.env).get(
          c.get("adminUserId"),
          collectionRunId.data,
        );
        if (data.jobPostingId !== jobPostingId) {
          return errorResponse(
            c,
            404,
            "NOT_FOUND",
            "공고 수집 정보를 찾을 수 없습니다.",
          );
        }
        return jsonData(c, data);
      } catch (error) {
        return collectionServiceErrorResponse(c, error);
      }
    },
  );

  app.post("/v1/internal/job-posting-collections/:id/complete", async (c) => {
    const collectionRunId = parseResourceId(c, "수집 실행");
    if (collectionRunId instanceof Response) return collectionRunId;
    const input = await parseJsonBody(
      c,
      JobPostingCollectionCallbackSchema,
      INTERNAL_CALLBACK_MAX_BYTES,
    );
    if (input instanceof Response) return input;
    if (
      input.collectionRunId !== collectionRunId ||
      input.eventId !== c.get("signedEventId") ||
      input.requestId !== getRequestId(c)
    ) {
      return errorResponse(
        c,
        401,
        "INVALID_SIGNATURE",
        "내부 요청 식별자가 일치하지 않습니다.",
      );
    }
    try {
      const data = await getJobPostingCollectionService(c.env).complete(input);
      return jsonData(c, data);
    } catch (error) {
      return collectionServiceErrorResponse(c, error);
    }
  });

  app.post("/v1/internal/document-versions/:id/extract", async (c) => {
    const documentVersionId = parseDocumentVersionId(c);
    if (documentVersionId instanceof Response) return documentVersionId;
    const input = await parseJsonBody(
      c,
      DocumentExtractionCallbackSchema,
      INTERNAL_CALLBACK_MAX_BYTES,
    );
    if (input instanceof Response) return input;
    if (
      input.documentVersionId !== documentVersionId ||
      input.eventId !== c.get("signedEventId") ||
      input.requestId !== getRequestId(c)
    ) {
      return errorResponse(
        c,
        401,
        "INVALID_SIGNATURE",
        "내부 요청 식별자가 일치하지 않습니다.",
      );
    }
    try {
      const data = await getDocumentService(c.env).completeExtraction(
        c.env.ADMIN_USER_ID,
        input,
      );
      return jsonData(c, data);
    } catch (error) {
      return documentServiceErrorResponse(c, error);
    }
  });

  app.post("/v1/internal/analysis-jobs/:id/events", async (c) => {
    const analysisJobId = parseResourceId(c, "분석 작업");
    if (analysisJobId instanceof Response) return analysisJobId;
    const input = await parseJsonBody(
      c,
      AnalysisEventCallbackSchema,
      INTERNAL_CALLBACK_MAX_BYTES,
    );
    if (input instanceof Response) return input;
    if (
      input.analysisJobId !== analysisJobId ||
      input.eventId !== c.get("signedEventId") ||
      input.requestId !== getRequestId(c)
    ) {
      return errorResponse(
        c,
        401,
        "INVALID_SIGNATURE",
        "내부 요청 식별자가 일치하지 않습니다.",
      );
    }
    try {
      return jsonData(c, await getAnalysisJobService(c.env).event(input));
    } catch (error) {
      return analysisServiceErrorResponse(c, error);
    }
  });

  app.post("/v1/internal/analysis-jobs/:id/result", async (c) => {
    const analysisJobId = parseResourceId(c, "분석 작업");
    if (analysisJobId instanceof Response) return analysisJobId;
    const input = await parseJsonBody(
      c,
      AnalysisResultCallbackSchema,
      INTERNAL_CALLBACK_MAX_BYTES,
    );
    if (input instanceof Response) return input;
    if (
      input.analysisJobId !== analysisJobId ||
      input.eventId !== c.get("signedEventId") ||
      input.requestId !== getRequestId(c)
    ) {
      return errorResponse(
        c,
        401,
        "INVALID_SIGNATURE",
        "내부 요청 식별자가 일치하지 않습니다.",
      );
    }
    try {
      return jsonData(c, await getAnalysisJobService(c.env).complete(input));
    } catch (error) {
      return analysisServiceErrorResponse(c, error);
    }
  });

  app.post("/v1/internal/slack-notifications/:id/result", async (c) => {
    const notificationId = parseResourceId(c, "Slack 알림");
    if (notificationId instanceof Response) return notificationId;
    const input = await parseJsonBody(
      c,
      SlackNotificationResultCallbackSchema,
      INTERNAL_CALLBACK_MAX_BYTES,
    );
    if (input instanceof Response) return input;
    if (
      input.notificationId !== notificationId ||
      input.eventId !== c.get("signedEventId") ||
      input.requestId !== getRequestId(c)
    ) {
      return errorResponse(
        c,
        401,
        "INVALID_SIGNATURE",
        "내부 요청 식별자가 일치하지 않습니다.",
      );
    }
    if (!getSlackNotificationService) {
      return errorResponse(
        c,
        503,
        "UPSTREAM_UNAVAILABLE",
        "Slack 알림 저장소를 사용할 수 없습니다.",
        true,
      );
    }
    try {
      return jsonData(
        c,
        await getSlackNotificationService(c.env).complete(input),
      );
    } catch (error) {
      return slackNotificationServiceErrorResponse(c, error);
    }
  });

  app.get("/v1/public/document-publications/:type", async (c) => {
    const rateLimitResponse = await enforceRateLimit(
      c,
      c.env.PUBLIC_API_RATE_LIMITER,
      `public:${c.req.header("CF-Connecting-IP") ?? "unknown"}:${c.req.path}`,
    );
    if (rateLimitResponse) return rateLimitResponse;

    const documentType = DocumentTypeSchema.safeParse(c.req.param("type"));
    const query = PublicDocumentAccessQuerySchema.safeParse({
      disposition: c.req.query("disposition"),
    });

    if (!documentType.success || !query.success) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "공개 문서 조회 조건이 올바르지 않습니다.",
      );
    }

    try {
      const data = await getDocumentService(c.env).createPublicAccessUrl(
        c.env.ADMIN_USER_ID,
        documentType.data,
        query.data.disposition,
      );
      return jsonData(c, data);
    } catch (error) {
      return documentServiceErrorResponse(c, error);
    }
  });

  app.post("/v1/document-versions/uploads", requireAdmin, async (c) => {
    const input = await parseJsonBody(c, PrepareDocumentUploadRequestSchema);
    if (input instanceof Response) return input;

    return executeIdempotently(
      c,
      getIdempotencyService(c.env),
      input,
      async () => {
        try {
          const data = await getDocumentService(c.env).prepareUpload(
            c.get("adminUserId"),
            input,
          );
          return jsonData(c, data, 201);
        } catch (error) {
          return documentServiceErrorResponse(c, error);
        }
      },
    );
  });

  app.post("/v1/document-versions/:id/complete", requireAdmin, async (c) => {
    const documentVersionId = parseDocumentVersionId(c);
    if (documentVersionId instanceof Response) return documentVersionId;
    const input = await parseJsonBody(c, CompleteDocumentUploadRequestSchema);
    if (input instanceof Response) return input;

    return executeIdempotently(
      c,
      getIdempotencyService(c.env),
      input,
      async () => {
        try {
          const documentService = getDocumentService(c.env);
          const data = await documentService.completeUpload(
            c.get("adminUserId"),
            documentVersionId,
            input,
          );
          scheduleBackground(c, async () => {
            try {
              const payload = await documentService.prepareExtraction(
                c.get("adminUserId"),
                documentVersionId,
                getRequestId(c),
              );
              if (payload) await dispatchToN8n(payload, c.env);
            } catch {
              await documentService.failExtraction(
                c.get("adminUserId"),
                documentVersionId,
                "EXTRACTION_DISPATCH_FAILED",
              );
            }
          });
          return jsonData(c, data, 201);
        } catch (error) {
          return documentServiceErrorResponse(c, error);
        }
      },
    );
  });

  app.post("/v1/document-versions/:id/extract", requireAdmin, async (c) => {
    const documentVersionId = parseDocumentVersionId(c);
    if (documentVersionId instanceof Response) return documentVersionId;

    const documentService = getDocumentService(c.env);
    try {
      const data = await documentService.get(
        c.get("adminUserId"),
        documentVersionId,
      );
      scheduleBackground(c, async () => {
        try {
          const payload = await documentService.prepareExtraction(
            c.get("adminUserId"),
            documentVersionId,
            getRequestId(c),
          );
          if (payload) await dispatchToN8n(payload, c.env);
        } catch {
          await documentService.failExtraction(
            c.get("adminUserId"),
            documentVersionId,
            "EXTRACTION_DISPATCH_FAILED",
          );
        }
      });
      return jsonData(c, data, 202);
    } catch (error) {
      return documentServiceErrorResponse(c, error);
    }
  });

  app.post(
    "/v1/document-versions/:id/abort-upload",
    requireAdmin,
    async (c) => {
      const documentVersionId = parseDocumentVersionId(c);
      if (documentVersionId instanceof Response) return documentVersionId;
      const input = await parseJsonBody(c, AbortDocumentUploadRequestSchema);
      if (input instanceof Response) return input;

      try {
        const status = await getDocumentService(c.env).abortUpload(
          c.get("adminUserId"),
          documentVersionId,
          input,
        );
        return jsonData(c, { status });
      } catch (error) {
        return documentServiceErrorResponse(c, error);
      }
    },
  );

  app.get("/v1/document-versions", requireAdmin, async (c) => {
    const query = DocumentListQuerySchema.safeParse({
      archived: c.req.query("archived"),
      documentType: c.req.query("documentType"),
    });
    if (!query.success) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "조회 조건이 올바르지 않습니다.",
      );
    }

    try {
      const items = await getDocumentService(c.env).list(
        c.get("adminUserId"),
        query.data,
      );
      return jsonData(c, { items });
    } catch (error) {
      return documentServiceErrorResponse(c, error);
    }
  });

  app.get("/v1/document-versions/:id", requireAdmin, async (c) => {
    const documentVersionId = parseDocumentVersionId(c);
    if (documentVersionId instanceof Response) return documentVersionId;

    try {
      const data = await getDocumentService(c.env).get(
        c.get("adminUserId"),
        documentVersionId,
      );
      return jsonData(c, data);
    } catch (error) {
      return documentServiceErrorResponse(c, error);
    }
  });

  app.patch("/v1/document-versions/:id", requireAdmin, async (c) => {
    const documentVersionId = parseDocumentVersionId(c);
    if (documentVersionId instanceof Response) return documentVersionId;
    const input = await parseJsonBody(c, UpdateDocumentVersionRequestSchema);
    if (input instanceof Response) return input;

    try {
      const data = await getDocumentService(c.env).update(
        c.get("adminUserId"),
        documentVersionId,
        input,
      );
      return jsonData(c, data);
    } catch (error) {
      return documentServiceErrorResponse(c, error);
    }
  });

  app.put("/v1/document-publications/:type", requireAdmin, async (c) => {
    const documentType = DocumentTypeSchema.safeParse(c.req.param("type"));
    if (!documentType.success) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "문서 종류가 올바르지 않습니다.",
      );
    }
    const input = await parseJsonBody(c, SetDocumentPublicationRequestSchema);
    if (input instanceof Response) return input;

    try {
      const data = await getDocumentService(c.env).setPublication(
        c.get("adminUserId"),
        documentType.data,
        input.documentVersionId,
      );
      return jsonData(c, data);
    } catch (error) {
      return documentServiceErrorResponse(c, error);
    }
  });

  app.delete("/v1/document-publications/:type", requireAdmin, async (c) => {
    const documentType = DocumentTypeSchema.safeParse(c.req.param("type"));
    if (!documentType.success) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "문서 종류가 올바르지 않습니다.",
      );
    }

    try {
      await getDocumentService(c.env).clearPublication(
        c.get("adminUserId"),
        documentType.data,
      );
      return new Response(null, {
        headers: { "X-Request-Id": getRequestId(c) },
        status: 204,
      });
    } catch (error) {
      return documentServiceErrorResponse(c, error);
    }
  });

  app.post(
    "/v1/document-versions/:id/download-url",
    requireAdmin,
    async (c) => {
      const documentVersionId = parseDocumentVersionId(c);
      if (documentVersionId instanceof Response) return documentVersionId;
      const input = await parseJsonBody(
        c,
        CreateDocumentDownloadUrlRequestSchema,
      );
      if (input instanceof Response) return input;

      try {
        const data = await getDocumentService(c.env).createDownloadUrl(
          c.get("adminUserId"),
          documentVersionId,
          input.disposition,
        );
        return jsonData(c, data);
      } catch (error) {
        return documentServiceErrorResponse(c, error);
      }
    },
  );

  app.notFound((c) =>
    errorResponse(c, 404, "NOT_FOUND", "요청한 경로를 찾을 수 없습니다."),
  );

  app.onError((_error, c) => {
    logError({
      event: "worker_error",
      requestId: getRequestId(c),
      errorCode: "INTERNAL_ERROR",
    });

    return errorResponse(
      c,
      500,
      "INTERNAL_ERROR",
      "서버에서 처리하지 못한 오류가 발생했습니다.",
    );
  });

  return app;
}

export const app = createApp();
