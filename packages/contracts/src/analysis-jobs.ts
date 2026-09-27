import * as z from "zod";

import { AnalysisResultSchema } from "./analysis-results";
import {
  AnalysisJobStageSchema,
  AnalysisJobStatusSchema,
  ApiErrorInfoSchema,
} from "./common";
import {
  ANALYSIS_DISPATCH_DOCUMENT_TEXT_MAX_LENGTH,
  ANALYSIS_DISPATCH_JOB_POSTING_TEXT_MAX_LENGTH,
  ANALYSIS_INPUT_POLICY_VERSION,
  ANALYSIS_JOB_MAX_RUN_ATTEMPTS,
  CONTRACT_VERSION,
  JobPostingBodySectionsSchema,
  JobPostingSourceSchema,
  Rfc3339TimestampSchema,
  UuidSchema,
  WantedJobPostingUrlSchema,
} from "./job-postings";

export const CreateAnalysisJobRequestSchema = z.strictObject({});

export type CreateAnalysisJobRequest = z.infer<
  typeof CreateAnalysisJobRequestSchema
>;

export const AnalysisSourceSchema = z.enum(["fixture", "ai"]);

export type AnalysisSource = z.infer<typeof AnalysisSourceSchema>;

export const AnalysisReasoningEffortSchema = z.enum(["medium", "high"]);

export type AnalysisReasoningEffort = z.infer<
  typeof AnalysisReasoningEffortSchema
>;

const ProfileEvidenceSchema = z.strictObject({
  page: z.int().positive().nullable(),
  section: z.string().max(200).nullable(),
  excerpt: z.string().min(1).max(500),
});

export const DocumentAnalysisProfileSchema = z.strictObject({
  summary: z.string().min(1).max(5_000),
  headline: z.string().max(500).nullable(),
  skills: z.array(z.string().min(1).max(200)).max(100),
  experiences: z
    .array(
      z.strictObject({
        title: z.string().min(1).max(300),
        organization: z.string().max(300).nullable(),
        period: z.string().max(200).nullable(),
        summary: z.string().min(1).max(3_000),
        achievements: z.array(z.string().min(1).max(1_000)).max(10),
        skills: z.array(z.string().min(1).max(200)).max(30),
        evidence: z.array(ProfileEvidenceSchema).max(10),
      }),
    )
    .max(20),
  projects: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(300),
        summary: z.string().min(1).max(3_000),
        role: z.string().max(500).nullable(),
        contributions: z.array(z.string().min(1).max(1_000)).max(20),
        technologies: z.array(z.string().min(1).max(200)).max(40),
        outcomes: z.array(z.string().min(1).max(1_000)).max(10),
        visualEvidence: z.array(ProfileEvidenceSchema).max(10),
        evidence: z.array(ProfileEvidenceSchema).max(10),
      }),
    )
    .max(30),
  visualHighlights: z.array(ProfileEvidenceSchema).max(30),
  strengths: z.array(z.string().min(1).max(1_000)).max(20),
  limitations: z.array(z.string().min(1).max(1_000)).max(20),
  warnings: z.array(z.string().min(1).max(1_000)).max(20),
});

export type DocumentAnalysisProfile = z.infer<
  typeof DocumentAnalysisProfileSchema
>;

export const DocumentEvidenceReviewStatusSchema = z.enum([
  "pending",
  "confirmed",
  "rejected",
]);

export type DocumentEvidenceReviewStatus = z.infer<
  typeof DocumentEvidenceReviewStatusSchema
>;

export const DocumentEvidenceReviewSchema = z.strictObject({
  id: UuidSchema,
  documentVersionId: UuidSchema,
  profileId: UuidSchema,
  evidenceKey: z.string().min(1).max(200),
  page: z.int().positive().nullable(),
  section: z.string().max(200).nullable(),
  excerpt: z.string().min(1).max(500),
  observation: z.string().min(1).max(2_000),
  status: DocumentEvidenceReviewStatusSchema,
  note: z.string().max(1_000).nullable(),
  createdAt: Rfc3339TimestampSchema,
  updatedAt: Rfc3339TimestampSchema,
});

export type DocumentEvidenceReview = z.infer<
  typeof DocumentEvidenceReviewSchema
>;

export const SaveDocumentEvidenceReviewRequestSchema = z.strictObject({
  profileId: UuidSchema,
  evidenceKey: z.string().min(1).max(200),
  page: z.int().positive().nullable(),
  section: z.string().max(200).nullable(),
  excerpt: z.string().min(1).max(500),
  observation: z.string().min(1).max(2_000),
  status: DocumentEvidenceReviewStatusSchema,
  note: z.string().max(1_000).nullable(),
});

export type SaveDocumentEvidenceReviewRequest = z.infer<
  typeof SaveDocumentEvidenceReviewRequestSchema
>;

export const DocumentEvidenceReviewListResponseSchema = z.strictObject({
  data: z.strictObject({
    items: z.array(DocumentEvidenceReviewSchema).max(100),
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type DocumentEvidenceReviewListResponse = z.infer<
  typeof DocumentEvidenceReviewListResponseSchema
>;

export const DocumentEvidenceReviewResponseSchema = z.strictObject({
  data: DocumentEvidenceReviewSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type DocumentEvidenceReviewResponse = z.infer<
  typeof DocumentEvidenceReviewResponseSchema
>;

export const JobPostingAnalysisProfileSchema = z.strictObject({
  summary: z.string().min(1).max(5_000),
  sections: JobPostingBodySectionsSchema,
  requirements: z.array(z.string().min(1).max(2_000)).max(40),
  preferred: z.array(z.string().min(1).max(2_000)).max(40),
  technologies: z.array(z.string().min(1).max(200)).max(40),
  traits: z.array(z.string().min(1).max(1_000)).max(20),
  warnings: z.array(z.string().min(1).max(1_000)).max(20),
});

export type JobPostingAnalysisProfile = z.infer<
  typeof JobPostingAnalysisProfileSchema
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

export const AnalysisInputPolicySchema = z.strictObject({
  version: z.literal(ANALYSIS_INPUT_POLICY_VERSION),
  documentTextMaxLength: z.literal(ANALYSIS_DISPATCH_DOCUMENT_TEXT_MAX_LENGTH),
  jobPostingTextMaxLength: z.literal(
    ANALYSIS_DISPATCH_JOB_POSTING_TEXT_MAX_LENGTH,
  ),
  includesPdf: z.boolean(),
  includesProfile: z.boolean(),
});

export type AnalysisInputPolicy = z.infer<typeof AnalysisInputPolicySchema>;

export const AnalysisJobActionRequestSchema = z.strictObject({});

export type AnalysisJobActionRequest = z.infer<
  typeof AnalysisJobActionRequestSchema
>;

export const AnalysisInputDocumentSchema = z.strictObject({
  versionId: UuidSchema,
  profileId: UuidSchema.nullable(),
  profileSource: AnalysisSourceSchema.nullable(),
  profile: DocumentAnalysisProfileSchema.nullable(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  text: z.string().min(1).max(80_100),
  originalLength: z.int().positive(),
  truncated: z.boolean(),
  sourceTextLength: z.int().positive(),
  inputTextLength: z.int().positive(),
  inputTextTruncated: z.boolean(),
  confirmedEvidence: z.array(DocumentEvidenceReviewSchema).max(100),
  file: z
    .strictObject({
      url: z.string().url().max(2_000),
      filename: z.string().min(1).max(255),
      mimeType: z.literal("application/pdf"),
      fileSize: z.int().positive(),
    })
    .nullable(),
});

export const N8nDispatchPayloadSchema = z.strictObject({
  kind: z.literal("application_analysis"),
  schemaVersion: z.literal(CONTRACT_VERSION),
  eventId: UuidSchema,
  requestId: UuidSchema,
  analysisJobId: UuidSchema,
  runAttempt: z.int().min(1).max(ANALYSIS_JOB_MAX_RUN_ATTEMPTS),
  inputPolicy: AnalysisInputPolicySchema,
  jobPosting: z.strictObject({
    id: UuidSchema,
    snapshotId: UuidSchema,
    source: JobPostingSourceSchema,
    url: WantedJobPostingUrlSchema,
    title: z.string().min(1).max(500),
    companyName: z.string().min(1).max(500),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    text: z.string().min(1).max(100_000),
    sourceTextLength: z.int().positive(),
    inputTextLength: z.int().positive(),
    inputTextTruncated: z.boolean(),
    profileId: UuidSchema.nullable(),
    profileSource: AnalysisSourceSchema.nullable(),
    profile: JobPostingAnalysisProfileSchema.nullable(),
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
