"use client";
import {
  SlackNotificationListEnvelopeSchema,
  type SlackNotificationListItem,
} from "@workspace/contracts";

import { fetchWorker, readWorkerError, requestWorker } from "./core";

export async function getSlackNotifications(): Promise<
  SlackNotificationListItem[]
> {
  return (
    await requestWorker(
      "/v1/slack-notifications",
      SlackNotificationListEnvelopeSchema,
    )
  ).data;
}
export async function retrySlackNotification(
  item: SlackNotificationListItem,
  confirmUnknownDelivery: boolean,
) {
  const response = await fetchWorker(
    `/v1/slack-notifications/${item.id}/retry`,
    {
      method: "POST",
      body: JSON.stringify({
        expectedUpdatedAt: item.updatedAt,
        confirmUnknownDelivery,
      }),
    },
  );
  if (!response.ok) throw await readWorkerError(response);
}
