import * as z from "zod";

import {
  CONTRACT_VERSION,
  Rfc3339TimestampSchema,
  UuidSchema,
} from "./job-postings";

export const AiOperationSchema = z.enum([
  "document_ocr",
  "job_posting_extraction",
  "job_facts",
  "profile_comparison",
]);
export const AiTokenUsageSchema = z
  .strictObject({
    inputTokens: z.int().nonnegative(),
    outputTokens: z.int().nonnegative(),
    cachedInputTokens: z.int().nonnegative(),
    cacheWriteTokens: z.int().nonnegative(),
  })
  .refine(
    (usage) =>
      usage.cachedInputTokens + usage.cacheWriteTokens <= usage.inputTokens,
    {
      message: "Cache token counts cannot exceed input tokens",
    },
  );

export const AiUsageCallbackSchema = z
  .strictObject({
    schemaVersion: z.literal(CONTRACT_VERSION),
    eventId: UuidSchema,
    requestId: UuidSchema,
    callId: UuidSchema,
    operation: AiOperationSchema,
    resourceId: UuidSchema,
    model: z.string().min(1).max(200),
    responseId: z.string().min(1).max(300).nullable(),
    serviceTier: z.string().max(40).nullable(),
    status: z.enum(["started", "succeeded", "failed", "unknown"]),
    usage: AiTokenUsageSchema.nullable(),
    latencyMs: z.int().nonnegative().nullable(),
    attempt: z.int().min(1).max(20),
    runAttempt: z.int().min(1).max(20),
    occurredAt: Rfc3339TimestampSchema,
  })
  .refine(
    (value) =>
      value.status !== "started" ||
      (value.usage === null && value.responseId === null),
    {
      message: "A started call cannot already have response usage",
    },
  );
export type AiUsageCallback = z.infer<typeof AiUsageCallbackSchema>;
export type AiTokenUsage = z.infer<typeof AiTokenUsageSchema>;

export const AiUsageRecordSchema = z.strictObject({
  callId: UuidSchema,
  requestId: UuidSchema,
  operation: AiOperationSchema,
  resourceId: UuidSchema,
  model: z.string(),
  responseId: z.string().nullable(),
  serviceTier: z.string().nullable(),
  status: z.enum(["started", "succeeded", "failed", "unknown"]),
  usage: AiTokenUsageSchema.nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
  pricingVersion: z.string().nullable(),
  latencyMs: z.int().nonnegative().nullable(),
  attempt: z.int().positive(),
  runAttempt: z.int().positive(),
  startedAt: Rfc3339TimestampSchema,
  finishedAt: Rfc3339TimestampSchema.nullable(),
});
export type AiUsageRecord = z.infer<typeof AiUsageRecordSchema>;

export const AiBalanceBaselineSchema = z.strictObject({
  balanceUsd: z.number().min(0).max(1_000_000),
  recordedAt: Rfc3339TimestampSchema,
});
export const SaveAiBalanceBaselineRequestSchema = AiBalanceBaselineSchema;
export type AiBalanceBaseline = z.infer<typeof AiBalanceBaselineSchema>;

export const AiUsageDashboardSchema = z.strictObject({
  baseline: AiBalanceBaselineSchema.nullable(),
  estimatedBalanceUsd: z.number().nullable(),
  spentSinceBaselineUsd: z.number().nonnegative(),
  unpricedSinceBaselineCount: z.int().nonnegative(),
  totalCallCount: z.int().nonnegative(),
  unpricedCallCount: z.int().nonnegative(),
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  cachedInputTokens: z.int().nonnegative(),
  cacheWriteTokens: z.int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  daily: z
    .array(
      z.strictObject({
        date: z.string(),
        calls: z.int().nonnegative(),
        inputTokens: z.int().nonnegative(),
        outputTokens: z.int().nonnegative(),
        estimatedCostUsd: z.number().nonnegative(),
        unpricedCalls: z.int().nonnegative(),
      }),
    )
    .max(366),
  recent: z.array(AiUsageRecordSchema).max(100),
  periodDays: z.int().min(1).max(366),
});
export type AiUsageDashboard = z.infer<typeof AiUsageDashboardSchema>;
export const AiUsageDashboardResponseSchema = z.strictObject({
  data: AiUsageDashboardSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});

// Snapshot standard pricing when the response is recorded, rather than
// retroactively repricing old calls. Unknown models/tiers remain unpriced.
// https://developers.openai.com/api/docs/pricing (verified 2026-10-07)
export const AI_PRICING_VERSION = "openai-standard-2026-10-07";
const STANDARD_PRICES: Record<
  string,
  readonly [number, number, number, number]
> = {
  "gpt-5.6-luna": [0.2, 0.02, 0.25, 1.2],
  "gpt-5.6-terra": [2, 0.2, 2.5, 12],
  "gpt-5.6-sol": [4, 0.4, 5, 20],
};
export function estimateAiCostUsd(
  model: string,
  usage: AiTokenUsage | null,
  serviceTier: string | null = null,
): number | null {
  if (
    !usage ||
    !AiTokenUsageSchema.safeParse(usage).success ||
    (serviceTier && !["default", "standard"].includes(serviceTier))
  )
    return null;
  const name = model.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  const rates = STANDARD_PRICES[name];
  if (!rates) return null;
  const [input, cached, written, output] = rates;
  const longContext = usage.inputTokens > 272_000;
  const normalInput =
    usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens;
  return (
    (normalInput * input * (longContext ? 2 : 1) +
      usage.cachedInputTokens * cached * (longContext ? 2 : 1) +
      usage.cacheWriteTokens * written * (longContext ? 2 : 1) +
      usage.outputTokens * output * (longContext ? 1.5 : 1)) /
    1_000_000
  );
}
