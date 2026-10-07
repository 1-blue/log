import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { AiUsageDashboard } from "@workspace/contracts";

import { AiUsagePanel } from "#/app/admin/(protected)/usage/_components/AiUsagePanel";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "AI 사용량 화면 미리보기",
};
export default function UsagePreviewPage() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  if (process.env.NODE_ENV === "production") notFound();
  const data: AiUsageDashboard = {
    baseline: { balanceUsd: 5, recordedAt: "2026-10-07T00:00:00Z" },
    estimatedBalanceUsd: 4.84,
    spentSinceBaselineUsd: 0.16,
    unpricedSinceBaselineCount: 1,
    totalCallCount: 5,
    unpricedCallCount: 1,
    inputTokens: 25577,
    outputTokens: 14015,
    cachedInputTokens: 2000,
    cacheWriteTokens: 300,
    estimatedCostUsd: 0.23,
    periodDays: 30,
    daily: [
      {
        date: "2026-10-06",
        calls: 2,
        inputTokens: 6000,
        outputTokens: 4015,
        estimatedCostUsd: 0.07,
        unpricedCalls: 0,
      },
      {
        date: "2026-10-07",
        calls: 3,
        inputTokens: 19577,
        outputTokens: 10000,
        estimatedCostUsd: 0.16,
        unpricedCalls: 1,
      },
    ],
    recent: [
      {
        callId: "00000000-0000-4000-8000-000000000981",
        requestId: "00000000-0000-4000-8000-000000000982",
        resourceId: "00000000-0000-4000-8000-000000000983",
        operation: "document_ocr",
        model: "gpt-5.6-luna",
        responseId: null,
        serviceTier: "default",
        status: "unknown",
        usage: null,
        estimatedCostUsd: null,
        pricingVersion: null,
        latencyMs: 180000,
        attempt: 2,
        runAttempt: 1,
        startedAt: "2026-10-07T01:00:00Z",
        finishedAt: "2026-10-07T01:03:00Z",
      },
    ],
  };
  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-2xl font-bold">
        AI 사용량 미리보기 · 가상 데이터
      </h1>
      <AiUsagePanel data={data} />
    </main>
  );
}
