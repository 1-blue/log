import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  AdminLoginInputSchema,
  AdminSessionResponseSchema,
  AnalysisEventCallbackSchema,
  AnalysisJobActionRequestSchema,
  AnalysisJobResponseSchema,
  type AnalysisResult,
  AnalysisResultCallbackSchema,
  AnalysisResultSchema,
  AnalysisWorkspaceResponseSchema,
  ApplicationListQuerySchema,
  ApplicationResponseSchema,
  ApplicationStateInputSchema,
  ApplicationStatusSchema,
  calculateAnalysisFitScore,
  CompleteDocumentUploadRequestSchema,
  CreateApplicationRequestSchema,
  CreateInterviewNoteRequestSchema,
  CreateJobPostingCollectionRequestSchema,
  CreateJobPostingRequestSchema,
  DOCUMENT_MAX_FILE_SIZE,
  DocumentDownloadUrlResponseSchema,
  DocumentExtractionCallbackSchema,
  DocumentExtractionStatusSchema,
  DocumentTypeSchema,
  DocumentUploadMetadataSchema,
  DocumentVersionResponseSchema,
  IdempotencyKeySchema,
  isValidAnalysisJobTransition,
  isValidJobPostingCollectionTransition,
  isValidSlackNotificationTransition,
  JobPostingCollectionCallbackSchema,
  JobPostingCollectionStatusSchema,
  N8nSlackNotificationDispatchPayloadSchema,
  PatchApplicationRequestSchema,
  PatchInterviewChecklistItemRequestSchema,
  PrepareDocumentUploadResponseSchema,
  PublicDocumentAccessResponseSchema,
  ReorderInterviewChecklistRequestSchema,
  SaveInterviewAnswerRequestSchema,
  SlackNotificationResponseSchema,
  SlackNotificationResultCallbackSchema,
  SlackNotificationStatusSchema,
  UpdateAnalysisReviewRequestSchema,
  UpdateDocumentVersionRequestSchema,
} from "../src/index.js";

const validUuid = "00000000-0000-4000-8000-000000000001";
const validWantedUrl = "https://www.wanted.co.kr/wd/384409";

function expectStrictJsonSchemaObjects(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const schema = value as Record<string, unknown>;
  if (schema.type === "object") {
    const properties = (schema.properties ?? {}) as Record<string, unknown>;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(Object.keys(properties));
  }
  for (const nested of Object.values(schema)) {
    if (Array.isArray(nested)) {
      nested.forEach(expectStrictJsonSchemaObjects);
    } else {
      expectStrictJsonSchemaObjects(nested);
    }
  }
}

const validAnalysisResult: AnalysisResult = {
  job: {
    title: "AX Engineer - Infra",
    companyName: "미리디",
    summary: "인프라 자동화와 서비스 운영 역량을 요구하는 공고입니다.",
    bodySections: {
      companyIntroduction: null,
      positionIntroduction: null,
      expectations: null,
      mainResponsibilities: null,
      requirements: null,
      preferred: null,
      employmentConditions: null,
      process: null,
      benefits: null,
      technologies: null,
      traits: null,
      deadline: null,
      location: null,
      other: null,
    },
    requirements: [
      {
        id: "requirement-1",
        kind: "required",
        text: "클라우드 인프라 운영 경험",
        evidence: [
          {
            source: "job_posting",
            sourceVersionId: validUuid,
            section: "자격요건",
            excerpt: "클라우드 인프라 운영 경험",
            context: null,
          },
        ],
      },
    ],
    technologies: [],
    traits: [],
    warnings: [],
  },
  comparison: {
    summary: "관련 경험이 일부 확인되지만 운영 자동화 경험을 보완해야 합니다.",
    matches: [
      {
        requirementId: "requirement-1",
        status: "partial",
        rationale:
          "프로젝트 운영 경험은 있으나 클라우드 운영 범위가 제한적입니다.",
        profileEvidence: [
          {
            source: "portfolio",
            sourceVersionId: validUuid,
            section: "프로젝트 경험",
            excerpt: "배포 및 모니터링 환경을 구성했습니다.",
            context: null,
          },
        ],
      },
    ],
    gaps: [],
    interviewQuestions: [],
    applicationStrategy: {
      motivationDraft: null,
      keyMessages: [],
      resumeFocus: null,
      portfolioFocus: null,
      warnings: [],
    },
    warnings: [],
  },
  fitScore: 50,
};

describe("career operations contracts", () => {
  it("accepts only UUID idempotency keys", () => {
    expect(IdempotencyKeySchema.safeParse(validUuid).success).toBe(true);
    expect(IdempotencyKeySchema.safeParse("reused-key").success).toBe(false);
  });

  it("validates administrator login inputs and session responses", () => {
    expect(
      AdminLoginInputSchema.safeParse({
        email: "admin@example.com",
        password: "strong-password",
      }).success,
    ).toBe(true);
    expect(
      PrepareDocumentUploadResponseSchema.safeParse({
        data: {
          documentVersionId: validUuid,
          expiresAt: null,
          resumableEndpoint:
            "https://example.supabase.co/storage/v1/upload/resumable",
          storagePath: `${validUuid}/portfolio/portfolio-000000.pdf`,
          uploadMethod: "tus",
          uploadToken: null,
        },
        meta: { requestId: validUuid },
      }).success,
    ).toBe(true);
    expect(
      AdminLoginInputSchema.safeParse({
        email: "not-an-email",
        password: "strong-password",
      }).success,
    ).toBe(false);

    expect(
      AdminSessionResponseSchema.safeParse({
        data: { userId: validUuid },
        meta: { requestId: validUuid },
      }).success,
    ).toBe(true);
    expect(
      AdminSessionResponseSchema.safeParse({
        data: { userId: validUuid, email: "admin@example.com" },
        meta: { requestId: validUuid },
      }).success,
    ).toBe(false);
  });

  it("accepts a Wanted URL and nullable manual content", () => {
    expect(
      CreateJobPostingRequestSchema.safeParse({
        source: "wanted",
        url: validWantedUrl,
        manualContent: null,
      }).success,
    ).toBe(true);
  });

  it("requires a canonical Wanted URL without URL decorations", () => {
    for (const url of [
      `${validWantedUrl}?from=search`,
      `${validWantedUrl}#details`,
      "https://user@www.wanted.co.kr/wd/384409",
      "https://www.wanted.co.kr:444/wd/384409",
      "http://www.wanted.co.kr/wd/384409",
    ]) {
      expect(
        CreateJobPostingRequestSchema.safeParse({
          manualContent: null,
          source: "wanted",
          url,
        }).success,
      ).toBe(false);
    }
  });

  it("validates manual collection input and strict callbacks", () => {
    expect(
      CreateJobPostingCollectionRequestSchema.safeParse({ manualContent: null })
        .success,
    ).toBe(true);
    expect(
      CreateJobPostingCollectionRequestSchema.safeParse({
        manualContent: "공고 원문 ".repeat(20),
      }).success,
    ).toBe(true);
    expect(
      CreateJobPostingCollectionRequestSchema.safeParse({
        manualContent: "너무 짧음",
      }).success,
    ).toBe(false);

    const callback = {
      collectionRunId: validUuid,
      eventId: "00000000-0000-4000-8000-000000000002",
      occurredAt: "2026-09-13T00:00:00.000Z",
      outcome: "timeout",
      requestId: "00000000-0000-4000-8000-000000000003",
      response: null,
      schemaVersion: "1.0.0",
    };
    expect(JobPostingCollectionCallbackSchema.safeParse(callback).success).toBe(
      true,
    );
    expect(
      JobPostingCollectionCallbackSchema.safeParse({
        ...callback,
        response: {
          body: "",
          contentLength: 0,
          contentType: null,
          status: 504,
        },
      }).success,
    ).toBe(false);
    expect(
      JobPostingCollectionCallbackSchema.safeParse({ ...callback, extra: true })
        .success,
    ).toBe(false);

    const aiExtractionCallback = {
      ...callback,
      extraction: {
        companyName: "미리디",
        description: "공고 본문 구조화 결과",
        evidence: [{ excerpt: "공고 본문", section: "자격요건" }],
        title: "AX Engineer - Infra",
        warnings: [],
      },
      outcome: "ai_extraction",
      response: {
        body: "<main>공고 본문</main>",
        contentLength: 25,
        contentType: "text/html",
        status: 200,
      },
    };
    expect(
      JobPostingCollectionCallbackSchema.safeParse(aiExtractionCallback)
        .success,
    ).toBe(true);
    expect(
      JobPostingCollectionCallbackSchema.safeParse({
        ...aiExtractionCallback,
        extraction: null,
      }).success,
    ).toBe(false);
  });

  it("separates application status from archive state", () => {
    expect(ApplicationStatusSchema.safeParse("interview").success).toBe(true);
    expect(ApplicationStatusSchema.safeParse("archived").success).toBe(false);
    expect(
      PatchApplicationRequestSchema.safeParse({ archived: true }).success,
    ).toBe(true);
    expect(PatchApplicationRequestSchema.safeParse({}).success).toBe(false);
  });

  it("requires both document versions after an application is submitted", () => {
    const pending = {
      appliedOn: null,
      interviewAt: null,
      note: null,
      portfolioVersionId: null,
      resumeVersionId: null,
      status: "preparing",
    };
    expect(ApplicationStateInputSchema.safeParse(pending).success).toBe(true);
    expect(
      ApplicationStateInputSchema.safeParse({ ...pending, status: "applied" })
        .success,
    ).toBe(false);
    expect(
      ApplicationStateInputSchema.safeParse({
        ...pending,
        portfolioVersionId: "00000000-0000-4000-8000-000000000003",
        resumeVersionId: "00000000-0000-4000-8000-000000000002",
        status: "applied",
      }).success,
    ).toBe(true);
  });

  it("validates Wanted application creation and list pagination", () => {
    expect(
      CreateApplicationRequestSchema.safeParse({
        appliedOn: null,
        companyName: "미리디",
        interviewAt: null,
        note: null,
        portfolioVersionId: null,
        resumeVersionId: null,
        source: "wanted",
        status: "interested",
        title: "AX Engineer - Infra",
        url: validWantedUrl,
      }).success,
    ).toBe(true);
    expect(
      ApplicationListQuerySchema.safeParse({ page: "2", pageSize: "51" })
        .success,
    ).toBe(false);
    expect(ApplicationListQuerySchema.parse({ page: "2" })).toMatchObject({
      archived: "exclude",
      page: 2,
      pageSize: 20,
    });
  });

  it("validates application details without leaking owner identifiers", () => {
    const response = {
      data: {
        appliedOn: null,
        archivedAt: null,
        attemptNumber: 1,
        createdAt: "2026-09-12T00:00:00.000Z",
        documents: { portfolio: null, resume: null },
        documentsLockedAt: null,
        id: validUuid,
        interviewAt: null,
        jobPosting: {
          companyName: "미리디",
          createdAt: "2026-09-12T00:00:00.000Z",
          externalId: "384409",
          id: "00000000-0000-4000-8000-000000000002",
          source: "wanted",
          title: "AX Engineer - Infra",
          updatedAt: "2026-09-12T00:00:00.000Z",
          url: validWantedUrl,
        },
        note: null,
        status: "interested",
        statusHistory: [
          {
            changedAt: "2026-09-12T00:00:00.000Z",
            fromStatus: null,
            id: "00000000-0000-4000-8000-000000000003",
            toStatus: "interested",
          },
        ],
        updatedAt: "2026-09-12T00:00:00.000Z",
      },
      meta: { requestId: validUuid },
    };
    expect(ApplicationResponseSchema.safeParse(response).success).toBe(true);
    expect(
      ApplicationResponseSchema.safeParse({
        ...response,
        data: { ...response.data, ownerId: validUuid },
      }).success,
    ).toBe(false);
  });

  it("accepts only the supported document types and extraction states", () => {
    expect(DocumentTypeSchema.safeParse("resume").success).toBe(true);
    expect(DocumentTypeSchema.safeParse("cover-letter").success).toBe(false);
    expect(DocumentExtractionStatusSchema.safeParse("ready").success).toBe(
      true,
    );
    expect(DocumentExtractionStatusSchema.safeParse("unknown").success).toBe(
      false,
    );
  });

  it("validates PDF upload metadata and rejects unsafe values", () => {
    const validMetadata = {
      contentHash: "a".repeat(64),
      documentType: "resume",
      fileSize: 1_024,
      label: "2026 인프라 이력서",
      mimeType: "application/pdf",
      originalFilename: "resume.pdf",
    };

    expect(DocumentUploadMetadataSchema.safeParse(validMetadata).success).toBe(
      true,
    );
    expect(
      DocumentUploadMetadataSchema.safeParse({
        ...validMetadata,
        fileSize: DOCUMENT_MAX_FILE_SIZE + 1,
      }).success,
    ).toBe(false);
    expect(
      DocumentUploadMetadataSchema.safeParse({
        ...validMetadata,
        originalFilename: "../resume.pdf",
      }).success,
    ).toBe(false);
    expect(
      DocumentUploadMetadataSchema.safeParse({
        ...validMetadata,
        contentHash: "A".repeat(64),
      }).success,
    ).toBe(false);
    expect(
      CompleteDocumentUploadRequestSchema.safeParse({
        ...validMetadata,
        storagePath: `${validUuid}/resume/resume-000000.pdf`,
      }).success,
    ).toBe(true);
    expect(
      CompleteDocumentUploadRequestSchema.safeParse({
        ...validMetadata,
        storagePath: `${validUuid}/resume/이력서-000000.pdf`,
      }).success,
    ).toBe(false);
  });

  it("validates document actions and strict response envelopes", () => {
    expect(
      UpdateDocumentVersionRequestSchema.safeParse({
        action: "update_metadata",
      }).success,
    ).toBe(false);
    expect(
      UpdateDocumentVersionRequestSchema.safeParse({
        action: "update_metadata",
        extractedText: null,
      }).success,
    ).toBe(true);
    expect(
      UpdateDocumentVersionRequestSchema.safeParse({
        action: "set_archived",
        archived: true,
        unknown: true,
      }).success,
    ).toBe(false);

    expect(
      PrepareDocumentUploadResponseSchema.safeParse({
        data: {
          documentVersionId: validUuid,
          expiresAt: "2026-09-11T00:00:00.000Z",
          resumableEndpoint: null,
          storagePath: `${validUuid}/resume/${validUuid}.pdf`,
          uploadMethod: "standard",
          uploadToken: "signed-token",
        },
        meta: { requestId: validUuid },
      }).success,
    ).toBe(true);

    const document = {
      archivedAt: null,
      contentHash: "a".repeat(64),
      createdAt: "2026-09-11T00:00:00.000Z",
      documentType: "resume",
      extractedText: null,
      extractionStatus: "pending",
      fileSize: 1_024,
      id: validUuid,
      isDefault: true,
      isPublished: false,
      label: "이력서",
      mimeType: "application/pdf",
      originalFilename: "resume.pdf",
      updatedAt: "2026-09-11T00:00:00.000Z",
    };
    expect(
      DocumentVersionResponseSchema.safeParse({
        data: document,
        meta: { requestId: validUuid },
      }).success,
    ).toBe(true);
    expect(
      DocumentVersionResponseSchema.safeParse({
        data: { ...document, storagePath: "private/path" },
        meta: { requestId: validUuid },
      }).success,
    ).toBe(false);
    expect(
      DocumentVersionResponseSchema.safeParse({
        data: {
          ...document,
          storagePath: `${validUuid}/portfolio/포트폴리오-000000.pdf`,
        },
        meta: { requestId: validUuid },
      }).success,
    ).toBe(false);
    expect(
      DocumentDownloadUrlResponseSchema.safeParse({
        data: {
          expiresAt: "2026-09-11T00:01:00.000Z",
          url: "https://example.supabase.co/signed",
        },
        meta: { requestId: validUuid },
      }).success,
    ).toBe(true);

    const publicDocumentAccess = {
      data: {
        documentType: "resume",
        expiresAt: "2026-09-11T00:01:00.000Z",
        url: "https://example.supabase.co/signed/public-document",
      },
      meta: { requestId: validUuid },
    };
    expect(
      PublicDocumentAccessResponseSchema.safeParse(publicDocumentAccess)
        .success,
    ).toBe(true);
    expect(
      PublicDocumentAccessResponseSchema.safeParse({
        ...publicDocumentAccess,
        data: {
          ...publicDocumentAccess.data,
          documentVersionId: validUuid,
          storagePath: "private/resume.pdf",
        },
      }).success,
    ).toBe(false);
  });

  it("validates automatic PDF extraction callbacks", () => {
    const base = {
      contentHash: "a".repeat(64),
      documentVersionId: validUuid,
      eventId: "00000000-0000-4000-8000-000000000002",
      occurredAt: "2026-09-16T00:00:00.000Z",
      requestId: "00000000-0000-4000-8000-000000000003",
      schemaVersion: "1.0.0",
    };

    expect(
      DocumentExtractionCallbackSchema.safeParse({
        ...base,
        errorCode: null,
        extractedText: "이력서 본문",
        outcome: "ready",
      }).success,
    ).toBe(true);
    expect(
      DocumentExtractionCallbackSchema.safeParse({
        ...base,
        errorCode: "PDF_TEXT_EMPTY",
        extractedText: null,
        outcome: "failed",
      }).success,
    ).toBe(true);
    expect(
      DocumentExtractionCallbackSchema.safeParse({
        ...base,
        errorCode: null,
        extractedText: null,
        outcome: "ready",
      }).success,
    ).toBe(false);
    expect(
      DocumentExtractionCallbackSchema.safeParse({
        ...base,
        errorCode: "PDF_PARSE_FAILED",
        extractedText: "실패 본문",
        outcome: "failed",
      }).success,
    ).toBe(false);
    expect(
      DocumentExtractionCallbackSchema.safeParse({
        ...base,
        errorCode: null,
        extractedText: "본문",
        outcome: "ready",
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported job URLs and unknown fields", () => {
    expect(
      CreateJobPostingRequestSchema.safeParse({
        source: "wanted",
        url: "https://example.com/jobs/384409",
        manualContent: null,
      }).success,
    ).toBe(false);

    expect(
      CreateJobPostingRequestSchema.safeParse({
        source: "wanted",
        url: validWantedUrl,
        manualContent: null,
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it("validates the complete analysis result", () => {
    expect(AnalysisResultSchema.safeParse(validAnalysisResult).success).toBe(
      true,
    );

    expect(
      AnalysisResultSchema.safeParse({
        ...validAnalysisResult,
        fitScore: 101,
      }).success,
    ).toBe(false);

    expect(
      AnalysisResultSchema.safeParse({
        ...validAnalysisResult,
        job: { ...validAnalysisResult.job, extra: "not allowed" },
      }).success,
    ).toBe(false);
  });

  it("computes a deterministic weighted fit score", () => {
    expect(
      calculateAnalysisFitScore(validAnalysisResult.job.requirements, [
        ...validAnalysisResult.comparison.matches,
      ]),
    ).toBe(50);
  });

  it("enforces the analysis job state machine", () => {
    const allowed = new Set([
      "failed:queued",
      "queued:cancelled",
      "queued:failed",
      "queued:running",
      "retrying:cancelled",
      "retrying:failed",
      "retrying:running",
      "running:cancelled",
      "running:failed",
      "running:needs_input",
      "running:retrying",
      "running:running",
      "running:succeeded",
    ]);
    for (const from of [
      "queued",
      "running",
      "needs_input",
      "retrying",
      "succeeded",
      "failed",
      "cancelled",
    ] as const) {
      for (const to of [
        "queued",
        "running",
        "needs_input",
        "retrying",
        "succeeded",
        "failed",
        "cancelled",
      ] as const) {
        expect(isValidAnalysisJobTransition(from, to)).toBe(
          allowed.has(`${from}:${to}`),
        );
      }
    }
  });

  it("enforces collection and Slack notification terminal states", () => {
    const collectionAllowed = new Set([
      "queued:failed",
      "queued:needs_input",
      "queued:running",
      "queued:succeeded",
      "running:failed",
      "running:needs_input",
      "running:succeeded",
    ]);
    for (const from of JobPostingCollectionStatusSchema.options) {
      for (const to of JobPostingCollectionStatusSchema.options) {
        expect(isValidJobPostingCollectionTransition(from, to)).toBe(
          collectionAllowed.has(`${from}:${to}`),
        );
      }
    }

    const slackAllowed = new Set([
      "dispatching:delivery_unknown",
      "dispatching:failed",
      "dispatching:sent",
      "dispatching:skipped",
      "queued:dispatching",
      "queued:failed",
      "queued:skipped",
    ]);
    for (const from of SlackNotificationStatusSchema.options) {
      for (const to of SlackNotificationStatusSchema.options) {
        expect(isValidSlackNotificationTransition(from, to)).toBe(
          slackAllowed.has(`${from}:${to}`),
        );
      }
    }
  });

  it("validates analysis retry and cancellation action bodies strictly", () => {
    expect(AnalysisJobActionRequestSchema.safeParse({}).success).toBe(true);
    expect(
      AnalysisJobActionRequestSchema.safeParse({ force: true }).success,
    ).toBe(false);
  });

  it("requires run attempts and retry metadata in analysis callbacks", () => {
    const baseEvent = {
      analysisJobId: validUuid,
      error: null,
      eventId: "00000000-0000-4000-8000-000000000002",
      eventType: "heartbeat",
      message: "공고 요구사항 분석을 진행하고 있습니다.",
      occurredAt: "2026-09-13T00:00:00.000Z",
      requestId: "00000000-0000-4000-8000-000000000003",
      retryAt: null,
      runAttempt: 1,
      schemaVersion: "1.0.0",
      stage: "extracting",
      status: "running",
      step: "job_facts",
      stepAttempt: 1,
    } as const;
    expect(AnalysisEventCallbackSchema.safeParse(baseEvent).success).toBe(true);
    expect(
      AnalysisEventCallbackSchema.safeParse({
        ...baseEvent,
        error: {
          code: "OPENAI_RATE_LIMITED",
          message: "호출 제한으로 잠시 대기합니다.",
          retryable: true,
        },
        eventType: "retrying",
        retryAt: "2026-09-13T00:00:03.000Z",
        status: "retrying",
      }).success,
    ).toBe(true);
    expect(
      AnalysisEventCallbackSchema.safeParse({
        ...baseEvent,
        eventType: "retrying",
        status: "retrying",
      }).success,
    ).toBe(false);
    expect(
      AnalysisEventCallbackSchema.safeParse({
        ...baseEvent,
        runAttempt: 3,
      }).success,
    ).toBe(false);
  });

  it("exposes heartbeat and retry timing in analysis job responses", () => {
    const now = "2026-09-13T00:00:00.000Z";
    expect(
      AnalysisJobResponseSchema.safeParse({
        applicationId: validUuid,
        attemptCount: 1,
        createdAt: now,
        finishedAt: null,
        id: "00000000-0000-4000-8000-000000000002",
        jobPostingId: "00000000-0000-4000-8000-000000000003",
        jobPostingSnapshotId: "00000000-0000-4000-8000-000000000004",
        lastHeartbeatAt: now,
        lastError: null,
        portfolioVersionId: "00000000-0000-4000-8000-000000000005",
        requestId: "00000000-0000-4000-8000-000000000006",
        result: null,
        resumeVersionId: "00000000-0000-4000-8000-000000000007",
        retryAt: null,
        stage: "extracting",
        startedAt: now,
        status: "running",
        updatedAt: now,
      }).success,
    ).toBe(true);
  });

  it("requires the run attempt on completed analysis callbacks", () => {
    const callback = {
      analysisJobId: validUuid,
      eventId: "00000000-0000-4000-8000-000000000002",
      executions: [
        {
          attemptCount: 1,
          inputTokens: 100,
          latencyMs: 250,
          model: "fixture-model",
          outputTokens: 50,
          promptVersion: "job-facts-v1",
          responseId: null,
          step: "job_facts",
        },
      ],
      occurredAt: "2026-09-13T00:00:00.000Z",
      requestId: "00000000-0000-4000-8000-000000000003",
      result: validAnalysisResult,
      runAttempt: 1,
      schemaVersion: "1.0.0",
      status: "succeeded",
    };
    expect(AnalysisResultCallbackSchema.safeParse(callback).success).toBe(true);
    const withoutRunAttempt: Partial<typeof callback> = { ...callback };
    delete withoutRunAttempt.runAttempt;
    expect(
      AnalysisResultCallbackSchema.safeParse(withoutRunAttempt).success,
    ).toBe(false);
  });

  it("validates requirement reviews and rejects duplicate IDs", () => {
    const valid = {
      expectedUpdatedAt: null,
      overallNote: "운영 경험을 더 구체적으로 설명한다.",
      requirements: [
        {
          note: "개인 프로젝트의 장애 대응 경험을 보완한다.",
          overrideStatus: "partial",
          requirementId: "requirement-1",
        },
      ],
    };
    expect(UpdateAnalysisReviewRequestSchema.safeParse(valid).success).toBe(
      true,
    );
    expect(
      UpdateAnalysisReviewRequestSchema.safeParse({
        ...valid,
        requirements: [valid.requirements[0], valid.requirements[0]],
      }).success,
    ).toBe(false);
    expect(
      UpdateAnalysisReviewRequestSchema.safeParse({
        ...valid,
        requirements: [
          {
            note: null,
            overrideStatus: null,
            requirementId: "requirement-1",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates answer revisions, checklist updates, and interview notes", () => {
    expect(
      SaveInterviewAnswerRequestSchema.safeParse({ answer: "STAR 답변" })
        .success,
    ).toBe(true);
    expect(
      SaveInterviewAnswerRequestSchema.safeParse({ answer: null }).success,
    ).toBe(true);
    expect(
      SaveInterviewAnswerRequestSchema.safeParse({ answer: "" }).success,
    ).toBe(false);
    expect(
      PatchInterviewChecklistItemRequestSchema.safeParse({
        completed: true,
        expectedUpdatedAt: "2026-09-13T00:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      PatchInterviewChecklistItemRequestSchema.safeParse({
        expectedUpdatedAt: "2026-09-13T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      ReorderInterviewChecklistRequestSchema.safeParse({
        itemIds: [validUuid, validUuid],
      }).success,
    ).toBe(false);
    expect(
      CreateInterviewNoteRequestSchema.safeParse({
        analysisJobId: validUuid,
        content: null,
        followUpActions: "프로젝트 수치를 정리한다.",
        improvements: null,
        interviewedAt: "2026-09-13T00:00:00.000Z",
        questionsAsked: null,
        roundLabel: "1차 실무 면접",
        wentWell: null,
      }).success,
    ).toBe(true);
  });

  it("keeps the analysis workspace response strict", () => {
    const timestamp = "2026-09-13T00:00:00.000Z";
    const source = {
      jobPostingSnapshot: {
        contentHash: "a".repeat(64),
        fetchedAt: timestamp,
        id: validUuid,
        source: "wanted_json_ld",
      },
      portfolio: {
        archivedAt: null,
        contentHash: "b".repeat(64),
        id: validUuid,
        label: "포트폴리오 v1",
      },
      resume: {
        archivedAt: null,
        contentHash: "c".repeat(64),
        id: validUuid,
        label: "이력서 v1",
      },
    };
    const payload = {
      data: {
        application: {
          attemptNumber: 1,
          companyName: "미리디",
          id: validUuid,
          interviewAt: timestamp,
          status: "preparing",
          title: "AX Engineer - Infra",
        },
        checklist: [],
        comparison: null,
        history: [],
        interviewNotes: [],
        job: {
          applicationId: validUuid,
          attemptCount: 1,
          createdAt: timestamp,
          finishedAt: timestamp,
          id: validUuid,
          jobPostingId: validUuid,
          jobPostingSnapshotId: validUuid,
          lastError: null,
          lastHeartbeatAt: timestamp,
          portfolioVersionId: validUuid,
          requestId: validUuid,
          result: validAnalysisResult,
          resumeVersionId: validUuid,
          retryAt: null,
          stage: "saving",
          startedAt: timestamp,
          status: "succeeded",
          updatedAt: timestamp,
        },
        questions: [],
        resultMetadata: {
          createdAt: timestamp,
          executions: [],
          schemaVersion: "1.0.0",
        },
        review: { overallNote: null, requirements: [], updatedAt: null },
        reviewedFitScore: validAnalysisResult.fitScore,
        sources: source,
      },
      meta: { requestId: validUuid },
    };
    expect(AnalysisWorkspaceResponseSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(
      AnalysisWorkspaceResponseSchema.safeParse({
        ...payload,
        data: { ...payload.data, unexpected: true },
      }).success,
    ).toBe(false);
  });

  it("keeps generated schemas synchronized with the source schemas", async () => {
    const schemaPath = join(
      fileURLToPath(
        new URL("../schemas/analysis-result.schema.json", import.meta.url),
      ),
    );
    const schema = JSON.parse(await readFile(schemaPath, "utf8")) as {
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties: boolean;
    };

    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(
      expect.arrayContaining(["job", "comparison", "fitScore"]),
    );
    expect(schema.properties).toHaveProperty("comparison");

    for (const filename of [
      "job-posting-facts.schema.json",
      "profile-comparison.schema.json",
    ]) {
      const generated = JSON.parse(
        await readFile(
          join(
            fileURLToPath(new URL(`../schemas/${filename}`, import.meta.url)),
          ),
          "utf8",
        ),
      );
      expectStrictJsonSchemaObjects(generated);
    }
  });
});

describe("Slack notification contracts", () => {
  const timestamp = "2026-09-14T00:00:00.000Z";
  const dispatch = {
    blocks: [
      {
        text: { text: "*미리디* AX Engineer", type: "mrkdwn", verbatim: true },
        type: "section",
      },
    ],
    callbackPath: `/v1/internal/slack-notifications/${validUuid}/result`,
    eventId: validUuid,
    jobPostingId: validUuid,
    kind: "slack_notification",
    notificationId: validUuid,
    requestId: validUuid,
    schemaVersion: "1.0.0",
    target: "job_thread",
    text: "미리디 AX Engineer 분석이 완료되었습니다.",
    threadTs: "1710000000.000001",
  };

  it("validates thread routing and rejects unknown fields", () => {
    expect(
      N8nSlackNotificationDispatchPayloadSchema.safeParse(dispatch).success,
    ).toBe(true);
    expect(
      N8nSlackNotificationDispatchPayloadSchema.safeParse({
        ...dispatch,
        threadTs: null,
      }).success,
    ).toBe(false);
    expect(
      N8nSlackNotificationDispatchPayloadSchema.safeParse({
        ...dispatch,
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("requires callback errors only for unsuccessful outcomes", () => {
    const callback = {
      channelId: "C0123456789",
      error: null,
      eventId: validUuid,
      httpStatus: 200,
      messageTs: "1710000000.000001",
      notificationEventId: validUuid,
      notificationId: validUuid,
      occurredAt: timestamp,
      outcome: "sent",
      requestId: validUuid,
      schemaVersion: "1.0.0",
    };
    expect(
      SlackNotificationResultCallbackSchema.safeParse(callback).success,
    ).toBe(true);
    expect(
      SlackNotificationResultCallbackSchema.safeParse({
        ...callback,
        error: {
          code: "SLACK_RATE_LIMITED",
          message: "Slack 호출 제한에 도달했습니다.",
          retryable: true,
        },
        outcome: "failed",
      }).success,
    ).toBe(false);
  });

  it("validates persisted notification responses", () => {
    expect(
      SlackNotificationResponseSchema.safeParse({
        analysisJobId: null,
        applicationId: null,
        attemptCount: 0,
        channelId: null,
        collectionRunId: null,
        createdAt: timestamp,
        dispatchedAt: null,
        error: null,
        eventId: validUuid,
        eventType: "job_posting_registered",
        finishedAt: null,
        id: validUuid,
        jobPostingId: validUuid,
        httpStatus: null,
        messageTs: null,
        requestId: validUuid,
        status: "queued",
        target: "job_root",
        updatedAt: timestamp,
      }).success,
    ).toBe(true);
  });
});
