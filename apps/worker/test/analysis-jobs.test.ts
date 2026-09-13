import type { AnalysisJobResponse, AnalysisResult } from "@workspace/contracts";
import {
  AnalysisJobListResponseSchema,
  AnalysisJobStatusResponseSchema,
  CreateAnalysisJobResponseSchema,
} from "@workspace/contracts";

import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  type AnalysisJobService,
  prepareAnalysisDocumentText,
  prepareAnalysisJobPostingText,
  validateAnalysisSemantics,
} from "../src/analysis-jobs.js";
import { createApp } from "../src/app.js";
import type { IdempotencyService } from "../src/idempotency.js";

const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000001";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000002";
const ANALYSIS_JOB_ID = "00000000-0000-4000-8000-000000000003";
const POSTING_ID = "00000000-0000-4000-8000-000000000004";
const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000005";
const RESUME_ID = "00000000-0000-4000-8000-000000000006";
const PORTFOLIO_ID = "00000000-0000-4000-8000-000000000007";
const REQUEST_ID = "00000000-0000-4000-8000-000000000008";
const NOW = "2026-09-13T00:00:00.000Z";

const result: AnalysisResult = {
  comparison: {
    gaps: [],
    interviewQuestions: [],
    matches: [
      {
        profileEvidence: [
          {
            excerpt: "Cloudflare Worker API를 구현했습니다.",
            section: "프로젝트",
            source: "resume",
            sourceVersionId: RESUME_ID,
          },
        ],
        rationale: "관련 구현 경험이 명시되어 있습니다.",
        requirementId: "required-1",
        status: "matched",
      },
    ],
    summary: "필수 요구사항에 직접 대응하는 경험이 있습니다.",
    warnings: [],
  },
  fitScore: 100,
  job: {
    companyName: "미리디",
    requirements: [
      {
        evidence: [
          {
            excerpt: "Cloudflare Worker 운영 경험",
            section: "자격요건",
            source: "job_posting",
            sourceVersionId: SNAPSHOT_ID,
          },
        ],
        id: "required-1",
        kind: "required",
        text: "Cloudflare Worker 운영 경험",
      },
    ],
    summary: "인프라 자동화 역량을 요구합니다.",
    technologies: [],
    title: "AX Engineer - Infra",
    traits: [],
    warnings: [],
  },
};

const row: Parameters<typeof validateAnalysisSemantics>[1] = {
  application_id: APPLICATION_ID,
  attempt_count: 1,
  created_at: NOW,
  document_type: "resume",
  error_code: null,
  error_message: null,
  error_retryable: false,
  final_event_id: null,
  finished_at: null,
  id: ANALYSIS_JOB_ID,
  job_posting_content_hash: "a".repeat(64),
  job_posting_id: POSTING_ID,
  job_posting_snapshot_id: SNAPSHOT_ID,
  job_posting_text: "자격요건\nCloudflare Worker 운영 경험",
  owner_id: ADMIN_USER_ID,
  portfolio_content_hash: "b".repeat(64),
  portfolio_document_type: "portfolio",
  portfolio_original_length: 20,
  portfolio_text: "n8n 자동화 경험이 있습니다.",
  portfolio_truncated: false,
  portfolio_version_id: PORTFOLIO_ID,
  request_id: REQUEST_ID,
  resume_content_hash: "c".repeat(64),
  resume_original_length: 30,
  resume_text: "프로젝트\nCloudflare Worker API를 구현했습니다.",
  resume_truncated: false,
  resume_version_id: RESUME_ID,
  stage: "matching",
  started_at: NOW,
  status: "running",
  updated_at: NOW,
};

const response: AnalysisJobResponse = {
  applicationId: APPLICATION_ID,
  attemptCount: 0,
  createdAt: NOW,
  finishedAt: null,
  id: ANALYSIS_JOB_ID,
  jobPostingId: POSTING_ID,
  jobPostingSnapshotId: SNAPSHOT_ID,
  lastError: null,
  portfolioVersionId: PORTFOLIO_ID,
  requestId: REQUEST_ID,
  result: null,
  resumeVersionId: RESUME_ID,
  stage: "dispatching",
  startedAt: null,
  status: "queued",
  updatedAt: NOW,
};

describe("analysis input and evidence validation", () => {
  it("keeps short text and deterministically trims long text", () => {
    expect(prepareAnalysisDocumentText("  짧은 문서  ")).toEqual({
      originalLength: 5,
      text: "짧은 문서",
      truncated: false,
    });
    const long = Array.from({ length: 90_000 }, (_, index) =>
      String(index % 10),
    ).join("");
    const first = prepareAnalysisDocumentText(long);
    const second = prepareAnalysisDocumentText(long);
    expect(first).toEqual(second);
    expect(first.truncated).toBe(true);
    expect(first.originalLength).toBe(90_000);
    expect(first.text.length).toBeLessThanOrEqual(80_100);
    expect(first.text).toContain("[...중간 일부 생략...]");

    const posting = prepareAnalysisJobPostingText(long + long);
    expect(posting).toHaveLength(100_000);
    expect(posting).toContain("[...중간 일부 생략...]");
  });

  it("accepts exact evidence and rejects invented excerpts or scores", () => {
    expect(validateAnalysisSemantics(result, row)).toEqual({ ok: true });
    expect(
      validateAnalysisSemantics(
        {
          ...result,
          job: {
            ...result.job,
            requirements: [
              {
                ...result.job.requirements[0]!,
                evidence: [
                  {
                    ...result.job.requirements[0]!.evidence[0]!,
                    excerpt: "원문에 없는 경력",
                  },
                ],
              },
            ],
          },
        },
        row,
      ),
    ).toEqual({ ok: false, reason: "invalid_job_evidence" });
    expect(validateAnalysisSemantics({ ...result, fitScore: 99 }, row)).toEqual(
      { ok: false, reason: "invalid_fit_score" },
    );
  });
});

describe("analysis job API", () => {
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
      .setIssuer("https://example.supabase.co/auth/v1")
      .setAudience("authenticated")
      .setSubject(ADMIN_USER_ID)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }

  function service(): AnalysisJobService {
    return {
      complete: vi.fn(
        async (): Promise<AnalysisJobResponse> => ({
          ...response,
          result,
          status: "succeeded",
        }),
      ),
      create: vi.fn(async () => response),
      event: vi.fn(
        async (): Promise<AnalysisJobResponse> => ({
          ...response,
          status: "running",
        }),
      ),
      get: vi.fn(async () => response),
      list: vi.fn(async () => [response]),
    };
  }

  function idempotency(): IdempotencyService {
    return {
      claim: vi.fn(async ({ executionId }) => ({
        executionId,
        kind: "claimed" as const,
      })),
      complete: vi.fn(async () => undefined),
      release: vi.fn(async () => undefined),
    };
  }

  async function request(path: string, init: RequestInit = {}) {
    const app = createApp({
      analysisJobServiceFactory: () => service(),
      idempotencyServiceFactory: () => idempotency(),
      jwtVerificationKey: publicKey,
    });
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await token()}`);
    if (init.body) headers.set("Content-Type", "application/json");
    if (init.method === "POST")
      headers.set("Idempotency-Key", crypto.randomUUID());
    return app.request(
      `http://localhost:8787${path}`,
      { ...init, headers },
      {
        ADMIN_USER_ID,
        ADMIN_API_RATE_LIMITER: {
          limit: vi.fn(async () => ({ success: true })),
        },
        APP_BASE_URL: "http://localhost:3000",
        N8N_CALLBACK_SECRET: "callback",
        N8N_WEBHOOK_SECRET: "webhook",
        N8N_WEBHOOK_URL: "http://localhost:5678/webhook/career-analysis",
        PUBLIC_API_RATE_LIMITER: {
          limit: vi.fn(async () => ({ success: true })),
        },
        SLACK_ERROR_WEBHOOK_URL: "https://hooks.slack.com/test",
        SUPABASE_SECRET_KEY: "secret",
        SUPABASE_URL: "https://example.supabase.co",
      },
    );
  }

  it("creates, lists, and reads an analysis job with strict envelopes", async () => {
    const created = await request(
      `/v1/applications/${APPLICATION_ID}/analysis-jobs`,
      {
        body: "{}",
        method: "POST",
      },
    );
    const listed = await request(
      `/v1/applications/${APPLICATION_ID}/analysis-jobs`,
    );
    const fetched = await request(`/v1/analysis-jobs/${ANALYSIS_JOB_ID}`);

    expect(created.status).toBe(202);
    expect(
      CreateAnalysisJobResponseSchema.safeParse(await created.json()).success,
    ).toBe(true);
    expect(
      AnalysisJobListResponseSchema.safeParse(await listed.json()).success,
    ).toBe(true);
    expect(
      AnalysisJobStatusResponseSchema.safeParse(await fetched.json()).success,
    ).toBe(true);
  });
});
