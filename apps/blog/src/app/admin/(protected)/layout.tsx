import { Button } from "@workspace/ui/components/Button";

import { LogOutIcon } from "lucide-react";

import AdminNav from "#/app/admin/(protected)/_components/AdminNav";
import { logoutAction } from "#/app/admin/actions";
import { requireAdmin } from "#/libs/auth/admin";

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();

  return (
    <div className="mx-auto min-h-[calc(100vh-2rem)] max-w-7xl overflow-hidden rounded-xl border lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="bg-muted/40 border-b p-5 lg:border-b-0 lg:border-r">
        <div className="mb-6">
          <p className="text-primary text-xs font-semibold tracking-widest">
            BLUELOG
          </p>
          <h1 className="mt-1 text-lg font-bold">취업 준비 관리</h1>
        </div>

        <AdminNav />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between border-b px-5 py-4 sm:px-8">
          <div>
            <p className="font-semibold">관리자 대시보드</p>
            <p className="text-muted-foreground text-xs">
              개인 취업 준비 데이터를 안전하게 관리합니다.
            </p>
          </div>
          <form action={logoutAction}>
            <Button size="sm" type="submit" variant="outline">
              <LogOutIcon aria-hidden="true" />
              로그아웃
            </Button>
          </form>
        </header>

        <main className="flex-1 p-5 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
