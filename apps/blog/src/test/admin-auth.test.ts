import { NextRequest } from "next/server";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_ADMIN_PATH, getSafeAdminNext } from "#/libs/auth/redirect";

const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";

let claimsResult: {
  data: { claims: { sub?: string } } | null;
  error: Error | null;
};
const signOut = vi.fn();
const signInWithPassword = vi.fn();
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getClaims: () => Promise.resolve(claimsResult),
      signOut,
    },
  }),
}));
vi.mock("#/libs/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        getClaims: () => Promise.resolve(claimsResult),
        signInWithPassword,
        signOut,
      },
    }),
}));

describe("administrator redirect validation", () => {
  it.each([
    [undefined, DEFAULT_ADMIN_PATH],
    ["https://malicious.example/admin", DEFAULT_ADMIN_PATH],
    ["//malicious.example/admin", DEFAULT_ADMIN_PATH],
    ["/administrator", DEFAULT_ADMIN_PATH],
    ["/admin/login", DEFAULT_ADMIN_PATH],
    ["/admin/jobs?status=applied", "/admin/jobs?status=applied"],
  ])("maps %s to a safe administrator path", (value, expected) => {
    expect(getSafeAdminNext(value)).toBe(expected);
  });
});

describe("administrator middleware", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("ADMIN_USER_ID", ADMIN_USER_ID);
    claimsResult = { data: null, error: new Error("No session") };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects an unauthenticated protected request to login", async () => {
    const { updateAdminSession } = await import("#/libs/supabase/middleware");
    const response = await updateAdminSession(
      new NextRequest("http://localhost:3000/admin/jobs?status=applied"),
    );
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/admin/login");
    expect(location.searchParams.get("reason")).toBe("session-required");
    expect(location.searchParams.get("next")).toBe(
      "/admin/jobs?status=applied",
    );
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
  });

  it("allows the configured administrator", async () => {
    claimsResult = {
      data: { claims: { sub: ADMIN_USER_ID } },
      error: null,
    };
    const { updateAdminSession } = await import("#/libs/supabase/middleware");
    const response = await updateAdminSession(
      new NextRequest("http://localhost:3000/admin"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects a different authenticated user and clears its session", async () => {
    claimsResult = {
      data: { claims: { sub: OTHER_USER_ID } },
      error: null,
    };
    const { updateAdminSession } = await import("#/libs/supabase/middleware");
    const response = await updateAdminSession(
      new NextRequest("http://localhost:3000/admin"),
    );
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(location.searchParams.get("reason")).toBe("forbidden");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("redirects an authenticated administrator away from login", async () => {
    claimsResult = {
      data: { claims: { sub: ADMIN_USER_ID } },
      error: null,
    };
    const { updateAdminSession } = await import("#/libs/supabase/middleware");
    const response = await updateAdminSession(
      new NextRequest("http://localhost:3000/admin/login"),
    );

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/admin");
  });
});

describe("administrator login action", () => {
  const previousState = { message: null, status: "idle" } as const;

  beforeEach(() => {
    vi.stubEnv("ADMIN_USER_ID", ADMIN_USER_ID);
    claimsResult = {
      data: { claims: { sub: ADMIN_USER_ID } },
      error: null,
    };
    signInWithPassword.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function createLoginFormData(overrides: Record<string, string> = {}) {
    const formData = new FormData();
    formData.set("email", overrides.email ?? "admin@example.com");
    formData.set("password", overrides.password ?? "strong-password");
    formData.set("next", overrides.next ?? "/admin");
    return formData;
  }

  it("rejects invalid input before calling Supabase", async () => {
    const { loginAction } = await import("#/app/admin/actions");
    const result = await loginAction(
      previousState,
      createLoginFormData({ email: "invalid-email" }),
    );

    expect(result.status).toBe("error");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("maps the Supabase rate limit without exposing details", async () => {
    signInWithPassword.mockResolvedValue({ error: { status: 429 } });
    const { loginAction } = await import("#/app/admin/actions");
    const result = await loginAction(previousState, createLoginFormData());

    expect(result.message).toContain("요청이 많습니다");
  });

  it("maps an authentication network failure without exposing details", async () => {
    signInWithPassword.mockRejectedValue(new Error("private network detail"));
    const { loginAction } = await import("#/app/admin/actions");
    const result = await loginAction(previousState, createLoginFormData());

    expect(result.message).toContain("로그인 서버에 연결하지 못했습니다");
    expect(result.message).not.toContain("private network detail");
  });

  it("signs out a valid non-administrator account", async () => {
    claimsResult = {
      data: { claims: { sub: OTHER_USER_ID } },
      error: null,
    };
    const { loginAction } = await import("#/app/admin/actions");
    const result = await loginAction(previousState, createLoginFormData());

    expect(result.message).toBe("이메일 또는 비밀번호를 확인해 주세요.");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("redirects the administrator only to a safe internal path", async () => {
    const { loginAction } = await import("#/app/admin/actions");

    await expect(
      loginAction(
        previousState,
        createLoginFormData({ next: "https://malicious.example/admin" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("signs out the current browser session with a server action", async () => {
    const { logoutAction } = await import("#/app/admin/actions");

    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(redirect).toHaveBeenCalledWith("/admin/login");
  });
});
