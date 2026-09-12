import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ROUTES } from "#/constants";
import {
  getPublicDocumentAccess,
  PublicDocumentApiError,
} from "#/libs/public-document-client";

const REQUEST_ID = "00000000-0000-4000-8000-000000000001";

describe("public document client", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_WORKER_API_URL", "http://localhost:8787");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requests the public endpoint without an authorization header", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        data: {
          documentType: "resume",
          expiresAt: "2026-09-12T00:01:00.000Z",
          url: "https://example.supabase.co/signed/resume",
        },
        meta: { requestId: REQUEST_ID },
      }),
    );

    const result = await getPublicDocumentAccess("resume");
    const [requestUrl, requestInit] = fetchMock.mock.calls[0]!;

    expect(result.data.documentType).toBe("resume");
    expect(requestUrl.toString()).toBe(
      "http://localhost:8787/v1/public/document-publications/resume?disposition=inline",
    );
    expect(requestInit).toMatchObject({ cache: "no-store" });
    expect(new Headers(requestInit?.headers).has("Authorization")).toBe(false);
  });

  it("requests a fresh attachment URL for downloads", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        data: {
          documentType: "portfolio",
          expiresAt: "2026-09-12T00:01:00.000Z",
          url: "https://example.supabase.co/signed/portfolio",
        },
        meta: { requestId: REQUEST_ID },
      }),
    );

    await getPublicDocumentAccess("portfolio", "attachment");

    expect(fetchMock.mock.calls[0]![0].toString()).toContain(
      "disposition=attachment",
    );
  });

  it("maps an unpublished document to the standard API error", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        {
          error: {
            code: "NOT_FOUND",
            details: null,
            message: "현재 공개된 문서가 없습니다.",
            requestId: REQUEST_ID,
            retryable: false,
          },
        },
        { status: 404 },
      ),
    );

    const error = await getPublicDocumentAccess("resume").catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(PublicDocumentApiError);
    expect(error).toMatchObject({
      code: "NOT_FOUND",
      message: "현재 공개된 문서가 없습니다.",
      retryable: false,
      status: 404,
    });
  });

  it("rejects a malformed successful response", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { url: "secret" } }));

    await expect(getPublicDocumentAccess("resume")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 200,
    });
  });
});

describe("public document routes", () => {
  it.each([
    ["/resume", "이력서"],
    ["/portfolio", "포트폴리오"],
  ])("exposes %s in navigation without adding it to sitemap", (path, label) => {
    expect(ROUTES).toContainEqual(
      expect.objectContaining({ isDraft: false, label, path }),
    );
    expect(
      ROUTES.find((route) => route.path === path)?.sitemap,
    ).toBeUndefined();
  });
});
