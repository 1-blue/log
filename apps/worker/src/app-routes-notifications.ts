import { RetrySlackNotificationRequestSchema } from "@workspace/contracts";

import { slackNotificationServiceErrorResponse } from "./app-errors.js";
import {
  errorResponse,
  jsonData,
  parseJsonBody,
  parseResourceId,
} from "./app-response.js";
import type { AppRouteDependencies } from "./app-types.js";

export function registerNotificationRoutes({
  app,
  requireAdmin,
  getSlackNotificationService,
}: AppRouteDependencies) {
  app.get("/v1/slack-notifications", requireAdmin, async (c) => {
    if (!getSlackNotificationService)
      return errorResponse(
        c,
        503,
        "UPSTREAM_UNAVAILABLE",
        "알림 저장소를 사용할 수 없습니다.",
        true,
      );
    try {
      return jsonData(
        c,
        await getSlackNotificationService(c.env).list(c.get("adminUserId")),
      );
    } catch (error) {
      return slackNotificationServiceErrorResponse(c, error);
    }
  });
  app.post("/v1/slack-notifications/:id/retry", requireAdmin, async (c) => {
    const id = parseResourceId(c, "알림");
    if (id instanceof Response) return id;
    const input = await parseJsonBody(c, RetrySlackNotificationRequestSchema);
    if (input instanceof Response) return input;
    if (!getSlackNotificationService)
      return errorResponse(
        c,
        503,
        "UPSTREAM_UNAVAILABLE",
        "알림 저장소를 사용할 수 없습니다.",
        true,
      );
    try {
      return jsonData(
        c,
        await getSlackNotificationService(c.env).retry(
          c.get("adminUserId"),
          id,
          input.expectedUpdatedAt,
          input.confirmUnknownDelivery,
        ),
      );
    } catch (error) {
      return slackNotificationServiceErrorResponse(c, error);
    }
  });
}
