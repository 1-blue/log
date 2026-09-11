import {
  AdminSessionResponseSchema,
  HealthResponseSchema,
} from "@workspace/contracts";

import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { app, createApp } from "../src/app.js";

const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
const AUTH_ISSUER = "https://example.supabase.co/auth/v1";

const mockEnv: CloudflareBindings = {
  ADMIN_USER_ID,
  APP_BASE_URL: "http://localhost:3000",
  N8N_CALLBACK_SECRET: "test-callback-secret",
  N8N_WEBHOOK_SECRET: "test-webhook-secret",
  N8N_WEBHOOK_URL: "http://localhost:5678/webhook/career-analysis",
  SLACK_ERROR_WEBHOOK_URL: "https://hooks.slack.com/services/test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  SUPABASE_URL: "https://example.supabase.co",
};

let privateKey: CryptoKey;
let publicKey: CryptoKey;

beforeAll(async () => {
  const keys = await generateKeyPair("ES256");
  privateKey = keys.privateKey;
  publicKey = keys.publicKey;
});

async function createAccessToken({
  audience = "authenticated",
  expiresAt = Math.floor(Date.now() / 1_000) + 300,
  issuer = AUTH_ISSUER,
  role = "authenticated",
  subject = ADMIN_USER_ID,
}: {
  audience?: string;
  expiresAt?: number;
  issuer?: string;
  role?: string;
  subject?: string;
} = {}) {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "ES256" })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setExpirationTime(expiresAt)
    .sign(privateKey);
}

describe("worker health API", () => {
  it("returns a validated health response with a propagated request ID", async () => {
    const response = await app.request(
      "http://localhost:8787/health",
      {},
      mockEnv,
    );
    const payload = (await response.json()) as {
      meta: { requestId: string };
    };
    const parsed = HealthResponseSchema.safeParse(payload);

    expect(response.status).toBe(200);
    expect(parsed.success).toBe(true);
    expect(response.headers.get("X-Request-Id")).toBe(payload.meta.requestId);
  });

  it("generates a new request ID for every request", async () => {
    const first = await app.request(
      "http://localhost:8787/health",
      {},
      mockEnv,
    );
    const second = await app.request(
      "http://localhost:8787/health",
      {},
      mockEnv,
    );

    expect(first.headers.get("X-Request-Id")).not.toBe(
      second.headers.get("X-Request-Id"),
    );
  });

  it("allows the configured origin and handles preflight requests", async () => {
    const response = await app.request(
      "http://localhost:8787/v1/auth/me",
      {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:3000" },
      },
      mockEnv,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
  });

  it("rejects an unconfigured origin", async () => {
    const response = await app.request(
      "http://localhost:8787/health",
      { headers: { Origin: "https://malicious.example" } },
      mockEnv,
    );
    const payload = (await response.json()) as {
      error: { code: string };
    };

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("FORBIDDEN");
  });

  it("returns the standard error envelope for unknown routes", async () => {
    const response = await app.request(
      "http://localhost:8787/unknown",
      {},
      mockEnv,
    );
    const payload = (await response.json()) as {
      error: { code: string; stack?: string };
    };

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("NOT_FOUND");
    expect(payload.error).not.toHaveProperty("stack");
  });
});

describe("worker administrator authentication", () => {
  it("rejects requests without a bearer token", async () => {
    const testApp = createApp({ jwtVerificationKey: publicKey });
    const response = await testApp.request(
      "http://localhost:8787/v1/auth/me",
      {},
      mockEnv,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED", retryable: false },
    });
  });

  it("rejects a malformed bearer token", async () => {
    const testApp = createApp({ jwtVerificationKey: publicKey });
    const response = await testApp.request(
      "http://localhost:8787/v1/auth/me",
      { headers: { Authorization: "Bearer" } },
      mockEnv,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED", retryable: false },
    });
  });

  it("returns the verified administrator session", async () => {
    const testApp = createApp({ jwtVerificationKey: publicKey });
    const response = await testApp.request(
      "http://localhost:8787/v1/auth/me",
      { headers: { Authorization: `Bearer ${await createAccessToken()}` } },
      mockEnv,
    );
    const payload: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(AdminSessionResponseSchema.safeParse(payload).success).toBe(true);
    expect(payload).toMatchObject({ data: { userId: ADMIN_USER_ID } });
    expect(response.headers.get("X-Request-Id")).toBe(
      (payload as { meta: { requestId: string } }).meta.requestId,
    );
  });

  it("rejects a valid token for another user", async () => {
    const testApp = createApp({ jwtVerificationKey: publicKey });
    const response = await testApp.request(
      "http://localhost:8787/v1/auth/me",
      {
        headers: {
          Authorization: `Bearer ${await createAccessToken({ subject: OTHER_USER_ID })}`,
        },
      },
      mockEnv,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN", retryable: false },
    });
  });

  it.each([
    ["expired", { expiresAt: Math.floor(Date.now() / 1_000) - 60 }],
    ["issuer", { issuer: "https://malicious.example/auth/v1" }],
    ["audience", { audience: "anonymous" }],
    ["role", { role: "anon" }],
    ["subject", { subject: "not-a-uuid" }],
  ])("rejects a token with invalid %s claims", async (_name, claims) => {
    const testApp = createApp({ jwtVerificationKey: publicKey });
    const response = await testApp.request(
      "http://localhost:8787/v1/auth/me",
      {
        headers: {
          Authorization: `Bearer ${await createAccessToken(claims)}`,
        },
      },
      mockEnv,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("rejects a token with an invalid signature", async () => {
    const differentKeys = await generateKeyPair("ES256");
    const token = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "ES256" })
      .setIssuedAt()
      .setIssuer(AUTH_ISSUER)
      .setAudience("authenticated")
      .setSubject(ADMIN_USER_ID)
      .setExpirationTime("5m")
      .sign(differentKeys.privateKey);
    const testApp = createApp({ jwtVerificationKey: publicKey });
    const response = await testApp.request(
      "http://localhost:8787/v1/auth/me",
      { headers: { Authorization: `Bearer ${token}` } },
      mockEnv,
    );

    expect(response.status).toBe(401);
  });

  it("returns a retryable error when the JWKS provider is unavailable", async () => {
    const testApp = createApp({
      jwtVerificationKey: async () => {
        throw new Error("JWKS unavailable");
      },
    });
    const response = await testApp.request(
      "http://localhost:8787/v1/auth/me",
      { headers: { Authorization: `Bearer ${await createAccessToken()}` } },
      mockEnv,
    );

    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).not.toContain("JWKS unavailable");
    expect(body).not.toContain(mockEnv.SUPABASE_SECRET_KEY);
    expect(JSON.parse(body)).toMatchObject({
      error: { code: "UPSTREAM_UNAVAILABLE", retryable: true },
    });
  });

  it("returns a configuration error for an invalid administrator ID", async () => {
    const testApp = createApp({ jwtVerificationKey: publicKey });
    const response = await testApp.request(
      "http://localhost:8787/v1/auth/me",
      { headers: { Authorization: `Bearer ${await createAccessToken()}` } },
      { ...mockEnv, ADMIN_USER_ID: "not-a-uuid" },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UPSTREAM_UNAVAILABLE", retryable: true },
    });
  });
});
