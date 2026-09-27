import {
  ApplicationListQuerySchema,
  ApplicationStateInputSchema,
  CreateApplicationRequestSchema,
  PatchApplicationRequestSchema,
  PatchJobPostingRequestSchema,
} from "@workspace/contracts";

import { applicationServiceErrorResponse } from "./app-errors.js";
import {
  errorResponse,
  executeIdempotently,
  getRequestId,
  jsonData,
  parseJsonBody,
  parseResourceId,
} from "./app-response.js";
import type { AppRouteDependencies } from "./app-types.js";

export function registerApplicationsRoutes(routes: AppRouteDependencies) {
  const { app, requireAdmin, getApplicationService, getIdempotencyService } =
    routes;

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
}
