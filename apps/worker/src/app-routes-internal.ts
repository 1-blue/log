import {
  AnalysisEventCallbackSchema,
  AnalysisResultCallbackSchema,
  DocumentExtractionCallbackSchema,
  JobPostingCollectionCallbackSchema,
  SlackNotificationResultCallbackSchema,
} from "@workspace/contracts";

import {
  analysisServiceErrorResponse,
  collectionServiceErrorResponse,
  documentServiceErrorResponse,
  slackNotificationServiceErrorResponse,
} from "./app-errors.js";
import {
  errorResponse,
  getRequestId,
  jsonData,
  parseDocumentVersionId,
  parseJsonBody,
  parseResourceId,
} from "./app-response.js";
import type { AppRouteDependencies } from "./app-types.js";

const INTERNAL_CALLBACK_MAX_BYTES = 1_250_000;

export function registerInternalRoutes(routes: AppRouteDependencies) {
  const {
    app,
    getAnalysisJobService,
    getDocumentService,
    getJobPostingCollectionService,
    getSlackNotificationService,
  } = routes;

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
}
