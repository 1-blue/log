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

import { ArrowLeftIcon, LoaderCircleIcon } from "lucide-react";

import {
  APPLICATION_STATUS_OPTIONS,
  toUtcTimestamp,
} from "#/libs/application-ui";
import {
  createApplication,
  createJobPostingCollection,
  listDocumentVersions,
  WorkerApiError,
} from "#/libs/worker-client";

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
      const resumeVersionId = String(data.get("resumeVersionId") ?? "");
      const portfolioVersionId = String(data.get("portfolioVersionId") ?? "");
      if (
        documentsRequired &&
        (resumeVersionId === "none" || portfolioVersionId === "none")
      ) {
        setError("필수 문서 버전을 선택해 주세요.");
        return;
      }
      const response = await createApplication({
        appliedOn: String(data.get("appliedOn") ?? "") || null,
        companyName: String(data.get("companyName") ?? "").trim(),
        interviewAt: toUtcTimestamp(String(data.get("interviewAt") ?? "")),
        note: String(data.get("note") ?? "").trim() || null,
        portfolioVersionId:
          portfolioVersionId && portfolioVersionId !== "none"
            ? portfolioVersionId
            : null,
        resumeVersionId:
          resumeVersionId && resumeVersionId !== "none"
            ? resumeVersionId
            : null,
        source: "wanted",
        status,
        title: String(data.get("title") ?? "").trim(),
        url: String(data.get("url") ?? "").trim(),
      });
      try {
        const collection = await createJobPostingCollection(
          response.data.jobPosting.id,
          { manualContent: null },
        );
        router.push(
          `/admin/applications/${response.data.id}?collectionRunId=${collection.data.id}`,
        );
      } catch {
        router.push(
          `/admin/applications/${response.data.id}?collection=dispatch_failed`,
        );
      }
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
        <div className="grid gap-2 text-sm font-medium sm:col-span-2">
          <Label htmlFor="application-url">Wanted 공고 URL</Label>
          <Input
            id="application-url"
            name="url"
            placeholder="https://www.wanted.co.kr/wd/384409"
            required
            type="url"
          />
        </div>
        <div className="grid gap-2 text-sm font-medium">
          <Label htmlFor="application-company">회사명</Label>
          <Input
            id="application-company"
            maxLength={200}
            name="companyName"
            required
          />
        </div>
        <div className="grid gap-2 text-sm font-medium">
          <Label htmlFor="application-title">공고 제목</Label>
          <Input id="application-title" maxLength={300} name="title" required />
        </div>
        <div className="grid gap-2 text-sm font-medium">
          <Label htmlFor="application-status">지원 상태</Label>
          <Select
            name="status"
            onValueChange={(value) => setStatus(value as ApplicationStatus)}
            value={status}
          >
            <SelectTrigger id="application-status">
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
          <Label htmlFor="application-date">지원일</Label>
          <Input id="application-date" name="appliedOn" type="date" />
        </div>
        <div className="grid gap-2 text-sm font-medium sm:col-span-2">
          <Label htmlFor="application-interview-at">면접 일정</Label>
          <Input
            id="application-interview-at"
            name="interviewAt"
            type="datetime-local"
          />
        </div>
        <div className="grid gap-2 text-sm font-medium">
          <Label htmlFor="application-resume">
            이력서 버전 {documentsRequired ? "(필수)" : "(선택)"}
          </Label>
          <Select
            defaultValue={resumes.find((item) => item.isDefault)?.id ?? "none"}
            disabled={loadingDocuments}
            key={resumes.find((item) => item.isDefault)?.id ?? "resume-empty"}
            name="resumeVersionId"
            required={documentsRequired}
          >
            <SelectTrigger id="application-resume">
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
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 text-sm font-medium">
          <Label htmlFor="application-portfolio">
            포트폴리오 버전 {documentsRequired ? "(필수)" : "(선택)"}
          </Label>
          <Select
            defaultValue={
              portfolios.find((item) => item.isDefault)?.id ?? "none"
            }
            disabled={loadingDocuments}
            key={
              portfolios.find((item) => item.isDefault)?.id ?? "portfolio-empty"
            }
            name="portfolioVersionId"
            required={documentsRequired}
          >
            <SelectTrigger id="application-portfolio">
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
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 text-sm font-medium sm:col-span-2">
          <Label htmlFor="application-note">메모</Label>
          <Textarea
            className="min-h-36 resize-y"
            id="application-note"
            maxLength={10_000}
            name="note"
          />
        </div>
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
