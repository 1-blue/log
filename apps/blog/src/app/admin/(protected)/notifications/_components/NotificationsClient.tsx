"use client";
import { useEffect, useState } from "react";

import type { SlackNotificationListItem } from "@workspace/contracts";

import {
  getSlackNotifications,
  retrySlackNotification,
} from "#/libs/worker-client";

import NotificationPanel from "./NotificationPanel";

export default function NotificationsClient() {
  const [items, setItems] = useState<SlackNotificationListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const refresh = async () => {
    setPending(true);
    setError(null);
    try {
      setItems(await getSlackNotifications());
    } catch {
      setError("알림 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  };
  useEffect(() => {
    let current = true;
    void getSlackNotifications()
      .then((data) => {
        if (current) setItems(data);
      })
      .catch(() => {
        if (current) setError("알림 기록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (current) setPending(false);
      });
    return () => {
      current = false;
    };
  }, []);
  const retry = async (item: SlackNotificationListItem, confirmed: boolean) => {
    setPending(true);
    setError(null);
    try {
      await retrySlackNotification(item, confirmed);
      await refresh();
    } catch {
      setError(
        "알림 상태가 바뀌었거나 재전송하지 못했습니다. 새로고침 후 다시 확인해 주세요.",
      );
      setPending(false);
    }
  };
  return (
    <NotificationPanel
      items={items}
      pending={pending}
      error={error}
      onRefresh={refresh}
      onRetry={retry}
    />
  );
}
