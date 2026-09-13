import type {
  JobPostingCollectionCallback,
  JobPostingCollectionRun,
} from "@workspace/contracts";
import {
  JobPostingCollectionListResponseSchema,
  JobPostingCollectionResponseSchema,
} from "@workspace/contracts";

import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { IdempotencyService } from "../src/idempotency.js";
import type { JobPostingCollectionService } from "../src/job-posting-collections.js";
import { createSignedHeaders } from "../src/n8n.js";

const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000001";
const POSTING_ID = "00000000-0000-4000-8000-000000000002";
const RUN_ID = "00000000-0000-4000-8000-000000000003";
const REQUEST_ID = "00000000-0000-4000-8000-000000000004";
const EVENT_ID = "00000000-0000-4000-8000-000000000005";
const now = "2026-09-13T00:00:00.000Z";

const env: CloudflareBindings = {
  ADMIN_API_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
  ADMIN_USER_ID,
  APP_BASE_URL: "http://localhost:3000",
  N8N_CALLBACK_SECRET: "test-callback-secret",
  N8N_WEBHOOK_SECRET: "test-webhook-secret",
  N8N_WEBHOOK_URL: "http://localhost:5678/webhook/career-analysis",
  PUBLIC_API_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
  SLACK_ERROR_WEBHOOK_URL: "https://hooks.slack.com/services/test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  SUPABASE_URL: "https://example.supabase.co",
};

const run: JobPostingCollectionRun = {
  createdAt: now,
  errorCode: null,
  finishedAt: null,
  httpStatus: null,
  id: RUN_ID,
  jobPostingId: POSTING_ID,
  mode: "automatic",
  requestId: REQUEST_ID,
  retryable: false,
  snapshot: null,
  startedAt: now,
  status: "running",
  updatedAt: now,
};

let privateKey: CryptoKey;
let publicKey: CryptoKey;

beforeAll(async () => {
  const keys = await generateKeyPair("ES256");
  privateKey = keys.privateKey;
  publicKey = keys.publicKey;
});

async function token() {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256" })
    .setIssuedAt()
    .setIssuer("https://example.supabase.co/auth/v1")
    .setAudience("authenticated")
    .setSubject(ADMIN_USER_ID)
    .setExpirationTime("5m")
    .sign(privateKey);
}

function fakeCollectionService(): JobPostingCollectionService {
  return {
    complete: vi.fn(
      async (): Promise<JobPostingCollectionRun> => ({
        ...run,
        finishedAt: now,
        status: "succeeded",
      }),
    ),
    create: vi.fn(async () => run),
    get: vi.fn(async () => run),
    list: vi.fn(async () => [run]),
  };
}

function fakeIdempotencyService(): IdempotencyService {
  return {
    claim: vi.fn(async ({ executionId }) => ({
      executionId,
      kind: "claimed" as const,
    })),
    complete: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
  };
}

function testApp(service = fakeCollectionService()) {
  return {
    app: createApp({
      idempotencyServiceFactory: () => fakeIdempotencyService(),
      jobPostingCollectionServiceFactory: () => service,
      jwtVerificationKey: publicKey,
    }),
    service,
  };
}

describe("job posting collection API", () => {
  it("creates, gets, and lists collection runs", async () => {
    const { app, service } = testApp();
    const authorization = `Bearer ${await token()}`;
    const created = await app.request(
      `http://localhost:8787/v1/job-postings/${POSTING_ID}/collections`,
      {
        body: JSON.stringify({ manualContent: null }),
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          "Idempotency-Key": EVENT_ID,
        },
        method: "POST",
      },
      env,
    );
    const retrieved = await app.request(
      `http://localhost:8787/v1/job-postings/${POSTING_ID}/collections/${RUN_ID}`,
      { headers: { Authorization: authorization } },
      env,
    );
    const listed = await app.request(
      `http://localhost:8787/v1/job-postings/${POSTING_ID}/collections`,
      { headers: { Authorization: authorization } },
      env,
    );

    expect(created.status).toBe(202);
    expect(
      JobPostingCollectionResponseSchema.safeParse(await created.json())
        .success,
    ).toBe(true);
    expect(
      JobPostingCollectionResponseSchema.safeParse(await retrieved.json())
        .success,
    ).toBe(true);
    expect(
      JobPostingCollectionListResponseSchema.safeParse(await listed.json())
        .success,
    ).toBe(true);
    expect(service.create).toHaveBeenCalledWith(
      ADMIN_USER_ID,
      POSTING_ID,
      expect.any(String),
      { manualContent: null },
    );
  });

  it("rejects short manual content before dispatch", async () => {
    const { app, service } = testApp();
    const response = await app.request(
      `http://localhost:8787/v1/job-postings/${POSTING_ID}/collections`,
      {
        body: JSON.stringify({ manualContent: "짧은 원문" }),
        headers: {
          Authorization: `Bearer ${await token()}`,
          "Content-Type": "application/json",
          "Idempotency-Key": EVENT_ID,
        },
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("accepts a callback only when signature and identifiers agree", async () => {
    const { app, service } = testApp();
    const callback: JobPostingCollectionCallback = {
      collectionRunId: RUN_ID,
      eventId: EVENT_ID,
      occurredAt: now,
      outcome: "timeout",
      requestId: REQUEST_ID,
      response: null,
      schemaVersion: "1.0.0",
    };
    const body = new TextEncoder().encode(JSON.stringify(callback));
    const path = `/v1/internal/job-posting-collections/${RUN_ID}/complete`;
    const headers = await createSignedHeaders({
      body,
      eventId: EVENT_ID,
      method: "POST",
      path,
      requestId: REQUEST_ID,
      secret: env.N8N_CALLBACK_SECRET,
      timestamp: Math.floor(Date.now() / 1_000),
    });
    const response = await app.request(
      `http://localhost:8787${path}`,
      { body, headers, method: "POST" },
      env,
    );
    expect(response.status).toBe(200);
    expect(service.complete).toHaveBeenCalledWith(callback);

    const invalid = await app.request(
      `http://localhost:8787${path}`,
      { body, headers: { "Content-Type": "application/json" }, method: "POST" },
      env,
    );
    expect(invalid.status).toBe(401);
  });
});
