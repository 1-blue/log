"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@workspace/ui/components/Button";

import { LogInIcon } from "lucide-react";

import { loginAction, type LoginActionState } from "#/app/admin/actions";

const initialState: LoginActionState = { message: null, status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" disabled={pending} type="submit">
      <LogInIcon aria-hidden="true" />
      {pending ? "로그인 중..." : "로그인"}
    </Button>
  );
}

export default function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input name="next" type="hidden" value={nextPath} />

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="admin-email">
          이메일
        </label>
        <input
          autoComplete="email"
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]"
          id="admin-email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="admin-password">
          비밀번호
        </label>
        <input
          autoComplete="current-password"
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]"
          id="admin-password"
          maxLength={1_024}
          name="password"
          required
          type="password"
        />
      </div>

      {state.message && (
        <p
          aria-live="polite"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
          role="alert"
        >
          {state.message}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
