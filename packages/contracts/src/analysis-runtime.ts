import * as z from "zod";

import { AnalysisJobResponseSchema } from "./analysis-jobs";
import { AnalysisResultSchema } from "./analysis-results";
import { AnalysisJobStageSchema, AnalysisJobStatusSchema } from "./common";
import {
  ANALYSIS_DISPATCH_DOCUMENT_TEXT_MAX_LENGTH,
  ANALYSIS_DISPATCH_JOB_POSTING_TEXT_MAX_LENGTH,
  ANALYSIS_INPUT_POLICY_VERSION,
  ANALYSIS_JOB_MAX_RUN_ATTEMPTS,
  ANALYSIS_STEP_MAX_ATTEMPTS,
  CONTRACT_VERSION,
  Rfc3339TimestampSchema,
  UuidSchema,
} from "./job-postings";

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

export type AnalysisStep = z.infer<typeof AnalysisStepSchema>;

export const AnalysisDiagnosticEventSchema = z.strictObject({
  eventId: UuidSchema,
  eventType: z.string().min(1).max(50),
  status: AnalysisJobStatusSchema,
  stage: AnalysisJobStageSchema.nullable(),
  step: AnalysisStepNameSchema.nullable(),
  message: z.string().max(1_000).nullable(),
  errorCode: AnalysisErrorCodeSchema.nullable(),
  retryable: z.boolean(),
  occurredAt: Rfc3339TimestampSchema,
});

export type AnalysisDiagnosticEvent = z.infer<
  typeof AnalysisDiagnosticEventSchema
>;

export const AnalysisDiagnosticActionSchema = z.enum([
  "wait",
  "retry",
  "recover_stale",
  "start_new_analysis",
  "check_input",
  "none",
]);

export type AnalysisDiagnosticAction = z.infer<
  typeof AnalysisDiagnosticActionSchema
>;

export const AnalysisDiagnosticsSchema = z.strictObject({
  job: AnalysisJobResponseSchema,
  events: z.array(AnalysisDiagnosticEventSchema).max(100),
  executions: z.array(AnalysisStepSchema).max(10),
  nextAction: AnalysisDiagnosticActionSchema,
});

export type AnalysisDiagnostics = z.infer<typeof AnalysisDiagnosticsSchema>;

export const AnalysisDiagnosticsResponseSchema = z.strictObject({
  data: AnalysisDiagnosticsSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type AnalysisDiagnosticsResponse = z.infer<
  typeof AnalysisDiagnosticsResponseSchema
>;

export const AnalysisUsageSummarySchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  totalLatencyMs: z.number().int().nonnegative(),
  stepCount: z.number().int().nonnegative().max(10),
});

export type AnalysisUsageSummary = z.infer<typeof AnalysisUsageSummarySchema>;

export const AnalysisInputAuditItemSchema = z.strictObject({
  originalLength: z.number().int().positive(),
  storedLength: z.number().int().positive(),
  dispatchLength: z.number().int().positive(),
  storedTruncated: z.boolean(),
  dispatchTruncated: z.boolean(),
  confirmedEvidenceCount: z.number().int().nonnegative().default(0),
});

export type AnalysisInputAuditItem = z.infer<
  typeof AnalysisInputAuditItemSchema
>;

export const AnalysisInputAuditSchema = z.strictObject({
  policyVersion: z.literal(ANALYSIS_INPUT_POLICY_VERSION),
  documentTextMaxLength: z.literal(ANALYSIS_DISPATCH_DOCUMENT_TEXT_MAX_LENGTH),
  jobPostingTextMaxLength: z.literal(
    ANALYSIS_DISPATCH_JOB_POSTING_TEXT_MAX_LENGTH,
  ),
  includesPdf: z.boolean(),
  includesProfile: z.boolean(),
  jobPosting: AnalysisInputAuditItemSchema,
  resume: AnalysisInputAuditItemSchema,
  portfolio: AnalysisInputAuditItemSchema,
});

export type AnalysisInputAudit = z.infer<typeof AnalysisInputAuditSchema>;

export function summarizeAnalysisExecutions(
  executions: readonly AnalysisStep[],
): AnalysisUsageSummary {
  return executions.reduce(
    (summary, execution) => ({
      inputTokens: summary.inputTokens + execution.inputTokens,
      outputTokens: summary.outputTokens + execution.outputTokens,
      totalTokens:
        summary.totalTokens + execution.inputTokens + execution.outputTokens,
      totalLatencyMs: summary.totalLatencyMs + execution.latencyMs,
      stepCount: summary.stepCount + 1,
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      totalLatencyMs: 0,
      stepCount: 0,
    },
  );
}

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

export const NullableWorkspaceTextSchema = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable();
