import * as z from "zod";

import {
  CONTRACT_VERSION,
  Rfc3339TimestampSchema,
  UuidSchema,
} from "./job-postings";

export const SlackNotificationEventTypeSchema = z.enum([
  "job_posting_registered",
  "collection_succeeded",
  "collection_needs_input",
  "collection_failed",
  "analysis_queued",
  "analysis_succeeded",
  "analysis_retrying",
  "analysis_failed",
  "analysis_cancelled",
  "application_status_changed",
  "interview_scheduled",
]);

export type SlackNotificationEventType = z.infer<
  typeof SlackNotificationEventTypeSchema
>;

export const SlackNotificationTargetSchema = z.enum([
  "job_root",
  "job_thread",
  "error_channel",
]);

export type SlackNotificationTarget = z.infer<
  typeof SlackNotificationTargetSchema
>;

export const SlackNotificationStatusSchema = z.enum([
  "queued",
  "dispatching",
  "sent",
  "failed",
  "delivery_unknown",
  "skipped",
]);

export type SlackNotificationStatus = z.infer<
  typeof SlackNotificationStatusSchema
>;

export const SlackNotificationErrorCodeSchema = z.enum([
  "N8N_DISPATCH_FAILED",
  "SLACK_AUTHENTICATION_FAILED",
  "SLACK_CHANNEL_UNAVAILABLE",
  "SLACK_INVALID_PAYLOAD",
  "SLACK_RATE_LIMITED",
  "SLACK_SERVICE_UNAVAILABLE",
  "SLACK_DELIVERY_UNKNOWN",
]);

export type SlackNotificationErrorCode = z.infer<
  typeof SlackNotificationErrorCodeSchema
>;

export const SlackMessageBlockSchema = z.strictObject({
  type: z.literal("section"),
  text: z.strictObject({
    type: z.literal("mrkdwn"),
    text: z.string().min(1).max(3_000),
    verbatim: z.literal(true),
  }),
});

export type SlackMessageBlock = z.infer<typeof SlackMessageBlockSchema>;

export const N8nSlackNotificationDispatchPayloadSchema = z
  .strictObject({
    kind: z.literal("slack_notification"),
    schemaVersion: z.literal(CONTRACT_VERSION),
    eventId: UuidSchema,
    requestId: UuidSchema,
    notificationId: UuidSchema,
    jobPostingId: UuidSchema,
    target: SlackNotificationTargetSchema,
    threadTs: z
      .string()
      .regex(/^\d{10,20}\.\d{6}$/)
      .nullable(),
    text: z.string().min(1).max(2_000),
    blocks: z.array(SlackMessageBlockSchema).min(1).max(10),
    callbackPath: z
      .string()
      .regex(/^\/v1\/internal\/slack-notifications\/[0-9a-f-]+\/result$/),
  })
  .superRefine((value, context) => {
    if ((value.target === "job_thread") !== (value.threadTs !== null)) {
      context.addIssue({
        code: "custom",
        message: "threadTs is required only for job thread notifications",
        path: ["threadTs"],
      });
    }
  });

export type N8nSlackNotificationDispatchPayload = z.infer<
  typeof N8nSlackNotificationDispatchPayloadSchema
>;

export const SlackNotificationDeliveryOutcomeSchema = z.enum([
  "sent",
  "failed",
  "delivery_unknown",
]);

export type SlackNotificationDeliveryOutcome = z.infer<
  typeof SlackNotificationDeliveryOutcomeSchema
>;

const SlackNotificationCallbackErrorSchema = z.strictObject({
  code: SlackNotificationErrorCodeSchema,
  message: z.string().min(1).max(500),
  retryable: z.boolean(),
});

export const SlackNotificationResultCallbackSchema = z
  .strictObject({
    schemaVersion: z.literal(CONTRACT_VERSION),
    eventId: UuidSchema,
    notificationEventId: UuidSchema,
    requestId: UuidSchema,
    notificationId: UuidSchema,
    outcome: SlackNotificationDeliveryOutcomeSchema,
    channelId: z
      .string()
      .regex(/^[A-Z][A-Z0-9]{1,79}$/)
      .nullable(),
    messageTs: z
      .string()
      .regex(/^\d{10,20}\.\d{6}$/)
      .nullable(),
    httpStatus: z.int().min(100).max(599).nullable(),
    error: SlackNotificationCallbackErrorSchema.nullable(),
    occurredAt: Rfc3339TimestampSchema,
  })
  .superRefine((value, context) => {
    if (value.outcome === "sent" && value.error !== null) {
      context.addIssue({
        code: "custom",
        message: "successful notifications cannot contain an error",
        path: ["error"],
      });
    }
    if (value.outcome !== "sent" && value.error === null) {
      context.addIssue({
        code: "custom",
        message: "failed notifications require an error",
        path: ["error"],
      });
    }
    if (
      value.outcome === "sent" &&
      (value.channelId === null) !== (value.messageTs === null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Slack channel and message timestamp must be returned together",
        path: ["channelId"],
      });
    }
    if (value.outcome !== "sent" && value.messageTs !== null) {
      context.addIssue({
        code: "custom",
        message: "failed notifications cannot contain a message timestamp",
        path: ["messageTs"],
      });
    }
  });

export type SlackNotificationResultCallback = z.infer<
  typeof SlackNotificationResultCallbackSchema
>;

export const SlackNotificationResponseSchema = z.strictObject({
  id: UuidSchema,
  eventId: UuidSchema,
  requestId: UuidSchema,
  eventType: SlackNotificationEventTypeSchema,
  target: SlackNotificationTargetSchema,
  status: SlackNotificationStatusSchema,
  jobPostingId: UuidSchema,
  applicationId: UuidSchema.nullable(),
  collectionRunId: UuidSchema.nullable(),
  analysisJobId: UuidSchema.nullable(),
  attemptCount: z.int().nonnegative(),
  channelId: z.string().max(80).nullable(),
  messageTs: z.string().max(40).nullable(),
  httpStatus: z.int().min(100).max(599).nullable(),
  error: SlackNotificationCallbackErrorSchema.nullable(),
  createdAt: Rfc3339TimestampSchema,
  dispatchedAt: Rfc3339TimestampSchema.nullable(),
  finishedAt: Rfc3339TimestampSchema.nullable(),
  updatedAt: Rfc3339TimestampSchema,
});

export type SlackNotificationResponse = z.infer<
  typeof SlackNotificationResponseSchema
>;
