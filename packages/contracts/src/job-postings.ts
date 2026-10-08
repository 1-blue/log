import * as z from "zod";

import { JobPostingUrlSchema } from "./job-platforms";

export const CONTRACT_VERSION = "1.0.0" as const;

export const ANALYSIS_JOB_MAX_RUN_ATTEMPTS = 2;

export const ANALYSIS_STEP_MAX_ATTEMPTS = 2;

export const ANALYSIS_INPUT_POLICY_VERSION = "analysis-input-v1" as const;

export const ANALYSIS_DISPATCH_DOCUMENT_TEXT_MAX_LENGTH = 32_000;

export const ANALYSIS_DISPATCH_JOB_POSTING_TEXT_MAX_LENGTH = 60_000;

export const UuidSchema = z.uuid();

export const Rfc3339TimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/,
    "RFC 3339 timestamp is required",
  );

const UrlSchema = z.url();

export const JobPostingSourceSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/);

export type JobPostingSource = z.infer<typeof JobPostingSourceSchema>;

export const DocumentTypeSchema = z.enum(["resume", "portfolio"]);

export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const DocumentExtractionStatusSchema = z.enum([
  "pending",
  "processing",
  "ready",
  "failed",
]);

export type DocumentExtractionStatus = z.infer<
  typeof DocumentExtractionStatusSchema
>;

export const DOCUMENT_MAX_FILE_SIZE = 20 * 1_024 * 1_024;

export const DOCUMENT_RESUMABLE_THRESHOLD = 6 * 1_024 * 1_024;

export const DOCUMENT_EXTRACTED_TEXT_MAX_LENGTH = 500_000;

export const DocumentExtractionOutcomeSchema = z.enum(["ready", "failed"]);

export type DocumentExtractionOutcome = z.infer<
  typeof DocumentExtractionOutcomeSchema
>;

export const DocumentExtractionErrorCodeSchema = z.enum([
  "PDF_PARSE_FAILED",
  "PDF_TEXT_EMPTY",
  "PDF_TEXT_TOO_LARGE",
  "EXTRACTION_DISPATCH_FAILED",
  "OCR_PAGE_LIMIT_EXCEEDED",
  "OCR_PAGE_COUNT_UNKNOWN",
  "OCR_TEXT_EMPTY",
  "OCR_INCOMPLETE",
  "OCR_TIMEOUT",
  "OCR_RATE_LIMITED",
  "OCR_BILLING_LIMIT",
  "OCR_UNAVAILABLE",
  "OCR_FAILED",
]);

export type DocumentExtractionErrorCode = z.infer<
  typeof DocumentExtractionErrorCodeSchema
>;

export const WantedJobPostingUrlSchema = UrlSchema.refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.hostname === "www.wanted.co.kr" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    /^\/wd\/\d+$/.test(url.pathname)
  );
}, "A valid HTTPS Wanted job URL is required");

export const JOB_POSTING_MANUAL_CONTENT_MIN_LENGTH = 100;

export const JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH = 100_000;

export const JOB_POSTING_FETCH_MAX_BYTES = 600_000;

export const JobPostingCollectionModeSchema = z.enum(["automatic", "manual"]);

export type JobPostingCollectionMode = z.infer<
  typeof JobPostingCollectionModeSchema
>;

export const JobPostingCollectionStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "needs_input",
  "failed",
]);

export type JobPostingCollectionStatus = z.infer<
  typeof JobPostingCollectionStatusSchema
>;

export const JobPostingCollectionErrorCodeSchema = z.enum([
  "ACCESS_BLOCKED",
  "JOB_EXPIRED",
  "REDIRECT_NOT_ALLOWED",
  "INVALID_CONTENT_TYPE",
  "CONTENT_TOO_LARGE",
  "INVALID_JOB_POSTING",
  "PARSER_STRUCTURE_CHANGED",
  "URL_MISMATCH",
  "TIMEOUT",
  "NETWORK_ERROR",
  "RATE_LIMITED",
  "UPSTREAM_ERROR",
  "DISPATCH_FAILED",
  "AUTOMATIC_COLLECTION_UNSUPPORTED",
  "AI_STRUCTURING_FAILED",
]);

export type JobPostingCollectionErrorCode = z.infer<
  typeof JobPostingCollectionErrorCodeSchema
>;

export const JobPostingSnapshotSourceSchema = z.enum([
  "wanted_json_ld",
  "wanted_html",
  "wanted_ai",
  "manual",
  "ai",
]);

export type JobPostingSnapshotSource = z.infer<
  typeof JobPostingSnapshotSourceSchema
>;

const JobPostingManualContentSchema = z
  .string()
  .trim()
  .min(JOB_POSTING_MANUAL_CONTENT_MIN_LENGTH)
  .max(JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH);

export const CreateJobPostingCollectionRequestSchema = z.strictObject({
  manualContent: JobPostingManualContentSchema.nullable(),
});

export type CreateJobPostingCollectionRequest = z.infer<
  typeof CreateJobPostingCollectionRequestSchema
>;

export const JobPostingSourceMetadataSchema = z.strictObject({
  title: z.string().max(500).nullable(),
  companyName: z.string().max(500).nullable(),
  datePosted: z.string().max(100).nullable(),
  validThrough: z.string().max(100).nullable(),
  employmentType: z.string().max(300).nullable(),
  location: z.string().max(1_000).nullable(),
  industry: z.string().max(500).nullable(),
  occupationalCategory: z.string().max(500).nullable(),
});

export type JobPostingSourceMetadata = z.infer<
  typeof JobPostingSourceMetadataSchema
>;

export const JobPostingBodySectionsSchema = z.strictObject({
  companyIntroduction: z.string().max(20_000).nullable(),
  positionIntroduction: z.string().max(20_000).nullable(),
  expectations: z.string().max(20_000).nullable(),
  mainResponsibilities: z.string().max(30_000).nullable(),
  requirements: z.string().max(30_000).nullable(),
  preferred: z.string().max(30_000).nullable(),
  employmentConditions: z.string().max(10_000).nullable(),
  process: z.string().max(10_000).nullable(),
  benefits: z.string().max(10_000).nullable(),
  technologies: z.string().max(10_000).nullable(),
  traits: z.string().max(10_000).nullable(),
  deadline: z.string().max(2_000).nullable(),
  location: z.string().max(2_000).nullable(),
  other: z.string().max(20_000).nullable(),
});

export type JobPostingBodySections = z.infer<
  typeof JobPostingBodySectionsSchema
>;

export const JobPostingAiEvidenceSchema = z.strictObject({
  section: z.string().min(1).max(200),
  excerpt: z.string().min(1).max(500),
});

export const JobPostingAiExtractionSchema = z.strictObject({
  title: z.string().max(500).nullable(),
  companyName: z.string().max(500).nullable(),
  description: z.string().max(JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH).nullable(),
  evidence: z.array(JobPostingAiEvidenceSchema).max(30),
  warnings: z.array(z.string().max(1_000)).max(20),
});

export type JobPostingAiExtraction = z.infer<
  typeof JobPostingAiExtractionSchema
>;

export const JobPostingSnapshotSchema = z.strictObject({
  id: UuidSchema,
  jobPostingId: UuidSchema,
  source: JobPostingSnapshotSourceSchema,
  rawContent: z.string().min(1).max(JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH),
  normalizedContent: z
    .string()
    .min(1)
    .max(JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH + 2_000),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  parserVersion: z.string().min(1).max(100),
  sourceMetadata: JobPostingSourceMetadataSchema,
  sections: JobPostingBodySectionsSchema,
  fetchedAt: Rfc3339TimestampSchema,
  createdAt: Rfc3339TimestampSchema,
});

export type JobPostingSnapshot = z.infer<typeof JobPostingSnapshotSchema>;

export const JobPostingCollectionRunSchema = z.strictObject({
  id: UuidSchema,
  jobPostingId: UuidSchema,
  mode: JobPostingCollectionModeSchema,
  status: JobPostingCollectionStatusSchema,
  requestId: UuidSchema,
  errorCode: JobPostingCollectionErrorCodeSchema.nullable(),
  retryable: z.boolean(),
  httpStatus: z.int().min(100).max(599).nullable(),
  snapshot: JobPostingSnapshotSchema.nullable(),
  createdAt: Rfc3339TimestampSchema,
  startedAt: Rfc3339TimestampSchema.nullable(),
  finishedAt: Rfc3339TimestampSchema.nullable(),
  updatedAt: Rfc3339TimestampSchema,
});

export type JobPostingCollectionRun = z.infer<
  typeof JobPostingCollectionRunSchema
>;

export const JobPostingCollectionResponseSchema = z.strictObject({
  data: JobPostingCollectionRunSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type JobPostingCollectionResponse = z.infer<
  typeof JobPostingCollectionResponseSchema
>;

export const JobPostingCollectionListResponseSchema = z.strictObject({
  data: z.strictObject({
    items: z.array(JobPostingCollectionRunSchema).max(20),
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type JobPostingCollectionListResponse = z.infer<
  typeof JobPostingCollectionListResponseSchema
>;

export const N8nJobPostingCollectionDispatchPayloadSchema = z.strictObject({
  kind: z.literal("job_posting_collection"),
  schemaVersion: z.literal(CONTRACT_VERSION),
  eventId: UuidSchema,
  requestId: UuidSchema,
  collectionRunId: UuidSchema,
  jobPosting: z.strictObject({
    id: UuidSchema,
    source: JobPostingSourceSchema,
    url: JobPostingUrlSchema,
    manualContent: JobPostingManualContentSchema.nullable(),
  }),
  callbackPath: z
    .string()
    .regex(/^\/v1\/internal\/job-posting-collections\/[0-9a-f-]+\/complete$/),
});

export type N8nJobPostingCollectionDispatchPayload = z.infer<
  typeof N8nJobPostingCollectionDispatchPayloadSchema
>;

export const N8nJobPostingExtractionDispatchPayloadSchema = z.strictObject({
  kind: z.literal("job_posting_extraction"),
  schemaVersion: z.literal(CONTRACT_VERSION),
  eventId: UuidSchema,
  requestId: UuidSchema,
  collectionRunId: UuidSchema,
  jobPosting: z.strictObject({
    id: UuidSchema,
    source: JobPostingSourceSchema,
    url: JobPostingUrlSchema,
    sourceText: z.string().min(1).max(JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH),
  }),
  callbackPath: z
    .string()
    .regex(/^\/v1\/internal\/job-posting-collections\/[0-9a-f-]+\/complete$/),
  outputSchema: z.record(z.string(), z.unknown()),
});

export type N8nJobPostingExtractionDispatchPayload = z.infer<
  typeof N8nJobPostingExtractionDispatchPayloadSchema
>;

export const N8nDocumentExtractionDispatchPayloadSchema = z.strictObject({
  kind: z.literal("document_extraction"),
  schemaVersion: z.literal(CONTRACT_VERSION),
  eventId: UuidSchema,
  requestId: UuidSchema,
  document: z.strictObject({
    id: UuidSchema,
    type: DocumentTypeSchema,
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    fileSize: z.int().positive(),
    downloadUrl: z.url(),
  }),
  callbackPath: z
    .string()
    .regex(/^\/v1\/internal\/document-versions\/[0-9a-f-]+\/extract$/),
  outputSchema: z.record(z.string(), z.unknown()),
});

export type N8nDocumentExtractionDispatchPayload = z.infer<
  typeof N8nDocumentExtractionDispatchPayloadSchema
>;
