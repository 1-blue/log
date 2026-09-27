import * as z from "zod";

import { AnalysisJobResponseSchema } from "./analysis-jobs";
import {
  AnalysisInputAuditSchema,
  AnalysisStepSchema,
  AnalysisUsageSummarySchema,
} from "./analysis-runtime";
import { ApplicationStatusSchema } from "./common";
import {
  AnalysisReviewSchema,
  InterviewChecklistItemSchema,
  InterviewNoteSchema,
  InterviewQuestionSchema,
} from "./interview";
import {
  JobPostingSnapshotSourceSchema,
  Rfc3339TimestampSchema,
  UuidSchema,
} from "./job-postings";

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
  usageSummary: AnalysisUsageSummarySchema,
  inputAudit: AnalysisInputAuditSchema,
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
    status: ApplicationStatusSchema,
    interviewAt: Rfc3339TimestampSchema.nullable(),
  }),
  job: AnalysisJobResponseSchema,
  resultMetadata: z
    .strictObject({
      schemaVersion: z.string().min(1).max(30),
      createdAt: Rfc3339TimestampSchema,
      executions: z.array(AnalysisStepSchema).max(10),
      usageSummary: AnalysisUsageSummarySchema,
      inputAudit: AnalysisInputAuditSchema,
    })
    .nullable(),
  sources: AnalysisWorkspaceSourceSchema,
  review: AnalysisReviewSchema,
  reviewedFitScore: z.int().min(0).max(100).nullable(),
  evidenceCoverage: z.int().min(0).max(100).nullable(),
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
