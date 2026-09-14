import {
  type AnalysisJobService,
  createAnalysisJobService,
} from "./analysis-jobs.js";
import { app } from "./app.js";
import { logInfo } from "./logger.js";
import {
  createSlackNotificationService,
  type SlackNotificationService,
} from "./slack-notifications.js";

const ANALYSIS_STALE_AFTER_MS = 20 * 60 * 1_000;
const ANALYSIS_STALE_SWEEP_LIMIT = 100;
const SLACK_NOTIFICATION_STALE_AFTER_MS = 10 * 60 * 1_000;
const SLACK_NOTIFICATION_STALE_SWEEP_LIMIT = 100;

export async function runStaleAnalysisSweep(
  env: CloudflareBindings,
  scheduledAt: number,
  service: AnalysisJobService = createAnalysisJobService(env),
): Promise<string[]> {
  const cutoff = new Date(scheduledAt - ANALYSIS_STALE_AFTER_MS).toISOString();
  const failedJobIds = await service.failStale(
    cutoff,
    ANALYSIS_STALE_SWEEP_LIMIT,
  );
  logInfo({
    event: "analysis_stale_sweep",
    failedCount: failedJobIds.length,
    scheduledAt: new Date(scheduledAt).toISOString(),
  });
  return failedJobIds;
}

export async function runSlackNotificationSweep(
  env: CloudflareBindings,
  scheduledAt: number,
  service: SlackNotificationService = createSlackNotificationService(env),
): Promise<{ dispatchedCount: number; staleCount: number }> {
  const cutoff = new Date(
    scheduledAt - SLACK_NOTIFICATION_STALE_AFTER_MS,
  ).toISOString();
  const staleIds = await service.failStale(
    cutoff,
    SLACK_NOTIFICATION_STALE_SWEEP_LIMIT,
  );
  const dispatched = await service.drain(2);
  const result = {
    dispatchedCount: dispatched.length,
    staleCount: staleIds.length,
  };
  logInfo({
    event: "slack_notification_sweep",
    ...result,
    scheduledAt: new Date(scheduledAt).toISOString(),
  });
  return result;
}

export default {
  fetch: app.fetch,
  async scheduled(controller, env, context) {
    context.waitUntil(
      Promise.all([
        runStaleAnalysisSweep(env, controller.scheduledTime),
        runSlackNotificationSweep(env, controller.scheduledTime),
      ]),
    );
  },
} satisfies ExportedHandler<CloudflareBindings>;

export { app };
