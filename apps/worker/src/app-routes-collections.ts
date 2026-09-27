import { CreateJobPostingCollectionRequestSchema } from "@workspace/contracts";

import * as z from "zod";

import { collectionServiceErrorResponse } from "./app-errors.js";
import {
  errorResponse,
  executeIdempotently,
  getRequestId,
  jsonData,
  parseJsonBody,
  parseResourceId,
} from "./app-response.js";
import type { AppRouteDependencies } from "./app-types.js";

const ResourceIdSchema = z.uuid();

export function registerCollectionsRoutes(routes: AppRouteDependencies) {
  const {
    app,
    requireAdmin,
    getIdempotencyService,
    getJobPostingCollectionService,
  } = routes;

  app.post("/v1/job-postings/:id/collections", requireAdmin, async (c) => {
    const jobPostingId = parseResourceId(c, "채용공고");
    if (jobPostingId instanceof Response) return jobPostingId;
    const input = await parseJsonBody(
      c,
      CreateJobPostingCollectionRequestSchema,
    );
    if (input instanceof Response) return input;

    return executeIdempotently(
      c,
      getIdempotencyService(c.env),
      input,
      async () => {
        try {
          const data = await getJobPostingCollectionService(c.env).create(
            c.get("adminUserId"),
            jobPostingId,
            getRequestId(c),
            input,
          );
          return jsonData(c, data, 202);
        } catch (error) {
          return collectionServiceErrorResponse(c, error);
        }
      },
    );
  });

  app.get("/v1/job-postings/:id/collections", requireAdmin, async (c) => {
    const jobPostingId = parseResourceId(c, "채용공고");
    if (jobPostingId instanceof Response) return jobPostingId;
    try {
      const items = await getJobPostingCollectionService(c.env).list(
        c.get("adminUserId"),
        jobPostingId,
      );
      return jsonData(c, { items });
    } catch (error) {
      return collectionServiceErrorResponse(c, error);
    }
  });

  app.get(
    "/v1/job-postings/:id/collections/:collectionId",
    requireAdmin,
    async (c) => {
      const jobPostingId = parseResourceId(c, "채용공고");
      const collectionRunId = ResourceIdSchema.safeParse(
        c.req.param("collectionId"),
      );
      if (jobPostingId instanceof Response) return jobPostingId;
      if (!collectionRunId.success) {
        return errorResponse(
          c,
          400,
          "VALIDATION_ERROR",
          "수집 실행 ID가 올바르지 않습니다.",
        );
      }
      try {
        const data = await getJobPostingCollectionService(c.env).get(
          c.get("adminUserId"),
          collectionRunId.data,
        );
        if (data.jobPostingId !== jobPostingId) {
          return errorResponse(
            c,
            404,
            "NOT_FOUND",
            "공고 수집 정보를 찾을 수 없습니다.",
          );
        }
        return jsonData(c, data);
      } catch (error) {
        return collectionServiceErrorResponse(c, error);
      }
    },
  );
}
