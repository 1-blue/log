"use client";

import type { AiBalanceBaseline, AiUsageDashboard } from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";
import { Input } from "@workspace/ui/components/Input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/Table";

import {
  formatApplicationDate,
  toLocalDateTimeInput,
  toUtcTimestamp,
} from "#/libs/application-ui";

const usd = (value: number | null) =>
  value === null ? "집계 불가" : `$${value.toFixed(4)}`;
const OPERATIONS = {
  document_ocr: "문서 AI OCR",
  job_posting_extraction: "공고 AI 구조화",
  job_facts: "공고 요구사항 추출",
  profile_comparison: "지원 적합도 분석",
};
const STATUSES = {
  started: "응답 미확정",
  succeeded: "응답 완료",
  failed: "호출 실패",
  unknown: "결과 불명확",
};

export function AiUsagePanel({
  data,
  pending = false,
  onSave,
}: Readonly<{
  data: AiUsageDashboard;
  pending?: boolean;
  onSave?: (input: AiBalanceBaseline) => Promise<void>;
}>) {
  const maxCost = Math.max(
    ...data.daily.map((day) => day.estimatedCostUsd),
    0.000001,
  );
  const maxTokens = Math.max(
    ...data.daily.map((day) => day.inputTokens + day.outputTokens),
    1,
  );
  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [
            "추정 잔액",
            data.estimatedBalanceUsd === null
              ? "기준 미등록"
              : usd(data.estimatedBalanceUsd),
          ],
          [
            "확인된 기간 비용",
            `${usd(data.estimatedCostUsd)}${data.unpricedCallCount ? " + 미집계" : ""}`,
          ],
          [
            "확인된 입력 / 출력 토큰",
            `${data.inputTokens.toLocaleString()} / ${data.outputTokens.toLocaleString()}`,
          ],
          [
            "호출 / 비용 미집계",
            `${data.totalCallCount}회 / ${data.unpricedCallCount}회`,
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="border-border bg-card rounded-lg border p-4"
          >
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="bg-muted/40 rounded-lg p-4 text-sm leading-6">
        <p>
          추정 잔액 = 수동 등록 잔액 − 기준 시점 이후 기록된 추정 비용입니다.
          실제 OpenAI 충전 잔액이나 남은 토큰 수가 아닙니다.
        </p>
        <p className="mt-2">
          사용량 누락·미확정 호출, 다른 프로젝트의 지출과 요금 변경으로 실제
          청구액과 차이가 날 수 있습니다. 미집계 호출은 무료 사용이 아닙니다.
        </p>
        {data.baseline ? (
          <p className="mt-2">
            기준: {usd(data.baseline.balanceUsd)} ·{" "}
            {formatApplicationDate(data.baseline.recordedAt)} / 이후 집계 비용{" "}
            {usd(data.spentSinceBaselineUsd)} · 미집계{" "}
            {data.unpricedSinceBaselineCount}회
          </p>
        ) : null}
      </div>
      <section className="border-border rounded-lg border p-5">
        <h3 className="font-semibold">잔액 기준 등록</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          OpenAI Billing에서 확인한 잔액과 확인 시점을 입력하세요. 저장하면 이전
          기준을 교체합니다.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          key={data.baseline?.recordedAt ?? "empty"}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const recordedAt = toUtcTimestamp(String(form.get("recordedAt")));
            const balanceUsd = Number(form.get("balanceUsd"));
            if (
              recordedAt &&
              Number.isFinite(balanceUsd) &&
              balanceUsd >= 0 &&
              onSave
            )
              void onSave({ balanceUsd, recordedAt });
          }}
        >
          <label className="grid gap-2 text-sm">
            확인한 잔액 (USD)
            <Input
              name="balanceUsd"
              type="number"
              min="0"
              max="1000000"
              step="0.000001"
              required
              defaultValue={data.baseline?.balanceUsd ?? 5}
              disabled={pending || !onSave}
            />
          </label>
          <label className="grid gap-2 text-sm">
            확인 시점
            <Input
              name="recordedAt"
              type="datetime-local"
              required
              defaultValue={toLocalDateTimeInput(
                data.baseline?.recordedAt ?? new Date().toISOString(),
              )}
              disabled={pending || !onSave}
            />
          </label>
          <Button type="submit" disabled={pending || !onSave}>
            {pending ? "저장 중…" : "잔액 기준 저장"}
          </Button>
        </form>
      </section>
      <section className="border-border rounded-lg border p-5">
        <h3 className="font-semibold">일별 비용과 토큰</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          한국 시간 기준 · 비용과 토큰은 서로 다른 척도로 표시합니다.
        </p>
        {data.daily.length === 0 ? (
          <p className="text-muted-foreground mt-4">
            기록된 AI 호출이 없습니다. 적용 이전의 비용은 소급 집계하지
            않습니다.
          </p>
        ) : (
          <div className="mt-4 grid gap-4">
            {data.daily.map((day) => (
              <div className="grid gap-2 text-sm" key={day.date}>
                <div className="flex flex-wrap justify-between gap-2">
                  <span>
                    {day.date} · {day.calls}회
                  </span>
                  <span className="tabular-nums">
                    {usd(day.estimatedCostUsd)} ·{" "}
                    {(day.inputTokens + day.outputTokens).toLocaleString()}{" "}
                    tokens{" "}
                    {day.unpricedCalls ? `· 미집계 ${day.unpricedCalls}회` : ""}
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="bg-muted h-2 overflow-hidden rounded-full"
                >
                  <div
                    className="bg-primary h-full"
                    style={{
                      width: `${(day.estimatedCostUsd / maxCost) * 100}%`,
                    }}
                  />
                </div>
                <div
                  aria-hidden="true"
                  className="bg-muted h-2 overflow-hidden rounded-full"
                >
                  <div
                    className="h-full bg-emerald-500"
                    style={{
                      width: `${((day.inputTokens + day.outputTokens) / maxTokens) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-muted-foreground mt-4 text-xs">
          파란 막대: 추정 비용 · 초록 막대: 확인된 입력+출력 토큰 · 캐시 읽기{" "}
          {data.cachedInputTokens.toLocaleString()} / 쓰기{" "}
          {data.cacheWriteTokens.toLocaleString()} tokens
        </p>
      </section>
      <section className="grid gap-3">
        <h3 className="font-semibold">최근 호출 내역</h3>
        <Table aria-label="AI 호출별 사용량과 추정 비용">
          <TableHeader>
            <TableRow>
              {[
                "작업 / 시각",
                "모델 / 회차",
                "상태",
                "입력 / 출력",
                "추정 비용",
              ].map((label) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.recent.map((call) => (
              <TableRow key={call.callId}>
                <TableCell>
                  {OPERATIONS[call.operation]}
                  <p className="text-muted-foreground text-xs">
                    {formatApplicationDate(call.startedAt)}
                  </p>
                </TableCell>
                <TableCell>
                  {call.model}
                  <p className="text-muted-foreground text-xs">
                    실행 {call.runAttempt} · 시도 {call.attempt}
                  </p>
                </TableCell>
                <TableCell>
                  {STATUSES[call.status]}
                  {call.latencyMs === null ? null : (
                    <p className="text-muted-foreground text-xs">
                      {(call.latencyMs / 1000).toFixed(1)}초
                    </p>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {call.usage
                    ? `${call.usage.inputTokens.toLocaleString()} / ${call.usage.outputTokens.toLocaleString()}`
                    : "사용량 미확인"}
                </TableCell>
                <TableCell className="tabular-nums">
                  {usd(call.estimatedCostUsd)}
                  <p className="text-muted-foreground text-xs">
                    {call.pricingVersion ?? "요금 또는 사용량 미확인"}
                  </p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-muted-foreground text-xs">
          최신 100건 표시 · 합계와 잔액 계산에는 표시되지 않은 기록도
          포함됩니다.
        </p>
      </section>
    </div>
  );
}
