import type {
  AnalysisWorkspace,
  InterviewChecklistItem,
  InterviewNote,
  InterviewQuestion,
} from "@workspace/contracts";
import {
  AnalysisReviewResponseSchema,
  AnalysisWorkspaceResponseSchema,
  InterviewAnswerHistoryResponseSchema,
  InterviewAnswerResponseSchema,
  InterviewChecklistItemResponseSchema,
  InterviewChecklistListResponseSchema,
  InterviewNoteResponseSchema,
} from "@workspace/contracts";

import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { IdempotencyService } from "../src/idempotency.js";
import {
  type InterviewWorkspaceService,
  InterviewWorkspaceServiceError,
} from "../src/interview-workspace.js";

const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000001";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000002";
const ANALYSIS_ID = "00000000-0000-4000-8000-000000000003";
const QUESTION_ID = "00000000-0000-4000-8000-000000000004";
const CHECKLIST_ID = "00000000-0000-4000-8000-000000000005";
const NOTE_ID = "00000000-0000-4000-8000-000000000006";
const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000007";
const RESUME_ID = "00000000-0000-4000-8000-000000000008";
const PORTFOLIO_ID = "00000000-0000-4000-8000-000000000009";
const POSTING_ID = "00000000-0000-4000-8000-000000000010";
const REQUEST_ID = "00000000-0000-4000-8000-000000000011";
const NOW = "2026-09-14T00:00:00.000Z";

const mockEnv: CloudflareBindings = {
  ADMIN_USER_ID,
  APP_BASE_URL: "http://localhost:3000",
  N8N_CALLBACK_SECRET: "test-callback-secret",
  N8N_WEBHOOK_SECRET: "test-webhook-secret",
  N8N_WEBHOOK_URL: "http://localhost:5678/webhook/career-analysis",
  SLACK_ERROR_WEBHOOK_URL: "https://hooks.slack.com/services/test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  SUPABASE_URL: "https://example.supabase.co",
  ADMIN_API_RATE_LIMITER: {
    limit: vi.fn(async () => ({ success: true })),
  },
  PUBLIC_API_RATE_LIMITER: {
    limit: vi.fn(async () => ({ success: true })),
  },
};

const question: InterviewQuestion = {
  analysisJobId: ANALYSIS_ID,
  answerRevisionCount: 0,
  category: "인프라",
  createdAt: NOW,
  currentAnswer: null,
  id: QUESTION_ID,
  intent: "장애 대응 경험을 확인합니다.",
  priority: "high",
  question: "장애 대응 경험을 설명해 주세요.",
  requirementIds: ["required-1"],
  sourceIndex: 0,
};

const checklist: InterviewChecklistItem = {
  analysisJobId: ANALYSIS_ID,
  archivedAt: null,
  completedAt: null,
  content: "장애 대응 사례 정리",
  createdAt: NOW,
  id: CHECKLIST_ID,
  position: 0,
  priority: "high",
  source: "gap_action",
  sourceKey: "gap:0:action:0",
  updatedAt: NOW,
};

const note: InterviewNote = {
  analysisJobId: ANALYSIS_ID,
  applicationId: APPLICATION_ID,
  archivedAt: null,
  content: null,
  createdAt: NOW,
  followUpActions: "경험을 수치화합니다.",
  id: NOTE_ID,
  improvements: "답변을 더 짧게 정리합니다.",
  interviewedAt: NOW,
  questionsAsked: "장애 대응 질문",
  roundLabel: "1차 실무 면접",
  updatedAt: NOW,
  wentWell: "근거를 설명했습니다.",
};

const workspace: AnalysisWorkspace = {
  application: {
    attemptNumber: 1,
    companyName: "미리디",
    id: APPLICATION_ID,
    title: "AX Engineer - Infra",
  },
  checklist: [checklist],
  comparison: null,
  history: [],
  interviewNotes: [note],
  job: {
    applicationId: APPLICATION_ID,
    attemptCount: 1,
    createdAt: NOW,
    finishedAt: null,
    id: ANALYSIS_ID,
    jobPostingId: POSTING_ID,
    jobPostingSnapshotId: SNAPSHOT_ID,
    lastError: null,
    lastHeartbeatAt: NOW,
    portfolioVersionId: PORTFOLIO_ID,
    requestId: REQUEST_ID,
    result: null,
    resumeVersionId: RESUME_ID,
    retryAt: null,
    stage: "matching",
    startedAt: NOW,
    status: "running",
    updatedAt: NOW,
  },
  questions: [question],
  resultMetadata: null,
  review: { overallNote: null, requirements: [], updatedAt: null },
  reviewedFitScore: null,
  sources: {
    jobPostingSnapshot: {
      contentHash: "a".repeat(64),
      fetchedAt: NOW,
      id: SNAPSHOT_ID,
      source: "wanted_json_ld",
    },
    portfolio: {
      archivedAt: null,
      contentHash: "b".repeat(64),
      id: PORTFOLIO_ID,
      label: "포트폴리오 v1",
    },
    resume: {
      archivedAt: null,
      contentHash: "c".repeat(64),
      id: RESUME_ID,
      label: "이력서 v1",
    },
  },
};

function service(): InterviewWorkspaceService {
  return {
    archiveChecklist: vi.fn(async () => ({ ...checklist, archivedAt: NOW })),
    archiveNote: vi.fn(async () => ({ ...note, archivedAt: NOW })),
    createChecklist: vi.fn(
      async (): Promise<InterviewChecklistItem> => ({
        ...checklist,
        source: "custom",
      }),
    ),
    createNote: vi.fn(async () => note),
    getWorkspace: vi.fn(async () => workspace),
    listAnswers: vi.fn(async () => []),
    patchChecklist: vi.fn(async () => ({ ...checklist, completedAt: NOW })),
    patchNote: vi.fn(async () => note),
    reorderChecklist: vi.fn(async () => [checklist]),
    saveAnswer: vi.fn(async () => ({
      currentAnswer: {
        answer: "STAR 답변",
        createdAt: NOW,
        id: "00000000-0000-4000-8000-000000000012",
        questionId: QUESTION_ID,
        revision: 1,
      },
      revisionCount: 1,
    })),
    saveReview: vi.fn(async () => ({
      review: {
        overallNote: "개인 메모",
        requirements: [],
        updatedAt: NOW,
      },
      reviewedFitScore: 75,
    })),
  };
}

function idempotencyService(): IdempotencyService {
  return {
    claim: vi.fn(async ({ executionId }) => ({
      executionId,
      kind: "claimed" as const,
    })),
    complete: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
  };
}

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
    .setIssuer("https://example.supabase.co/auth/v1")
    .setAudience("authenticated")
    .setSubject(ADMIN_USER_ID)
    .setExpirationTime("5m")
    .sign(privateKey);
}

async function request(
  path: string,
  init: RequestInit = {},
  workspaceService = service(),
) {
  const app = createApp({
    idempotencyServiceFactory: () => idempotencyService(),
    interviewWorkspaceServiceFactory: () => workspaceService,
    jwtVerificationKey: publicKey,
  });
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await accessToken()}`);
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.method === "POST") {
    headers.set("Idempotency-Key", crypto.randomUUID());
  }
  const response = await app.request(
    `http://localhost:8787${path}`,
    { ...init, headers },
    mockEnv,
  );
  return { response, workspaceService };
}

describe("interview workspace API", () => {
  it("returns the workspace and forwards a comparison ID", async () => {
    const comparisonId = "00000000-0000-4000-8000-000000000013";
    const { response, workspaceService } = await request(
      `/v1/analysis-jobs/${ANALYSIS_ID}/workspace?compareTo=${comparisonId}`,
    );
    expect(response.status).toBe(200);
    expect(
      AnalysisWorkspaceResponseSchema.safeParse(await response.json()).success,
    ).toBe(true);
    expect(workspaceService.getWorkspace).toHaveBeenCalledWith(
      ADMIN_USER_ID,
      ANALYSIS_ID,
      comparisonId,
    );
  });

  it("validates comparison and review payloads", async () => {
    const comparison = await request(
      `/v1/analysis-jobs/${ANALYSIS_ID}/workspace?compareTo=invalid`,
    );
    const review = await request(`/v1/analysis-jobs/${ANALYSIS_ID}/review`, {
      body: JSON.stringify({ overallNote: null }),
      method: "PUT",
    });
    expect(comparison.response.status).toBe(400);
    expect(review.response.status).toBe(400);
  });

  it("saves analysis reviews and maps stale conflicts", async () => {
    const valid = await request(`/v1/analysis-jobs/${ANALYSIS_ID}/review`, {
      body: JSON.stringify({
        expectedUpdatedAt: null,
        overallNote: "개인 메모",
        requirements: [],
      }),
      method: "PUT",
    });
    expect(valid.response.status).toBe(200);
    expect(
      AnalysisReviewResponseSchema.safeParse(await valid.response.json())
        .success,
    ).toBe(true);

    const staleService = service();
    vi.mocked(staleService.saveReview).mockRejectedValue(
      new InterviewWorkspaceServiceError("conflict", {
        reason: "stale_update",
      }),
    );
    const stale = await request(
      `/v1/analysis-jobs/${ANALYSIS_ID}/review`,
      {
        body: JSON.stringify({
          expectedUpdatedAt: NOW,
          overallNote: null,
          requirements: [],
        }),
        method: "PUT",
      },
      staleService,
    );
    expect(stale.response.status).toBe(409);
  });

  it("saves, clears, and lists answer revisions", async () => {
    const saved = await request(
      `/v1/interview-questions/${QUESTION_ID}/answer`,
      { body: JSON.stringify({ answer: "STAR 답변" }), method: "PUT" },
    );
    const cleared = await request(
      `/v1/interview-questions/${QUESTION_ID}/answer`,
      { body: JSON.stringify({ answer: null }), method: "PUT" },
    );
    const history = await request(
      `/v1/interview-questions/${QUESTION_ID}/answers`,
    );
    expect(saved.response.status).toBe(200);
    expect(cleared.response.status).toBe(200);
    expect(history.response.status).toBe(200);
    expect(
      InterviewAnswerResponseSchema.safeParse(await saved.response.json())
        .success,
    ).toBe(true);
    expect(
      InterviewAnswerHistoryResponseSchema.safeParse(
        await history.response.json(),
      ).success,
    ).toBe(true);
  });

  it("creates, updates, archives, and reorders checklist items", async () => {
    const created = await request(
      `/v1/analysis-jobs/${ANALYSIS_ID}/checklist-items`,
      {
        body: JSON.stringify({ content: "추가 준비", priority: "medium" }),
        method: "POST",
      },
    );
    const updated = await request(
      `/v1/interview-checklist-items/${CHECKLIST_ID}`,
      {
        body: JSON.stringify({ completed: true, expectedUpdatedAt: NOW }),
        method: "PATCH",
      },
    );
    const archived = await request(
      `/v1/interview-checklist-items/${CHECKLIST_ID}?expectedUpdatedAt=${encodeURIComponent(NOW)}`,
      { method: "DELETE" },
    );
    const reordered = await request(
      `/v1/analysis-jobs/${ANALYSIS_ID}/checklist-order`,
      { body: JSON.stringify({ itemIds: [CHECKLIST_ID] }), method: "PUT" },
    );
    expect(created.response.status).toBe(201);
    expect(updated.response.status).toBe(200);
    expect(archived.response.status).toBe(200);
    expect(reordered.response.status).toBe(200);
    expect(
      InterviewChecklistItemResponseSchema.safeParse(
        await created.response.json(),
      ).success,
    ).toBe(true);
    expect(
      InterviewChecklistListResponseSchema.safeParse(
        await reordered.response.json(),
      ).success,
    ).toBe(true);
  });

  it("creates, updates, and archives structured interview notes", async () => {
    const input = {
      analysisJobId: ANALYSIS_ID,
      content: null,
      followUpActions: "후속 작업",
      improvements: "개선점",
      interviewedAt: NOW,
      questionsAsked: "질문",
      roundLabel: "1차 실무 면접",
      wentWell: "잘한 점",
    };
    const created = await request(
      `/v1/applications/${APPLICATION_ID}/interview-notes`,
      { body: JSON.stringify(input), method: "POST" },
    );
    const updated = await request(`/v1/interview-notes/${NOTE_ID}`, {
      body: JSON.stringify({
        ...input,
        analysisJobId: undefined,
        expectedUpdatedAt: NOW,
      }),
      method: "PATCH",
    });
    const archived = await request(
      `/v1/interview-notes/${NOTE_ID}?expectedUpdatedAt=${encodeURIComponent(NOW)}`,
      { method: "DELETE" },
    );
    expect(created.response.status).toBe(201);
    expect(updated.response.status).toBe(200);
    expect(archived.response.status).toBe(200);
    expect(
      InterviewNoteResponseSchema.safeParse(await created.response.json())
        .success,
    ).toBe(true);
  });
});
