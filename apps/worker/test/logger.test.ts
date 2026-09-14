import { afterEach, describe, expect, it, vi } from "vitest";

import { logError, logInfo } from "../src/logger.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("structured Worker logging", () => {
  it("serializes only explicitly allowed fields", () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    const requestId = "00000000-0000-4000-8000-000000000001";

    logInfo({
      durationMs: 17,
      event: "worker_request",
      method: "POST",
      path: "/v1/applications",
      requestId,
      status: 201,
    });

    expect(output).toHaveBeenCalledOnce();
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toEqual({
      durationMs: 17,
      event: "worker_request",
      method: "POST",
      path: "/v1/applications",
      requestId,
      status: 201,
    });
  });

  it("does not accept or infer arbitrary error details", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    const secretValues = [
      "private@example.com",
      "sb_secret_<test-fixture-must-not-leak>",
      "https://hooks.slack.com/services/TOKEN/SHOULD/NOTLEAK",
      "Bearer eyJhbGciOiJIUzI1NiJ9.private.signature",
    ];

    const unsafeEntry = {
      errorCode: "INTERNAL_ERROR",
      errorMessage: secretValues.join(" "),
      event: "worker_error",
      requestId: "00000000-0000-4000-8000-000000000001",
    };
    logError(unsafeEntry);

    const serialized = String(output.mock.calls[0]?.[0]);
    for (const secret of secretValues) expect(serialized).not.toContain(secret);
    expect(JSON.parse(serialized)).toEqual({
      errorCode: "INTERNAL_ERROR",
      event: "worker_error",
      requestId: "00000000-0000-4000-8000-000000000001",
    });
  });
});
