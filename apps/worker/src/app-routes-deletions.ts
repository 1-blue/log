import { DeleteResourceRequestSchema } from "@workspace/contracts";

import type { Context } from "hono";

import {
  errorResponse,
  executeIdempotently,
  jsonData,
  parseJsonBody,
  parseResourceId,
  scheduleBackground,
} from "./app-response.js";
import type { AppRouteDependencies, WorkerAppEnv } from "./app-types.js";
import { type DeletionService, DeletionServiceError } from "./deletions.js";

function deletionError(c: Context<WorkerAppEnv>, error: unknown) {
  const reason =
    error instanceof DeletionServiceError ? error.reason : "unavailable";
  if (reason === "resource_not_found")
    return errorResponse(
      c,
      404,
      "NOT_FOUND",
      "삭제 대상이나 작업을 찾을 수 없습니다.",
    );
  if (reason === "deletion_preview_changed")
    return errorResponse(
      c,
      409,
      "CONFLICT",
      "삭제 대상이 변경됐습니다. 영향 범위를 다시 확인해 주세요.",
      false,
      { reason },
    );
  if (reason === "deletion_blocked" || reason === "career_ops_maintenance")
    return errorResponse(
      c,
      409,
      "CONFLICT",
      "활성 지원이나 실행 중인 작업이 있습니다. 삭제 조건을 다시 확인해 주세요.",
      false,
      { reason },
    );
  return errorResponse(
    c,
    503,
    "UPSTREAM_UNAVAILABLE",
    "삭제 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    true,
  );
}
export function registerDeletionRoutes(
  routes: AppRouteDependencies,
  service: (env: CloudflareBindings) => DeletionService,
) {
  const { app, requireAdmin, getIdempotencyService } = routes;
  for (const [resource, type] of [
    ["applications", "application"],
    ["document-versions", "document"],
  ] as const) {
    app.get(`/v1/${resource}/:id/deletion-preview`, requireAdmin, async (c) => {
      const id = parseResourceId(c, "삭제 대상");
      if (id instanceof Response) return id;
      try {
        return jsonData(
          c,
          await service(c.env).preview(c.get("adminUserId"), type, id),
        );
      } catch (error) {
        return deletionError(c, error);
      }
    });
    app.delete(`/v1/${resource}/:id`, requireAdmin, async (c) => {
      const id = parseResourceId(c, "삭제 대상");
      if (id instanceof Response) return id;
      const input = await parseJsonBody(c, DeleteResourceRequestSchema);
      if (input instanceof Response) return input;
      return executeIdempotently(
        c,
        getIdempotencyService(c.env),
        input,
        async () => {
          try {
            const data = await service(c.env).delete(
              c.get("adminUserId"),
              type,
              id,
              input.fingerprint,
            );
            if (data.status !== "completed")
              scheduleBackground(c, () =>
                service(c.env)
                  .cleanup(c.get("adminUserId"))
                  .catch(() => undefined),
              );
            return jsonData(c, data, data.status === "completed" ? 200 : 202);
          } catch (error) {
            return deletionError(c, error);
          }
        },
      );
    });
  }
  app.get("/v1/deletion-operations/:id", requireAdmin, async (c) => {
    const id = parseResourceId(c, "삭제 작업");
    if (id instanceof Response) return id;
    try {
      return jsonData(c, await service(c.env).get(c.get("adminUserId"), id));
    } catch (error) {
      return deletionError(c, error);
    }
  });
}
