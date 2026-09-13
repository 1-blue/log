import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  AdminLoginInputSchema,
  AdminSessionResponseSchema,
  AnalysisResultSchema,
  ApplicationListQuerySchema,
  ApplicationResponseSchema,
  ApplicationStateInputSchema,
  ApplicationStatusSchema,
  CreateApplicationRequestSchema,
  CreateJobPostingCollectionRequestSchema,
  CreateJobPostingRequestSchema,
  DOCUMENT_MAX_FILE_SIZE,
  DocumentDownloadUrlResponseSchema,
  DocumentExtractionStatusSchema,
  DocumentTypeSchema,
  DocumentUploadMetadataSchema,
  DocumentVersionResponseSchema,
  IdempotencyKeySchema,
  isValidAnalysisJobTransition,
  JobPostingCollectionCallbackSchema,
  PatchApplicationRequestSchema,
  PrepareDocumentUploadResponseSchema,
  PublicDocumentAccessResponseSchema,
  UpdateDocumentVersionRequestSchema,
} from "../src/index.js";

const validUuid = "00000000-0000-4000-8000-000000000001";
const validWantedUrl = "https://www.wanted.co.kr/wd/384409";

const validAnalysisResult = {
  job: {
    title: "AX Engineer - Infra",
    companyName: "미리디",
    summary: "인프라 자동화와 서비스 운영 역량을 요구하는 공고입니다.",
    requirements: [
      {
        id: "requirement-1",
        kind: "required",
        text: "클라우드 인프라 운영 경험",
        evidence: [
          {
            source: "job_posting",
            documentVersionId: null,
            section: "자격요건",
            excerpt: "클라우드 인프라 운영 경험",
          },
        ],
      },
    ],
    technologies: [],
    traits: [],
  },
  fit: {
    score: 72,
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
            documentVersionId: validUuid,
            section: "프로젝트 경험",
            excerpt: "배포 및 모니터링 환경을 구성했습니다.",
          },
        ],
      },
    ],
  },
  gaps: [],
  interviewQuestions: [],
  warnings: [],
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
        fit: { ...validAnalysisResult.fit, score: 101 },
      }).success,
    ).toBe(false);

    expect(
      AnalysisResultSchema.safeParse({
        ...validAnalysisResult,
        job: { ...validAnalysisResult.job, extra: "not allowed" },
      }).success,
    ).toBe(false);
  });

  it("enforces the analysis job state machine", () => {
    expect(isValidAnalysisJobTransition("queued", "running")).toBe(true);
    expect(isValidAnalysisJobTransition("running", "succeeded")).toBe(true);
    expect(isValidAnalysisJobTransition("succeeded", "running")).toBe(false);
    expect(isValidAnalysisJobTransition("cancelled", "running")).toBe(false);
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
      expect.arrayContaining([
        "job",
        "fit",
        "gaps",
        "interviewQuestions",
        "warnings",
      ]),
    );
    expect(schema.properties).toHaveProperty("fit");
  });
});
