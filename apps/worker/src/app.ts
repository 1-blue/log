import { Hono } from "hono";
import * as z from "zod";

import { createAnalysisJobService } from "./analysis-jobs.js";
import { createRequireAdmin } from "./app-auth.js";
import { errorResponse, getRequestId } from "./app-response.js";
import { registerAnalysisRoutes } from "./app-routes-analysis.js";
import { registerApplicationsRoutes } from "./app-routes-applications.js";
import { registerCollectionsRoutes } from "./app-routes-collections.js";
import { registerDeletionRoutes } from "./app-routes-deletions.js";
import { registerDocumentsRoutes } from "./app-routes-documents.js";
import { registerInternalRoutes } from "./app-routes-internal.js";
import { registerInterviewRoutes } from "./app-routes-interview.js";
import type { AppDependencies, WorkerAppEnv } from "./app-types.js";
import { createApplicationService } from "./applications.js";
import { createDeletionService } from "./deletions.js";
import { createDocumentService } from "./documents.js";
import { createIdempotencyService } from "./idempotency.js";
import { createInterviewWorkspaceService } from "./interview-workspace.js";
import { createJobPostingCollectionService } from "./job-posting-collections.js";
import { logError, logInfo } from "./logger.js";
import { verifySignedRequest } from "./n8n.js";
import { createSlackNotificationService } from "./slack-notifications.js";

const INTERNAL_CALLBACK_MAX_BYTES = 1_250_000;
const SERVICE_NAME = "blog-career-ops-api" as const;
const ResourceIdSchema = z.uuid();

export function createApp(dependencies?: AppDependencies) {
  const resolvedDependencies = dependencies ?? {
    isMaintenance: (env: CloudflareBindings) =>
      createDeletionService(env).isMaintenance(env.ADMIN_USER_ID),
  };
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
    if (
      resolvedDependencies.isMaintenance &&
      (await resolvedDependencies.isMaintenance(c.env))
    ) {
      return errorResponse(
        c,
        409,
        "CONFLICT",
        "데이터 초기화 중입니다. 잠시 후 다시 시도해 주세요.",
      );
    }
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

  const routeDependencies = {
    app,
    getAnalysisJobService,
    getApplicationService,
    getDocumentService,
    getIdempotencyService,
    getInterviewWorkspaceService,
    getJobPostingCollectionService,
    getSlackNotificationService,
    requireAdmin,
  };

  registerApplicationsRoutes(routeDependencies);
  registerAnalysisRoutes(routeDependencies);
  registerInterviewRoutes(routeDependencies);
  registerCollectionsRoutes(routeDependencies);
  registerInternalRoutes(routeDependencies);
  registerDocumentsRoutes(routeDependencies);
  registerDeletionRoutes(
    routeDependencies,
    resolvedDependencies.deletionServiceFactory ?? createDeletionService,
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
