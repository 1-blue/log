import {
  ApiErrorCodeSchema,
  CompleteDocumentUploadRequestSchema,
  CreateDocumentDownloadUrlRequestSchema,
  DocumentTypeSchema,
  PrepareDocumentUploadRequestSchema,
  PublicDocumentDispositionSchema,
  SetDocumentPublicationRequestSchema,
  UpdateDocumentVersionRequestSchema,
} from "@workspace/contracts";

import type { Context } from "hono";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import * as z from "zod";

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

type WorkerAppEnv = {
  Bindings: CloudflareBindings;
  Variables: {
    adminUserId: string;
    requestId: string;
  };
};

const SERVICE_NAME = "bluelog-career-ops-api" as const;

function getRequestId(c: { get: (key: "requestId") => string }): string {
  return c.get("requestId");
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
  documentServiceFactory?: (env: CloudflareBindings) => DocumentService;
  jwtVerificationKey?: JwtVerificationKey;
};

const DocumentVersionIdSchema = z.uuid();
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
): Promise<T | Response> {
  const contentLength = Number(c.req.header("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 600_000) {
    return errorResponse(
      c,
      400,
      "VALIDATION_ERROR",
      "요청 본문이 허용된 크기를 초과했습니다.",
    );
  }

  const payload: unknown = await c.req.json().catch(() => undefined);
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

function jsonData<T>(
  c: Context<WorkerAppEnv>,
  data: T,
  status: 200 | 201 = 200,
) {
  const requestId = getRequestId(c);
  const response = c.json({ data, meta: { requestId } }, status);
  response.headers.set("X-Request-Id", requestId);
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

    try {
      const { userId } = await verifySupabaseAdminToken(
        match[1],
        c.env,
        dependencies.jwtVerificationKey,
      );
      c.set("adminUserId", userId);
      await next();
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
  };
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono<WorkerAppEnv>();
  const requireAdmin = createRequireAdmin(dependencies);
  const getDocumentService = (env: CloudflareBindings) =>
    dependencies.documentServiceFactory?.(env) ?? createDocumentService(env);

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
      c.header("Vary", "Origin");

      if (c.req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: c.res.headers });
      }
    }

    await next();

    console.log(
      JSON.stringify({
        event: "worker_request",
        requestId,
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status: c.res.status,
        durationMs: Date.now() - startedAt,
      }),
    );
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

  app.get("/v1/public/document-publications/:type", async (c) => {
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

    try {
      const data = await getDocumentService(c.env).prepareUpload(
        c.get("adminUserId"),
        input,
      );
      return jsonData(c, data, 201);
    } catch (error) {
      return documentServiceErrorResponse(c, error);
    }
  });

  app.post("/v1/document-versions/:id/complete", requireAdmin, async (c) => {
    const documentVersionId = parseDocumentVersionId(c);
    if (documentVersionId instanceof Response) return documentVersionId;
    const input = await parseJsonBody(c, CompleteDocumentUploadRequestSchema);
    if (input instanceof Response) return input;

    try {
      const data = await getDocumentService(c.env).completeUpload(
        c.get("adminUserId"),
        documentVersionId,
        input,
      );
      return jsonData(c, data, 201);
    } catch (error) {
      return documentServiceErrorResponse(c, error);
    }
  });

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

  app.onError((error, c) => {
    console.error(
      JSON.stringify({
        event: "worker_error",
        requestId: getRequestId(c),
        errorName: error.name,
      }),
    );

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
