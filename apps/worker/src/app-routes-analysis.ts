import {
  AnalysisJobActionRequestSchema,
  CreateAnalysisJobRequestSchema,
} from "@workspace/contracts";

import { analysisServiceErrorResponse } from "./app-errors.js";
import {
  executeIdempotently,
  getRequestId,
  jsonData,
  parseJsonBody,
  parseResourceId,
} from "./app-response.js";
import type { AppRouteDependencies } from "./app-types.js";

export function registerAnalysisRoutes(routes: AppRouteDependencies) {
  const { app, requireAdmin, getAnalysisJobService, getIdempotencyService } =
    routes;

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

  app.get("/v1/analysis-jobs/:id/diagnostics", requireAdmin, async (c) => {
    const analysisJobId = parseResourceId(c, "분석 작업");
    if (analysisJobId instanceof Response) return analysisJobId;
    try {
      const data = await getAnalysisJobService(c.env).diagnostics(
        c.get("adminUserId"),
        analysisJobId,
      );
      return jsonData(c, data);
    } catch (error) {
      return analysisServiceErrorResponse(c, error);
    }
  });

  app.post("/v1/analysis-jobs/:id/recover-stale", requireAdmin, async (c) => {
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
          const job = await getAnalysisJobService(c.env).recoverStale(
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
}
