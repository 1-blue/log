import {
  SlackNotificationErrorCodeSchema,
  type SlackNotificationResponse,
} from "@workspace/contracts";

import type { NotificationRow } from "./slack-notification-formatter.js";

export function mapSlackNotification(
  row: NotificationRow,
): SlackNotificationResponse {
  const parsedErrorCode = row.error_code
    ? SlackNotificationErrorCodeSchema.safeParse(row.error_code)
    : null;
  return {
    analysisJobId: row.analysis_job_id,
    applicationId: row.application_id,
    attemptCount: row.attempt_count,
    channelId: row.channel_id,
    collectionRunId: row.collection_run_id,
    createdAt: row.created_at,
    dispatchedAt: row.dispatched_at,
    error:
      row.error_code && row.error_message
        ? {
            code: parsedErrorCode?.success
              ? parsedErrorCode.data
              : "SLACK_SERVICE_UNAVAILABLE",
            message: row.error_message,
            retryable: row.error_retryable,
          }
        : null,
    eventId: row.event_id,
    eventType: row.event_type,
    finishedAt: row.finished_at,
    httpStatus: row.http_status,
    id: row.id,
    jobPostingId: row.job_posting_id,
    messageTs: row.message_ts,
    requestId: row.request_id,
    status: row.status,
    target: row.target,
    updatedAt: row.updated_at,
  };
}
