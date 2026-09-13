import {
  type AnalysisJobService,
  createAnalysisJobService,
} from "./analysis-jobs.js";
import { app } from "./app.js";

const ANALYSIS_STALE_AFTER_MS = 20 * 60 * 1_000;
const ANALYSIS_STALE_SWEEP_LIMIT = 100;

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
  console.log(
    JSON.stringify({
      event: "analysis_stale_sweep",
      failedCount: failedJobIds.length,
      scheduledAt: new Date(scheduledAt).toISOString(),
    }),
  );
  return failedJobIds;
}

export default {
  fetch: app.fetch,
  async scheduled(controller, env, context) {
    context.waitUntil(runStaleAnalysisSweep(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<CloudflareBindings>;

export { app };
