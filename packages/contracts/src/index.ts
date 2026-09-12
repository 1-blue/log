import * as z from "zod";

export const CONTRACT_VERSION = "1.0.0" as const;

const UuidSchema = z.uuid();
const Rfc3339TimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/,
    "RFC 3339 timestamp is required",
  );
const UrlSchema = z.url();

export const JobPostingSourceSchema = z.enum(["wanted"]);
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

export const WantedJobPostingUrlSchema = UrlSchema.refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.hostname === "www.wanted.co.kr" &&
    /^\/wd\/\d+$/.test(url.pathname)
  );
}, "A valid HTTPS Wanted job URL is required");

export const ApplicationStatusSchema = z.enum([
  "interested",
  "preparing",
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const APPLICATION_STATUSES_REQUIRING_DOCUMENTS = [
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
] as const satisfies readonly ApplicationStatus[];

export function applicationStatusRequiresDocuments(
  status: ApplicationStatus,
): boolean {
  return APPLICATION_STATUSES_REQUIRING_DOCUMENTS.includes(
    status as (typeof APPLICATION_STATUSES_REQUIRING_DOCUMENTS)[number],
  );
}

export const AnalysisJobStatusSchema = z.enum([
  "queued",
  "running",
  "needs_input",
  "retrying",
  "succeeded",
  "failed",
  "cancelled",
]);
export type AnalysisJobStatus = z.infer<typeof AnalysisJobStatusSchema>;

export const AnalysisJobStageSchema = z.enum([
  "dispatching",
  "fetching",
  "normalizing",
  "extracting",
  "matching",
  "generating_questions",
  "saving",
  "notifying",
]);
export type AnalysisJobStage = z.infer<typeof AnalysisJobStageSchema>;

export const AnalysisRequirementKindSchema = z.enum(["required", "preferred"]);
export const MatchStatusSchema = z.enum([
  "matched",
  "partial",
  "missing",
  "unknown",
]);
export const PrioritySchema = z.enum(["high", "medium", "low"]);
export const EvidenceSourceSchema = z.enum([
  "job_posting",
  "resume",
  "portfolio",
]);

export const EvidenceSchema = z.strictObject({
  source: EvidenceSourceSchema,
  documentVersionId: UuidSchema.nullable(),
  section: z.string().max(200).nullable(),
  excerpt: z.string().min(1).max(2_000),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ApiErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "IDEMPOTENCY_KEY_REQUIRED",
  "IDEMPOTENCY_CONFLICT",
  "IDEMPOTENCY_IN_PROGRESS",
  "INVALID_SIGNATURE",
  "REPLAY_DETECTED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "CONFLICT",
  "RATE_LIMITED",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export const IdempotencyKeySchema = UuidSchema;
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;

export const ApiErrorInfoSchema = z.strictObject({
  code: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  retryable: z.boolean(),
});

export const ApiErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: ApiErrorCodeSchema,
    message: z.string().min(1).max(500),
    retryable: z.boolean(),
    requestId: UuidSchema,
    details: z.record(z.string(), z.string()).nullable(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export const AdminLoginInputSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1).max(1_024),
});
export type AdminLoginInput = z.infer<typeof AdminLoginInputSchema>;

export const AdminSessionResponseSchema = z.strictObject({
  data: z.strictObject({ userId: UuidSchema }),
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type AdminSessionResponse = z.infer<typeof AdminSessionResponseSchema>;

export const DOCUMENT_MAX_FILE_SIZE = 20 * 1_024 * 1_024;
export const DOCUMENT_RESUMABLE_THRESHOLD = 6 * 1_024 * 1_024;
export const DOCUMENT_EXTRACTED_TEXT_MAX_LENGTH = 500_000;

const DocumentLabelSchema = z.string().trim().min(1).max(100);
const DocumentFilenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      !value.includes("/") &&
      !value.includes("\\") &&
      Array.from(value).every((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint >= 32 && codePoint !== 127;
      }),
    "A plain file name without path separators is required",
  );
const DocumentContentHashSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "A lowercase SHA-256 hash is required");

export const DocumentUploadMetadataSchema = z.strictObject({
  documentType: DocumentTypeSchema,
  label: DocumentLabelSchema,
  originalFilename: DocumentFilenameSchema,
  mimeType: z.literal("application/pdf"),
  fileSize: z.int().min(1).max(DOCUMENT_MAX_FILE_SIZE),
  contentHash: DocumentContentHashSchema,
});
export type DocumentUploadMetadata = z.infer<
  typeof DocumentUploadMetadataSchema
>;

export const PrepareDocumentUploadRequestSchema = DocumentUploadMetadataSchema;
export type PrepareDocumentUploadRequest = z.infer<
  typeof PrepareDocumentUploadRequestSchema
>;

export const CompleteDocumentUploadRequestSchema = DocumentUploadMetadataSchema;
export type CompleteDocumentUploadRequest = z.infer<
  typeof CompleteDocumentUploadRequestSchema
>;

export const DocumentUploadMethodSchema = z.enum(["standard", "tus"]);
export type DocumentUploadMethod = z.infer<typeof DocumentUploadMethodSchema>;

export const PrepareDocumentUploadResponseSchema = z.strictObject({
  data: z.strictObject({
    documentVersionId: UuidSchema,
    storagePath: z.string().min(1).max(500),
    uploadToken: z.string().min(1),
    uploadMethod: DocumentUploadMethodSchema,
    resumableEndpoint: z.url().nullable(),
    expiresAt: Rfc3339TimestampSchema,
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type PrepareDocumentUploadResponse = z.infer<
  typeof PrepareDocumentUploadResponseSchema
>;

export const DocumentVersionSchema = z.strictObject({
  id: UuidSchema,
  documentType: DocumentTypeSchema,
  label: z.string().min(1).max(100),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.literal("application/pdf"),
  fileSize: z.int().min(1).max(DOCUMENT_MAX_FILE_SIZE),
  contentHash: DocumentContentHashSchema,
  extractedText: z.string().max(DOCUMENT_EXTRACTED_TEXT_MAX_LENGTH).nullable(),
  extractionStatus: DocumentExtractionStatusSchema,
  isDefault: z.boolean(),
  isPublished: z.boolean(),
  archivedAt: Rfc3339TimestampSchema.nullable(),
  createdAt: Rfc3339TimestampSchema,
  updatedAt: Rfc3339TimestampSchema,
});
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;

export const DocumentVersionResponseSchema = z.strictObject({
  data: DocumentVersionSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type DocumentVersionResponse = z.infer<
  typeof DocumentVersionResponseSchema
>;

export const DocumentVersionListResponseSchema = z.strictObject({
  data: z.strictObject({ items: z.array(DocumentVersionSchema).max(100) }),
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type DocumentVersionListResponse = z.infer<
  typeof DocumentVersionListResponseSchema
>;

const UpdateDocumentMetadataRequestSchema = z
  .strictObject({
    action: z.literal("update_metadata"),
    label: DocumentLabelSchema.optional(),
    extractedText: z
      .string()
      .max(DOCUMENT_EXTRACTED_TEXT_MAX_LENGTH)
      .nullable()
      .optional(),
  })
  .refine(
    (value) => value.label !== undefined || value.extractedText !== undefined,
    "At least one metadata field is required",
  );

export const UpdateDocumentVersionRequestSchema = z.discriminatedUnion(
  "action",
  [
    UpdateDocumentMetadataRequestSchema,
    z.strictObject({ action: z.literal("set_default") }),
    z.strictObject({
      action: z.literal("set_archived"),
      archived: z.boolean(),
    }),
  ],
);
export type UpdateDocumentVersionRequest = z.infer<
  typeof UpdateDocumentVersionRequestSchema
>;

export const SetDocumentPublicationRequestSchema = z.strictObject({
  documentVersionId: UuidSchema,
});
export type SetDocumentPublicationRequest = z.infer<
  typeof SetDocumentPublicationRequestSchema
>;

export const PublicDocumentDispositionSchema = z.enum(["inline", "attachment"]);
export type PublicDocumentDisposition = z.infer<
  typeof PublicDocumentDispositionSchema
>;

export const CreateDocumentDownloadUrlRequestSchema = z.strictObject({
  disposition: PublicDocumentDispositionSchema,
});
export type CreateDocumentDownloadUrlRequest = z.infer<
  typeof CreateDocumentDownloadUrlRequestSchema
>;

export const DocumentDownloadUrlResponseSchema = z.strictObject({
  data: z.strictObject({
    url: z.url(),
    expiresAt: Rfc3339TimestampSchema,
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type DocumentDownloadUrlResponse = z.infer<
  typeof DocumentDownloadUrlResponseSchema
>;

export const PublicDocumentAccessResponseSchema = z.strictObject({
  data: z.strictObject({
    documentType: DocumentTypeSchema,
    url: z.url(),
    expiresAt: Rfc3339TimestampSchema,
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type PublicDocumentAccessResponse = z.infer<
  typeof PublicDocumentAccessResponseSchema
>;

export const CreateJobPostingRequestSchema = z.strictObject({
  source: JobPostingSourceSchema,
  url: WantedJobPostingUrlSchema,
  manualContent: z.string().max(100_000).nullable(),
});
export type CreateJobPostingRequest = z.infer<
  typeof CreateJobPostingRequestSchema
>;

export const JobPostingResponseSchema = z.strictObject({
  id: UuidSchema,
  source: JobPostingSourceSchema,
  url: WantedJobPostingUrlSchema,
  title: z.string().max(500).nullable(),
  companyName: z.string().max(500).nullable(),
  createdAt: Rfc3339TimestampSchema,
  updatedAt: Rfc3339TimestampSchema,
});

export const CreateJobPostingResponseSchema = z.strictObject({
  data: JobPostingResponseSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});

export const ApplicationArchiveFilterSchema = z.enum([
  "exclude",
  "include",
  "only",
]);
export type ApplicationArchiveFilter = z.infer<
  typeof ApplicationArchiveFilterSchema
>;

export const ApplicationSortSchema = z.enum([
  "updated_desc",
  "interview_asc",
  "applied_desc",
]);
export type ApplicationSort = z.infer<typeof ApplicationSortSchema>;

export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date is required")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
    );
  }, "A valid calendar date is required");

const ApplicationCompanyNameSchema = z.string().trim().min(1).max(200);
const ApplicationTitleSchema = z.string().trim().min(1).max(300);
const ApplicationNoteSchema = z.string().trim().max(10_000).nullable();

const ApplicationStateShape = {
  status: ApplicationStatusSchema,
  appliedOn: DateOnlySchema.nullable(),
  interviewAt: Rfc3339TimestampSchema.nullable(),
  note: ApplicationNoteSchema,
  resumeVersionId: UuidSchema.nullable(),
  portfolioVersionId: UuidSchema.nullable(),
};

function validateApplicationDocuments(
  value: {
    status: ApplicationStatus;
    resumeVersionId: string | null;
    portfolioVersionId: string | null;
  },
  context: z.RefinementCtx,
) {
  if (
    applicationStatusRequiresDocuments(value.status) &&
    (!value.resumeVersionId || !value.portfolioVersionId)
  ) {
    context.addIssue({
      code: "custom",
      message: "Submitted applications require resume and portfolio versions",
      path: [!value.resumeVersionId ? "resumeVersionId" : "portfolioVersionId"],
    });
  }
}

export const ApplicationStateInputSchema = z
  .strictObject(ApplicationStateShape)
  .superRefine(validateApplicationDocuments);
export type ApplicationStateInput = z.infer<typeof ApplicationStateInputSchema>;

export const CreateApplicationRequestSchema = z
  .strictObject({
    source: JobPostingSourceSchema,
    url: WantedJobPostingUrlSchema,
    companyName: ApplicationCompanyNameSchema,
    title: ApplicationTitleSchema,
    ...ApplicationStateShape,
  })
  .superRefine(validateApplicationDocuments);
export type CreateApplicationRequest = z.infer<
  typeof CreateApplicationRequestSchema
>;

export const CreateApplicationAttemptRequestSchema =
  ApplicationStateInputSchema;
export type CreateApplicationAttemptRequest = z.infer<
  typeof CreateApplicationAttemptRequestSchema
>;

export const PatchApplicationRequestSchema = z
  .strictObject({
    status: ApplicationStatusSchema.optional(),
    appliedOn: DateOnlySchema.nullable().optional(),
    interviewAt: Rfc3339TimestampSchema.nullable().optional(),
    note: ApplicationNoteSchema.optional(),
    resumeVersionId: UuidSchema.nullable().optional(),
    portfolioVersionId: UuidSchema.nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one application field is required",
  });
export type PatchApplicationRequest = z.infer<
  typeof PatchApplicationRequestSchema
>;

export const PatchJobPostingRequestSchema = z
  .strictObject({
    companyName: ApplicationCompanyNameSchema.optional(),
    title: ApplicationTitleSchema.optional(),
  })
  .refine(
    (value) => value.companyName !== undefined || value.title !== undefined,
    "At least one job posting field is required",
  );
export type PatchJobPostingRequest = z.infer<
  typeof PatchJobPostingRequestSchema
>;

export const ApplicationDocumentSelectionSchema = z.strictObject({
  id: UuidSchema,
  documentType: DocumentTypeSchema,
  label: z.string().min(1).max(100),
  originalFilename: z.string().min(1).max(255),
  archivedAt: Rfc3339TimestampSchema.nullable(),
});
export type ApplicationDocumentSelection = z.infer<
  typeof ApplicationDocumentSelectionSchema
>;

export const ApplicationJobPostingSchema = z.strictObject({
  id: UuidSchema,
  source: JobPostingSourceSchema,
  externalId: z.string().regex(/^\d+$/),
  url: WantedJobPostingUrlSchema,
  companyName: ApplicationCompanyNameSchema,
  title: ApplicationTitleSchema,
  createdAt: Rfc3339TimestampSchema,
  updatedAt: Rfc3339TimestampSchema,
});
export type ApplicationJobPosting = z.infer<typeof ApplicationJobPostingSchema>;

export const ApplicationJobPostingResponseSchema = z.strictObject({
  data: ApplicationJobPostingSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type ApplicationJobPostingResponse = z.infer<
  typeof ApplicationJobPostingResponseSchema
>;

export const ApplicationSummarySchema = z.strictObject({
  id: UuidSchema,
  attemptNumber: z.int().positive(),
  status: ApplicationStatusSchema,
  appliedOn: DateOnlySchema.nullable(),
  interviewAt: Rfc3339TimestampSchema.nullable(),
  note: ApplicationNoteSchema,
  documentsLockedAt: Rfc3339TimestampSchema.nullable(),
  archivedAt: Rfc3339TimestampSchema.nullable(),
  createdAt: Rfc3339TimestampSchema,
  updatedAt: Rfc3339TimestampSchema,
  jobPosting: ApplicationJobPostingSchema,
  documents: z.strictObject({
    resume: ApplicationDocumentSelectionSchema.nullable(),
    portfolio: ApplicationDocumentSelectionSchema.nullable(),
  }),
});
export type ApplicationSummary = z.infer<typeof ApplicationSummarySchema>;

export const ApplicationStatusHistorySchema = z.strictObject({
  id: UuidSchema,
  fromStatus: ApplicationStatusSchema.nullable(),
  toStatus: ApplicationStatusSchema,
  changedAt: Rfc3339TimestampSchema,
});
export type ApplicationStatusHistory = z.infer<
  typeof ApplicationStatusHistorySchema
>;

export const ApplicationDetailSchema = ApplicationSummarySchema.extend({
  statusHistory: z.array(ApplicationStatusHistorySchema).max(500),
});
export type ApplicationDetail = z.infer<typeof ApplicationDetailSchema>;

export const ApplicationResponseSchema = z.strictObject({
  data: ApplicationDetailSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type ApplicationResponse = z.infer<typeof ApplicationResponseSchema>;

export const ApplicationListQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  status: ApplicationStatusSchema.optional(),
  archived: ApplicationArchiveFilterSchema.default("exclude"),
  sort: ApplicationSortSchema.default("updated_desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ApplicationListQuery = z.infer<typeof ApplicationListQuerySchema>;

export const ApplicationListResponseSchema = z.strictObject({
  data: z.strictObject({ items: z.array(ApplicationSummarySchema) }),
  pagination: z.strictObject({
    page: z.int().positive(),
    pageSize: z.int().positive().max(50),
    total: z.int().nonnegative(),
    totalPages: z.int().nonnegative(),
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type ApplicationListResponse = z.infer<
  typeof ApplicationListResponseSchema
>;

export const CreateAnalysisJobRequestSchema = z.strictObject({
  jobPostingId: UuidSchema,
  resumeVersionId: UuidSchema,
  portfolioVersionId: UuidSchema,
});
export type CreateAnalysisJobRequest = z.infer<
  typeof CreateAnalysisJobRequestSchema
>;

export const CreateAnalysisJobResponseSchema = z.strictObject({
  data: z.strictObject({
    jobId: UuidSchema,
    status: z.literal("queued"),
    statusUrl: UrlSchema,
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});

export const AnalysisJobResponseSchema = z.strictObject({
  id: UuidSchema,
  jobPostingId: UuidSchema,
  resumeVersionId: UuidSchema,
  portfolioVersionId: UuidSchema,
  status: AnalysisJobStatusSchema,
  stage: AnalysisJobStageSchema.nullable(),
  requestId: UuidSchema,
  attemptCount: z.number().int().nonnegative(),
  lastError: ApiErrorInfoSchema.nullable(),
  result: z.unknown().nullable(),
  createdAt: Rfc3339TimestampSchema,
  updatedAt: Rfc3339TimestampSchema,
});
export type AnalysisJobResponse = z.infer<typeof AnalysisJobResponseSchema>;

export const AnalysisJobStatusResponseSchema = z.strictObject({
  data: AnalysisJobResponseSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});

const ProfileSnapshotSchema = z.strictObject({
  versionId: UuidSchema,
  contentHash: z.string().min(1).max(128),
  extractedText: z.string().min(1).max(200_000),
});

export const N8nDispatchPayloadSchema = z.strictObject({
  schemaVersion: z.literal(CONTRACT_VERSION),
  eventId: UuidSchema,
  requestId: UuidSchema,
  analysisJobId: UuidSchema,
  jobPosting: z.strictObject({
    id: UuidSchema,
    source: JobPostingSourceSchema,
    url: WantedJobPostingUrlSchema,
    manualContent: z.string().max(100_000).nullable(),
  }),
  profile: z.strictObject({
    resume: ProfileSnapshotSchema,
    portfolio: ProfileSnapshotSchema,
  }),
  callbackUrl: UrlSchema,
});
export type N8nDispatchPayload = z.infer<typeof N8nDispatchPayloadSchema>;

export const AnalysisRequirementSchema = z.strictObject({
  id: z.string().min(1).max(100),
  kind: AnalysisRequirementKindSchema,
  text: z.string().min(1).max(2_000),
  evidence: z.array(EvidenceSchema).min(1).max(10),
});

export const AnalysisTechnologySchema = z.strictObject({
  name: z.string().min(1).max(200),
  category: z.string().max(200).nullable(),
  evidence: z.array(EvidenceSchema).min(1).max(10),
});

export const AnalysisTraitSchema = z.strictObject({
  text: z.string().min(1).max(1_000),
  evidence: z.array(EvidenceSchema).min(1).max(10),
});

export const RequirementMatchSchema = z.strictObject({
  requirementId: z.string().min(1).max(100),
  status: MatchStatusSchema,
  rationale: z.string().min(1).max(2_000),
  profileEvidence: z.array(EvidenceSchema).max(10),
});

export const FitAssessmentSchema = z.strictObject({
  score: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(3_000),
  matches: z.array(RequirementMatchSchema),
});

export const CapabilityGapSchema = z.strictObject({
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(2_000),
  priority: PrioritySchema,
  evidence: z.array(EvidenceSchema).max(10),
  actions: z.array(z.string().min(1).max(1_000)).max(10),
});

export const InterviewQuestionSchema = z.strictObject({
  category: z.string().min(1).max(200),
  question: z.string().min(1).max(2_000),
  intent: z.string().min(1).max(2_000),
  priority: PrioritySchema,
  requirementIds: z.array(z.string().min(1).max(100)).max(10),
});

export const AnalysisResultSchema = z.strictObject({
  job: z.strictObject({
    title: z.string().max(500).nullable(),
    companyName: z.string().max(500).nullable(),
    summary: z.string().min(1).max(5_000),
    requirements: z.array(AnalysisRequirementSchema),
    technologies: z.array(AnalysisTechnologySchema),
    traits: z.array(AnalysisTraitSchema),
  }),
  fit: FitAssessmentSchema,
  gaps: z.array(CapabilityGapSchema),
  interviewQuestions: z.array(InterviewQuestionSchema),
  warnings: z.array(z.string().min(1).max(1_000)),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

export const AnalysisEventTypeSchema = z.enum([
  "progress",
  "needs_input",
  "retrying",
  "failed",
  "cancelled",
]);

export const AnalysisEventCallbackSchema = z.strictObject({
  schemaVersion: z.literal(CONTRACT_VERSION),
  eventId: UuidSchema,
  requestId: UuidSchema,
  analysisJobId: UuidSchema,
  eventType: AnalysisEventTypeSchema,
  status: AnalysisJobStatusSchema,
  stage: AnalysisJobStageSchema.nullable(),
  message: z.string().max(1_000).nullable(),
  error: ApiErrorInfoSchema.nullable(),
  occurredAt: Rfc3339TimestampSchema,
});
export type AnalysisEventCallback = z.infer<typeof AnalysisEventCallbackSchema>;

export const AnalysisStepSchema = z.strictObject({
  step: z.enum(["extracting", "matching", "generating_questions"]),
  model: z.string().min(1).max(200),
  promptVersion: z.string().min(1).max(100),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
});

export const AnalysisResultCallbackSchema = z.strictObject({
  schemaVersion: z.literal(CONTRACT_VERSION),
  eventId: UuidSchema,
  requestId: UuidSchema,
  analysisJobId: UuidSchema,
  status: z.literal("succeeded"),
  result: AnalysisResultSchema,
  executions: z.array(AnalysisStepSchema).min(1),
  occurredAt: Rfc3339TimestampSchema,
});
export type AnalysisResultCallback = z.infer<
  typeof AnalysisResultCallbackSchema
>;

export const HealthResponseSchema = z.strictObject({
  data: z.strictObject({
    status: z.literal("ok"),
    service: z.literal("bluelog-career-ops-api"),
    timestamp: Rfc3339TimestampSchema,
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});

const AllowedAnalysisTransitions: Record<
  AnalysisJobStatus,
  readonly AnalysisJobStatus[]
> = {
  cancelled: [],
  failed: ["queued", "retrying"],
  needs_input: ["queued", "cancelled"],
  queued: ["running", "cancelled"],
  retrying: ["running", "failed", "cancelled"],
  running: ["needs_input", "retrying", "succeeded", "failed", "cancelled"],
  succeeded: [],
};

export function isValidAnalysisJobTransition(
  from: AnalysisJobStatus,
  to: AnalysisJobStatus,
): boolean {
  return AllowedAnalysisTransitions[from].includes(to);
}

export type {
  AnalysisJobResponse as AnalysisJobResponseType,
  AnalysisJobStage as AnalysisJobStageType,
  AnalysisJobStatus as AnalysisJobStatusType,
};
