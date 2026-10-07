import {
  AI_PRICING_VERSION,
  type AiBalanceBaseline,
  type AiUsageCallback,
  type AiUsageDashboard,
  AiUsageDashboardSchema,
  type AiUsageRecord,
  estimateAiCostUsd,
} from "@workspace/contracts";
import type { Database, Json } from "@workspace/contracts/database";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "./document-service-support.js";

type UsageRow = Database["public"]["Tables"]["ai_usage_calls"]["Row"];
export class AiUsageServiceError extends Error {
  constructor(readonly kind: "conflict" | "not_found" | "unavailable") {
    super(kind);
  }
}
export interface AiUsageService {
  record(ownerId: string, call: AiUsageCallback): Promise<void>;
  dashboard(ownerId: string, days: number): Promise<AiUsageDashboard>;
  saveBaseline(
    ownerId: string,
    input: AiBalanceBaseline,
  ): Promise<AiBalanceBaseline>;
}
function mapUsage(row: UsageRow): AiUsageRecord {
  return {
    callId: row.call_id,
    requestId: row.request_id,
    operation: row.operation as AiUsageRecord["operation"],
    resourceId: row.resource_id,
    model: row.model,
    responseId: row.response_id,
    serviceTier: row.service_tier,
    status: row.status as AiUsageRecord["status"],
    usage: row.usage as AiUsageRecord["usage"],
    estimatedCostUsd: row.estimated_cost_usd,
    pricingVersion: row.pricing_version,
    latencyMs: row.latency_ms,
    attempt: row.attempt,
    runAttempt: row.run_attempt,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export function summarizeAiUsage(
  calls: readonly AiUsageRecord[],
  baseline: AiBalanceBaseline | null,
  days: number,
  now = Date.now(),
): AiUsageDashboard {
  const cutoff =
    Math.floor((now + 9 * 3_600_000) / 86_400_000) * 86_400_000 -
    9 * 3_600_000 -
    (days - 1) * 86_400_000;
  const period = calls.filter((call) => Date.parse(call.startedAt) >= cutoff);
  const sinceBaseline = baseline
    ? calls.filter(
        (call) => Date.parse(call.startedAt) >= Date.parse(baseline.recordedAt),
      )
    : [];
  const spentSinceBaselineUsd = sinceBaseline.reduce(
    (sum, call) => sum + (call.estimatedCostUsd ?? 0),
    0,
  );
  const daily = new Map<string, AiUsageDashboard["daily"][number]>();
  for (const call of period) {
    const date = new Date(Date.parse(call.startedAt) + 9 * 3_600_000)
      .toISOString()
      .slice(0, 10);
    const day = daily.get(date) ?? {
      date,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      unpricedCalls: 0,
    };
    day.calls++;
    day.inputTokens += call.usage?.inputTokens ?? 0;
    day.outputTokens += call.usage?.outputTokens ?? 0;
    day.estimatedCostUsd += call.estimatedCostUsd ?? 0;
    day.unpricedCalls += Number(call.estimatedCostUsd === null);
    daily.set(date, day);
  }
  return {
    baseline,
    estimatedBalanceUsd: baseline
      ? baseline.balanceUsd - spentSinceBaselineUsd
      : null,
    spentSinceBaselineUsd,
    unpricedSinceBaselineCount: sinceBaseline.filter(
      (call) => call.estimatedCostUsd === null,
    ).length,
    totalCallCount: period.length,
    unpricedCallCount: period.filter((call) => call.estimatedCostUsd === null)
      .length,
    inputTokens: period.reduce(
      (sum, call) => sum + (call.usage?.inputTokens ?? 0),
      0,
    ),
    outputTokens: period.reduce(
      (sum, call) => sum + (call.usage?.outputTokens ?? 0),
      0,
    ),
    cachedInputTokens: period.reduce(
      (sum, call) => sum + (call.usage?.cachedInputTokens ?? 0),
      0,
    ),
    cacheWriteTokens: period.reduce(
      (sum, call) => sum + (call.usage?.cacheWriteTokens ?? 0),
      0,
    ),
    estimatedCostUsd: period.reduce(
      (sum, call) => sum + (call.estimatedCostUsd ?? 0),
      0,
    ),
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    recent: [...period]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 100),
    periodDays: days,
  };
}

export class SupabaseAiUsageService implements AiUsageService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}
  async record(ownerId: string, call: AiUsageCallback) {
    const estimatedCostUsd = estimateAiCostUsd(
      call.model,
      call.usage,
      call.serviceTier,
    );
    const { error } = await this.supabase.rpc("record_ai_usage", {
      p_owner_id: ownerId,
      p_call: {
        ...call,
        estimatedCostUsd,
        pricingVersion: estimatedCostUsd === null ? null : AI_PRICING_VERSION,
      } as Json,
    });
    if (error)
      throw new AiUsageServiceError(
        error.code === "P0002"
          ? "not_found"
          : error.code === "23514"
            ? "conflict"
            : "unavailable",
      );
  }
  async saveBaseline(ownerId: string, input: AiBalanceBaseline) {
    if (Date.parse(input.recordedAt) > Date.now() + 60_000)
      throw new AiUsageServiceError("conflict");
    const { error } = await this.supabase.from("ai_balance_baselines").upsert({
      owner_id: ownerId,
      balance_usd: input.balanceUsd,
      recorded_at: input.recordedAt,
      updated_at: new Date().toISOString(),
    });
    if (error)
      throw new AiUsageServiceError(
        error.message === "career_ops_maintenance" ? "conflict" : "unavailable",
      );
    return input;
  }
  async dashboard(ownerId: string, days: number) {
    const observedAt = Date.now();
    const { data: baselineRow, error } = await this.supabase
      .from("ai_balance_baselines")
      .select("*")
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) throw new AiUsageServiceError("unavailable");
    const baseline = baselineRow
      ? {
          balanceUsd: baselineRow.balance_usd,
          recordedAt: baselineRow.recorded_at,
        }
      : null;
    const cutoff = new Date(
      Math.min(
        Math.floor((observedAt + 9 * 3_600_000) / 86_400_000) * 86_400_000 -
          9 * 3_600_000 -
          (days - 1) * 86_400_000,
        baseline ? Date.parse(baseline.recordedAt) : Infinity,
      ),
    ).toISOString();
    // Page through all relevant rows: PostgREST's default 1000-row cap must not
    // silently inflate an estimated remaining balance.
    const calls: AiUsageRecord[] = [];
    const seen = new Set<string>();
    for (let offset = 0; ; offset += 1000) {
      const { data, error: readError } = await this.supabase
        .from("ai_usage_calls")
        .select("*")
        .eq("owner_id", ownerId)
        .gte("started_at", cutoff)
        .lte("received_at", new Date(observedAt).toISOString())
        .order("started_at")
        .order("call_id")
        .range(offset, offset + 999);
      if (readError) throw new AiUsageServiceError("unavailable");
      for (const row of data ?? [])
        if (!seen.has(row.call_id)) {
          seen.add(row.call_id);
          calls.push(mapUsage(row));
        }
      if ((data?.length ?? 0) < 1000) break;
    }
    return AiUsageDashboardSchema.parse(
      summarizeAiUsage(calls, baseline, days, observedAt),
    );
  }
}
export const createAiUsageService = (env: CloudflareBindings): AiUsageService =>
  new SupabaseAiUsageService(createSupabaseAdminClient(env));
