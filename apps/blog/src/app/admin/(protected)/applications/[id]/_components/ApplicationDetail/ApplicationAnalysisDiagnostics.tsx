import type { AnalysisDiagnosticsResponse } from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";

import { LoaderCircleIcon, RotateCcwIcon } from "lucide-react";

import { formatApplicationDate } from "#/libs/application-ui";

import { ANALYSIS_STAGE_LABELS } from "./ApplicationDetailLabels";
import type { AnalysisAction } from "./ApplicationDetailTypes";

export function AnalysisDiagnostics({
  diagnostics,
}: Readonly<{ diagnostics: AnalysisDiagnosticsResponse["data"] }>) {
  const nextAction = {
    check_input: "입력 문서와 공고 원문을 확인해 주세요.",
    none: "추가 조치가 필요하지 않습니다.",
    recover_stale: "멈춘 작업인지 확인한 뒤 복구할 수 있습니다.",
    retry: "같은 작업을 다시 시도할 수 있습니다.",
    start_new_analysis:
      "재시도 횟수를 모두 사용했습니다. 새 분석을 시작해 주세요.",
    wait: "현재 작업의 다음 응답을 기다려 주세요.",
  }[diagnostics.nextAction];

  return (
    <details className="border-border mt-3 rounded-md border p-3">
      <summary className="cursor-pointer text-xs font-medium">
        실행 진단과 다음 조치
      </summary>
      <p className="text-muted-foreground mt-2 text-xs">{nextAction}</p>
      <ol className="text-muted-foreground mt-3 grid gap-2 text-xs">
        {diagnostics.events.slice(0, 8).map((event) => (
          <li
            className="border-border border-b pb-2 last:border-0"
            key={event.eventId}
          >
            <span className="font-medium">{event.eventType}</span>
            {event.stage ? ` · ${ANALYSIS_STAGE_LABELS[event.stage]}` : ""}
            {event.errorCode ? ` · ${event.errorCode}` : ""}
            {event.message ? ` · ${event.message}` : ""}
            <span className="ml-2">
              {formatApplicationDate(event.occurredAt)}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

export function PollingRecovery({
  analysisJobId,
  disabled,
  pending,
  recoverStaleAnalysis,
  refreshAnalysis,
}: Readonly<{
  analysisJobId: string;
  disabled: boolean;
  pending: string | null;
  recoverStaleAnalysis: AnalysisAction;
  refreshAnalysis: AnalysisAction;
}>) {
  return (
    <div className="border-border bg-muted/30 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <p className="text-muted-foreground text-xs">
        자동 새로고침이 종료되었습니다. 응답이 오래 멈췄다면 중단 여부를 확인해
        실패 상태로 전환할 수 있습니다.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={disabled}
          onClick={() => void recoverStaleAnalysis(analysisJobId)}
          size="sm"
          type="button"
          variant="outline"
        >
          {pending === "analysis-recover" ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : (
            <RotateCcwIcon />
          )}
          중단 여부 확인
        </Button>
        <Button
          disabled={disabled}
          onClick={() => void refreshAnalysis(analysisJobId)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {pending === "analysis-refresh" ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : null}
          상태 새로고침
        </Button>
      </div>
    </div>
  );
}
