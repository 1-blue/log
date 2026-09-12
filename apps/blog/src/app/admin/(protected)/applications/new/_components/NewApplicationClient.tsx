"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  type ApplicationStatus,
  applicationStatusRequiresDocuments,
  type DocumentVersion,
} from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";

import { ArrowLeftIcon, LoaderCircleIcon } from "lucide-react";

import {
  APPLICATION_STATUS_OPTIONS,
  toUtcTimestamp,
} from "#/libs/application-ui";
import {
  createApplication,
  listDocumentVersions,
  WorkerApiError,
} from "#/libs/worker-client";

const fieldClassName =
  "border-input bg-background focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2";

function message(error: unknown) {
  return error instanceof WorkerApiError
    ? error.message
    : "지원 정보를 등록하지 못했습니다.";
}

export default function NewApplicationClient() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentVersion[]>([]);
  const [status, setStatus] = useState<ApplicationStatus>("interested");
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  useEffect(() => {
    void listDocumentVersions({ archived: "exclude" })
      .then((response) => setDocuments(response.data.items))
      .catch((caught) => setError(message(caught)))
      .finally(() => setLoadingDocuments(false));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setDuplicateId(null);

    try {
      const response = await createApplication({
        appliedOn: String(data.get("appliedOn") ?? "") || null,
        companyName: String(data.get("companyName") ?? "").trim(),
        interviewAt: toUtcTimestamp(String(data.get("interviewAt") ?? "")),
        note: String(data.get("note") ?? "").trim() || null,
        portfolioVersionId:
          String(data.get("portfolioVersionId") ?? "") || null,
        resumeVersionId: String(data.get("resumeVersionId") ?? "") || null,
        source: "wanted",
        status,
        title: String(data.get("title") ?? "").trim(),
        url: String(data.get("url") ?? "").trim(),
      });
      router.push(`/admin/applications/${response.data.id}`);
    } catch (caught) {
      setError(message(caught));
      if (
        caught instanceof WorkerApiError &&
        caught.details?.reason === "duplicate_job_posting"
      ) {
        setDuplicateId(caught.details.latestApplicationId ?? null);
      }
    } finally {
      setPending(false);
    }
  }

  const resumes = documents.filter((item) => item.documentType === "resume");
  const portfolios = documents.filter(
    (item) => item.documentType === "portfolio",
  );
  const documentsRequired = applicationStatusRequiresDocuments(status);

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <Button asChild className="w-fit" variant="ghost">
        <Link href="/admin/applications">
          <ArrowLeftIcon /> 지원 목록
        </Link>
      </Button>
      <div>
        <h2 className="text-2xl font-bold">채용공고 등록</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Wanted 공고와 이번 지원에서 사용할 문서 버전을 기록합니다.
        </p>
      </div>

      {error ? (
        <div
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
          role="alert"
        >
          <p>{error}</p>
          {duplicateId ? (
            <Link
              className="mt-2 inline-block underline"
              href={`/admin/applications/${duplicateId}`}
            >
              기존 공고에서 재지원 등록하기
            </Link>
          ) : null}
        </div>
      ) : null}

      <form
        className="border-border bg-card grid gap-5 rounded-lg border p-5 sm:grid-cols-2"
        onSubmit={handleSubmit}
      >
        <label className="grid gap-2 text-sm font-medium sm:col-span-2">
          Wanted 공고 URL
          <input
            className={fieldClassName}
            name="url"
            placeholder="https://www.wanted.co.kr/wd/384409"
            required
            type="url"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          회사명
          <input
            className={fieldClassName}
            maxLength={200}
            name="companyName"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          공고 제목
          <input
            className={fieldClassName}
            maxLength={300}
            name="title"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          지원 상태
          <select
            className={fieldClassName}
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
          <input className={fieldClassName} name="appliedOn" type="date" />
        </label>
        <label className="grid gap-2 text-sm font-medium sm:col-span-2">
          면접 일정
          <input
            className={fieldClassName}
            name="interviewAt"
            type="datetime-local"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          이력서 버전 {documentsRequired ? "(필수)" : "(선택)"}
          <select
            className={fieldClassName}
            defaultValue={resumes.find((item) => item.isDefault)?.id ?? ""}
            disabled={loadingDocuments}
            key={resumes.find((item) => item.isDefault)?.id ?? "resume-empty"}
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
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          포트폴리오 버전 {documentsRequired ? "(필수)" : "(선택)"}
          <select
            className={fieldClassName}
            defaultValue={portfolios.find((item) => item.isDefault)?.id ?? ""}
            disabled={loadingDocuments}
            key={
              portfolios.find((item) => item.isDefault)?.id ?? "portfolio-empty"
            }
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
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium sm:col-span-2">
          메모
          <textarea
            className={`${fieldClassName} min-h-36 resize-y`}
            maxLength={10_000}
            name="note"
          />
        </label>
        <div className="flex justify-end sm:col-span-2">
          <Button disabled={pending || loadingDocuments} type="submit">
            {pending ? <LoaderCircleIcon className="animate-spin" /> : null}
            등록
          </Button>
        </div>
      </form>
    </section>
  );
}
