import { describe, expect, it, vi } from "vitest";

import type { AnalysisJobService } from "../src/analysis-jobs.js";
import {
  runSlackNotificationSweep,
  runStaleAnalysisSweep,
} from "../src/index.js";
import type { SlackNotificationService } from "../src/slack-notifications.js";

describe("analysis stale cron", () => {
  it("fails at most 100 jobs without exposing identifiers in logs", async () => {
    const scheduledAt = Date.parse("2026-09-13T01:00:00.000Z");
    const failStale = vi.fn(async () => [
      "00000000-0000-4000-8000-000000000001",
    ]);
    const service = { failStale } as unknown as AnalysisJobService;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runStaleAnalysisSweep({} as CloudflareBindings, scheduledAt, service),
    ).resolves.toHaveLength(1);
    expect(failStale).toHaveBeenCalledWith("2026-09-13T00:40:00.000Z", 100);
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({
        event: "analysis_stale_sweep",
        failedCount: 1,
        scheduledAt: "2026-09-13T01:00:00.000Z",
      }),
    );
    expect(log.mock.calls.flat().join(" ")).not.toContain(
      "00000000-0000-4000-8000-000000000001",
    );
    log.mockRestore();
  });
});

describe("Slack notification cron", () => {
  it("marks stale dispatches before draining the two serialized routes", async () => {
    const scheduledAt = Date.parse("2026-09-14T01:00:00.000Z");
    const failStale = vi.fn(async () => [
      "00000000-0000-4000-8000-000000000001",
    ]);
    const drain = vi.fn(async () => []);
    const service = {
      complete: vi.fn(),
      drain,
      failStale,
    } as unknown as SlackNotificationService;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runSlackNotificationSweep({} as CloudflareBindings, scheduledAt, service),
    ).resolves.toEqual({ dispatchedCount: 0, staleCount: 1 });
    expect(failStale).toHaveBeenCalledWith("2026-09-14T00:50:00.000Z", 100);
    expect(drain).toHaveBeenCalledWith(2);
    expect(log.mock.calls.flat().join(" ")).not.toContain(
      "00000000-0000-4000-8000-000000000001",
    );
    log.mockRestore();
  });
});
