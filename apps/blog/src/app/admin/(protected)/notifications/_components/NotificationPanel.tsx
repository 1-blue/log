"use client";
import { useState } from "react";
import Link from "next/link";

import type {
  SlackNotificationListItem,
  SlackNotificationStatus,
} from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";

const labels: Record<SlackNotificationStatus, string> = {
  queued: "대기 중",
  dispatching: "전달 중",
  sent: "발송 완료",
  failed: "발송 실패",
  delivery_unknown: "전달 여부 불명",
  skipped: "발송 생략",
};
const eventLabels: Record<SlackNotificationListItem["eventType"], string> = {
  document_uploaded: "문서 업로드 접수",
  document_extraction_succeeded: "AI OCR 완료",
  document_extraction_failed: "AI OCR 실패",
  job_posting_registered: "공고 알림 시작",
  collection_succeeded: "공고 수집 완료",
  collection_needs_input: "공고 입력 필요",
  collection_failed: "공고 수집 실패",
  analysis_queued: "분석 접수",
  analysis_succeeded: "분석 완료",
  analysis_retrying: "분석 재시도",
  analysis_failed: "분석 실패",
  analysis_cancelled: "분석 취소",
  application_status_changed: "지원 상태 변경",
  interview_scheduled: "면접 일정",
};

export default function NotificationPanel({
  items,
  pending = false,
  error = null,
  onRefresh,
  onRetry,
}: {
  items: SlackNotificationListItem[];
  pending?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onRetry?: (
    item: SlackNotificationListItem,
    confirmed: boolean,
  ) => Promise<void>;
}) {
  const [selected, setSelected] = useState<SlackNotificationListItem | null>(
    null,
  );
  const [confirmed, setConfirmed] = useState(false);
  const choose = (item: SlackNotificationListItem) => {
    setSelected(item);
    setConfirmed(false);
  };
  const selectedCurrent = selected
    ? items.find((item) => item.id === selected.id)
    : null;
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Slack 알림 기록</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            최근 100건과 대기 중인 답글을 막고 있는 이전 루트 알림을 표시합니다.
          </p>
        </div>
        <Button
          onClick={onRefresh}
          disabled={pending || !onRefresh}
          variant="outline"
        >
          {pending ? "처리 중…" : "새로고침"}
        </Button>
      </div>
      <p className="bg-muted rounded-lg p-4 text-sm leading-6">
        전달 여부가 불명인 알림은 자동으로 재전송하지 않습니다. Slack에서 기존
        메시지를 확인해야 중복을 피할 수 있습니다. 공고 루트 알림을 복구하면 그
        뒤에 대기한 분석·상태 알림도 순서대로 전달됩니다.
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {selected && (
        <div
          role="region"
          aria-label="알림 재전송 확인"
          className="border-primary space-y-3 rounded-lg border p-4"
        >
          <h2 className="font-semibold">
            {eventLabels[selected.eventType]} 재전송
          </h2>
          <p className="text-sm">{selected.label}</p>
          {selected.status === "delivery_unknown" && (
            <label className="flex items-start gap-2 text-sm leading-6">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1"
              />
              Slack에서 기존 메시지를 확인했습니다. 중복 메시지가 생길 수 있음을
              이해하고 재전송합니다.
            </label>
          )}
          <div className="flex gap-2">
            <Button
              disabled={
                pending ||
                !onRetry ||
                selectedCurrent?.updatedAt !== selected.updatedAt ||
                (selected.status === "delivery_unknown" && !confirmed)
              }
              onClick={async () => {
                if (onRetry) {
                  await onRetry(selected, confirmed);
                  setSelected(null);
                }
              }}
            >
              재전송 요청
            </Button>
            <Button
              variant="outline"
              onClick={() => setSelected(null)}
              disabled={pending}
            >
              취소
            </Button>
          </div>
        </div>
      )}
      {!items.length && !error && (
        <p className="text-muted-foreground" role="status">
          {pending
            ? "알림 기록을 불러오는 중입니다."
            : "아직 알림 기록이 없습니다."}
        </p>
      )}
      <ul className="space-y-3">
        {items.map((item) => {
          const root = item.blockedByRootId
            ? items.find((root) => root.id === item.blockedByRootId)
            : null;
          const link = item.documentVersionId
            ? `/admin/documents/${item.documentVersionId}`
            : item.applicationId
              ? `/admin/applications/${item.applicationId}`
              : null;
          return (
            <li key={item.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground text-xs">
                    {labels[item.status]} ·{" "}
                    {new Date(item.createdAt).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}
                  </p>
                  <h2 className="mt-2 font-semibold">
                    {eventLabels[item.eventType]}
                  </h2>
                  <p className="mt-1 break-words text-sm">{item.label}</p>
                </div>
                {["failed", "delivery_unknown"].includes(item.status) && (
                  <Button
                    variant="outline"
                    disabled={pending || !onRetry}
                    onClick={() => choose(item)}
                  >
                    재전송 확인
                  </Button>
                )}
              </div>
              {item.error && (
                <p className="text-destructive mt-3 whitespace-pre-wrap text-sm leading-6">
                  {item.error.message}{" "}
                  <span className="text-muted-foreground">
                    ({item.error.code})
                  </span>
                </p>
              )}
              {root && (
                <div className="bg-muted mt-3 rounded-md p-3 text-sm">
                  <p>
                    공고의 첫 알림이 {labels[root.status]}이어서 이 답글이 대기
                    중입니다.
                  </p>
                  {["failed", "delivery_unknown"].includes(root.status) && (
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="outline"
                      disabled={pending || !onRetry}
                      onClick={() => choose(root)}
                    >
                      첫 알림 복구
                    </Button>
                  )}
                </div>
              )}
              <div className="text-muted-foreground mt-3 flex flex-wrap gap-3 text-xs">
                <span>전달 시도 {item.attemptCount}회</span>
                {link && (
                  <Link href={link} className="underline">
                    관련 자료 보기
                  </Link>
                )}
                <span className="break-all">Request ID: {item.requestId}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
