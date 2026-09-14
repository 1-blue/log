import * as z from "zod";

export const CONTRACT_VERSION = "1.0.0" as const;
export const ANALYSIS_JOB_MAX_RUN_ATTEMPTS = 2;
export const ANALYSIS_STEP_MAX_ATTEMPTS = 2;

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
]);
export type JobPostingCollectionErrorCode = z.infer<
  typeof JobPostingCollectionErrorCodeSchema
>;

export const JobPostingSnapshotSourceSchema = z.enum([
  "wanted_json_ld",
  "manual",
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
    source: z.literal("wanted"),
    url: WantedJobPostingUrlSchema,
    manualContent: JobPostingManualContentSchema.nullable(),
  }),
  callbackPath: z
    .string()
    .regex(/^\/v1\/internal\/job-posting-collections\/[0-9a-f-]+\/complete$/),
});
export type N8nJobPostingCollectionDispatchPayload = z.infer<
  typeof N8nJobPostingCollectionDispatchPayloadSchema
>;

export const SlackNotificationEventTypeSchema = z.enum([
  "job_posting_registered",
  "collection_succeeded",
  "collection_needs_input",
  "collection_failed",
  "analysis_queued",
  "analysis_succeeded",
  "analysis_retrying",
  "analysis_failed",
  "analysis_cancelled",
  "application_status_changed",
  "interview_scheduled",
]);
export type SlackNotificationEventType = z.infer<
  typeof SlackNotificationEventTypeSchema
>;

export const SlackNotificationTargetSchema = z.enum([
  "job_root",
  "job_thread",
  "error_channel",
]);
export type SlackNotificationTarget = z.infer<
  typeof SlackNotificationTargetSchema
>;

export const SlackNotificationStatusSchema = z.enum([
  "queued",
  "dispatching",
  "sent",
  "failed",
  "delivery_unknown",
  "skipped",
]);
export type SlackNotificationStatus = z.infer<
  typeof SlackNotificationStatusSchema
>;

export const SlackNotificationErrorCodeSchema = z.enum([
  "N8N_DISPATCH_FAILED",
  "SLACK_AUTHENTICATION_FAILED",
  "SLACK_CHANNEL_UNAVAILABLE",
  "SLACK_INVALID_PAYLOAD",
  "SLACK_RATE_LIMITED",
  "SLACK_SERVICE_UNAVAILABLE",
  "SLACK_DELIVERY_UNKNOWN",
]);
export type SlackNotificationErrorCode = z.infer<
  typeof SlackNotificationErrorCodeSchema
>;

export const SlackMessageBlockSchema = z.strictObject({
  type: z.literal("section"),
  text: z.strictObject({
    type: z.literal("mrkdwn"),
    text: z.string().min(1).max(3_000),
    verbatim: z.literal(true),
  }),
});
export type SlackMessageBlock = z.infer<typeof SlackMessageBlockSchema>;

export const N8nSlackNotificationDispatchPayloadSchema = z
  .strictObject({
    kind: z.literal("slack_notification"),
    schemaVersion: z.literal(CONTRACT_VERSION),
    eventId: UuidSchema,
    requestId: UuidSchema,
    notificationId: UuidSchema,
    jobPostingId: UuidSchema,
    target: SlackNotificationTargetSchema,
    threadTs: z
      .string()
      .regex(/^\d{10,20}\.\d{6}$/)
      .nullable(),
    text: z.string().min(1).max(2_000),
    blocks: z.array(SlackMessageBlockSchema).min(1).max(10),
    callbackPath: z
      .string()
      .regex(/^\/v1\/internal\/slack-notifications\/[0-9a-f-]+\/result$/),
  })
  .superRefine((value, context) => {
    if ((value.target === "job_thread") !== (value.threadTs !== null)) {
      context.addIssue({
        code: "custom",
        message: "threadTs is required only for job thread notifications",
        path: ["threadTs"],
      });
    }
  });
export type N8nSlackNotificationDispatchPayload = z.infer<
  typeof N8nSlackNotificationDispatchPayloadSchema
>;

export const SlackNotificationDeliveryOutcomeSchema = z.enum([
  "sent",
  "failed",
  "delivery_unknown",
]);
export type SlackNotificationDeliveryOutcome = z.infer<
  typeof SlackNotificationDeliveryOutcomeSchema
>;

const SlackNotificationCallbackErrorSchema = z.strictObject({
  code: SlackNotificationErrorCodeSchema,
  message: z.string().min(1).max(500),
  retryable: z.boolean(),
});

export const SlackNotificationResultCallbackSchema = z
  .strictObject({
    schemaVersion: z.literal(CONTRACT_VERSION),
    eventId: UuidSchema,
    notificationEventId: UuidSchema,
    requestId: UuidSchema,
    notificationId: UuidSchema,
    outcome: SlackNotificationDeliveryOutcomeSchema,
    channelId: z
      .string()
      .regex(/^[A-Z][A-Z0-9]{1,79}$/)
      .nullable(),
    messageTs: z
      .string()
      .regex(/^\d{10,20}\.\d{6}$/)
      .nullable(),
    httpStatus: z.int().min(100).max(599).nullable(),
    error: SlackNotificationCallbackErrorSchema.nullable(),
    occurredAt: Rfc3339TimestampSchema,
  })
  .superRefine((value, context) => {
    if (value.outcome === "sent" && value.error !== null) {
      context.addIssue({
        code: "custom",
        message: "successful notifications cannot contain an error",
        path: ["error"],
      });
    }
    if (value.outcome !== "sent" && value.error === null) {
      context.addIssue({
        code: "custom",
        message: "failed notifications require an error",
        path: ["error"],
      });
    }
    if (
      value.outcome === "sent" &&
      (value.channelId === null) !== (value.messageTs === null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Slack channel and message timestamp must be returned together",
        path: ["channelId"],
      });
    }
    if (value.outcome !== "sent" && value.messageTs !== null) {
      context.addIssue({
        code: "custom",
        message: "failed notifications cannot contain a message timestamp",
        path: ["messageTs"],
      });
    }
  });
export type SlackNotificationResultCallback = z.infer<
  typeof SlackNotificationResultCallbackSchema
>;

export const SlackNotificationResponseSchema = z.strictObject({
  id: UuidSchema,
  eventId: UuidSchema,
  requestId: UuidSchema,
  eventType: SlackNotificationEventTypeSchema,
  target: SlackNotificationTargetSchema,
  status: SlackNotificationStatusSchema,
  jobPostingId: UuidSchema,
  applicationId: UuidSchema.nullable(),
  collectionRunId: UuidSchema.nullable(),
  analysisJobId: UuidSchema.nullable(),
  attemptCount: z.int().nonnegative(),
  channelId: z.string().max(80).nullable(),
  messageTs: z.string().max(40).nullable(),
  httpStatus: z.int().min(100).max(599).nullable(),
  error: SlackNotificationCallbackErrorSchema.nullable(),
  createdAt: Rfc3339TimestampSchema,
  dispatchedAt: Rfc3339TimestampSchema.nullable(),
  finishedAt: Rfc3339TimestampSchema.nullable(),
  updatedAt: Rfc3339TimestampSchema,
});
export type SlackNotificationResponse = z.infer<
  typeof SlackNotificationResponseSchema
>;

export const JobPostingCollectionCallbackOutcomeSchema = z.enum([
  "response",
  "manual",
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
      value.outcome === "response" || value.outcome === "manual";
    if (responseRequired !== (value.response !== null)) {
      context.addIssue({
        code: "custom",
        message: "The callback response must match its outcome",
        path: ["response"],
      });
    }
  });
export type JobPostingCollectionCallback = z.infer<
  typeof JobPostingCollectionCallbackSchema
>;

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
export type AnalysisRequirementKind = z.infer<
  typeof AnalysisRequirementKindSchema
>;
export const MatchStatusSchema = z.enum([
  "matched",
  "partial",
  "missing",
  "unknown",
]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;
export const PrioritySchema = z.enum(["high", "medium", "low"]);
export type Priority = z.infer<typeof PrioritySchema>;
export const EvidenceSourceSchema = z.enum([
  "job_posting",
  "resume",
  "portfolio",
]);

export const EvidenceSchema = z.strictObject({
  source: EvidenceSourceSchema,
  sourceVersionId: UuidSchema,
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

export const CreateAnalysisJobRequestSchema = z.strictObject({});
export type CreateAnalysisJobRequest = z.infer<
  typeof CreateAnalysisJobRequestSchema
>;

export const CreateAnalysisJobResponseSchema = z.strictObject({
  data: z.strictObject({ job: z.lazy(() => AnalysisJobResponseSchema) }),
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type CreateAnalysisJobResponse = z.infer<
  typeof CreateAnalysisJobResponseSchema
>;

export const AnalysisJobResponseSchema = z.strictObject({
  id: UuidSchema,
  applicationId: UuidSchema,
  jobPostingId: UuidSchema,
  jobPostingSnapshotId: UuidSchema,
  resumeVersionId: UuidSchema,
  portfolioVersionId: UuidSchema,
  status: AnalysisJobStatusSchema,
  stage: AnalysisJobStageSchema.nullable(),
  requestId: UuidSchema,
  attemptCount: z.number().int().nonnegative(),
  lastError: ApiErrorInfoSchema.nullable(),
  result: z.lazy(() => AnalysisResultSchema).nullable(),
  createdAt: Rfc3339TimestampSchema,
  startedAt: Rfc3339TimestampSchema.nullable(),
  lastHeartbeatAt: Rfc3339TimestampSchema.nullable(),
  retryAt: Rfc3339TimestampSchema.nullable(),
  finishedAt: Rfc3339TimestampSchema.nullable(),
  updatedAt: Rfc3339TimestampSchema,
});
export type AnalysisJobResponse = z.infer<typeof AnalysisJobResponseSchema>;

export const AnalysisJobStatusResponseSchema = z.strictObject({
  data: AnalysisJobResponseSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type AnalysisJobStatusResponse = z.infer<
  typeof AnalysisJobStatusResponseSchema
>;

export const AnalysisJobListResponseSchema = z.strictObject({
  data: z.strictObject({ items: z.array(AnalysisJobResponseSchema).max(20) }),
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type AnalysisJobListResponse = z.infer<
  typeof AnalysisJobListResponseSchema
>;

export const AnalysisJobActionRequestSchema = z.strictObject({});
export type AnalysisJobActionRequest = z.infer<
  typeof AnalysisJobActionRequestSchema
>;

export const AnalysisInputDocumentSchema = z.strictObject({
  versionId: UuidSchema,
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  text: z.string().min(1).max(80_100),
  originalLength: z.int().positive(),
  truncated: z.boolean(),
});

export const N8nDispatchPayloadSchema = z.strictObject({
  kind: z.literal("application_analysis"),
  schemaVersion: z.literal(CONTRACT_VERSION),
  eventId: UuidSchema,
  requestId: UuidSchema,
  analysisJobId: UuidSchema,
  runAttempt: z.int().min(1).max(ANALYSIS_JOB_MAX_RUN_ATTEMPTS),
  jobPosting: z.strictObject({
    id: UuidSchema,
    snapshotId: UuidSchema,
    source: JobPostingSourceSchema,
    url: WantedJobPostingUrlSchema,
    title: z.string().min(1).max(500),
    companyName: z.string().min(1).max(500),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    text: z.string().min(1).max(100_000),
  }),
  profile: z.strictObject({
    resume: AnalysisInputDocumentSchema,
    portfolio: AnalysisInputDocumentSchema,
  }),
  callbacks: z.strictObject({
    eventPath: z
      .string()
      .regex(/^\/v1\/internal\/analysis-jobs\/[0-9a-f-]+\/events$/),
    resultPath: z
      .string()
      .regex(/^\/v1\/internal\/analysis-jobs\/[0-9a-f-]+\/result$/),
  }),
  outputSchemas: z.strictObject({
    jobPostingFacts: z.record(z.string(), z.unknown()),
    profileComparison: z.record(z.string(), z.unknown()),
  }),
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

export const ProfileComparisonSchema = z.strictObject({
  summary: z.string().min(1).max(3_000),
  matches: z.array(RequirementMatchSchema).max(40),
  gaps: z
    .array(
      z.strictObject({
        title: z.string().min(1).max(300),
        description: z.string().min(1).max(2_000),
        priority: PrioritySchema,
        requirementIds: z.array(z.string().min(1).max(100)).max(10),
        evidence: z.array(EvidenceSchema).max(10),
        actions: z.array(z.string().min(1).max(1_000)).max(10),
      }),
    )
    .max(20),
  interviewQuestions: z
    .array(
      z.strictObject({
        category: z.string().min(1).max(200),
        question: z.string().min(1).max(2_000),
        intent: z.string().min(1).max(2_000),
        priority: PrioritySchema,
        requirementIds: z.array(z.string().min(1).max(100)).max(10),
      }),
    )
    .max(30),
  warnings: z.array(z.string().min(1).max(1_000)).max(20),
});
export type ProfileComparison = z.infer<typeof ProfileComparisonSchema>;

export const JobPostingFactsSchema = z.strictObject({
  title: z.string().max(500).nullable(),
  companyName: z.string().max(500).nullable(),
  summary: z.string().min(1).max(5_000),
  requirements: z.array(AnalysisRequirementSchema).max(40),
  technologies: z.array(AnalysisTechnologySchema).max(40),
  traits: z.array(AnalysisTraitSchema).max(20),
  warnings: z.array(z.string().min(1).max(1_000)).max(20),
});
export type JobPostingFacts = z.infer<typeof JobPostingFactsSchema>;

export const AnalysisResultSchema = z.strictObject({
  job: JobPostingFactsSchema,
  comparison: ProfileComparisonSchema,
  fitScore: z.number().int().min(0).max(100),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

const MATCH_WEIGHTS: Record<z.infer<typeof MatchStatusSchema>, number> = {
  matched: 1,
  partial: 0.5,
  missing: 0,
  unknown: 0,
};

export function calculateAnalysisFitScore(
  requirements: JobPostingFacts["requirements"],
  matches: ProfileComparison["matches"],
): number {
  const matchByRequirement = new Map(
    matches.map((match) => [match.requirementId, match.status]),
  );
  const scoreKind = (kind: z.infer<typeof AnalysisRequirementKindSchema>) => {
    const relevant = requirements.filter(
      (requirement) => requirement.kind === kind,
    );
    if (relevant.length === 0) return null;
    return (
      relevant.reduce(
        (total, requirement) =>
          total +
          (MATCH_WEIGHTS[matchByRequirement.get(requirement.id) ?? "unknown"] ??
            0),
        0,
      ) / relevant.length
    );
  };

  const required = scoreKind("required");
  const preferred = scoreKind("preferred");
  if (required === null && preferred === null) return 0;
  if (required === null) return Math.round((preferred ?? 0) * 100);
  if (preferred === null) return Math.round(required * 100);
  return Math.round(required * 70 + preferred * 30);
}

export const AnalysisEventTypeSchema = z.enum([
  "heartbeat",
  "progress",
  "needs_input",
  "retrying",
  "failed",
  "cancelled",
]);

export const AnalysisStepNameSchema = z.enum([
  "job_facts",
  "profile_comparison",
]);

export const AnalysisErrorCodeSchema = z.enum([
  "CALLBACK_FAILED",
  "CANCELLED_BY_ADMIN",
  "DISPATCH_FAILED",
  "OPENAI_AUTHENTICATION_FAILED",
  "OPENAI_BILLING_LIMIT",
  "OPENAI_INCOMPLETE",
  "OPENAI_INVALID_REQUEST",
  "OPENAI_RATE_LIMITED",
  "OPENAI_SCHEMA_INVALID",
  "OPENAI_TIMEOUT",
  "OPENAI_UNAVAILABLE",
  "WORKFLOW_ERROR",
  "WORKFLOW_STALLED",
]);
export type AnalysisErrorCode = z.infer<typeof AnalysisErrorCodeSchema>;

const AnalysisCallbackErrorSchema = z.strictObject({
  code: AnalysisErrorCodeSchema,
  message: z.string().min(1).max(500),
  retryable: z.boolean(),
});

export const AnalysisEventCallbackSchema = z
  .strictObject({
    schemaVersion: z.literal(CONTRACT_VERSION),
    eventId: UuidSchema,
    requestId: UuidSchema,
    analysisJobId: UuidSchema,
    runAttempt: z.int().min(1).max(ANALYSIS_JOB_MAX_RUN_ATTEMPTS),
    eventType: AnalysisEventTypeSchema,
    status: AnalysisJobStatusSchema,
    stage: AnalysisJobStageSchema.nullable(),
    step: AnalysisStepNameSchema.nullable(),
    stepAttempt: z.int().min(1).max(ANALYSIS_STEP_MAX_ATTEMPTS).nullable(),
    retryAt: Rfc3339TimestampSchema.nullable(),
    message: z.string().max(1_000).nullable(),
    error: AnalysisCallbackErrorSchema.nullable(),
    occurredAt: Rfc3339TimestampSchema,
  })
  .superRefine((value, context) => {
    const expectedStatus = {
      cancelled: "cancelled",
      failed: "failed",
      heartbeat: "running",
      needs_input: "needs_input",
      progress: "running",
      retrying: "retrying",
    } as const;
    if (value.status !== expectedStatus[value.eventType]) {
      context.addIssue({
        code: "custom",
        message: "eventType and status must match",
        path: ["status"],
      });
    }
    const isFailure = [
      "cancelled",
      "failed",
      "needs_input",
      "retrying",
    ].includes(value.eventType);
    if (isFailure !== (value.error !== null)) {
      context.addIssue({
        code: "custom",
        message: "error must be present only for failure events",
        path: ["error"],
      });
    }
    if ((value.eventType === "retrying") !== (value.retryAt !== null)) {
      context.addIssue({
        code: "custom",
        message: "retryAt is required only for retrying events",
        path: ["retryAt"],
      });
    }
  });
export type AnalysisEventCallback = z.infer<typeof AnalysisEventCallbackSchema>;

export const AnalysisStepSchema = z.strictObject({
  step: AnalysisStepNameSchema,
  model: z.string().min(1).max(200),
  promptVersion: z.string().min(1).max(100),
  responseId: z.string().min(1).max(300).nullable(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  attemptCount: z.number().int().min(1).max(ANALYSIS_STEP_MAX_ATTEMPTS),
});

export const AnalysisResultCallbackSchema = z.strictObject({
  schemaVersion: z.literal(CONTRACT_VERSION),
  eventId: UuidSchema,
  requestId: UuidSchema,
  analysisJobId: UuidSchema,
  runAttempt: z.int().min(1).max(ANALYSIS_JOB_MAX_RUN_ATTEMPTS),
  status: z.literal("succeeded"),
  result: AnalysisResultSchema,
  executions: z.array(AnalysisStepSchema).min(1),
  occurredAt: Rfc3339TimestampSchema,
});
export type AnalysisResultCallback = z.infer<
  typeof AnalysisResultCallbackSchema
>;

const NullableWorkspaceTextSchema = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable();

export const AnalysisRequirementReviewSchema = z
  .strictObject({
    requirementId: z.string().min(1).max(100),
    overrideStatus: MatchStatusSchema.nullable(),
    note: NullableWorkspaceTextSchema(5_000),
  })
  .refine((value) => value.overrideStatus !== null || value.note !== null, {
    message: "A requirement review must contain a status or note",
  });
export type AnalysisRequirementReview = z.infer<
  typeof AnalysisRequirementReviewSchema
>;

export const AnalysisReviewSchema = z.strictObject({
  overallNote: NullableWorkspaceTextSchema(20_000),
  requirements: z.array(AnalysisRequirementReviewSchema).max(40),
  updatedAt: Rfc3339TimestampSchema.nullable(),
});
export type AnalysisReview = z.infer<typeof AnalysisReviewSchema>;

export const AnalysisReviewResponseSchema = z.strictObject({
  data: z.strictObject({
    review: AnalysisReviewSchema,
    reviewedFitScore: z.int().min(0).max(100).nullable(),
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type AnalysisReviewResponse = z.infer<
  typeof AnalysisReviewResponseSchema
>;

export const UpdateAnalysisReviewRequestSchema = z
  .strictObject({
    overallNote: NullableWorkspaceTextSchema(20_000),
    requirements: z.array(AnalysisRequirementReviewSchema).max(40),
    expectedUpdatedAt: Rfc3339TimestampSchema.nullable(),
  })
  .superRefine((value, context) => {
    const ids = value.requirements.map((item) => item.requirementId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Requirement reviews must be unique",
        path: ["requirements"],
      });
    }
  });
export type UpdateAnalysisReviewRequest = z.infer<
  typeof UpdateAnalysisReviewRequestSchema
>;

export const InterviewAnswerRevisionSchema = z.strictObject({
  id: UuidSchema,
  questionId: UuidSchema,
  revision: z.int().positive(),
  answer: NullableWorkspaceTextSchema(20_000),
  createdAt: Rfc3339TimestampSchema,
});
export type InterviewAnswerRevision = z.infer<
  typeof InterviewAnswerRevisionSchema
>;

export const InterviewQuestionSchema = z.strictObject({
  id: UuidSchema,
  analysisJobId: UuidSchema,
  sourceIndex: z.int().nonnegative(),
  category: z.string().min(1).max(200),
  question: z.string().min(1).max(2_000),
  intent: z.string().min(1).max(2_000),
  priority: PrioritySchema,
  requirementIds: z.array(z.string().min(1).max(100)).max(10),
  currentAnswer: InterviewAnswerRevisionSchema.nullable(),
  answerRevisionCount: z.int().nonnegative(),
  createdAt: Rfc3339TimestampSchema,
});
export type InterviewQuestion = z.infer<typeof InterviewQuestionSchema>;

export const SaveInterviewAnswerRequestSchema = z.strictObject({
  answer: NullableWorkspaceTextSchema(20_000),
});
export type SaveInterviewAnswerRequest = z.infer<
  typeof SaveInterviewAnswerRequestSchema
>;

export const InterviewAnswerResponseSchema = z.strictObject({
  data: z.strictObject({
    currentAnswer: InterviewAnswerRevisionSchema.nullable(),
    revisionCount: z.int().nonnegative(),
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type InterviewAnswerResponse = z.infer<
  typeof InterviewAnswerResponseSchema
>;

export const InterviewAnswerHistoryResponseSchema = z.strictObject({
  data: z.strictObject({
    items: z.array(InterviewAnswerRevisionSchema).max(100),
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type InterviewAnswerHistoryResponse = z.infer<
  typeof InterviewAnswerHistoryResponseSchema
>;

export const InterviewChecklistSourceSchema = z.enum(["gap_action", "custom"]);
export type InterviewChecklistSource = z.infer<
  typeof InterviewChecklistSourceSchema
>;

export const InterviewChecklistItemSchema = z.strictObject({
  id: UuidSchema,
  analysisJobId: UuidSchema,
  source: InterviewChecklistSourceSchema,
  sourceKey: z.string().max(100).nullable(),
  content: z.string().min(1).max(2_000),
  priority: PrioritySchema,
  position: z.int().nonnegative(),
  completedAt: Rfc3339TimestampSchema.nullable(),
  archivedAt: Rfc3339TimestampSchema.nullable(),
  createdAt: Rfc3339TimestampSchema,
  updatedAt: Rfc3339TimestampSchema,
});
export type InterviewChecklistItem = z.infer<
  typeof InterviewChecklistItemSchema
>;

export const CreateInterviewChecklistItemRequestSchema = z.strictObject({
  content: z.string().trim().min(1).max(2_000),
  priority: PrioritySchema,
});
export type CreateInterviewChecklistItemRequest = z.infer<
  typeof CreateInterviewChecklistItemRequestSchema
>;

export const PatchInterviewChecklistItemRequestSchema = z
  .strictObject({
    content: z.string().trim().min(1).max(2_000).optional(),
    priority: PrioritySchema.optional(),
    completed: z.boolean().optional(),
    expectedUpdatedAt: Rfc3339TimestampSchema,
  })
  .refine(
    (value) =>
      value.content !== undefined ||
      value.priority !== undefined ||
      value.completed !== undefined,
    { message: "At least one checklist field must be updated" },
  );
export type PatchInterviewChecklistItemRequest = z.infer<
  typeof PatchInterviewChecklistItemRequestSchema
>;

export const ReorderInterviewChecklistRequestSchema = z
  .strictObject({
    itemIds: z.array(UuidSchema).min(1).max(100),
  })
  .refine((value) => new Set(value.itemIds).size === value.itemIds.length, {
    message: "Checklist item IDs must be unique",
  });
export type ReorderInterviewChecklistRequest = z.infer<
  typeof ReorderInterviewChecklistRequestSchema
>;

export const InterviewChecklistItemResponseSchema = z.strictObject({
  data: InterviewChecklistItemSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type InterviewChecklistItemResponse = z.infer<
  typeof InterviewChecklistItemResponseSchema
>;

export const InterviewChecklistListResponseSchema = z.strictObject({
  data: z.strictObject({
    items: z.array(InterviewChecklistItemSchema).max(100),
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type InterviewChecklistListResponse = z.infer<
  typeof InterviewChecklistListResponseSchema
>;

const InterviewNoteContentSchema = z.strictObject({
  questionsAsked: NullableWorkspaceTextSchema(20_000),
  wentWell: NullableWorkspaceTextSchema(20_000),
  improvements: NullableWorkspaceTextSchema(20_000),
  followUpActions: NullableWorkspaceTextSchema(20_000),
  content: NullableWorkspaceTextSchema(20_000),
});

export const InterviewNoteSchema = InterviewNoteContentSchema.extend({
  id: UuidSchema,
  applicationId: UuidSchema,
  analysisJobId: UuidSchema,
  roundLabel: z.string().min(1).max(100),
  interviewedAt: Rfc3339TimestampSchema,
  archivedAt: Rfc3339TimestampSchema.nullable(),
  createdAt: Rfc3339TimestampSchema,
  updatedAt: Rfc3339TimestampSchema,
});
export type InterviewNote = z.infer<typeof InterviewNoteSchema>;

const InterviewNoteInputSchema = InterviewNoteContentSchema.extend({
  roundLabel: z.string().trim().min(1).max(100),
  interviewedAt: Rfc3339TimestampSchema,
});

function hasInterviewNoteContent(
  value: z.infer<typeof InterviewNoteContentSchema>,
) {
  return [
    value.questionsAsked,
    value.wentWell,
    value.improvements,
    value.followUpActions,
    value.content,
  ].some((item) => item !== null);
}

export const CreateInterviewNoteRequestSchema = InterviewNoteInputSchema.extend(
  {
    analysisJobId: UuidSchema,
  },
).refine(hasInterviewNoteContent, {
  message: "At least one interview note field is required",
});
export type CreateInterviewNoteRequest = z.infer<
  typeof CreateInterviewNoteRequestSchema
>;

export const PatchInterviewNoteRequestSchema = InterviewNoteInputSchema.extend({
  expectedUpdatedAt: Rfc3339TimestampSchema,
}).refine(hasInterviewNoteContent, {
  message: "At least one interview note field is required",
});
export type PatchInterviewNoteRequest = z.infer<
  typeof PatchInterviewNoteRequestSchema
>;

export const InterviewNoteResponseSchema = z.strictObject({
  data: InterviewNoteSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type InterviewNoteResponse = z.infer<typeof InterviewNoteResponseSchema>;

export const ExpectedUpdatedAtQuerySchema = z.strictObject({
  expectedUpdatedAt: Rfc3339TimestampSchema,
});
export type ExpectedUpdatedAtQuery = z.infer<
  typeof ExpectedUpdatedAtQuerySchema
>;

export const AnalysisWorkspaceSourceSchema = z.strictObject({
  jobPostingSnapshot: z.strictObject({
    id: UuidSchema,
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    source: JobPostingSnapshotSourceSchema,
    fetchedAt: Rfc3339TimestampSchema,
  }),
  resume: z.strictObject({
    id: UuidSchema,
    label: z.string().min(1).max(100),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    archivedAt: Rfc3339TimestampSchema.nullable(),
  }),
  portfolio: z.strictObject({
    id: UuidSchema,
    label: z.string().min(1).max(100),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    archivedAt: Rfc3339TimestampSchema.nullable(),
  }),
});
export type AnalysisWorkspaceSource = z.infer<
  typeof AnalysisWorkspaceSourceSchema
>;

export const AnalysisMatchCountsSchema = z.strictObject({
  matched: z.int().nonnegative(),
  partial: z.int().nonnegative(),
  missing: z.int().nonnegative(),
  unknown: z.int().nonnegative(),
});
export type AnalysisMatchCounts = z.infer<typeof AnalysisMatchCountsSchema>;

export const AnalysisHistoryItemSchema = z.strictObject({
  analysisJobId: UuidSchema,
  createdAt: Rfc3339TimestampSchema,
  completedAt: Rfc3339TimestampSchema,
  fitScore: z.int().min(0).max(100),
  matchCounts: AnalysisMatchCountsSchema,
  gapCount: z.int().nonnegative(),
  questionCount: z.int().nonnegative(),
  sources: AnalysisWorkspaceSourceSchema,
  executions: z.array(AnalysisStepSchema).max(10),
});
export type AnalysisHistoryItem = z.infer<typeof AnalysisHistoryItemSchema>;

export const AnalysisWorkspaceQuerySchema = z.strictObject({
  compareTo: UuidSchema.optional(),
});
export type AnalysisWorkspaceQuery = z.infer<
  typeof AnalysisWorkspaceQuerySchema
>;

export const AnalysisWorkspaceSchema = z.strictObject({
  application: z.strictObject({
    id: UuidSchema,
    attemptNumber: z.int().positive(),
    companyName: z.string().min(1).max(200),
    title: z.string().min(1).max(300),
  }),
  job: AnalysisJobResponseSchema,
  resultMetadata: z
    .strictObject({
      schemaVersion: z.string().min(1).max(30),
      createdAt: Rfc3339TimestampSchema,
      executions: z.array(AnalysisStepSchema).max(10),
    })
    .nullable(),
  sources: AnalysisWorkspaceSourceSchema,
  review: AnalysisReviewSchema,
  reviewedFitScore: z.int().min(0).max(100).nullable(),
  questions: z.array(InterviewQuestionSchema).max(30),
  checklist: z.array(InterviewChecklistItemSchema).max(100),
  interviewNotes: z.array(InterviewNoteSchema).max(100),
  history: z.array(AnalysisHistoryItemSchema).max(20),
  comparison: AnalysisHistoryItemSchema.nullable(),
});
export type AnalysisWorkspace = z.infer<typeof AnalysisWorkspaceSchema>;

export const AnalysisWorkspaceResponseSchema = z.strictObject({
  data: AnalysisWorkspaceSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});
export type AnalysisWorkspaceResponse = z.infer<
  typeof AnalysisWorkspaceResponseSchema
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
  failed: ["queued"],
  needs_input: [],
  queued: ["running", "failed", "cancelled"],
  retrying: ["running", "failed", "cancelled"],
  running: [
    "running",
    "needs_input",
    "retrying",
    "succeeded",
    "failed",
    "cancelled",
  ],
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
