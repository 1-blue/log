import Link from "next/link";

import { Button } from "@workspace/ui/components/Button";

import {
  BriefcaseBusinessIcon,
  FileStackIcon,
  MessageSquareTextIcon,
  ShieldCheckIcon,
} from "lucide-react";

import WorkerAuthStatus from "#/app/admin/(protected)/_components/WorkerAuthStatus";

export default function AdminDashboardPage() {
  return (
    <section className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-bold">대시보드</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          관리자 인증, 문서 버전과 지원 공고 관리 기능이 연결되어 있습니다.
        </p>
      </div>

      <div className="border-border bg-card rounded-lg border p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheckIcon aria-hidden="true" className="text-primary size-5" />
          <h3 className="font-semibold">인증 연결 상태</h3>
        </div>
        <WorkerAuthStatus />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="border-border bg-card rounded-lg border p-5">
          <FileStackIcon
            aria-hidden="true"
            className="text-primary mb-4 size-6"
          />
          <h3 className="font-semibold">문서 관리</h3>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            이력서와 포트폴리오 PDF를 업로드하고 기본·공개 버전을 관리합니다.
          </p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/admin/documents">문서 관리 열기</Link>
          </Button>
        </div>

        <div className="border-border bg-card rounded-lg border p-5">
          <BriefcaseBusinessIcon
            aria-hidden="true"
            className="text-primary mb-4 size-6"
          />
          <h3 className="font-semibold">지원 관리</h3>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            채용공고와 제출 문서, 진행 상태, 지원·면접 일정을 관리합니다.
          </p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/admin/applications">지원 관리 열기</Link>
          </Button>
        </div>
      </div>

      <article className="border-border bg-card rounded-lg border p-5">
        <MessageSquareTextIcon
          aria-hidden="true"
          className="text-primary mb-4 size-6"
        />
        <h3 className="font-semibold">면접 준비</h3>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          예상 질문, 답변과 면접 회고를 한곳에서 관리합니다.
        </p>
        <span className="bg-muted text-muted-foreground mt-4 inline-block rounded-full px-2.5 py-1 text-xs">
          준비 중
        </span>
      </article>
    </section>
  );
}
