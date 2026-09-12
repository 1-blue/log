import { describe, expect, it, vi } from "vitest";

import { createIdempotentRequestInit } from "#/libs/worker-client";

describe("Worker idempotency request", () => {
  it("creates one idempotency key for a logical request", () => {
    const createKey = vi.fn(() => "00000000-0000-4000-8000-000000000001");
    const request = createIdempotentRequestInit(
      { body: "{}", method: "POST" },
      createKey,
    );
    const retried = createIdempotentRequestInit(request, createKey);

    expect(new Headers(retried.headers).get("Idempotency-Key")).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(createKey).toHaveBeenCalledOnce();
  });

  it("preserves a caller-provided idempotency key", () => {
    const createKey = vi.fn(() => "unused");
    const request = createIdempotentRequestInit(
      {
        headers: {
          "Idempotency-Key": "00000000-0000-4000-8000-000000000002",
        },
        method: "POST",
      },
      createKey,
    );

    expect(new Headers(request.headers).get("Idempotency-Key")).toBe(
      "00000000-0000-4000-8000-000000000002",
    );
    expect(createKey).not.toHaveBeenCalled();
  });
});
