import Link from "next/link";

import { ShieldCheckIcon } from "lucide-react";

import LoginForm from "#/app/admin/login/_components/LoginForm";
import { getSafeAdminNext } from "#/libs/auth/redirect";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    reason?: string | string[];
  }>;
};

const REASON_MESSAGES: Record<string, string> = {
  forbidden: "이 관리자 서비스에 접근할 수 없는 계정입니다.",
  "session-required": "세션이 만료되었거나 로그인이 필요합니다.",
};

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = getSafeAdminNext(params.next);
  const reason = Array.isArray(params.reason)
    ? params.reason[0]
    : params.reason;
  const reasonMessage = reason ? REASON_MESSAGES[reason] : null;

  return (
    <section className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-md items-center py-12">
      <div className="border-border bg-card w-full rounded-xl border p-6 shadow-sm sm:p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="bg-primary/10 text-primary mb-4 rounded-full p-3">
            <ShieldCheckIcon aria-hidden="true" className="size-7" />
          </span>
          <h1 className="text-2xl font-bold">관리자 로그인</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            취업 준비 관리 화면은 지정된 관리자만 사용할 수 있습니다.
          </p>
        </div>

        {reasonMessage && (
          <p
            aria-live="polite"
            className="bg-muted text-muted-foreground mb-5 rounded-md px-3 py-2 text-sm"
          >
            {reasonMessage}
          </p>
        )}

        <LoginForm nextPath={nextPath} />

        <p className="text-muted-foreground mt-6 text-center text-xs">
          비밀번호 변경은 Supabase 관리자 화면에서 진행합니다.
        </p>
        <Link
          className="text-primary mt-4 block text-center text-sm hover:underline"
          href="/"
        >
          블로그로 돌아가기
        </Link>
      </div>
    </section>
  );
}
