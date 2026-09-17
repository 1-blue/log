"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  type AnalysisJobResponse,
  type ApplicationDetail,
  type ApplicationStatus,
  applicationStatusRequiresDocuments,
  type DocumentVersion,
  type JobPostingCollectionErrorCode,
  type JobPostingCollectionRun,
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
import { Input } from "@workspace/ui/components/Input";
import { Label } from "@workspace/ui/components/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/Select";
import { Textarea } from "@workspace/ui/components/Textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/Accordion";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/Tabs";

import {
  ArchiveIcon,
  ArrowLeftIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";

import {
  APPLICATION_STATUS_OPTIONS,
  formatApplicationDate,
  getApplicationStatusLabel,
  toLocalDateTimeInput,
  toUtcTimestamp,
} from "#/libs/application-ui";
import {
  cancelAnalysisJob,
  createAnalysisJob,
  createApplicationAttempt,
  createJobPostingCollection,
  getAnalysisJob,
  getApplication,
  getJobPostingCollection,
  listAnalysisJobs,
  listDocumentVersions,
  listJobPostingCollections,
  retryAnalysisJob,
  updateApplication,
  updateJobPosting,
  WorkerApiError,
} from "#/libs/worker-client";

function message(error: unknown) {
  return error instanceof WorkerApiError
    ? error.message
    : "요청을 처리하지 못했습니다.";
}

function normalizeOptionalDocumentId(
  value: FormDataEntryValue | null,
): string | null {
  const normalized = String(value ?? "");
  return normalized && normalized !== "none" ? normalized : null;
}

const COLLECTION_ERROR_LABELS: Record<JobPostingCollectionErrorCode, string> = {
  ACCESS_BLOCKED: "Wanted가 자동 접근을 차단했습니다.",
  CONTENT_TOO_LARGE: "공고 원문이 허용된 크기를 초과했습니다.",
  DISPATCH_FAILED: "수집 Workflow에 요청을 전달하지 못했습니다.",
  INVALID_CONTENT_TYPE: "Wanted가 HTML이 아닌 응답을 반환했습니다.",
  INVALID_JOB_POSTING: "유효한 채용공고 내용을 확인하지 못했습니다.",
  JOB_EXPIRED: "삭제되었거나 만료된 공고입니다.",
  NETWORK_ERROR: "Wanted 연결 중 네트워크 오류가 발생했습니다.",
  PARSER_STRUCTURE_CHANGED:
    "Wanted 공고 구조가 변경되어 자동으로 읽지 못했습니다.",
  RATE_LIMITED: "Wanted 요청 제한에 도달했습니다.",
  REDIRECT_NOT_ALLOWED: "공고가 다른 주소로 이동되었습니다.",
  TIMEOUT: "Wanted 응답 시간이 초과되었습니다.",
  UPSTREAM_ERROR: "Wanted 서버에서 오류를 반환했습니다.",
  URL_MISMATCH: "응답 공고와 등록한 URL이 일치하지 않습니다.",
};

const JOB_POSTING_SECTION_LABELS = {
  companyIntroduction: "회사 소개",
  positionIntroduction: "직무 소개",
  expectations: "기대 모습",
  mainResponsibilities: "주요 업무",
  requirements: "자격요건",
  preferred: "우대사항",
  employmentConditions: "고용조건",
  process: "채용절차",
  benefits: "복리후생",
  technologies: "기술 스택",
  traits: "인재상",
  deadline: "마감일",
  location: "근무지역",
} as const;

function upsertCollection(
  current: JobPostingCollectionRun[],
  next: JobPostingCollectionRun,
) {
  return [next, ...current.filter((item) => item.id !== next.id)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
}

function upsertAnalysis(
  current: AnalysisJobResponse[],
  next: AnalysisJobResponse,
) {
  return [next, ...current.filter((item) => item.id !== next.id)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
}

const ANALYSIS_STATUS_LABELS: Record<AnalysisJobResponse["status"], string> = {
  cancelled: "취소됨",
  failed: "분석 실패",
  needs_input: "추가 입력 필요",
  queued: "분석 대기 중",
  retrying: "분석 재시도 중",
  running: "분석 중",
  succeeded: "분석 완료",
};

const ANALYSIS_STAGE_LABELS: Record<
  NonNullable<AnalysisJobResponse["stage"]>,
  string
> = {
  dispatching: "Workflow 전달",
  extracting: "공고 요구사항 추출",
  fetching: "원문 확인",
  generating_questions: "면접 질문 생성",
  matching: "이력서·포트폴리오 비교",
  normalizing: "원문 정리",
  notifying: "완료 알림",
  saving: "결과 저장",
};

export default function ApplicationDetailClient({
  applicationId,
}: Readonly<{ applicationId: string }>) {
  const router = useRouter();
  const [application, setApplication] = useState<ApplicationDetail | null>(
    null,
  );
  const [documents, setDocuments] = useState<DocumentVersion[]>([]);
  const [collections, setCollections] = useState<JobPostingCollectionRun[]>([]);
  const [analysisJobs, setAnalysisJobs] = useState<AnalysisJobResponse[]>([]);
  const [manualContent, setManualContent] = useState("");
  const [status, setStatus] = useState<ApplicationStatus>("interested");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisPollingExpired, setAnalysisPollingExpired] = useState(false);
  const [activeTab, setActiveTab] = useState("posting");

  const changeTab = useCallback((value: string) => {
    setActiveTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && ["info", "posting", "analysis"].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [applicationResponse, documentsResponse] = await Promise.all([
        getApplication(applicationId),
        listDocumentVersions({ archived: "exclude" }),
      ]);
      setApplication(applicationResponse.data);
      setStatus(applicationResponse.data.status);
      setDocuments(documentsResponse.data.items);
      try {
        const [collectionsResponse, analysisResponse] = await Promise.all([
          listJobPostingCollections(applicationResponse.data.jobPosting.id),
          listAnalysisJobs(applicationId),
        ]);
        setCollections(collectionsResponse.data.items);
        setAnalysisJobs(analysisResponse.data.items);
      } catch (caught) {
        setError(message(caught));
      }
    } catch (caught) {
      setError(message(caught));
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCollection = collections.find(
    (item) => item.status === "queued" || item.status === "running",
  );
  const activeCollectionId = activeCollection?.id ?? null;
  const activeAnalysis = analysisJobs.find((item) =>
    ["queued", "running", "retrying"].includes(item.status),
  );
  const activeAnalysisId = activeAnalysis?.id ?? null;

  useEffect(() => {
    if (!application || !activeCollectionId) return;
    const postingId = application.jobPosting.id;
    const runId = activeCollectionId;
    let stopped = false;
    const refresh = async () => {
      try {
        const response = await getJobPostingCollection(postingId, runId);
        if (stopped) return;
        setCollections((current) => upsertCollection(current, response.data));
      } catch (caught) {
        if (!stopped) setError(message(caught));
      }
    };
    const interval = window.setInterval(() => void refresh(), 2_000);
    const timeout = window.setTimeout(() => {
      stopped = true;
      window.clearInterval(interval);
    }, 60_000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [activeCollectionId, application]);

  useEffect(() => {
    if (!activeAnalysisId) return;
    let stopped = false;
    setAnalysisPollingExpired(false);
    const refresh = async () => {
      try {
        const response = await getAnalysisJob(activeAnalysisId);
        if (!stopped) {
          setAnalysisJobs((current) => upsertAnalysis(current, response.data));
        }
      } catch (caught) {
        if (!stopped) setError(message(caught));
      }
    };
    const interval = window.setInterval(() => void refresh(), 2_000);
    const timeout = window.setTimeout(() => {
      stopped = true;
      window.clearInterval(interval);
      setAnalysisPollingExpired(true);
    }, 5 * 60_000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [activeAnalysisId]);

  async function refreshAnalysis(analysisJobId: string) {
    setPending("analysis-refresh");
    setError(null);
    try {
      const response = await getAnalysisJob(analysisJobId);
      setAnalysisJobs((current) => upsertAnalysis(current, response.data));
      setAnalysisPollingExpired(
        ["queued", "running", "retrying"].includes(response.data.status),
      );
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  async function retryAnalysis(analysisJobId: string) {
    setPending("analysis-retry");
    setError(null);
    try {
      const response = await retryAnalysisJob(analysisJobId);
      setAnalysisJobs((current) => upsertAnalysis(current, response.data.job));
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  async function cancelAnalysis(analysisJobId: string) {
    setPending("analysis-cancel");
    setError(null);
    try {
      const response = await cancelAnalysisJob(analysisJobId);
      setAnalysisJobs((current) => upsertAnalysis(current, response.data.job));
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  async function analyze() {
    setPending("analyze");
    setError(null);
    try {
      const response = await createAnalysisJob(applicationId);
      setAnalysisJobs((current) => upsertAnalysis(current, response.data.job));
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  async function collect(content: string | null) {
    if (!application) return;
    setPending(content === null ? "collect" : "manual-collect");
    setError(null);
    try {
      const response = await createJobPostingCollection(
        application.jobPosting.id,
        { manualContent: content },
      );
      setCollections((current) => upsertCollection(current, response.data));
      if (content !== null) setManualContent("");
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!application) return;
    const data = new FormData(event.currentTarget);
    setPending("save");
    setError(null);
    try {
      const companyName = String(data.get("companyName") ?? "").trim();
      const title = String(data.get("title") ?? "").trim();
      if (
        companyName !== application.jobPosting.companyName ||
        title !== application.jobPosting.title
      ) {
        await updateJobPosting(application.jobPosting.id, {
          companyName,
          title,
        });
      }
      const response = await updateApplication(application.id, {
        appliedOn: String(data.get("appliedOn") ?? "") || null,
        interviewAt: toUtcTimestamp(String(data.get("interviewAt") ?? "")),
        note: String(data.get("note") ?? "").trim() || null,
        portfolioVersionId: application.documentsLockedAt
          ? (application.documents.portfolio?.id ?? null)
          : normalizeOptionalDocumentId(data.get("portfolioVersionId")),
        resumeVersionId: application.documentsLockedAt
          ? (application.documents.resume?.id ?? null)
          : normalizeOptionalDocumentId(data.get("resumeVersionId")),
        status,
      });
      setApplication(response.data);
      setStatus(response.data.status);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  async function setArchived(archived: boolean) {
    if (!application) return;
    setPending("archive");
    setError(null);
    try {
      const response = await updateApplication(application.id, { archived });
      setApplication(response.data);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  async function reapply() {
    if (!application) return;
    setPending("reapply");
    setError(null);
    try {
      const response = await createApplicationAttempt(
        application.jobPosting.id,
        {
          appliedOn: null,
          interviewAt: null,
          note: null,
          portfolioVersionId: application.documents.portfolio?.archivedAt
            ? null
            : (application.documents.portfolio?.id ?? null),
          resumeVersionId: application.documents.resume?.archivedAt
            ? null
            : (application.documents.resume?.id ?? null),
          status: "interested",
        },
      );
      router.push(`/admin/applications/${response.data.id}`);
    } catch (caught) {
      setError(message(caught));
      setPending(null);
    }
  }

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
        <LoaderCircleIcon className="size-4 animate-spin" /> 지원 정보를
        불러오는 중입니다.
      </div>
    );
  }

  if (!application) {
    return (
      <section className="grid gap-4">
        <Button asChild className="w-fit" variant="ghost">
          <Link href="/admin/applications">
            <ArrowLeftIcon /> 지원 목록
          </Link>
        </Button>
        <p className="text-destructive text-sm" role="alert">
          {error ?? "지원 정보를 찾을 수 없습니다."}
        </p>
      </section>
    );
  }

  const archived = Boolean(application.archivedAt);
  const locked = Boolean(application.documentsLockedAt);
  const documentsRequired = applicationStatusRequiresDocuments(status);
  const resumes = documents.filter((item) => item.documentType === "resume");
  const portfolios = documents.filter(
    (item) => item.documentType === "portfolio",
  );
  const disabled = pending !== null;
  const latestCollection = collections[0] ?? null;
  const latestSnapshot =
    collections.find((item) => item.snapshot)?.snapshot ?? null;
  const metadataDiffers = latestSnapshot
    ? (latestSnapshot.sourceMetadata.companyName !== null &&
        latestSnapshot.sourceMetadata.companyName !==
          application.jobPosting.companyName) ||
      (latestSnapshot.sourceMetadata.title !== null &&
        latestSnapshot.sourceMetadata.title !== application.jobPosting.title)
    : false;
  const selectedResume = documents.find(
    (item) => item.id === application.documents.resume?.id,
  );
  const selectedPortfolio = documents.find(
    (item) => item.id === application.documents.portfolio?.id,
  );
  const analysisReady = Boolean(
    latestSnapshot &&
      selectedResume?.extractionStatus === "ready" &&
      selectedResume.extractedText?.trim() &&
      selectedPortfolio?.extractionStatus === "ready" &&
      selectedPortfolio.extractedText?.trim(),
  );
  const latestAnalysis = analysisJobs[0] ?? null;

  return (
    <section className="flex w-full flex-col gap-6">
      <Button asChild className="w-fit" variant="ghost">
        <Link href="/admin/applications">
          <ArrowLeftIcon /> 지원 목록
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-primary text-sm font-semibold">
            {application.jobPosting.companyName} · {application.attemptNumber}차
            지원
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            {application.jobPosting.title}
          </h2>
          <a
            className="text-muted-foreground mt-2 inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
            href={application.jobPosting.url}
            rel="noreferrer"
            target="_blank"
          >
            Wanted 공고 보기 <ExternalLinkIcon className="size-3.5" />
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs">
            {getApplicationStatusLabel(application.status)}
          </span>
          {archived ? (
            <span className="bg-muted rounded-full px-3 py-1 text-xs">
              보관됨
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <p
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="border-border bg-card flex flex-wrap gap-2 rounded-lg border p-4">
        {!archived ? (
          <>
            <Button
              disabled={disabled}
              onClick={() => void reapply()}
              variant="outline"
            >
              <RotateCcwIcon /> 재지원 추가
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button disabled={disabled} variant="outline">
                  <ArchiveIcon /> 보관
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>지원 정보를 보관할까요?</DialogTitle>
                  <DialogDescription>
                    목록의 “보관됨” 필터에서 다시 찾고 복원할 수 있습니다.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">취소</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button onClick={() => void setArchived(true)}>보관</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <Button disabled={disabled} onClick={() => void setArchived(false)}>
            <RotateCcwIcon /> 보관 해제
          </Button>
        )}
      </div>

      {locked ? (
        <p className="border-primary/20 bg-primary/5 rounded-md border p-3 text-sm">
          제출 시점의 이력서와 포트폴리오가 영구 고정되었습니다. 다른 문서로
          지원하려면 재지원을 추가하세요.
        </p>
      ) : null}
      {archived ? (
        <p className="border-border bg-muted/40 rounded-md border p-3 text-sm">
          보관된 지원은 먼저 보관 해제한 뒤 수정할 수 있습니다.
        </p>
      ) : null}

      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList aria-label="지원 상세 영역">
          <TabsTrigger value="info">
            지원 정보
          </TabsTrigger>
          <TabsTrigger value="posting">
            채용공고
          </TabsTrigger>
          <TabsTrigger value="analysis">
            적합도 분석
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posting">
          <div className="border-border bg-card rounded-lg border p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">채용공고 원문 수집</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  Wanted의 공식 JobPosting 데이터 또는 직접 입력한 원문을
                  버전으로 보관합니다.
                </p>
              </div>
              <Button
                disabled={disabled || Boolean(activeCollection)}
                onClick={() => void collect(null)}
                type="button"
                variant="outline"
              >
                {pending === "collect" ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <RotateCcwIcon />
                )}
                {latestCollection ? "자동 수집 재시도" : "자동 수집"}
              </Button>
            </div>

            {latestCollection ? (
              <div className="border-border bg-muted/30 mt-4 rounded-md border p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {latestCollection.status === "queued" ||
                    latestCollection.status === "running"
                      ? "공고를 수집하고 있습니다."
                      : latestCollection.status === "succeeded"
                        ? "공고 원문 수집을 완료했습니다."
                        : COLLECTION_ERROR_LABELS[
                            latestCollection.errorCode ?? "INVALID_JOB_POSTING"
                          ]}
                  </span>
                  <time className="text-muted-foreground text-xs">
                    {formatApplicationDate(latestCollection.updatedAt)}
                  </time>
                </div>
                {latestCollection.retryable ? (
                  <p className="text-muted-foreground mt-2 text-xs">
                    일시적인 오류일 수 있으므로 잠시 후 다시 시도할 수 있습니다.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground mt-4 text-sm">
                아직 수집한 원문이 없습니다.
              </p>
            )}

            {latestSnapshot ? (
              <div className="mt-5 grid gap-4">
                {metadataDiffers ? (
                  <div className="border-primary/20 bg-primary/5 rounded-md border p-3 text-sm">
                    <p className="font-medium">
                      입력 정보와 Wanted 추출 정보가 다릅니다.
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      추출 회사명:{" "}
                      {latestSnapshot.sourceMetadata.companyName ?? "확인 불가"}{" "}
                      · 추출 공고명:{" "}
                      {latestSnapshot.sourceMetadata.title ?? "확인 불가"}
                    </p>
                  </div>
                ) : null}
                <dl className="text-muted-foreground grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="inline font-medium">출처 </dt>
                    <dd className="inline">
                      {latestSnapshot.source === "manual"
                        ? "직접 입력"
                        : latestSnapshot.source === "wanted_html"
                          ? "Wanted 본문 HTML"
                          : latestSnapshot.source === "wanted_ai"
                            ? "AI 보완 본문"
                            : "Wanted JSON-LD"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">파서 </dt>
                    <dd className="inline">{latestSnapshot.parserVersion}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">수집 시각 </dt>
                    <dd className="inline">
                      {formatApplicationDate(latestSnapshot.fetchedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">해시 </dt>
                    <dd className="inline font-mono">
                      {latestSnapshot.contentHash.slice(0, 12)}…
                    </dd>
                  </div>
                </dl>
                <Accordion
                  className="border-border rounded-md border px-4"
                  type="multiple"
                >
                  {Object.entries(JOB_POSTING_SECTION_LABELS).map(
                    ([key, label]) => {
                      const content =
                        latestSnapshot.sections[
                          key as keyof typeof latestSnapshot.sections
                        ];
                      return content ? (
                        <AccordionItem key={key} value={key}>
                          <AccordionTrigger>{label}</AccordionTrigger>
                          <AccordionContent>
                            <p className="text-muted-foreground max-w-prose whitespace-pre-wrap break-words text-sm leading-6">
                              {content}
                            </p>
                          </AccordionContent>
                        </AccordionItem>
                      ) : null;
                    },
                  )}
                </Accordion>
                <details className="border-border rounded-md border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    정규화된 전체 원문 보기
                  </summary>
                  <pre className="border-border bg-background mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border p-4 text-xs leading-6">
                    {latestSnapshot.normalizedContent}
                  </pre>
                </details>
              </div>
            ) : null}

            <details
              className="border-border mt-5 border-t pt-5"
              open={
                latestCollection?.status === "needs_input" ||
                latestCollection?.status === "failed"
              }
            >
              <summary className="cursor-pointer text-sm font-medium">
                원문 직접 입력
              </summary>
              <form
                className="mt-3 grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void collect(manualContent.trim());
                }}
              >
                <div className="grid gap-2 text-sm font-medium">
                  <Label htmlFor="manual-job-content">원문 직접 입력</Label>
                  <Textarea
                    className="min-h-44 resize-y"
                    maxLength={100_000}
                    minLength={100}
                    id="manual-job-content"
                    onChange={(event) => setManualContent(event.target.value)}
                    placeholder="자동 수집이 불가능하면 Wanted 공고 본문을 붙여 넣어 주세요."
                    value={manualContent}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-xs">
                    {manualContent.trim().length.toLocaleString()} / 100,000자 ·
                    최소 100자
                  </span>
                  <Button
                    disabled={
                      disabled ||
                      Boolean(activeCollection) ||
                      manualContent.trim().length < 100
                    }
                    type="submit"
                  >
                    {pending === "manual-collect" ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : null}
                    수동 원문 저장
                  </Button>
                </div>
              </form>
            </details>

            {collections.length > 1 ? (
              <details className="mt-5 text-sm">
                <summary className="cursor-pointer font-medium">
                  최근 수집 이력 {collections.length}건
                </summary>
                <ol className="mt-3 grid gap-2">
                  {collections.map((item) => (
                    <li
                      className="border-border flex flex-wrap justify-between gap-2 border-b py-2 last:border-0"
                      key={item.id}
                    >
                      <span>
                        {item.mode === "manual" ? "직접 입력" : "자동 수집"} ·{" "}
                        {item.status}
                      </span>
                      <time className="text-muted-foreground">
                        {formatApplicationDate(item.createdAt)}
                      </time>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="analysis">
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
              <div className="border-border bg-muted/30 mt-4 rounded-md border p-4 text-sm">
                <p className="font-medium">분석 준비가 필요합니다.</p>
                <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-xs">
                  {!latestSnapshot ? (
                    <li>채용공고 원문을 먼저 수집해 주세요.</li>
                  ) : null}
                  {!application.documents.resume ||
                  !application.documents.portfolio ? (
                    <li>이력서와 포트폴리오를 모두 선택하고 저장해 주세요.</li>
                  ) : null}
                  {application.documents.resume &&
                  selectedResume?.extractionStatus !== "ready" ? (
                    <li>
                      선택한 이력서의 문서 상세 화면에서 분석용 텍스트를 등록해
                      주세요.
                    </li>
                  ) : null}
                  {application.documents.portfolio &&
                  selectedPortfolio?.extractionStatus !== "ready" ? (
                    <li>
                      선택한 포트폴리오의 문서 상세 화면에서 분석용 텍스트를
                      등록해 주세요.
                    </li>
                  ) : null}
                </ul>
                <Button asChild className="mt-3" size="sm" variant="outline">
                  <Link href="/admin/documents">문서 관리로 이동</Link>
                </Button>
              </div>
            ) : null}

            {latestAnalysis ? (
              <div className="border-border mt-4 rounded-md border p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {ANALYSIS_STATUS_LABELS[latestAnalysis.status]}
                  </span>
                  <time className="text-muted-foreground text-xs">
                    {formatApplicationDate(latestAnalysis.updatedAt)}
                  </time>
                </div>
                <dl className="text-muted-foreground mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="inline font-medium">실행 회차 </dt>
                    <dd className="inline">
                      {latestAnalysis.attemptCount} / 2
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">현재 단계 </dt>
                    <dd className="inline">
                      {latestAnalysis.stage
                        ? ANALYSIS_STAGE_LABELS[latestAnalysis.stage]
                        : "대기 중"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">최근 응답 </dt>
                    <dd className="inline">
                      {latestAnalysis.lastHeartbeatAt
                        ? formatApplicationDate(latestAnalysis.lastHeartbeatAt)
                        : "아직 없음"}
                    </dd>
                  </div>
                  {latestAnalysis.retryAt ? (
                    <div>
                      <dt className="inline font-medium">다음 단계 재시도 </dt>
                      <dd className="inline">
                        {formatApplicationDate(latestAnalysis.retryAt)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                {latestAnalysis.lastError ? (
                  <p className="text-destructive mt-2 text-xs">
                    {latestAnalysis.lastError.message}
                  </p>
                ) : null}
                {analysisPollingExpired && activeAnalysisId ? (
                  <div className="border-border bg-muted/30 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">
                      자동 새로고침이 종료되었습니다. 작업은 백그라운드에서
                      계속될 수 있습니다.
                    </p>
                    <Button
                      disabled={disabled}
                      onClick={() => void refreshAnalysis(activeAnalysisId)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {pending === "analysis-refresh" ? (
                        <LoaderCircleIcon className="animate-spin" />
                      ) : (
                        <RotateCcwIcon />
                      )}
                      상태 새로고침
                    </Button>
                  </div>
                ) : null}
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
                            이미 실행 중인 외부 요청은 즉시 중단되지 않을 수
                            있지만, 이후 도착한 결과는 저장되지 않습니다.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="outline">계속 진행</Button>
                          </DialogClose>
                          <DialogClose asChild>
                            <Button
                              onClick={() =>
                                void cancelAnalysis(latestAnalysis.id)
                              }
                            >
                              취소 확정
                            </Button>
                          </DialogClose>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  ) : null}
                </div>
                {latestAnalysis.result ? (
                  <div className="mt-4 grid gap-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <strong className="text-primary text-3xl">
                        {latestAnalysis.result.fitScore}점
                      </strong>
                      <span className="text-muted-foreground text-xs">
                        요구사항 {latestAnalysis.result.job.requirements.length}
                        개 · 부족 역량{" "}
                        {latestAnalysis.result.comparison.gaps.length}개 · 면접
                        질문{" "}
                        {
                          latestAnalysis.result.comparison.interviewQuestions
                            .length
                        }
                        개
                      </span>
                    </div>
                    <p className="leading-6">
                      {latestAnalysis.result.comparison.summary}
                    </p>
                    <Button asChild className="w-fit" size="sm">
                      <Link
                        href={`/admin/applications/${application.id}/analyses/${latestAnalysis.id}`}
                      >
                        상세 결과 및 면접 준비
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground mt-4 text-sm">
                아직 실행한 분석이 없습니다.
              </p>
            )}

            {analysisJobs.length > 1 ? (
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
                        href={`/admin/applications/${application.id}/analyses/${item.id}`}
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
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="info">
          <form
            className="border-border bg-card grid gap-5 rounded-lg border p-5 sm:grid-cols-2"
            key={application.updatedAt}
            onSubmit={save}
          >
            <div className="grid gap-2 text-sm font-medium">
              <Label htmlFor="detail-company">회사명</Label>
              <Input
                id="detail-company"
                defaultValue={application.jobPosting.companyName}
                disabled={archived}
                maxLength={200}
                name="companyName"
                required
              />
            </div>
            <div className="grid gap-2 text-sm font-medium">
              <Label htmlFor="detail-title">공고 제목</Label>
              <Input
                id="detail-title"
                defaultValue={application.jobPosting.title}
                disabled={archived}
                maxLength={300}
                name="title"
                required
              />
            </div>
            <div className="grid gap-2 text-sm font-medium">
              <Label htmlFor="detail-status">지원 상태</Label>
              <Select
                disabled={archived}
                name="status"
                onValueChange={(value) => setStatus(value as ApplicationStatus)}
                value={status}
              >
                <SelectTrigger id="detail-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPLICATION_STATUS_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 text-sm font-medium">
              <Label htmlFor="detail-applied-on">지원일</Label>
              <Input
                id="detail-applied-on"
                defaultValue={application.appliedOn ?? ""}
                disabled={archived}
                name="appliedOn"
                type="date"
              />
            </div>
            <div className="grid gap-2 text-sm font-medium sm:col-span-2">
              <Label htmlFor="detail-interview-at">면접 일정</Label>
              <Input
                id="detail-interview-at"
                defaultValue={toLocalDateTimeInput(application.interviewAt)}
                disabled={archived}
                name="interviewAt"
                type="datetime-local"
              />
            </div>
            <div className="grid gap-2 text-sm font-medium">
              <Label htmlFor="detail-resume">
                이력서 버전 {documentsRequired ? "(필수)" : "(선택)"}
              </Label>
              <Select
                defaultValue={application.documents.resume?.id ?? "none"}
                disabled={archived || locked}
                name="resumeVersionId"
                required={documentsRequired}
              >
                <SelectTrigger id="detail-resume">
                  <SelectValue placeholder="선택하지 않음" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택하지 않음</SelectItem>
                  {resumes.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                      {item.isDefault ? " · 기본" : ""}
                    </SelectItem>
                  ))}
                  {application.documents.resume?.archivedAt ? (
                    <SelectItem value={application.documents.resume.id}>
                      {application.documents.resume.label} · 보관됨
                    </SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 text-sm font-medium">
              <Label htmlFor="detail-portfolio">
                포트폴리오 버전 {documentsRequired ? "(필수)" : "(선택)"}
              </Label>
              <Select
                defaultValue={application.documents.portfolio?.id ?? "none"}
                disabled={archived || locked}
                name="portfolioVersionId"
                required={documentsRequired}
              >
                <SelectTrigger id="detail-portfolio">
                  <SelectValue placeholder="선택하지 않음" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택하지 않음</SelectItem>
                  {portfolios.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                      {item.isDefault ? " · 기본" : ""}
                    </SelectItem>
                  ))}
                  {application.documents.portfolio?.archivedAt ? (
                    <SelectItem value={application.documents.portfolio.id}>
                      {application.documents.portfolio.label} · 보관됨
                    </SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 text-sm font-medium sm:col-span-2">
              <Label htmlFor="detail-note">메모</Label>
              <Textarea
                className="min-h-44 resize-y"
                defaultValue={application.note ?? ""}
                disabled={archived}
                maxLength={10_000}
                id="detail-note"
                name="note"
              />
            </div>
            <div className="text-muted-foreground text-xs sm:col-span-2">
              최근 수정 {formatApplicationDate(application.updatedAt)}
            </div>
            {!archived ? (
              <div className="flex justify-end sm:col-span-2">
                <Button disabled={disabled} type="submit">
                  {pending === "save" ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : null}{" "}
                  저장
                </Button>
              </div>
            ) : null}
          </form>

          <div className="border-border bg-card rounded-lg border p-5">
            <h3 className="font-semibold">상태 변경 이력</h3>
            <ol className="mt-4 grid gap-3">
              {application.statusHistory.map((history) => (
                <li
                  className="border-border flex flex-wrap justify-between gap-2 border-b pb-3 text-sm last:border-0 last:pb-0"
                  key={history.id}
                >
                  <span>
                    {history.fromStatus
                      ? `${getApplicationStatusLabel(history.fromStatus)} → `
                      : "등록 · "}
                    {getApplicationStatusLabel(history.toStatus)}
                  </span>
                  <time className="text-muted-foreground">
                    {formatApplicationDate(history.changedAt)}
                  </time>
                </li>
              ))}
            </ol>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
