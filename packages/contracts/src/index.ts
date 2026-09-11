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
  "archived",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

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

export const PatchApplicationRequestSchema = z
  .strictObject({
    status: ApplicationStatusSchema.nullable(),
    appliedAt: Rfc3339TimestampSchema.nullable(),
    interviewAt: Rfc3339TimestampSchema.nullable(),
    note: z.string().max(10_000).nullable(),
  })
  .refine(
    (value) =>
      value.status !== null ||
      value.appliedAt !== null ||
      value.interviewAt !== null ||
      value.note !== null,
    "At least one application field is required",
  );

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
