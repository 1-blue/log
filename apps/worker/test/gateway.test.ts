import type {
  ApplicationDetail,
  N8nDispatchPayload,
} from "@workspace/contracts";

import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { ApplicationService } from "../src/applications.js";
import type {
  IdempotencyClaim,
  IdempotencyService,
} from "../src/idempotency.js";
import {
  createSignedHeaders,
  dispatchToN8n,
  N8nDispatchError,
  verifySignedRequest,
} from "../src/n8n.js";

const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000001";
const REQUEST_ID = "00000000-0000-4000-8000-000000000002";
const EVENT_ID = "00000000-0000-4000-8000-000000000003";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000004";
const POSTING_ID = "00000000-0000-4000-8000-000000000005";
const AUTH_ISSUER = "https://example.supabase.co/auth/v1";
const now = "2026-09-12T00:00:00.000Z";

function rateLimiter(success = true): RateLimit {
  return { limit: vi.fn(async () => ({ success })) };
}

const baseEnv: CloudflareBindings = {
  ADMIN_API_RATE_LIMITER: rateLimiter(),
  ADMIN_USER_ID,
  APP_BASE_URL: "http://localhost:3000",
  N8N_CALLBACK_SECRET: "test-callback-secret",
  N8N_WEBHOOK_SECRET: "test-webhook-secret",
  N8N_WEBHOOK_URL: "http://localhost:5678/webhook/career-analysis",
  PUBLIC_API_RATE_LIMITER: rateLimiter(),
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

async function accessToken() {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256" })
    .setIssuedAt()
    .setIssuer(AUTH_ISSUER)
    .setAudience("authenticated")
    .setSubject(ADMIN_USER_ID)
    .setExpirationTime("5m")
    .sign(privateKey);
}

const application: ApplicationDetail = {
  appliedOn: null,
  archivedAt: null,
  attemptNumber: 1,
  createdAt: now,
  documents: { portfolio: null, resume: null },
  documentsLockedAt: null,
  id: APPLICATION_ID,
  interviewAt: null,
  jobPosting: {
    companyName: "미리디",
    createdAt: now,
    externalId: "384409",
    id: POSTING_ID,
    source: "wanted",
    title: "AX Engineer - Infra",
    updatedAt: now,
    url: "https://www.wanted.co.kr/wd/384409",
  },
  note: null,
  status: "interested",
  statusHistory: [],
  updatedAt: now,
};

function applicationService(): ApplicationService {
  return {
    create: vi.fn(async () => application),
    createAttempt: vi.fn(async () => application),
    get: vi.fn(async () => application),
    list: vi.fn(async () => ({
      items: [application],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    })),
    update: vi.fn(async () => application),
    updateJobPosting: vi.fn(async () => application.jobPosting),
  };
}

function idempotencyService(claim: IdempotencyClaim): IdempotencyService {
  return {
    claim: vi.fn(async () => claim),
    complete: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
  };
}

const createInput = {
  appliedOn: null,
  companyName: "미리디",
  interviewAt: null,
  note: null,
  portfolioVersionId: null,
  resumeVersionId: null,
  source: "wanted" as const,
  status: "interested" as const,
  title: "AX Engineer - Infra",
  url: "https://www.wanted.co.kr/wd/384409",
};

async function createApplicationRequest(
  claim: IdempotencyClaim,
  options: { idempotencyKey?: string } = {},
) {
  const service = applicationService();
  const idempotency = idempotencyService(claim);
  const testApp = createApp({
    applicationServiceFactory: () => service,
    idempotencyServiceFactory: () => idempotency,
    jwtVerificationKey: publicKey,
  });
  const headers = new Headers({
    Authorization: `Bearer ${await accessToken()}`,
    "Content-Type": "application/json",
  });
  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }
  const response = await testApp.request(
    "http://localhost:8787/v1/applications",
    { body: JSON.stringify(createInput), headers, method: "POST" },
    baseEnv,
  );
  return { idempotency, response, service };
}

describe("worker idempotency", () => {
  it("requires a UUID idempotency key", async () => {
    const { response, service } = await createApplicationRequest({
      executionId: EVENT_ID,
      kind: "claimed",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_KEY_REQUIRED" },
    });
    expect(service.create).not.toHaveBeenCalled();
  });

  it("stores a successful response after one execution", async () => {
    const { idempotency, response, service } = await createApplicationRequest(
      { executionId: EVENT_ID, kind: "claimed" },
      { idempotencyKey: EVENT_ID },
    );

    expect(response.status).toBe(201);
    expect(service.create).toHaveBeenCalledOnce();
    expect(idempotency.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: EVENT_ID,
        idempotencyKey: EVENT_ID,
        status: 201,
      }),
    );
  });

  it("replays the stored response without executing the mutation", async () => {
    const storedBody = {
      data: application,
      meta: { requestId: REQUEST_ID },
    };
    const { response, service } = await createApplicationRequest(
      {
        body: storedBody,
        kind: "replay",
        requestId: REQUEST_ID,
        status: 201,
      },
      { idempotencyKey: EVENT_ID },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("Idempotency-Replayed")).toBe("true");
    expect(response.headers.get("X-Request-Id")).toBe(REQUEST_ID);
    expect(service.create).not.toHaveBeenCalled();
  });

  it.each([
    ["conflict", "IDEMPOTENCY_CONFLICT"],
    ["in_progress", "IDEMPOTENCY_IN_PROGRESS"],
  ] as const)("maps %s claims to a standard conflict", async (kind, code) => {
    const { response, service } = await createApplicationRequest(
      { kind },
      { idempotencyKey: EVENT_ID },
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
    expect(service.create).not.toHaveBeenCalled();
  });

  it("releases a claim and preserves the internal error boundary", async () => {
    const service = applicationService();
    vi.mocked(service.create).mockRejectedValue(new Error("database secret"));
    const idempotency = idempotencyService({
      executionId: EVENT_ID,
      kind: "claimed",
    });
    const testApp = createApp({
      applicationServiceFactory: () => service,
      idempotencyServiceFactory: () => idempotency,
      jwtVerificationKey: publicKey,
    });
    const response = await testApp.request(
      "http://localhost:8787/v1/applications",
      {
        body: JSON.stringify(createInput),
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          "Content-Type": "application/json",
          "Idempotency-Key": EVENT_ID,
        },
        method: "POST",
      },
      baseEnv,
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(idempotency.release).toHaveBeenCalledOnce();
    expect(body).not.toContain("database secret");
  });
});

describe("worker rate limiting", () => {
  it("limits authenticated requests by the verified administrator", async () => {
    const limiter = rateLimiter(false);
    const testApp = createApp({ jwtVerificationKey: publicKey });
    const response = await testApp.request(
      "http://localhost:8787/v1/auth/me",
      { headers: { Authorization: `Bearer ${await accessToken()}` } },
      { ...baseEnv, ADMIN_API_RATE_LIMITER: limiter },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(limiter.limit).toHaveBeenCalledWith({
      key: `admin:${ADMIN_USER_ID}`,
    });
  });

  it("limits public document access independently and excludes health", async () => {
    const limiter = rateLimiter(false);
    const env = { ...baseEnv, PUBLIC_API_RATE_LIMITER: limiter };
    const testApp = createApp();
    const limited = await testApp.request(
      "http://localhost:8787/v1/public/document-publications/resume",
      { headers: { "CF-Connecting-IP": "192.0.2.1" } },
      env,
    );
    const health = await testApp.request(
      "http://localhost:8787/health",
      {},
      env,
    );

    expect(limited.status).toBe(429);
    expect(health.status).toBe(200);
    expect(limiter.limit).toHaveBeenCalledOnce();
  });

  it("fails closed when the rate limit binding is unavailable", async () => {
    const limiter: RateLimit = {
      limit: vi.fn(async () => {
        throw new Error("binding unavailable");
      }),
    };
    const testApp = createApp({ jwtVerificationKey: publicKey });
    const response = await testApp.request(
      "http://localhost:8787/v1/auth/me",
      { headers: { Authorization: `Bearer ${await accessToken()}` } },
      { ...baseEnv, ADMIN_API_RATE_LIMITER: limiter },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UPSTREAM_UNAVAILABLE", retryable: true },
    });
  });
});

describe("n8n request signing", () => {
  const body = new TextEncoder().encode('{"status":"running"}');
  const timestamp = 1_799_712_000;

  async function signedRequest(
    path = "/v1/internal/test",
    signedAt = Math.floor(Date.now() / 1_000),
  ) {
    const headers = await createSignedHeaders({
      body,
      eventId: EVENT_ID,
      method: "POST",
      path,
      requestId: REQUEST_ID,
      secret: baseEnv.N8N_CALLBACK_SECRET,
      timestamp: signedAt,
    });
    return new Request(`http://localhost:8787${path}`, {
      body,
      headers,
      method: "POST",
    });
  }

  it("verifies the exact method, path, timestamp, IDs, and raw body", async () => {
    const request = await signedRequest("/v1/internal/test", timestamp);
    await expect(
      verifySignedRequest({
        now: timestamp,
        request,
        secret: baseEnv.N8N_CALLBACK_SECRET,
      }),
    ).resolves.toMatchObject({ eventId: EVENT_ID, requestId: REQUEST_ID });

    const tampered = new Request(request, {
      body: '{"status":"failed"}',
    });
    await expect(
      verifySignedRequest({
        now: timestamp,
        request: tampered,
        secret: baseEnv.N8N_CALLBACK_SECRET,
      }),
    ).resolves.toBeNull();
  });

  it("rejects signatures outside the five minute window", async () => {
    await expect(
      verifySignedRequest({
        now: timestamp + 301,
        request: await signedRequest("/v1/internal/test", timestamp),
        secret: baseEnv.N8N_CALLBACK_SECRET,
      }),
    ).resolves.toBeNull();
  });

  it("protects the internal namespace before routing callbacks", async () => {
    const testApp = createApp();
    const unsigned = await testApp.request(
      "http://localhost:8787/v1/internal/test",
      {
        body: "{}",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
      baseEnv,
    );
    const signed = await signedRequest();
    const accepted = await testApp.request(signed, undefined, baseEnv);
    const wrongMethod = await testApp.request(
      "http://localhost:8787/v1/internal/test",
      { method: "GET" },
      baseEnv,
    );

    expect(unsigned.status).toBe(401);
    expect(accepted.status).toBe(404);
    expect(accepted.headers.get("X-Request-Id")).toBe(REQUEST_ID);
    expect(wrongMethod.status).toBe(405);
  });
});

describe("n8n dispatch client", () => {
  const payload: N8nDispatchPayload = {
    analysisJobId: APPLICATION_ID,
    callbacks: {
      eventPath: `/v1/internal/analysis-jobs/${APPLICATION_ID}/events`,
      resultPath: `/v1/internal/analysis-jobs/${APPLICATION_ID}/result`,
    },
    eventId: EVENT_ID,
    jobPosting: {
      companyName: "미리디",
      contentHash: "c".repeat(64),
      id: POSTING_ID,
      snapshotId: "00000000-0000-4000-8000-000000000008",
      source: "wanted",
      text: "채용공고 본문",
      title: "AX Engineer - Infra",
      url: "https://www.wanted.co.kr/wd/384409",
    },
    kind: "application_analysis",
    outputSchemas: {
      jobPostingFacts: { type: "object" },
      profileComparison: { type: "object" },
    },
    profile: {
      portfolio: {
        contentHash: "b".repeat(64),
        originalLength: 9,
        text: "포트폴리오 본문",
        truncated: false,
        versionId: "00000000-0000-4000-8000-000000000006",
      },
      resume: {
        contentHash: "a".repeat(64),
        originalLength: 7,
        text: "이력서 본문",
        truncated: false,
        versionId: "00000000-0000-4000-8000-000000000007",
      },
    },
    requestId: REQUEST_ID,
    runAttempt: 1,
    schemaVersion: "1.0.0",
  };

  it("sends one signed JSON request and accepts any 2xx response", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        const verified = await verifySignedRequest({
          now: 1_799_712_000,
          request,
          secret: baseEnv.N8N_WEBHOOK_SECRET,
        });
        expect(verified).not.toBeNull();
        return new Response(null, { status: 202 });
      },
    ) as typeof fetch;

    await expect(
      dispatchToN8n(payload, baseEnv, {
        fetcher,
        now: 1_799_712_000,
      }),
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    [400, "rejected", false],
    [429, "unavailable", true],
    [500, "unavailable", true],
  ] as const)(
    "maps HTTP %s without exposing the response body",
    async (status, kind, retryable) => {
      const fetcher = vi.fn(
        async () => new Response("secret upstream body", { status }),
      ) as unknown as typeof fetch;
      const error = await dispatchToN8n(payload, baseEnv, { fetcher }).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(N8nDispatchError);
      expect(error).toMatchObject({ kind, retryable });
      expect(String(error)).not.toContain("secret upstream body");
    },
  );

  it("aborts a stalled webhook at the configured timeout", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    ) as typeof fetch;

    await expect(
      dispatchToN8n(payload, baseEnv, { fetcher, timeoutMs: 1 }),
    ).rejects.toMatchObject({ kind: "timeout", retryable: true });
  });
});
