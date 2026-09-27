import * as z from "zod";

import { UuidSchema } from "./job-postings";

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
  context: z.string().max(4_000).nullable().default(null),
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

export const DocumentLabelSchema = z.string().trim().min(1).max(100);

export const DocumentFilenameSchema = z
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

export const DocumentContentHashSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "A lowercase SHA-256 hash is required");
