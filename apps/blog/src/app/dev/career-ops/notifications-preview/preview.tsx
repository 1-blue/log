"use client";
import { useState } from "react";

import type { SlackNotificationListItem } from "@workspace/contracts";

import NotificationPanel from "#/app/admin/(protected)/notifications/_components/NotificationPanel";
const root = "00000000-0000-4000-8000-000000000995";
const base: SlackNotificationListItem = {
  id: root,
  eventId: root,
  requestId: root,
  eventType: "job_posting_registered",
  target: "job_root",
  status: "delivery_unknown",
  jobPostingId: root,
  documentVersionId: null,
  applicationId: null,
  collectionRunId: null,
  analysisJobId: null,
  attemptCount: 1,
  channelId: null,
  messageTs: null,
  httpStatus: null,
  error: {
    code: "SLACK_DELIVERY_UNKNOWN",
    message:
      "전달 여부를 확인할 수 없습니다. Slack에서 기존 메시지를 확인해 주세요.",
    retryable: false,
  },
  createdAt: "2026-10-07T00:00:00Z",
  dispatchedAt: "2026-10-07T00:00:00Z",
  finishedAt: "2026-10-07T00:00:05Z",
  updatedAt: "2026-10-07T00:00:05Z",
  label: "가상 디자인 플랫폼 · AX Engineer",
  blockedByRootId: null,
};
export default function NotificationsPreview() {
  const [items, setItems] = useState<SlackNotificationListItem[]>([
    base,
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000996",
      eventType: "analysis_succeeded",
      target: "job_thread",
      status: "queued",
      error: null,
      finishedAt: null,
      dispatchedAt: null,
      blockedByRootId: root,
    },
  ]);
  return (
    <NotificationPanel
      items={items}
      onRefresh={() => {}}
      onRetry={async (item) =>
        setItems((current) =>
          current.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  status: "queued",
                  error: null,
                  updatedAt: new Date().toISOString(),
                  finishedAt: null,
                  dispatchedAt: null,
                }
              : row,
          ),
        )
      }
    />
  );
}
