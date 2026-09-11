"use server";

import { redirect } from "next/navigation";

import { AdminLoginInputSchema } from "@workspace/contracts";

import { getAdminUserId } from "#/libs/auth/admin-id";
import { ADMIN_LOGIN_PATH, getSafeAdminNext } from "#/libs/auth/redirect";
import { createClient } from "#/libs/supabase/server";

export type LoginActionState = {
  message: string | null;
  status: "error" | "idle";
};

const INVALID_CREDENTIALS_MESSAGE = "이메일 또는 비밀번호를 확인해 주세요.";
const RATE_LIMIT_MESSAGE =
  "로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.";
const AUTH_UNAVAILABLE_MESSAGE =
  "로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = AdminLoginInputSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return { message: INVALID_CREDENTIALS_MESSAGE, status: "error" };
  }

  const nextPath = getSafeAdminNext(formData.get("next"));

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);

    if (error) {
      return {
        message:
          error.status === 429
            ? RATE_LIMIT_MESSAGE
            : INVALID_CREDENTIALS_MESSAGE,
        status: "error",
      };
    }

    const { data, error: claimsError } = await supabase.auth.getClaims();
    const subject = data?.claims.sub;

    if (claimsError || typeof subject !== "string") {
      await supabase.auth.signOut({ scope: "local" });
      return { message: AUTH_UNAVAILABLE_MESSAGE, status: "error" };
    }

    if (subject !== getAdminUserId()) {
      await supabase.auth.signOut({ scope: "local" });
      return { message: INVALID_CREDENTIALS_MESSAGE, status: "error" };
    }
  } catch {
    return { message: AUTH_UNAVAILABLE_MESSAGE, status: "error" };
  }

  redirect(nextPath);
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect(ADMIN_LOGIN_PATH);
}
