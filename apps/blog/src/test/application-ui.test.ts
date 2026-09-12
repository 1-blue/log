import { describe, expect, it } from "vitest";

import {
  formatApplicationDate,
  getApplicationStatusLabel,
  toLocalDateTimeInput,
  toUtcTimestamp,
} from "#/libs/application-ui";

describe("application UI helpers", () => {
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
