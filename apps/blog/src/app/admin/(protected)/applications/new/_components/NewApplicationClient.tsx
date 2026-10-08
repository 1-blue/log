"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  type ApplicationStatus,
  applicationStatusRequiresDocuments,
  canAutomaticallyCollectJobUrl,
  detectJobPlatform,
  type DocumentVersion,
  jobPlatformLabel,
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
  const [url, setUrl] = useState("");
  const [unknownPlatform, setUnknownPlatform] = useState("other");
  const platform = detectJobPlatform(url);

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
        companyName: String(data.get("companyName") ?? "").trim() || null,
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
        source: platform === "other" ? unknownPlatform : platform,
        status,
        title: String(data.get("title") ?? "").trim() || null,
        url: String(data.get("url") ?? "").trim(),
      });
      try {
        const collection = await createJobPostingCollection(
          response.data.jobPosting.id,
          {
            manualContent:
              String(data.get("manualContent") ?? "").trim() || null,
          },
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
          공고 URL을 등록하면 플랫폼을 확인합니다. 수집한 원문 또는 직접 입력한
          원문을 AI가 공통 형식으로 구조화하며, 결과의 회사명과 공고명을
          확인·수정할 수 있습니다.
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
          <Label htmlFor="application-url">채용공고 URL</Label>
          <Input
            id="application-url"
            name="url"
            placeholder="https://www.wanted.co.kr/wd/384409"
            required
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          {url ? (
            <p className="text-muted-foreground text-xs">
              플랫폼:{" "}
              {jobPlatformLabel(
                platform === "other" ? unknownPlatform : platform,
                url,
              )}
            </p>
          ) : null}
          {platform === "other" ? (
            <Select value={unknownPlatform} onValueChange={setUnknownPlatform}>
              <SelectTrigger aria-label="알 수 없는 사이트 분류">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="other">기타 사이트</SelectItem>
                <SelectItem value="company">자사 채용 홈페이지</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="application-manual-content">
            공고 원문 (자동 수집이 어려운 경우)
          </Label>
          <Textarea
            id="application-manual-content"
            name="manualContent"
            minLength={100}
            maxLength={100_000}
            placeholder="회사·직무 소개, 주요 업무, 자격요건과 우대사항 등 공고 본문을 붙여 넣어 주세요."
            rows={7}
          />
          <p className="text-muted-foreground text-xs">
            {canAutomaticallyCollectJobUrl(url)
              ? "원문을 입력하지 않으면 자동 수집을 시도합니다."
              : "이 링크는 직접 입력한 원문으로 분석합니다. 로그인·접근 차단을 우회해 수집하지 않습니다."}
          </p>
        </div>
        <div className="grid gap-2 text-sm font-medium">
          <Label htmlFor="application-company">회사명 (선택)</Label>
          <Input
            id="application-company"
            maxLength={200}
            name="companyName"
            placeholder="수집 후 자동 확인"
          />
        </div>
        <div className="grid gap-2 text-sm font-medium">
          <Label htmlFor="application-title">공고 제목 (선택)</Label>
          <Input
            id="application-title"
            maxLength={300}
            name="title"
            placeholder="수집 후 자동 확인"
          />
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
