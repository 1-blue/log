import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { getAdminUserId } from "#/libs/auth/admin-id";
import { ADMIN_LOGIN_PATH } from "#/libs/auth/redirect";
import { createClient } from "#/libs/supabase/server";

type AdminSessionResult =
  | { kind: "admin"; userId: string }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" };

export async function resolveAdminSession(): Promise<AdminSessionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims.sub;

  if (error || typeof subject !== "string") {
    return { kind: "unauthenticated" };
  }

  if (subject !== getAdminUserId()) {
    return { kind: "forbidden" };
  }

  return { kind: "admin", userId: subject };
}

const getCachedAdminSession = cache(resolveAdminSession);

export async function requireAdmin(): Promise<{ userId: string }> {
  const session = await getCachedAdminSession();

  if (session.kind !== "admin") {
    redirect(
      session.kind === "forbidden"
        ? `${ADMIN_LOGIN_PATH}?reason=forbidden`
        : `${ADMIN_LOGIN_PATH}?reason=session-required`,
    );
  }

  return { userId: session.userId };
}
