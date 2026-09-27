import Link from "next/link";

import type {
  AnalysisDiagnosticsResponse,
  AnalysisJobResponse,
  ApplicationDetail,
  DocumentVersion,
  JobPostingSnapshot,
} from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";

import { LoaderCircleIcon } from "lucide-react";

import { formatApplicationDate } from "#/libs/application-ui";

import { ApplicationAnalysisStatus } from "./ApplicationAnalysisStatus";
import { ANALYSIS_STATUS_LABELS } from "./ApplicationDetailLabels";
import type { AnalysisAction } from "./ApplicationDetailTypes";

export function ApplicationAnalysisTab({
  activeAnalysis,
  activeAnalysisId,
  analysisDiagnostics,
  analysisJobs,
  analysisPollingExpired,
  analysisReady,
  analyze,
  application,
  cancelAnalysis,
  disabled,
  latestAnalysis,
  latestSnapshot,
  pending,
  recoverStaleAnalysis,
  refreshAnalysis,
  retryAnalysis,
  selectedPortfolio,
  selectedResume,
}: Readonly<{
  activeAnalysis: AnalysisJobResponse | undefined;
  activeAnalysisId: string | null;
  analysisDiagnostics: AnalysisDiagnosticsResponse["data"] | null;
  analysisJobs: AnalysisJobResponse[];
  analysisPollingExpired: boolean;
  analysisReady: boolean;
  analyze: () => Promise<void>;
  application: ApplicationDetail;
  cancelAnalysis: AnalysisAction;
  disabled: boolean;
  latestAnalysis: AnalysisJobResponse | null;
  latestSnapshot: JobPostingSnapshot | null;
  pending: string | null;
  recoverStaleAnalysis: AnalysisAction;
  refreshAnalysis: AnalysisAction;
  retryAnalysis: AnalysisAction;
  selectedPortfolio: DocumentVersion | undefined;
  selectedResume: DocumentVersion | undefined;
}>) {
  return (
    <div className="border-border bg-card rounded-lg border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">공고 적합도 분석</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            현재 공고 원문과 선택한 이력서·포트폴리오의 고정본을 AI가
            비교합니다.
          </p>
        </div>
        <Button
          disabled={disabled || Boolean(activeAnalysis) || !analysisReady}
          onClick={() => void analyze()}
          type="button"
        >
          {pending === "analyze" || activeAnalysis ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : null}
          {latestAnalysis ? "다시 분석" : "분석 시작"}
        </Button>
      </div>

      {!analysisReady ? (
        <AnalysisReadiness
          application={application}
          latestSnapshot={latestSnapshot}
          selectedPortfolio={selectedPortfolio}
          selectedResume={selectedResume}
        />
      ) : null}

      {latestAnalysis ? (
        <ApplicationAnalysisStatus
          activeAnalysisId={activeAnalysisId}
          analysisDiagnostics={analysisDiagnostics}
          analysisPollingExpired={analysisPollingExpired}
          applicationId={application.id}
          cancelAnalysis={cancelAnalysis}
          disabled={disabled}
          latestAnalysis={latestAnalysis}
          pending={pending}
          recoverStaleAnalysis={recoverStaleAnalysis}
          refreshAnalysis={refreshAnalysis}
          retryAnalysis={retryAnalysis}
        />
      ) : (
        <p className="text-muted-foreground mt-4 text-sm">
          아직 실행한 분석이 없습니다.
        </p>
      )}

      {analysisJobs.length > 1 ? (
        <AnalysisHistory
          analysisJobs={analysisJobs}
          applicationId={application.id}
        />
      ) : null}
    </div>
  );
}

function AnalysisReadiness({
  application,
  latestSnapshot,
  selectedPortfolio,
  selectedResume,
}: Readonly<{
  application: ApplicationDetail;
  latestSnapshot: JobPostingSnapshot | null;
  selectedPortfolio: DocumentVersion | undefined;
  selectedResume: DocumentVersion | undefined;
}>) {
  return (
    <div className="border-border bg-muted/30 mt-4 rounded-md border p-4 text-sm">
      <p className="font-medium">분석 준비가 필요합니다.</p>
      <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-xs">
        {!latestSnapshot ? <li>채용공고 원문을 먼저 수집해 주세요.</li> : null}
        {!application.documents.resume || !application.documents.portfolio ? (
          <li>이력서와 포트폴리오를 모두 선택하고 저장해 주세요.</li>
        ) : null}
        {application.documents.resume &&
        selectedResume?.extractionStatus !== "ready" ? (
          <li>
            선택한 이력서의 문서 상세 화면에서 분석용 텍스트를 등록해 주세요.
          </li>
        ) : null}
        {application.documents.portfolio &&
        selectedPortfolio?.extractionStatus !== "ready" ? (
          <li>
            선택한 포트폴리오의 문서 상세 화면에서 분석용 텍스트를 등록해
            주세요.
          </li>
        ) : null}
      </ul>
      <Button asChild className="mt-3" size="sm" variant="outline">
        <Link href="/admin/documents">문서 관리로 이동</Link>
      </Button>
    </div>
  );
}

function AnalysisHistory({
  analysisJobs,
  applicationId,
}: Readonly<{
  analysisJobs: AnalysisJobResponse[];
  applicationId: string;
}>) {
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer font-medium">
        최근 분석 이력 {analysisJobs.length}건
      </summary>
      <ol className="mt-3 grid gap-2">
        {analysisJobs.map((item) => (
          <li
            className="border-border flex justify-between gap-2 border-b py-2 last:border-0"
            key={item.id}
          >
            <Link
              className="underline-offset-4 hover:underline"
              href={`/admin/applications/${applicationId}/analyses/${item.id}`}
            >
              {ANALYSIS_STATUS_LABELS[item.status]}
              {item.result ? ` · ${item.result.fitScore}점` : ""}
            </Link>
            <time className="text-muted-foreground">
              {formatApplicationDate(item.createdAt)}
            </time>
          </li>
        ))}
      </ol>
    </details>
  );
}
