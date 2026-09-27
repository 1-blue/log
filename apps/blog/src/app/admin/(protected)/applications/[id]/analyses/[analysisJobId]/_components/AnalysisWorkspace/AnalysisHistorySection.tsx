import type { AnalysisWorkspace } from "@workspace/contracts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/Select";

import { formatApplicationDate } from "#/libs/application-ui";

type AnalysisResult = NonNullable<AnalysisWorkspace["job"]["result"]>;

function UsageDetails({
  inputAudit,
  usageSummary,
}: Readonly<{
  inputAudit: NonNullable<AnalysisWorkspace["resultMetadata"]>["inputAudit"];
  usageSummary: NonNullable<
    AnalysisWorkspace["resultMetadata"]
  >["usageSummary"];
}>) {
  if (!usageSummary) return null;
  return (
    <>
      <br />
      사용량 {usageSummary.totalTokens.toLocaleString()} tokens ·{" "}
      {(usageSummary.totalLatencyMs / 1000).toFixed(1)}초 ·{" "}
      {usageSummary.stepCount}단계
      <br />
      입력 {inputAudit.includesPdf ? "PDF 포함" : "PDF 미포함"} ·{" "}
      {inputAudit.includesProfile ? "프로필 포함" : "프로필 미포함"}
    </>
  );
}

export function AnalysisHistorySection({
  disabled,
  onCompare,
  result,
  workspace,
}: Readonly<{
  disabled: boolean;
  onCompare: (analysisJobId?: string) => void;
  result: AnalysisResult;
  workspace: AnalysisWorkspace;
}>) {
  return (
    <details
      className="border-border bg-card rounded-lg border p-5"
      id="history"
    >
      <summary className="cursor-pointer font-semibold">
        분석 이력 및 이전 결과 비교
      </summary>
      <div className="mt-4 grid gap-4">
        <p className="text-muted-foreground text-sm leading-6">
          같은 공고를 다른 문서 버전이나 다른 시점에 다시 분석했을 때 결과
          차이를 확인합니다. 요구사항 ID는 재분석마다 달라질 수 있어
          점수·건수·사용 자료·실행 버전 중심으로 비교합니다.
        </p>
        <label className="grid max-w-md gap-1 text-sm font-medium">
          비교할 분석
          <Select
            disabled={disabled}
            onValueChange={(value) =>
              onCompare(value === "none" ? undefined : value)
            }
            value={workspace.comparison?.analysisJobId ?? "none"}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">선택하지 않음</SelectItem>
              {workspace.history
                .filter((item) => item.analysisJobId !== workspace.job.id)
                .map((item) => (
                  <SelectItem
                    key={item.analysisJobId}
                    value={item.analysisJobId}
                  >
                    {formatApplicationDate(item.completedAt)} · {item.fitScore}
                    점
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </label>
        {workspace.comparison ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="bg-muted/30 rounded-md p-4">
              <p className="text-xs font-medium">현재 분석</p>
              <strong className="mt-1 block text-2xl">
                {result.fitScore}점
              </strong>
              <p className="text-muted-foreground mt-2 text-xs leading-5">
                부족 역량 {result.comparison.gaps.length} · 질문{" "}
                {workspace.questions.length}
                <br />
                {workspace.sources.resume.label}
                <br />
                {workspace.sources.portfolio.label}
                <br />
                <span className="font-mono">
                  {workspace.sources.resume.contentHash.slice(0, 8)}… /{" "}
                  {workspace.sources.portfolio.contentHash.slice(0, 8)}…
                </span>
                <br />
                {workspace.resultMetadata?.executions
                  .map((item) => `${item.model} · ${item.promptVersion}`)
                  .join(" / ")}
                {workspace.resultMetadata?.inputAudit ? (
                  <UsageDetails
                    inputAudit={workspace.resultMetadata.inputAudit}
                    usageSummary={workspace.resultMetadata.usageSummary}
                  />
                ) : null}
              </p>
            </div>
            <div className="bg-muted/30 rounded-md p-4">
              <p className="text-xs font-medium">이전 분석</p>
              <strong className="mt-1 block text-2xl">
                {workspace.comparison.fitScore}점{" "}
                <span className="text-muted-foreground text-sm">
                  (
                  {result.fitScore - workspace.comparison.fitScore >= 0
                    ? "+"
                    : ""}
                  {result.fitScore - workspace.comparison.fitScore})
                </span>
              </strong>
              <p className="text-muted-foreground mt-2 text-xs leading-5">
                부족 역량 {workspace.comparison.gapCount} · 질문{" "}
                {workspace.comparison.questionCount}
                <br />
                {workspace.comparison.sources.resume.label}
                <br />
                {workspace.comparison.sources.portfolio.label}
                <br />
                <span className="font-mono">
                  {workspace.comparison.sources.resume.contentHash.slice(0, 8)}…
                  /{" "}
                  {workspace.comparison.sources.portfolio.contentHash.slice(
                    0,
                    8,
                  )}
                  …
                </span>
                <br />
                {workspace.comparison.executions
                  .map((item) => `${item.model} · ${item.promptVersion}`)
                  .join(" / ")}
                <UsageDetails
                  inputAudit={workspace.comparison.inputAudit}
                  usageSummary={workspace.comparison.usageSummary}
                />
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            비교할 이전 분석을 선택해 주세요.
          </p>
        )}
      </div>
    </details>
  );
}
