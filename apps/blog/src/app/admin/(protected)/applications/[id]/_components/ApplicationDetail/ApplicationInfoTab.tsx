import type { FormEvent } from "react";

import type {
  ApplicationDetail,
  ApplicationStatus,
  DocumentVersion,
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

import { LoaderCircleIcon } from "lucide-react";

import {
  APPLICATION_STATUS_OPTIONS,
  formatApplicationDate,
  getApplicationStatusLabel,
  toLocalDateTimeInput,
} from "#/libs/application-ui";

export function ApplicationInfoTab({
  application,
  archived,
  disabled,
  documentsRequired,
  locked,
  pending,
  portfolios,
  resumes,
  save,
  setStatus,
  status,
}: Readonly<{
  application: ApplicationDetail;
  archived: boolean;
  disabled: boolean;
  documentsRequired: boolean;
  locked: boolean;
  pending: string | null;
  portfolios: DocumentVersion[];
  resumes: DocumentVersion[];
  save: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  setStatus: (status: ApplicationStatus) => void;
  status: ApplicationStatus;
}>) {
  return (
    <>
      <form
        className="border-border bg-card grid gap-5 rounded-lg border p-5 sm:grid-cols-2"
        key={application.updatedAt}
        onSubmit={(event) => void save(event)}
      >
        <div className="grid gap-2 text-sm font-medium">
          <Label htmlFor="detail-company">회사명</Label>
          <Input
            defaultValue={application.jobPosting.companyName}
            disabled={archived}
            id="detail-company"
            maxLength={200}
            name="companyName"
            required
          />
        </div>
        <div className="grid gap-2 text-sm font-medium">
          <Label htmlFor="detail-title">공고 제목</Label>
          <Input
            defaultValue={application.jobPosting.title}
            disabled={archived}
            id="detail-title"
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
            defaultValue={application.appliedOn ?? ""}
            disabled={archived}
            id="detail-applied-on"
            name="appliedOn"
            type="date"
          />
        </div>
        <div className="grid gap-2 text-sm font-medium sm:col-span-2">
          <Label htmlFor="detail-interview-at">면접 일정</Label>
          <Input
            defaultValue={toLocalDateTimeInput(application.interviewAt)}
            disabled={archived}
            id="detail-interview-at"
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
            id="detail-note"
            maxLength={10_000}
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
    </>
  );
}
