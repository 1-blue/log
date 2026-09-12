"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  type ApplicationDetail,
  type ApplicationStatus,
  applicationStatusRequiresDocuments,
  type DocumentVersion,
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
  getApplication,
  listDocumentVersions,
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

export default function ApplicationDetailClient({
  applicationId,
}: Readonly<{ applicationId: string }>) {
  const router = useRouter();
  const [application, setApplication] = useState<ApplicationDetail | null>(
    null,
  );
  const [documents, setDocuments] = useState<DocumentVersion[]>([]);
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
    } catch (caught) {
      setError(message(caught));
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

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
