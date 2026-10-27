import { describe, expect, it } from "vitest";

import {
  APPLICATION_STATUS_COLORS,
  APPLICATION_STATUS_OPTIONS,
  formatApplicationDate,
  formatFitScore,
  getApplicationStatusLabel,
  toLocalDateTimeInput,
  toUtcTimestamp,
} from "#/libs/application-ui";

describe("application UI helpers", () => {
  it("gives every status a distinct light/dark accessible text color", () => {
    expect(new Set(Object.values(APPLICATION_STATUS_COLORS)).size).toBe(
      APPLICATION_STATUS_OPTIONS.length,
    );
    for (const [status] of APPLICATION_STATUS_OPTIONS) {
      expect(APPLICATION_STATUS_COLORS[status]).toContain("dark:text-");
      expect(APPLICATION_STATUS_COLORS[status]).toContain("border-");
    }
  });
  it("does not label an unavailable score as zero", () => {
    expect(formatFitScore(null)).toBe("산정 불가");
    expect(formatFitScore(0)).toBe("0점");
    expect(formatFitScore(75)).toBe("75점");
  });
  it("labels every application state in Korean", () => {
    expect(getApplicationStatusLabel("interested")).toBe("관심");
    expect(getApplicationStatusLabel("interview")).toBe("면접");
    expect(getApplicationStatusLabel("rejected")).toBe("불합격");
  });

  it("converts datetime-local values to UTC and back to local input", () => {
    const utc = toUtcTimestamp("2026-09-12T10:30");
    expect(utc).not.toBeNull();
    expect(toLocalDateTimeInput(utc)).toBe("2026-09-12T10:30");
    expect(toUtcTimestamp("")).toBeNull();
  });

  it("formats empty and populated dates safely", () => {
    expect(formatApplicationDate(null)).toBe("미정");
    expect(formatApplicationDate("2026-09-12")).toContain("2026");
  });
});
