import {
  AiUsageCallbackSchema,
  type AiUsageRecord,
  estimateAiCostUsd,
} from "@workspace/contracts";

import { describe, expect, it } from "vitest";

import { summarizeAiUsage } from "../src/ai-usage.js";

const usage = {
  inputTokens: 1000,
  outputTokens: 100,
  cachedInputTokens: 200,
  cacheWriteTokens: 100,
};
const now = Date.parse("2026-10-07T10:00:00Z");
const record = (startedAt: string, cost: number | null): AiUsageRecord => ({
  callId: crypto.randomUUID(),
  requestId: crypto.randomUUID(),
  resourceId: crypto.randomUUID(),
  operation: "document_ocr",
  model: "gpt-5.6-luna",
  status: "succeeded",
  usage: cost === null ? null : usage,
  responseId: null,
  serviceTier: "default",
  estimatedCostUsd: cost,
  pricingVersion: cost === null ? null : "fixture",
  latencyMs: 100,
  attempt: 1,
  runAttempt: 1,
  startedAt,
  finishedAt: startedAt,
});
describe("AI accounting", () => {
  it("includes cache read/write rates without charging them twice", () => {
    expect(estimateAiCostUsd("gpt-5.6-luna", usage)).toBeCloseTo(
      (700 * 0.2 + 200 * 0.02 + 100 * 0.25 + 100 * 1.2) / 1e6,
    );
    expect(estimateAiCostUsd("gpt-5.6-luna-2026-07-01", usage)).toBe(
      estimateAiCostUsd("gpt-5.6-luna", usage),
    );
    expect(estimateAiCostUsd("unknown", usage)).toBeNull();
    expect(estimateAiCostUsd("gpt-5.6-luna", null)).toBeNull();
    expect(estimateAiCostUsd("gpt-5.6-luna", usage, "priority")).toBeNull();
  });
  it("applies long-context rates to the full call", () => {
    expect(
      estimateAiCostUsd("gpt-5.6-luna", {
        inputTokens: 300000,
        outputTokens: 100,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
      }),
    ).toBeCloseTo((300000 * 0.4 + 100 * 1.8) / 1e6);
  });
  it("subtracts costs only since the manual baseline while retaining unpriced warnings", () => {
    const calls = [
      record("2026-10-06T10:00:00Z", 2),
      record("2026-10-07T09:00:00Z", 0.25),
      record("2026-10-07T09:01:00Z", null),
    ];
    const result = summarizeAiUsage(
      calls,
      { balanceUsd: 5, recordedAt: "2026-10-07T08:00:00Z" },
      30,
      now,
    );
    expect(result.estimatedBalanceUsd).toBe(4.75);
    expect(result.estimatedCostUsd).toBe(2.25);
    expect(result.unpricedSinceBaselineCount).toBe(1);
    expect(result.totalCallCount).toBe(3);
    expect(result.daily).toHaveLength(2);
  });
  it("never invents a balance or zero-cost records for unknown usage", () => {
    const result = summarizeAiUsage(
      [record("2026-10-07T09:00:00Z", null)],
      null,
      7,
      now,
    );
    expect(result.estimatedBalanceUsd).toBeNull();
    expect(result.recent[0]?.estimatedCostUsd).toBeNull();
    expect(result.unpricedCallCount).toBe(1);
  });
  it("rejects impossible cache counts and inconsistent started responses", () => {
    expect(
      estimateAiCostUsd("gpt-5.6-luna", { ...usage, cachedInputTokens: 1001 }),
    ).toBeNull();
    expect(
      AiUsageCallbackSchema.safeParse({
        ...record("2026-10-07T09:00:00Z", 0.25),
        schemaVersion: "1.0.0",
        eventId: crypto.randomUUID(),
        status: "started",
        occurredAt: "2026-10-07T09:00:00Z",
      }).success,
    ).toBe(false);
  });
  it("uses whole Korean calendar days without overflowing the 366-day contract", () => {
    const today =
      Math.floor((now + 9 * 3_600_000) / 86_400_000) * 86_400_000 -
      9 * 3_600_000;
    const firstDay = today - 365 * 86_400_000;
    const calls = Array.from({ length: 367 }, (_, i) =>
      record(new Date(firstDay + (i - 1) * 86_400_000).toISOString(), 0.01),
    );
    const dashboard = summarizeAiUsage(calls, null, 366, now);
    expect(dashboard.daily).toHaveLength(366);
    expect(dashboard.totalCallCount).toBe(366);
  });
});
