"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
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

import {
  ArchiveIcon,
  ArrowLeftIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
} from "lucide-react";

import {
  APPLICATION_STATUS_OPTIONS,
  formatApplicationDate,
  getApplicationStatusLabel,
  toLocalDateTimeInput,
  toUtcTimestamp,
} from "#/libs/application-ui";
import {
  createApplicationAttempt,
  createJobPostingCollection,
  getApplication,
  getJobPostingCollection,
  listDocumentVersions,
  listJobPostingCollections,
  updateApplication,
  updateJobPosting,
  WorkerApiError,
} from "#/libs/worker-client";

const fieldClassName =
  "border-input bg-background focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60";

function message(error: unknown) {
  return error instanceof WorkerApiError
    ? error.message
    : "요청을 처리하지 못했습니다.";
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

function upsertCollection(
  current: JobPostingCollectionRun[],
  next: JobPostingCollectionRun,
) {
  return [next, ...current.filter((item) => item.id !== next.id)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
}

export default function ApplicationDetailClient({
  applicationId,
}: Readonly<{ applicationId: string }>) {
  const router = useRouter();
  const [application, setApplication] = useState<ApplicationDetail | null>(
    null,
  );
  const [documents, setDocuments] = useState<DocumentVersion[]>([]);
  const [collections, setCollections] = useState<JobPostingCollectionRun[]>([]);
  const [manualContent, setManualContent] = useState("");
  const [status, setStatus] = useState<ApplicationStatus>("interested");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        const collectionsResponse = await listJobPostingCollections(
          applicationResponse.data.jobPosting.id,
        );
        setCollections(collectionsResponse.data.items);
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
          : String(data.get("portfolioVersionId") ?? "") || null,
        resumeVersionId: application.documentsLockedAt
          ? (application.documents.resume?.id ?? null)
          : String(data.get("resumeVersionId") ?? "") || null,
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

  return (
    <section className="flex max-w-4xl flex-col gap-6">
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

      <div className="border-border bg-card rounded-lg border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">채용공고 원문 수집</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Wanted의 공식 JobPosting 데이터 또는 직접 입력한 원문을 버전으로
              보관합니다.
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
                  {latestSnapshot.sourceMetadata.companyName ?? "확인 불가"} ·
                  추출 공고명:{" "}
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
            <pre className="border-border bg-background max-h-96 overflow-auto whitespace-pre-wrap rounded-md border p-4 text-xs leading-6">
              {latestSnapshot.normalizedContent}
            </pre>
          </div>
        ) : null}

        <form
          className="border-border mt-5 grid gap-3 border-t pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            void collect(manualContent.trim());
          }}
        >
          <label className="grid gap-2 text-sm font-medium">
            원문 직접 입력
            <textarea
              className={`${fieldClassName} min-h-44 resize-y`}
              maxLength={100_000}
              minLength={100}
              onChange={(event) => setManualContent(event.target.value)}
              placeholder="자동 수집이 불가능하면 Wanted 공고 본문을 붙여 넣어 주세요."
              value={manualContent}
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-xs">
              {manualContent.trim().length.toLocaleString()} / 100,000자 · 최소
              100자
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

      <form
        className="border-border bg-card grid gap-5 rounded-lg border p-5 sm:grid-cols-2"
        key={application.updatedAt}
        onSubmit={save}
      >
        <label className="grid gap-2 text-sm font-medium">
          회사명
          <input
            className={fieldClassName}
            defaultValue={application.jobPosting.companyName}
            disabled={archived}
            maxLength={200}
            name="companyName"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          공고 제목
          <input
            className={fieldClassName}
            defaultValue={application.jobPosting.title}
            disabled={archived}
            maxLength={300}
            name="title"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          지원 상태
          <select
            className={fieldClassName}
            disabled={archived}
            name="status"
            onChange={(event) =>
              setStatus(event.target.value as ApplicationStatus)
            }
            value={status}
          >
            {APPLICATION_STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          지원일
          <input
            className={fieldClassName}
            defaultValue={application.appliedOn ?? ""}
            disabled={archived}
            name="appliedOn"
            type="date"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium sm:col-span-2">
          면접 일정
          <input
            className={fieldClassName}
            defaultValue={toLocalDateTimeInput(application.interviewAt)}
            disabled={archived}
            name="interviewAt"
            type="datetime-local"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          이력서 버전 {documentsRequired ? "(필수)" : "(선택)"}
          <select
            className={fieldClassName}
            defaultValue={application.documents.resume?.id ?? ""}
            disabled={archived || locked}
            name="resumeVersionId"
            required={documentsRequired}
          >
            <option value="">선택하지 않음</option>
            {resumes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
                {item.isDefault ? " · 기본" : ""}
              </option>
            ))}
            {application.documents.resume?.archivedAt ? (
              <option value={application.documents.resume.id}>
                {application.documents.resume.label} · 보관됨
              </option>
            ) : null}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          포트폴리오 버전 {documentsRequired ? "(필수)" : "(선택)"}
          <select
            className={fieldClassName}
            defaultValue={application.documents.portfolio?.id ?? ""}
            disabled={archived || locked}
            name="portfolioVersionId"
            required={documentsRequired}
          >
            <option value="">선택하지 않음</option>
            {portfolios.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
                {item.isDefault ? " · 기본" : ""}
              </option>
            ))}
            {application.documents.portfolio?.archivedAt ? (
              <option value={application.documents.portfolio.id}>
                {application.documents.portfolio.label} · 보관됨
              </option>
            ) : null}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium sm:col-span-2">
          메모
          <textarea
            className={`${fieldClassName} min-h-44 resize-y`}
            defaultValue={application.note ?? ""}
            disabled={archived}
            maxLength={10_000}
            name="note"
          />
        </label>
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
    </section>
  );
}
