import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createServerClient } from "@supabase/ssr";

import { getAdminUserId } from "#/libs/auth/admin-id";
import {
  ADMIN_LOGIN_PATH,
  DEFAULT_ADMIN_PATH,
  getSafeAdminNext,
} from "#/libs/auth/redirect";
import { getSupabasePublicConfig } from "#/libs/env";

const ADMIN_CACHE_CONTROL = "private, no-store, max-age=0";

function applyAdminHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", ADMIN_CACHE_CONTROL);
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

function copyCookies(source: NextResponse, target: NextResponse): NextResponse {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });

  return target;
}

export async function updateAdminSession(
  request: NextRequest,
): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const { publishableKey, url } = getSupabasePublicConfig();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, options, value }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims.sub;
  const hasVerifiedUser = !error && typeof subject === "string";
  const isAdmin = hasVerifiedUser && subject === getAdminUserId();
  const isLoginPage = request.nextUrl.pathname === ADMIN_LOGIN_PATH;

  if (hasVerifiedUser && !isAdmin) {
    await supabase.auth.signOut({ scope: "local" });
  }

  if (isAdmin && isLoginPage) {
    return applyAdminHeaders(
      copyCookies(
        response,
        NextResponse.redirect(new URL(DEFAULT_ADMIN_PATH, request.url)),
      ),
    );
  }

  if (!isAdmin && !isLoginPage) {
    const loginUrl = new URL(ADMIN_LOGIN_PATH, request.url);
    loginUrl.searchParams.set(
      "reason",
      hasVerifiedUser ? "forbidden" : "session-required",
    );
    loginUrl.searchParams.set(
      "next",
      getSafeAdminNext(`${request.nextUrl.pathname}${request.nextUrl.search}`),
    );

    return applyAdminHeaders(
      copyCookies(response, NextResponse.redirect(loginUrl)),
    );
  }

  return applyAdminHeaders(response);
}
