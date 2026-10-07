import {
  AiUsageCallbackSchema,
  SaveAiBalanceBaselineRequestSchema,
} from "@workspace/contracts";

import * as z from "zod";

import { type AiUsageService,AiUsageServiceError } from "./ai-usage.js";
import {
  errorResponse,
  getRequestId,
  jsonData,
  parseJsonBody,
} from "./app-response.js";
import type { AppRouteDependencies } from "./app-types.js";

export function registerAiUsageRoutes(
  routes: AppRouteDependencies,
  service: (env: CloudflareBindings) => AiUsageService,
) {
  const { app, requireAdmin } = routes;
  const failure = (c: Parameters<typeof errorResponse>[0], error: unknown) => {
    const kind =
      error instanceof AiUsageServiceError ? error.kind : "unavailable";
    return errorResponse(
      c,
      kind === "not_found" ? 404 : kind === "conflict" ? 409 : 503,
      kind === "not_found"
        ? "NOT_FOUND"
        : kind === "conflict"
          ? "CONFLICT"
          : "UPSTREAM_UNAVAILABLE",
      kind === "conflict"
        ? "사용량 식별자나 잔액 기준 시점을 확인해 주세요."
        : "AI 사용량 기록을 처리하지 못했습니다.",
      kind === "unavailable",
    );
  };
  app.get("/v1/ai-usage", requireAdmin, async (c) => {
    const days = z.coerce
      .number()
      .int()
      .min(1)
      .max(366)
      .safeParse(c.req.query("days") ?? 30);
    if (!days.success)
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "조회 기간은 1~366일이어야 합니다.",
      );
    try {
      return jsonData(
        c,
        await service(c.env).dashboard(c.get("adminUserId"), days.data),
      );
    } catch (error) {
      return failure(c, error);
    }
  });
  app.put("/v1/ai-usage/balance", requireAdmin, async (c) => {
    const input = await parseJsonBody(c, SaveAiBalanceBaselineRequestSchema);
    if (input instanceof Response) return input;
    try {
      return jsonData(
        c,
        await service(c.env).saveBaseline(c.get("adminUserId"), input),
      );
    } catch (error) {
      return failure(c, error);
    }
  });
  app.post("/v1/internal/ai-usage", async (c) => {
    const input = await parseJsonBody(c, AiUsageCallbackSchema, 20_000);
    if (input instanceof Response) return input;
    if (
      input.eventId !== c.get("signedEventId") ||
      input.requestId !== getRequestId(c)
    )
      return errorResponse(
        c,
        401,
        "INVALID_SIGNATURE",
        "내부 요청 식별자가 일치하지 않습니다.",
      );
    try {
      await service(c.env).record(c.env.ADMIN_USER_ID, input);
      return jsonData(c, { recorded: true });
    } catch (error) {
      return failure(c, error);
    }
  });
}
