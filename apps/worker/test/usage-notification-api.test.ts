import { AiUsageDashboardResponseSchema } from "@workspace/contracts";

import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  type AiUsageService,
  AiUsageServiceError,
  summarizeAiUsage,
} from "../src/ai-usage.js";
import { createApp } from "../src/app.js";
import { createSignedHeaders } from "../src/n8n.js";
import {
  type SlackNotificationService,
  SlackNotificationServiceError,
} from "../src/slack-notifications.js";

const owner = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const env = {
  ADMIN_USER_ID: owner,
  SUPABASE_URL: "https://example.supabase.co",
  APP_BASE_URL: "http://localhost:3000",
  N8N_CALLBACK_SECRET: "fixture",
  ADMIN_API_RATE_LIMITER: { limit: async () => ({ success: true }) },
  PUBLIC_API_RATE_LIMITER: { limit: async () => ({ success: true }) },
} as unknown as CloudflareBindings;
let publicKey: CryptoKey;
let privateKey: CryptoKey;
beforeAll(async () => {
  ({ publicKey, privateKey } = await generateKeyPair("ES256"));
});
const token = async (subject = owner) =>
  new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256" })
    .setIssuer(env.SUPABASE_URL + "/auth/v1")
    .setAudience("authenticated")
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
const usageService = (): AiUsageService => ({
  record: vi.fn(async () => undefined),
  dashboard: vi.fn(async () => summarizeAiUsage([], null, 30)),
  saveBaseline: vi.fn(async (_owner, input) => input),
});
const notificationService = (): SlackNotificationService => ({
  list: vi.fn(async () => []),
  retry: vi.fn(async () => {
    throw new SlackNotificationServiceError("conflict");
  }),
  drain: vi.fn(async () => []),
  failStale: vi.fn(async () => []),
  complete: vi.fn(async () => {
    throw new Error("unused");
  }),
});

describe("usage and notification API authorization", () => {
  it("requires admin authentication and prevents another owner from reading", async () => {
    const service = usageService();
    const notifications = notificationService();
    const app = createApp({
      jwtVerificationKey: publicKey,
      aiUsageServiceFactory: () => service,
      slackNotificationServiceFactory: () => notifications,
    });
    for (const path of ["/v1/ai-usage", "/v1/slack-notifications"]) {
      expect(
        (await app.request("http://localhost:8787" + path, {}, env)).status,
      ).toBe(401);
      expect(
        (
          await app.request(
            "http://localhost:8787" + path,
            { headers: { Authorization: "Bearer " + (await token(id)) } },
            env,
          )
        ).status,
      ).toBe(403);
    }
    expect(service.dashboard).not.toHaveBeenCalled();
    expect(notifications.list).not.toHaveBeenCalled();
  });
  it("returns strict dashboard and scopes baseline/list/retry to the verified admin", async () => {
    const service = usageService();
    const notifications = notificationService();
    const app = createApp({
      jwtVerificationKey: publicKey,
      aiUsageServiceFactory: () => service,
      slackNotificationServiceFactory: () => notifications,
    });
    const headers = {
      Authorization: "Bearer " + (await token()),
      "Content-Type": "application/json",
    };
    const dashboard = await app.request(
      "http://localhost:8787/v1/ai-usage",
      { headers },
      env,
    );
    expect(dashboard.status).toBe(200);
    expect(
      AiUsageDashboardResponseSchema.safeParse(await dashboard.json()).success,
    ).toBe(true);
    expect(service.dashboard).toHaveBeenCalledWith(owner, 30);
    expect(
      (
        await app.request(
          "http://localhost:8787/v1/ai-usage?days=367",
          { headers },
          env,
        )
      ).status,
    ).toBe(400);
    const input = { balanceUsd: 5, recordedAt: "2026-10-07T00:00:00Z" };
    expect(
      (
        await app.request(
          "http://localhost:8787/v1/ai-usage/balance",
          { headers, method: "PUT", body: JSON.stringify(input) },
          env,
        )
      ).status,
    ).toBe(200);
    expect(service.saveBaseline).toHaveBeenCalledWith(owner, input);
    expect(
      (
        await app.request(
          "http://localhost:8787/v1/slack-notifications",
          { headers },
          env,
        )
      ).status,
    ).toBe(200);
    const retry = {
      expectedUpdatedAt: "2026-10-07T00:00:00Z",
      confirmUnknownDelivery: true,
    };
    expect(
      (
        await app.request(
          `http://localhost:8787/v1/slack-notifications/${id}/retry`,
          { headers, method: "POST", body: JSON.stringify(retry) },
          env,
        )
      ).status,
    ).toBe(409);
    expect(notifications.retry).toHaveBeenCalledWith(
      owner,
      id,
      retry.expectedUpdatedAt,
      true,
    );
  });
  it("accepts only signed accounting with matching identifiers and no client monetary override", async () => {
    const service = usageService();
    const app = createApp({ aiUsageServiceFactory: () => service });
    const input = {
      schemaVersion: "1.0.0",
      eventId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      callId: crypto.randomUUID(),
      operation: "document_ocr",
      resourceId: id,
      model: "gpt-5.6-luna",
      responseId: null,
      serviceTier: "default",
      status: "started",
      usage: null,
      latencyMs: null,
      attempt: 1,
      runAttempt: 1,
      occurredAt: "2026-10-07T00:00:00Z",
    };
    const request = async (payload: unknown, signedId = input.eventId) => {
      const body = new TextEncoder().encode(JSON.stringify(payload));
      const path = "/v1/internal/ai-usage";
      const headers = await createSignedHeaders({
        body,
        eventId: signedId,
        requestId: input.requestId,
        method: "POST",
        path,
        secret: "fixture",
        timestamp: Math.floor(Date.now() / 1000),
      });
      return app.request(
        "http://localhost:8787" + path,
        { headers, method: "POST", body },
        env,
      );
    };
    expect((await request(input)).status).toBe(200);
    expect(service.record).toHaveBeenCalledWith(owner, input);
    expect((await request(input, crypto.randomUUID())).status).toBe(401);
    expect((await request({ ...input, estimatedCostUsd: 0 })).status).toBe(400);
    expect(
      (
        await app.request(
          "http://localhost:8787/v1/internal/ai-usage",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
          env,
        )
      ).status,
    ).toBe(401);
  });
  it("maps accounting errors without exposing upstream secrets", async () => {
    const service = usageService();
    service.dashboard = vi.fn(async () => {
      throw new AiUsageServiceError("unavailable");
    });
    const app = createApp({
      jwtVerificationKey: publicKey,
      aiUsageServiceFactory: () => service,
    });
    const response = await app.request(
      "http://localhost:8787/v1/ai-usage",
      { headers: { Authorization: "Bearer " + (await token()) } },
      env,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("fixture");
  });
});
