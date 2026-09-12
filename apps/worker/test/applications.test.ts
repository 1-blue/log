import type {
  ApplicationDetail,
  ApplicationJobPosting,
  ApplicationStateInput,
  ApplicationSummary,
  CreateApplicationRequest,
  PatchApplicationRequest,
  PatchJobPostingRequest,
} from "@workspace/contracts";
import {
  ApplicationJobPostingResponseSchema,
  ApplicationListResponseSchema,
  ApplicationResponseSchema,
} from "@workspace/contracts";

import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import {
  type ApplicationService,
  ApplicationServiceError,
} from "../src/applications.js";

const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000001";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000010";
const POSTING_ID = "00000000-0000-4000-8000-000000000011";
const AUTH_ISSUER = "https://example.supabase.co/auth/v1";
const now = "2026-09-12T00:00:00.000Z";

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

const posting: ApplicationJobPosting = {
  companyName: "미리디",
  createdAt: now,
  externalId: "384409",
  id: POSTING_ID,
  source: "wanted",
  title: "AX Engineer - Infra",
  updatedAt: now,
  url: "https://www.wanted.co.kr/wd/384409",
};

const summary: ApplicationSummary = {
  appliedOn: null,
  archivedAt: null,
  attemptNumber: 1,
  createdAt: now,
  documents: { portfolio: null, resume: null },
  documentsLockedAt: null,
  id: APPLICATION_ID,
  interviewAt: null,
  jobPosting: posting,
  note: null,
  status: "interested",
  updatedAt: now,
};

const detail: ApplicationDetail = {
  ...summary,
  statusHistory: [
    {
      changedAt: now,
      fromStatus: null,
      id: "00000000-0000-4000-8000-000000000012",
      toStatus: "interested",
    },
  ],
};

function fakeService(): ApplicationService {
  return {
    create: vi.fn(async () => detail),
    createAttempt: vi.fn(async () => ({ ...detail, attemptNumber: 2 })),
    get: vi.fn(async () => detail),
    list: vi.fn(async () => ({
      items: [summary],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    })),
    update: vi.fn(
      async (): Promise<ApplicationDetail> => ({
        ...detail,
        status: "preparing",
      }),
    ),
    updateJobPosting: vi.fn(async () => ({ ...posting, title: "수정된 공고" })),
  };
}

async function request(
  path: string,
  init: RequestInit = {},
  service = fakeService(),
) {
  const app = createApp({
    applicationServiceFactory: () => service,
    jwtVerificationKey: publicKey,
  });
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await accessToken()}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return {
    response: await app.request(
      `http://localhost:8787${path}`,
      { ...init, headers },
      mockEnv,
    ),
    service,
  };
}

const state: ApplicationStateInput = {
  appliedOn: null,
  interviewAt: null,
  note: null,
  portfolioVersionId: null,
  resumeVersionId: null,
  status: "interested",
};

const creation: CreateApplicationRequest = {
  ...state,
  companyName: "미리디",
  source: "wanted",
  title: "AX Engineer - Infra",
  url: "https://www.wanted.co.kr/wd/384409",
};

describe("worker application API", () => {
  it("creates a Wanted application through the authenticated service", async () => {
    const { response, service } = await request("/v1/applications", {
      body: JSON.stringify(creation),
      method: "POST",
    });
    expect(response.status).toBe(201);
    expect(
      ApplicationResponseSchema.safeParse(await response.json()).success,
    ).toBe(true);
    expect(service.create).toHaveBeenCalledWith(ADMIN_USER_ID, creation);
  });

  it("rejects malformed URLs and submitted states without documents", async () => {
    const malformed = await request("/v1/applications", {
      body: JSON.stringify({ ...creation, url: "https://example.com/job/1" }),
      method: "POST",
    });
    const submitted = await request("/v1/applications", {
      body: JSON.stringify({ ...creation, status: "applied" }),
      method: "POST",
    });
    expect(malformed.response.status).toBe(400);
    expect(submitted.response.status).toBe(400);
    expect(malformed.service.create).not.toHaveBeenCalled();
    expect(submitted.service.create).not.toHaveBeenCalled();
  });

  it("requires JSON for write requests", async () => {
    const { response, service } = await request("/v1/applications", {
      body: JSON.stringify(creation),
      headers: { "Content-Type": "text/plain" },
      method: "POST",
    });
    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("lists with validated filters and pagination", async () => {
    const { response, service } = await request(
      "/v1/applications?q=%EB%AF%B8%EB%A6%AC%EB%94%94&status=interested&page=1",
    );
    const payload: unknown = await response.json();
    expect(response.status).toBe(200);
    expect(ApplicationListResponseSchema.safeParse(payload).success).toBe(true);
    expect(service.list).toHaveBeenCalledWith(
      ADMIN_USER_ID,
      expect.objectContaining({ q: "미리디", status: "interested" }),
    );
  });

  it("gets, updates, and archives one application", async () => {
    const service = fakeService();
    const retrieved = await request(
      `/v1/applications/${APPLICATION_ID}`,
      {},
      service,
    );
    const input: PatchApplicationRequest = { status: "preparing" };
    const updated = await request(
      `/v1/applications/${APPLICATION_ID}`,
      { body: JSON.stringify(input), method: "PATCH" },
      service,
    );
    expect(retrieved.response.status).toBe(200);
    expect(updated.response.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(
      ADMIN_USER_ID,
      APPLICATION_ID,
      input,
    );
  });

  it("creates another attempt for an existing posting", async () => {
    const { response, service } = await request(
      `/v1/job-postings/${POSTING_ID}/applications`,
      { body: JSON.stringify(state), method: "POST" },
    );
    expect(response.status).toBe(201);
    expect(service.createAttempt).toHaveBeenCalledWith(
      ADMIN_USER_ID,
      POSTING_ID,
      state,
    );
  });

  it("updates editable posting details but not its URL", async () => {
    const input: PatchJobPostingRequest = { title: "수정된 공고" };
    const { response, service } = await request(
      `/v1/job-postings/${POSTING_ID}`,
      { body: JSON.stringify(input), method: "PATCH" },
    );
    expect(response.status).toBe(200);
    expect(
      ApplicationJobPostingResponseSchema.safeParse(await response.json())
        .success,
    ).toBe(true);
    expect(service.updateJobPosting).toHaveBeenCalledWith(
      ADMIN_USER_ID,
      POSTING_ID,
      input,
    );
  });

  it("returns duplicate context for the reapplication flow", async () => {
    const service = fakeService();
    vi.mocked(service.create).mockRejectedValue(
      new ApplicationServiceError("conflict", {
        jobPostingId: POSTING_ID,
        latestApplicationId: APPLICATION_ID,
        reason: "duplicate_job_posting",
      }),
    );
    const { response } = await request(
      "/v1/applications",
      { body: JSON.stringify(creation), method: "POST" },
      service,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "CONFLICT",
        details: { jobPostingId: POSTING_ID, reason: "duplicate_job_posting" },
      },
    });
  });

  it("does not expose upstream details", async () => {
    const service = fakeService();
    vi.mocked(service.list).mockRejectedValue(
      new ApplicationServiceError("unavailable"),
    );
    const { response } = await request("/v1/applications", {}, service);
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(body).not.toContain(mockEnv.SUPABASE_SECRET_KEY);
    expect(JSON.parse(body)).toMatchObject({
      error: { code: "UPSTREAM_UNAVAILABLE", retryable: true },
    });
  });
});
