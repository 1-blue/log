import { ApiErrorCodeSchema } from "@workspace/contracts";

import type { Context } from "hono";
import { Hono } from "hono";
import * as z from "zod";

type WorkerAppEnv = {
  Bindings: CloudflareBindings;
  Variables: {
    requestId: string;
  };
};

const SERVICE_NAME = "bluelog-career-ops-api" as const;

function getRequestId(c: { get: (key: "requestId") => string }): string {
  return c.get("requestId");
}

function errorResponse(
  c: Context<WorkerAppEnv>,
  status: 400 | 403 | 404 | 405 | 409 | 429 | 500 | 502 | 504,
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

export function createApp() {
  const app = new Hono<WorkerAppEnv>();

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
