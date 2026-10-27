"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";

import {
  type ApplicationDetail,
  type ApplicationStatus,
  applicationStatusRequiresDocuments,
} from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";
import { Label } from "@workspace/ui/components/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/Select";

import { LoaderCircleIcon } from "lucide-react";

import { APPLICATION_STATUS_OPTIONS } from "#/libs/application-ui";
import {
  getApplication,
  updateApplication,
  WorkerApiError,
} from "#/libs/worker-client";

import { ApplicationStatusBadge } from "./ApplicationStatusBadge";

async function persistStatus(applicationId: string, status: ApplicationStatus) {
  return (await updateApplication(applicationId, { status })).data;
}

export function ApplicationStatusPanel({
  applicationId,
  status,
  application: supplied,
  disabled = false,
  preview = false,
  onSaved,
  onRequireDocuments,
  updateStatus = persistStatus,
}: Readonly<{
  applicationId: string;
  status: ApplicationStatus;
  application?: ApplicationDetail;
  disabled?: boolean;
  preview?: boolean;
  onSaved?: (application: ApplicationDetail) => void;
  onRequireDocuments?: () => void;
  updateStatus?: (
    applicationId: string,
    status: ApplicationStatus,
  ) => Promise<ApplicationDetail>;
}>) {
  const selectId = useId();
  const [loaded, setLoaded] = useState<ApplicationDetail | null>(null);
  const [draft, setDraft] = useState(status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const application = supplied ?? loaded;
  const currentStatus = application?.status ?? status;
  const archived = Boolean(application?.archivedAt);
  const missingDocuments =
    applicationStatusRequiresDocuments(draft) &&
    (!application?.documents.resume || !application.documents.portfolio);

  useEffect(() => {
    setDraft(currentStatus);
  }, [currentStatus]);
  useEffect(() => {
    if (supplied || preview) return;
    let stopped = false;
    void getApplication(applicationId)
      .then((response) => {
        if (!stopped) setLoaded(response.data);
      })
      .catch(() => {
        if (!stopped)
          setError(
            "지원 상태를 불러오지 못했습니다. 페이지를 새로고침해 주세요.",
          );
      });
    return () => {
      stopped = true;
    };
  }, [applicationId, supplied, preview]);

  async function saveStatus() {
    if (
      !application ||
      archived ||
      missingDocuments ||
      pending ||
      disabled ||
      preview
    )
      return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      // Send only the status: never overwrite notes, dates or submitted documents
      // with values left in another tab's form.
      const updated = await updateStatus(applicationId, draft);
      setLoaded(updated);
      onSaved?.(updated);
      setNotice("지원 상태를 변경했습니다.");
    } catch (caught) {
      setError(
        caught instanceof WorkerApiError
          ? caught.message
          : "지원 상태를 변경하지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-label="지원 상태 관리"
      className="border-border bg-card grid gap-3 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">현재 지원 상태</h3>
          <ApplicationStatusBadge status={currentStatus} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label className="sr-only" htmlFor={selectId}>
            변경할 지원 상태
          </Label>
          <Select
            value={draft}
            onValueChange={(value) => {
              setDraft(value as ApplicationStatus);
              setNotice(null);
              setError(null);
            }}
            disabled={
              disabled || pending || archived || preview || !application
            }
          >
            <SelectTrigger id={selectId} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPLICATION_STATUS_OPTIONS.map(([value]) => (
                <SelectItem key={value} value={value}>
                  <ApplicationStatusBadge status={value} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => void saveStatus()}
            disabled={
              disabled ||
              pending ||
              archived ||
              preview ||
              !application ||
              draft === currentStatus ||
              missingDocuments
            }
            size="sm"
            type="button"
          >
            {pending ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : null}{" "}
            상태 저장
          </Button>
        </div>
      </div>
      {missingDocuments && draft !== currentStatus && !archived ? (
        <p className="text-sm text-amber-800 dark:text-amber-300" role="status">
          이 상태로 변경하려면 이력서와 포트폴리오를 먼저 선택해야 합니다.{" "}
          {onRequireDocuments ? (
            <button
              type="button"
              className="underline"
              onClick={onRequireDocuments}
            >
              지원 정보에서 문서 선택
            </button>
          ) : (
            <Link
              className="underline"
              href={`/admin/applications/${applicationId}?tab=info`}
            >
              지원 정보에서 문서 선택
            </Link>
          )}
        </p>
      ) : !application?.documentsLockedAt &&
        applicationStatusRequiresDocuments(draft) &&
        draft !== currentStatus ? (
        <p className="text-muted-foreground text-xs">
          저장하면 현재 선택한 이력서·포트폴리오가 제출 문서로 고정됩니다.
        </p>
      ) : null}
      {archived ? (
        <p className="text-muted-foreground text-xs">
          보관된 지원입니다. 지원 상세에서 보관을 해제한 뒤 상태를 변경할 수
          있습니다.
        </p>
      ) : null}
      {preview ? (
        <p className="text-muted-foreground text-xs">
          미리보기에서는 지원 상태를 변경하지 않습니다.
        </p>
      ) : null}
      <div aria-live="polite">
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="text-muted-foreground text-sm">{notice}</p>
        ) : null}
      </div>
    </section>
  );
}
