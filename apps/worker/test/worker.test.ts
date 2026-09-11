import { HealthResponseSchema } from "@workspace/contracts";

import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";

const mockEnv: CloudflareBindings = {
  ADMIN_USER_ID: "00000000-0000-0000-0000-000000000000",
  APP_BASE_URL: "http://localhost:3000",
  N8N_CALLBACK_SECRET: "test-callback-secret",
  N8N_WEBHOOK_SECRET: "test-webhook-secret",
  N8N_WEBHOOK_URL: "http://localhost:5678/webhook/career-analysis",
  SLACK_ERROR_WEBHOOK_URL: "https://hooks.slack.com/services/test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  SUPABASE_URL: "https://example.supabase.co"
};

describe("worker health API", () => {
  it("returns a validated health response with a propagated request ID", async () => {
    const response = await app.request("http://localhost:8787/health", {}, mockEnv);
    const payload = (await response.json()) as {
      meta: { requestId: string };
    };
    const parsed = HealthResponseSchema.safeParse(payload);

    expect(response.status).toBe(200);
    expect(parsed.success).toBe(true);
    expect(response.headers.get("X-Request-Id")).toBe(payload.meta.requestId);
  });

  it("generates a new request ID for every request", async () => {
    const first = await app.request("http://localhost:8787/health", {}, mockEnv);
    const second = await app.request("http://localhost:8787/health", {}, mockEnv);

    expect(first.headers.get("X-Request-Id")).not.toBe(
      second.headers.get("X-Request-Id")
    );
  });

  it("allows the configured origin and handles preflight requests", async () => {
    const response = await app.request(
      "http://localhost:8787/health",
      {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:3000" }
      },
      mockEnv
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000"
    );
  });

  it("rejects an unconfigured origin", async () => {
    const response = await app.request(
      "http://localhost:8787/health",
      { headers: { Origin: "https://malicious.example" } },
      mockEnv
    );
    const payload = (await response.json()) as {
      error: { code: string };
    };

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("FORBIDDEN");
  });

  it("returns the standard error envelope for unknown routes", async () => {
    const response = await app.request("http://localhost:8787/unknown", {}, mockEnv);
    const payload = (await response.json()) as {
      error: { code: string; stack?: string };
    };

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("NOT_FOUND");
    expect(payload.error).not.toHaveProperty("stack");
  });
});
