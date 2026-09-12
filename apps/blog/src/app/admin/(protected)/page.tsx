import Link from "next/link";

import { Button } from "@workspace/ui/components/Button";

import {
  BriefcaseBusinessIcon,
  FileStackIcon,
  MessageSquareTextIcon,
  ShieldCheckIcon,
} from "lucide-react";

import WorkerAuthStatus from "#/app/admin/(protected)/_components/WorkerAuthStatus";

const upcomingFeatures = [
  {
    description: "지원할 회사와 채용공고의 진행 상태를 관리합니다.",
    icon: BriefcaseBusinessIcon,
    title: "지원 공고",
  },
  {
    description: "예상 질문, 답변과 면접 회고를 한곳에서 관리합니다.",
    icon: MessageSquareTextIcon,
    title: "면접 준비",
  },
] as const;

export default function AdminDashboardPage() {
  return (
    <section className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-bold">대시보드</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          관리자 인증과 문서 버전 관리 기능이 연결되어 있습니다.
        </p>
      </div>

      <div className="border-border bg-card rounded-lg border p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheckIcon aria-hidden="true" className="text-primary size-5" />
          <h3 className="font-semibold">인증 연결 상태</h3>
        </div>
        <WorkerAuthStatus />
      </div>

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

      <div className="grid gap-4 md:grid-cols-2">
        {upcomingFeatures.map(({ description, icon: Icon, title }) => (
          <article
            className="border-border bg-card rounded-lg border p-5"
            key={title}
          >
            <Icon aria-hidden="true" className="text-primary mb-4 size-6" />
            <h3 className="font-semibold">{title}</h3>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              {description}
            </p>
            <span className="bg-muted text-muted-foreground mt-4 inline-block rounded-full px-2.5 py-1 text-xs">
              준비 중
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
