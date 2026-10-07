import * as z from "zod";

import { DocumentAnalysisProfileSchema } from "./analysis-jobs";
import {
  CONTRACT_VERSION,
  DOCUMENT_EXTRACTED_TEXT_MAX_LENGTH,
  DocumentExtractionErrorCodeSchema,
  DocumentExtractionOutcomeSchema,
  JobPostingAiExtractionSchema,
  Rfc3339TimestampSchema,
  UuidSchema,
} from "./job-postings";

export const JobPostingCollectionCallbackOutcomeSchema = z.enum([
  "response",
  "manual",
  "ai_extraction",
  "network_error",
  "timeout",
]);

export const JobPostingCollectionCallbackSchema = z
  .strictObject({
    schemaVersion: z.literal(CONTRACT_VERSION),
    eventId: UuidSchema,
    requestId: UuidSchema,
    collectionRunId: UuidSchema,
    outcome: JobPostingCollectionCallbackOutcomeSchema,
    occurredAt: Rfc3339TimestampSchema,
    extraction: JobPostingAiExtractionSchema.nullable().optional(),
    response: z
      .strictObject({
        status: z.int().min(100).max(599),
        contentType: z.string().max(500).nullable(),
        contentLength: z.int().nonnegative().nullable(),
        body: z.string().max(1_000_000),
      })
      .nullable(),
  })
  .superRefine((value, context) => {
    const responseRequired =
      value.outcome === "response" ||
      value.outcome === "manual" ||
      value.outcome === "ai_extraction";
    if (responseRequired !== (value.response !== null)) {
      context.addIssue({
        code: "custom",
        message: "The callback response must match its outcome",
        path: ["response"],
      });
    }
    if (value.outcome === "ai_extraction" && !value.extraction) {
      context.addIssue({
        code: "custom",
        message: "AI extraction callback must include extraction data",
        path: ["extraction"],
      });
    }
    if (value.outcome !== "ai_extraction" && value.extraction) {
      context.addIssue({
        code: "custom",
        message: "Extraction data is only valid for AI extraction callbacks",
        path: ["extraction"],
      });
    }
  });

export type JobPostingCollectionCallback = z.infer<
  typeof JobPostingCollectionCallbackSchema
>;

export const DocumentExtractionCallbackSchema = z
  .strictObject({
    schemaVersion: z.literal(CONTRACT_VERSION),
    eventId: UuidSchema,
    requestId: UuidSchema,
    documentVersionId: UuidSchema,
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    outcome: DocumentExtractionOutcomeSchema,
    extractionSource: z.enum(["pdf", "ocr"]).optional(),
    extractedText: z
      .string()
      .max(DOCUMENT_EXTRACTED_TEXT_MAX_LENGTH)
      .nullable(),
    profile: z
      .lazy(() => DocumentAnalysisProfileSchema)
      .nullable()
      .optional(),
    profileMetadata: z
      .strictObject({
        model: z.string().max(100).nullable(),
        promptVersion: z.string().min(1).max(100),
        reasoningEffort: z.enum(["low", "medium", "high"]).nullable(),
      })
      .nullable()
      .optional(),
    profileErrorCode: z.string().min(1).max(100).nullable().optional(),
    errorCode: DocumentExtractionErrorCodeSchema.nullable(),
    occurredAt: Rfc3339TimestampSchema,
  })
  .superRefine((value, context) => {
    if (value.outcome === "ready" && !value.extractedText?.trim()) {
      context.addIssue({
        code: "custom",
        message: "A successful extraction callback must include text",
        path: ["extractedText"],
      });
    }
    if (value.outcome === "ready" && value.errorCode !== null) {
      context.addIssue({
        code: "custom",
        message: "A successful extraction callback cannot include an error",
        path: ["errorCode"],
      });
    }
    if (value.outcome === "failed" && value.extractedText !== null) {
      context.addIssue({
        code: "custom",
        message: "A failed extraction callback cannot include text",
        path: ["extractedText"],
      });
    }
    if (value.outcome === "failed" && value.errorCode === null) {
      context.addIssue({
        code: "custom",
        message: "A failed extraction callback must include an error",
        path: ["errorCode"],
      });
    }
  });

export type DocumentExtractionCallback = z.infer<
  typeof DocumentExtractionCallbackSchema
>;
