import Link from "next/link";

import type { ApplicationDetail } from "@workspace/contracts";
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
  RotateCcwIcon,
} from "lucide-react";

import { getApplicationStatusLabel } from "#/libs/application-ui";

import { DeleteResourceDialog } from "../../../../_components/DeleteResourceDialog";

export function ApplicationDetailHeader({
  application,
  archived,
  changeTab,
  disabled,
  error,
  locked,
  reapply,
  setArchived,
}: Readonly<{
  application: ApplicationDetail;
  archived: boolean;
  changeTab: (value: string) => void;
  disabled: boolean;
  error: string | null;
  locked: boolean;
  reapply: () => Promise<void>;
  setArchived: (archived: boolean) => Promise<void>;
}>) {
  return (
    <>
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

      {application.jobPosting.metadataStatus === "pending" ? (
        <div
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200"
          role="status"
        >
          <p className="font-medium">공고 정보를 확인하는 중입니다.</p>
          <p className="mt-1">
            자동 수집이 끝나면 회사명과 공고명이 제안됩니다. 현재 임시 정보로는
            분석과 Slack 알림을 시작하지 않는 것이 안전합니다.
          </p>
          <button
            className="mt-3 underline underline-offset-4"
            onClick={() => changeTab("posting")}
            type="button"
          >
            채용공고 수집 상태 확인
          </button>
        </div>
      ) : null}

      <ApplicationActions
        applicationId={application.id}
        archived={archived}
        disabled={disabled}
        reapply={reapply}
        setArchived={setArchived}
      />

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
    </>
  );
}

function ApplicationActions({
  applicationId,
  archived,
  disabled,
  reapply,
  setArchived,
}: Readonly<{
  applicationId: string;
  archived: boolean;
  disabled: boolean;
  reapply: () => Promise<void>;
  setArchived: (archived: boolean) => Promise<void>;
}>) {
  return (
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
      {archived && (
        <DeleteResourceDialog
          targetType="application"
          targetId={applicationId}
          disabled={disabled}
        />
      )}
    </div>
  );
}
