import type { DocumentVersion } from "@workspace/contracts";
import {
  AdminSessionResponseSchema,
  DocumentVersionListResponseSchema,
  DocumentVersionResponseSchema,
  HealthResponseSchema,
  PublicDocumentAccessResponseSchema,
} from "@workspace/contracts";

import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { app, createApp } from "../src/app.js";
import {
  type DocumentService,
  DocumentServiceError,
  getDocumentUploadMethod,
  inspectPdfResponse,
} from "../src/documents.js";

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

const documentFixture: DocumentVersion = {
  archivedAt: null,
  contentHash: "a".repeat(64),
  createdAt: "2026-09-11T00:00:00.000Z",
  documentType: "resume",
  extractedText: null,
  extractionStatus: "pending",
  fileSize: 1_024,
  id: "00000000-0000-4000-8000-000000000010",
  isDefault: true,
  isPublished: false,
  label: "2026 이력서",
  mimeType: "application/pdf",
  originalFilename: "resume.pdf",
  updatedAt: "2026-09-11T00:00:00.000Z",
};

function createFakeDocumentService(): DocumentService {
  return {
    clearPublication: vi.fn(async () => undefined),
    completeUpload: vi.fn(async () => documentFixture),
    createDownloadUrl: vi.fn(async () => ({
      expiresAt: "2026-09-11T00:01:00.000Z",
      url: "https://example.supabase.co/signed/document",
    })),
    createPublicAccessUrl: vi.fn(async (_ownerId, documentType) => ({
      documentType,
      expiresAt: "2026-09-12T00:01:00.000Z",
      url: "https://example.supabase.co/signed/public-document",
    })),
    get: vi.fn(async () => documentFixture),
    list: vi.fn(async () => [documentFixture]),
    prepareUpload: vi.fn(async () => ({
      documentVersionId: documentFixture.id,
      expiresAt: "2026-09-11T02:00:00.000Z",
      resumableEndpoint: null,
      storagePath: `${ADMIN_USER_ID}/resume/${documentFixture.id}.pdf`,
      uploadMethod: "standard" as const,
      uploadToken: "signed-upload-token",
    })),
    setPublication: vi.fn(async () => ({
      ...documentFixture,
      isPublished: true,
    })),
    update: vi.fn(async () => documentFixture),
  };
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

describe("worker document API", () => {
  it("uses resumable uploads only above the 6 MiB threshold", () => {
    expect(getDocumentUploadMethod(6 * 1_024 * 1_024)).toBe("standard");
    expect(getDocumentUploadMethod(6 * 1_024 * 1_024 + 1)).toBe("tus");
  });

  it("validates PDF signature, size, and SHA-256", async () => {
    const content = new TextEncoder().encode("%PDF-1.7\nvalidated");
    const inspected = await inspectPdfResponse(new Response(content));
    const expectedHash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", content)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");

    expect(inspected).toEqual({
      contentHash: expectedHash,
      fileSize: content.byteLength,
      validSignature: true,
    });
    await expect(
      inspectPdfResponse(new Response("not a PDF")),
    ).resolves.toMatchObject({ validSignature: false });
  });

  async function requestDocumentApi(
    path: string,
    init: RequestInit = {},
    service = createFakeDocumentService(),
  ) {
    const testApp = createApp({
      documentServiceFactory: () => service,
      jwtVerificationKey: publicKey,
    });
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await createAccessToken()}`);
    if (init.body) headers.set("Content-Type", "application/json");
    return {
      response: await testApp.request(
        `http://localhost:8787${path}`,
        { ...init, headers },
        mockEnv,
      ),
      service,
    };
  }

  it("rejects invalid upload metadata before calling storage", async () => {
    const { response, service } = await requestDocumentApi(
      "/v1/document-versions/uploads",
      {
        body: JSON.stringify({
          contentHash: "not-a-hash",
          documentType: "resume",
          fileSize: 0,
          label: "이력서",
          mimeType: "text/plain",
          originalFilename: "../resume.pdf",
        }),
        method: "POST",
      },
    );

    expect(response.status).toBe(400);
    expect(service.prepareUpload).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("prepares and completes a validated PDF upload", async () => {
    const service = createFakeDocumentService();
    const metadata = {
      contentHash: "a".repeat(64),
      documentType: "resume",
      fileSize: 1_024,
      label: "2026 이력서",
      mimeType: "application/pdf",
      originalFilename: "resume.pdf",
    };
    const prepared = await requestDocumentApi(
      "/v1/document-versions/uploads",
      { body: JSON.stringify(metadata), method: "POST" },
      service,
    );
    const completed = await requestDocumentApi(
      `/v1/document-versions/${documentFixture.id}/complete`,
      { body: JSON.stringify(metadata), method: "POST" },
      service,
    );
    const payload: unknown = await completed.response.json();

    expect(prepared.response.status).toBe(201);
    expect(completed.response.status).toBe(201);
    expect(DocumentVersionResponseSchema.safeParse(payload).success).toBe(true);
    expect(service.prepareUpload).toHaveBeenCalledWith(ADMIN_USER_ID, metadata);
    expect(service.completeUpload).toHaveBeenCalledWith(
      ADMIN_USER_ID,
      documentFixture.id,
      metadata,
    );
  });

  it("lists and retrieves only the authenticated administrator documents", async () => {
    const service = createFakeDocumentService();
    const listed = await requestDocumentApi(
      "/v1/document-versions?documentType=resume&archived=only",
      {},
      service,
    );
    const retrieved = await requestDocumentApi(
      `/v1/document-versions/${documentFixture.id}`,
      {},
      service,
    );

    expect(listed.response.status).toBe(200);
    expect(
      DocumentVersionListResponseSchema.safeParse(await listed.response.json())
        .success,
    ).toBe(true);
    expect(retrieved.response.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(ADMIN_USER_ID, {
      archived: "only",
      documentType: "resume",
    });
    expect(service.get).toHaveBeenCalledWith(ADMIN_USER_ID, documentFixture.id);
  });

  it("updates lifecycle, publication, and signed download state", async () => {
    const service = createFakeDocumentService();
    const update = await requestDocumentApi(
      `/v1/document-versions/${documentFixture.id}`,
      {
        body: JSON.stringify({ action: "set_default" }),
        method: "PATCH",
      },
      service,
    );
    const publication = await requestDocumentApi(
      "/v1/document-publications/resume",
      {
        body: JSON.stringify({ documentVersionId: documentFixture.id }),
        method: "PUT",
      },
      service,
    );
    const download = await requestDocumentApi(
      `/v1/document-versions/${documentFixture.id}/download-url`,
      {
        body: JSON.stringify({ disposition: "attachment" }),
        method: "POST",
      },
      service,
    );
    const unpublished = await requestDocumentApi(
      "/v1/document-publications/resume",
      { method: "DELETE" },
      service,
    );

    expect(update.response.status).toBe(200);
    expect(publication.response.status).toBe(200);
    expect(download.response.status).toBe(200);
    expect(unpublished.response.status).toBe(204);
    expect(service.update).toHaveBeenCalled();
    expect(service.setPublication).toHaveBeenCalled();
    expect(service.createDownloadUrl).toHaveBeenCalled();
    expect(service.clearPublication).toHaveBeenCalledWith(
      ADMIN_USER_ID,
      "resume",
    );
  });

  it("maps incomplete uploads and storage outages without exposing secrets", async () => {
    const conflictService = createFakeDocumentService();
    vi.mocked(conflictService.completeUpload).mockRejectedValue(
      new DocumentServiceError("conflict", { reason: "upload_incomplete" }),
    );
    const conflict = await requestDocumentApi(
      `/v1/document-versions/${documentFixture.id}/complete`,
      {
        body: JSON.stringify({
          contentHash: "a".repeat(64),
          documentType: "resume",
          fileSize: 1_024,
          label: "2026 이력서",
          mimeType: "application/pdf",
          originalFilename: "resume.pdf",
        }),
        method: "POST",
      },
      conflictService,
    );

    const unavailableService = createFakeDocumentService();
    vi.mocked(unavailableService.list).mockRejectedValue(
      new DocumentServiceError("unavailable"),
    );
    const unavailable = await requestDocumentApi(
      "/v1/document-versions",
      {},
      unavailableService,
    );
    const unavailableBody = await unavailable.response.text();

    expect(conflict.response.status).toBe(409);
    await expect(conflict.response.json()).resolves.toMatchObject({
      error: { code: "CONFLICT", retryable: true },
    });
    expect(unavailable.response.status).toBe(503);
    expect(unavailableBody).not.toContain(mockEnv.SUPABASE_SECRET_KEY);
    expect(JSON.parse(unavailableBody)).toMatchObject({
      error: { code: "UPSTREAM_UNAVAILABLE", retryable: true },
    });
  });
});

describe("worker public document API", () => {
  async function requestPublicDocument(
    path: string,
    service = createFakeDocumentService(),
  ) {
    const testApp = createApp({ documentServiceFactory: () => service });
    return {
      response: await testApp.request(
        `http://localhost:8787${path}`,
        {},
        mockEnv,
      ),
      service,
    };
  }

  it("returns only the published document access fields without authentication", async () => {
    const { response, service } = await requestPublicDocument(
      "/v1/public/document-publications/resume",
    );
    const payload: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(PublicDocumentAccessResponseSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload).toMatchObject({
      data: { documentType: "resume" },
    });
    expect(
      (payload as { data: Record<string, unknown> }).data,
    ).not.toHaveProperty("id");
    expect(
      (payload as { data: Record<string, unknown> }).data,
    ).not.toHaveProperty("storagePath");
    expect(service.createPublicAccessUrl).toHaveBeenCalledWith(
      ADMIN_USER_ID,
      "resume",
      "inline",
    );
  });

  it("creates a fresh attachment URL when download is requested", async () => {
    const { response, service } = await requestPublicDocument(
      "/v1/public/document-publications/portfolio?disposition=attachment",
    );

    expect(response.status).toBe(200);
    expect(service.createPublicAccessUrl).toHaveBeenCalledWith(
      ADMIN_USER_ID,
      "portfolio",
      "attachment",
    );
  });

  it.each([
    [
      "unsupported document type",
      "/v1/public/document-publications/cover-letter",
    ],
    [
      "unsupported disposition",
      "/v1/public/document-publications/resume?disposition=preview",
    ],
  ])("rejects an %s", async (_name, path) => {
    const { response, service } = await requestPublicDocument(path);

    expect(response.status).toBe(400);
    expect(service.createPublicAccessUrl).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR", retryable: false },
    });
  });

  it("returns a stable empty state when no document is published", async () => {
    const service = createFakeDocumentService();
    vi.mocked(service.createPublicAccessUrl).mockRejectedValue(
      new DocumentServiceError("not_found", {
        reason: "publication_not_found",
      }),
    );
    const { response } = await requestPublicDocument(
      "/v1/public/document-publications/resume",
      service,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "NOT_FOUND",
        message: "현재 공개된 문서가 없습니다.",
        retryable: false,
      },
    });
  });

  it("maps storage outages without exposing secrets", async () => {
    const service = createFakeDocumentService();
    vi.mocked(service.createPublicAccessUrl).mockRejectedValue(
      new DocumentServiceError("unavailable"),
    );
    const { response } = await requestPublicDocument(
      "/v1/public/document-publications/portfolio",
      service,
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).not.toContain(mockEnv.SUPABASE_SECRET_KEY);
    expect(JSON.parse(body)).toMatchObject({
      error: { code: "UPSTREAM_UNAVAILABLE", retryable: true },
    });
  });
});
