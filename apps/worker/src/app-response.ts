import { ApiErrorCodeSchema, IdempotencyKeySchema } from "@workspace/contracts";

import type { Context } from "hono";
import * as z from "zod";

import type { WorkerAppEnv } from "./app-types.js";
import {
  createRequestFingerprint,
  type IdempotencyService,
} from "./idempotency.js";

export function getRequestId(c: { get: (key: "requestId") => string }): string {
  return c.get("requestId");
}

export function scheduleBackground(
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

export function errorResponse(
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

const DocumentVersionIdSchema = z.uuid();
const ResourceIdSchema = z.uuid();

export async function parseJsonBody<T>(
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

export function parseDocumentVersionId(
  c: Context<WorkerAppEnv>,
): string | Response {
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

export function parseResourceId(
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

export function jsonData<T>(
  c: Context<WorkerAppEnv>,
  data: T,
  status: 200 | 201 | 202 = 200,
) {
  const requestId = getRequestId(c);
  const response = c.json({ data, meta: { requestId } }, status);
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export async function enforceRateLimit(
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

export async function executeIdempotently(
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
