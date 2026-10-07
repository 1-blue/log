import {
  AbortDocumentUploadRequestSchema,
  CompleteDocumentUploadRequestSchema,
  CreateDocumentDownloadUrlRequestSchema,
  DocumentTypeSchema,
  PrepareDocumentUploadRequestSchema,
  PublicDocumentDispositionSchema,
  SaveDocumentEvidenceReviewRequestSchema,
  SetDocumentPublicationRequestSchema,
  UpdateDocumentVersionRequestSchema,
} from "@workspace/contracts";

import * as z from "zod";

import { documentServiceErrorResponse } from "./app-errors.js";
import {
  enforceRateLimit,
  errorResponse,
  executeIdempotently,
  getRequestId,
  jsonData,
  parseDocumentVersionId,
  parseJsonBody,
  scheduleBackground,
} from "./app-response.js";
import type { AppRouteDependencies } from "./app-types.js";
import { dispatchToN8n } from "./n8n.js";

const DocumentListQuerySchema = z.strictObject({
  archived: z.enum(["exclude", "include", "only"]).default("exclude"),
  documentType: DocumentTypeSchema.optional(),
});
const PublicDocumentAccessQuerySchema = z.strictObject({
  disposition: PublicDocumentDispositionSchema.default("inline"),
});

export function registerDocumentsRoutes(routes: AppRouteDependencies) {
  const { app, requireAdmin, getDocumentService, getIdempotencyService } =
    routes;

  app.get("/v1/public/document-publications/:type", async (c) => {
    const rateLimitResponse = await enforceRateLimit(
      c,
      c.env.PUBLIC_API_RATE_LIMITER,
      `public:${c.req.header("CF-Connecting-IP") ?? "unknown"}:${c.req.path}`,
    );
    if (rateLimitResponse) return rateLimitResponse;

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

    return executeIdempotently(
      c,
      getIdempotencyService(c.env),
      input,
      async () => {
        try {
          const data = await getDocumentService(c.env).prepareUpload(
            c.get("adminUserId"),
            input,
          );
          return jsonData(c, data, 201);
        } catch (error) {
          return documentServiceErrorResponse(c, error);
        }
      },
    );
  });

  app.post("/v1/document-versions/:id/complete", requireAdmin, async (c) => {
    const documentVersionId = parseDocumentVersionId(c);
    if (documentVersionId instanceof Response) return documentVersionId;
    const input = await parseJsonBody(c, CompleteDocumentUploadRequestSchema);
    if (input instanceof Response) return input;

    return executeIdempotently(
      c,
      getIdempotencyService(c.env),
      input,
      async () => {
        try {
          const documentService = getDocumentService(c.env);
          const data = await documentService.completeUpload(
            c.get("adminUserId"),
            documentVersionId,
            input,
          );
          scheduleBackground(c, async () => {
            let eventId: string | null = null;
            try {
              const payload = await documentService.prepareExtraction(
                c.get("adminUserId"),
                documentVersionId,
                getRequestId(c),
              );
              if (payload) {
                eventId = payload.eventId;
                await dispatchToN8n(payload, c.env);
              }
            } catch {
              if (!eventId) return;
              await documentService.failExtraction(
                c.get("adminUserId"),
                documentVersionId,
                "EXTRACTION_DISPATCH_FAILED",
                eventId,
              );
            }
          });
          return jsonData(c, data, 201);
        } catch (error) {
          return documentServiceErrorResponse(c, error);
        }
      },
    );
  });

  app.post("/v1/document-versions/:id/extract", requireAdmin, async (c) => {
    const documentVersionId = parseDocumentVersionId(c);
    if (documentVersionId instanceof Response) return documentVersionId;

    const documentService = getDocumentService(c.env);
    try {
      const data = await documentService.get(
        c.get("adminUserId"),
        documentVersionId,
      );
      scheduleBackground(c, async () => {
        let eventId: string | null = null;
        try {
          const payload = await documentService.prepareExtraction(
            c.get("adminUserId"),
            documentVersionId,
            getRequestId(c),
          );
          if (payload) {
            eventId = payload.eventId;
            await dispatchToN8n(payload, c.env);
          }
        } catch {
          if (!eventId) return;
          await documentService.failExtraction(
            c.get("adminUserId"),
            documentVersionId,
            "EXTRACTION_DISPATCH_FAILED",
            eventId,
          );
        }
      });
      return jsonData(c, data, 202);
    } catch (error) {
      return documentServiceErrorResponse(c, error);
    }
  });

  app.post(
    "/v1/document-versions/:id/abort-upload",
    requireAdmin,
    async (c) => {
      const documentVersionId = parseDocumentVersionId(c);
      if (documentVersionId instanceof Response) return documentVersionId;
      const input = await parseJsonBody(c, AbortDocumentUploadRequestSchema);
      if (input instanceof Response) return input;

      try {
        const status = await getDocumentService(c.env).abortUpload(
          c.get("adminUserId"),
          documentVersionId,
          input,
        );
        return jsonData(c, { status });
      } catch (error) {
        return documentServiceErrorResponse(c, error);
      }
    },
  );

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

  app.get(
    "/v1/document-versions/:id/evidence-reviews",
    requireAdmin,
    async (c) => {
      const documentVersionId = parseDocumentVersionId(c);
      if (documentVersionId instanceof Response) return documentVersionId;

      try {
        const items = await getDocumentService(c.env).listEvidenceReviews(
          c.get("adminUserId"),
          documentVersionId,
        );
        return jsonData(c, { items });
      } catch (error) {
        return documentServiceErrorResponse(c, error);
      }
    },
  );

  app.put(
    "/v1/document-versions/:id/evidence-reviews",
    requireAdmin,
    async (c) => {
      const documentVersionId = parseDocumentVersionId(c);
      if (documentVersionId instanceof Response) return documentVersionId;
      const input = await parseJsonBody(
        c,
        SaveDocumentEvidenceReviewRequestSchema,
      );
      if (input instanceof Response) return input;

      try {
        const data = await getDocumentService(c.env).saveEvidenceReview(
          c.get("adminUserId"),
          documentVersionId,
          input,
        );
        return jsonData(c, data);
      } catch (error) {
        return documentServiceErrorResponse(c, error);
      }
    },
  );

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
        headers: c.res.headers,
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
}
