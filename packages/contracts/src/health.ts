import * as z from "zod";

import type { AnalysisJobStatus } from "./common";
import type { JobPostingCollectionStatus } from "./job-postings";
import { Rfc3339TimestampSchema, UuidSchema } from "./job-postings";
import type { SlackNotificationStatus } from "./slack";

export const HealthResponseSchema = z.strictObject({
  data: z.strictObject({
    status: z.literal("ok"),
    service: z.literal("blog-career-ops-api"),
    timestamp: Rfc3339TimestampSchema,
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});

const AllowedAnalysisTransitions: Record<
  AnalysisJobStatus,
  readonly AnalysisJobStatus[]
> = {
  cancelled: [],
  failed: ["queued"],
  needs_input: [],
  queued: ["running", "failed", "cancelled"],
  retrying: ["running", "failed", "cancelled"],
  running: [
    "running",
    "needs_input",
    "retrying",
    "succeeded",
    "failed",
    "cancelled",
  ],
  succeeded: [],
};

export function isValidAnalysisJobTransition(
  from: AnalysisJobStatus,
  to: AnalysisJobStatus,
): boolean {
  return AllowedAnalysisTransitions[from].includes(to);
}

const AllowedJobPostingCollectionTransitions: Record<
  JobPostingCollectionStatus,
  readonly JobPostingCollectionStatus[]
> = {
  failed: [],
  needs_input: [],
  queued: ["running", "succeeded", "needs_input", "failed"],
  running: ["succeeded", "needs_input", "failed"],
  succeeded: [],
};

export function isValidJobPostingCollectionTransition(
  from: JobPostingCollectionStatus,
  to: JobPostingCollectionStatus,
): boolean {
  return AllowedJobPostingCollectionTransitions[from].includes(to);
}

const AllowedSlackNotificationTransitions: Record<
  SlackNotificationStatus,
  readonly SlackNotificationStatus[]
> = {
  delivery_unknown: [],
  dispatching: ["sent", "failed", "delivery_unknown", "skipped"],
  failed: [],
  queued: ["dispatching", "failed", "skipped"],
  sent: [],
  skipped: [],
};

export function isValidSlackNotificationTransition(
  from: SlackNotificationStatus,
  to: SlackNotificationStatus,
): boolean {
  return AllowedSlackNotificationTransitions[from].includes(to);
}
