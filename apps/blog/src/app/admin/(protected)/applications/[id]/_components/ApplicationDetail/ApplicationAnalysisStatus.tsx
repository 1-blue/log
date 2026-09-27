import Link from "next/link";

import type {
  AnalysisDiagnosticsResponse,
  AnalysisJobResponse,
} from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/Dialog";

import { LoaderCircleIcon, RotateCcwIcon, XIcon } from "lucide-react";

import { formatApplicationDate } from "#/libs/application-ui";

import {
  AnalysisDiagnostics,
  PollingRecovery,
} from "./ApplicationAnalysisDiagnostics";
import {
  ANALYSIS_STAGE_LABELS,
  ANALYSIS_STATUS_LABELS,
} from "./ApplicationDetailLabels";
import type { AnalysisAction } from "./ApplicationDetailTypes";

export function ApplicationAnalysisStatus({
  activeAnalysisId,
  analysisDiagnostics,
  analysisPollingExpired,
  applicationId,
  cancelAnalysis,
  disabled,
  latestAnalysis,
  pending,
  recoverStaleAnalysis,
  refreshAnalysis,
  retryAnalysis,
}: Readonly<{
  activeAnalysisId: string | null;
  analysisDiagnostics: AnalysisDiagnosticsResponse["data"] | null;
  analysisPollingExpired: boolean;
  applicationId: string;
  cancelAnalysis: AnalysisAction;
  disabled: boolean;
  latestAnalysis: AnalysisJobResponse;
  pending: string | null;
  recoverStaleAnalysis: AnalysisAction;
  refreshAnalysis: AnalysisAction;
  retryAnalysis: AnalysisAction;
}>) {
  return (
    <div className="border-border mt-4 rounded-md border p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {ANALYSIS_STATUS_LABELS[latestAnalysis.status]}
        </span>
        <time className="text-muted-foreground text-xs">
          {formatApplicationDate(latestAnalysis.updatedAt)}
        </time>
      </div>
      <AnalysisMetadata analysis={latestAnalysis} />
      {latestAnalysis.lastError ? (
        <p className="text-destructive mt-2 text-xs">
          {latestAnalysis.lastError.message}
        </p>
      ) : null}
      {analysisDiagnostics ? (
        <AnalysisDiagnostics diagnostics={analysisDiagnostics} />
      ) : null}
      {analysisPollingExpired && activeAnalysisId ? (
        <PollingRecovery
          analysisJobId={activeAnalysisId}
          disabled={disabled}
          pending={pending}
          recoverStaleAnalysis={recoverStaleAnalysis}
          refreshAnalysis={refreshAnalysis}
        />
      ) : null}
      <AnalysisActions
        activeAnalysisId={activeAnalysisId}
        cancelAnalysis={cancelAnalysis}
        disabled={disabled}
        latestAnalysis={latestAnalysis}
        pending={pending}
        retryAnalysis={retryAnalysis}
      />
      {latestAnalysis.result ? (
        <AnalysisResult
          analysis={latestAnalysis}
          applicationId={applicationId}
        />
      ) : null}
    </div>
  );
}

function AnalysisMetadata({
  analysis,
}: Readonly<{ analysis: AnalysisJobResponse }>) {
  return (
    <dl className="text-muted-foreground mt-3 grid gap-2 text-xs sm:grid-cols-2">
      <div>
        <dt className="inline font-medium">실행 회차 </dt>
        <dd className="inline">{analysis.attemptCount} / 2</dd>
      </div>
      <div>
        <dt className="inline font-medium">현재 단계 </dt>
        <dd className="inline">
          {analysis.stage ? ANALYSIS_STAGE_LABELS[analysis.stage] : "대기 중"}
        </dd>
      </div>
      <div>
        <dt className="inline font-medium">최근 응답 </dt>
        <dd className="inline">
          {analysis.lastHeartbeatAt
            ? formatApplicationDate(analysis.lastHeartbeatAt)
            : "아직 없음"}
        </dd>
      </div>
      <div>
        <dt className="inline font-medium">Request ID </dt>
        <dd className="font-mono text-[11px] break-all">
          {analysis.requestId}
        </dd>
      </div>
      <div>
        <dt className="inline font-medium">결과 저장 </dt>
        <dd className="inline">
          {analysis.result ? "검증된 결과 저장 완료" : "아직 저장되지 않음"}
        </dd>
      </div>
      {analysis.retryAt ? (
        <div>
          <dt className="inline font-medium">다음 단계 재시도 </dt>
          <dd className="inline">{formatApplicationDate(analysis.retryAt)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function AnalysisActions({
  activeAnalysisId,
  cancelAnalysis,
  disabled,
  latestAnalysis,
  pending,
  retryAnalysis,
}: Readonly<{
  activeAnalysisId: string | null;
  cancelAnalysis: AnalysisAction;
  disabled: boolean;
  latestAnalysis: AnalysisJobResponse;
  pending: string | null;
  retryAnalysis: AnalysisAction;
}>) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {latestAnalysis.status === "failed" &&
      latestAnalysis.lastError?.retryable &&
      latestAnalysis.attemptCount < 2 ? (
        <Button
          disabled={disabled}
          onClick={() => void retryAnalysis(latestAnalysis.id)}
          size="sm"
          type="button"
          variant="outline"
        >
          {pending === "analysis-retry" ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : (
            <RotateCcwIcon />
          )}
          같은 작업 재시도
        </Button>
      ) : null}
      {activeAnalysisId === latestAnalysis.id ? (
        <Dialog>
          <DialogTrigger asChild>
            <Button disabled={disabled} size="sm" variant="outline">
              <XIcon /> 분석 취소
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>분석 작업을 취소할까요?</DialogTitle>
              <DialogDescription>
                이미 실행 중인 외부 요청은 즉시 중단되지 않을 수 있지만, 이후
                도착한 결과는 저장되지 않습니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">계속 진행</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button onClick={() => void cancelAnalysis(latestAnalysis.id)}>
                  취소 확정
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function AnalysisResult({
  analysis,
  applicationId,
}: Readonly<{
  analysis: AnalysisJobResponse;
  applicationId: string;
}>) {
  if (!analysis.result) return null;

  return (
    <div className="mt-4 grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <strong className="text-primary text-3xl">
          {analysis.result.fitScore}점
        </strong>
        <span className="text-muted-foreground text-xs">
          요구사항 {analysis.result.job.requirements.length}개 · 부족 역량{" "}
          {analysis.result.comparison.gaps.length}개 · 면접 질문{" "}
          {analysis.result.comparison.interviewQuestions.length}개
        </span>
      </div>
      <p className="leading-6">{analysis.result.comparison.summary}</p>
      <Button asChild className="w-fit" size="sm">
        <Link
          href={`/admin/applications/${applicationId}/analyses/${analysis.id}`}
        >
          상세 결과 및 면접 준비
        </Link>
      </Button>
    </div>
  );
}
