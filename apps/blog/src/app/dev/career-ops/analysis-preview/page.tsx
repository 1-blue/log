import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@workspace/ui/components/Button";

import AnalysisWorkspaceClient from "#/app/admin/(protected)/applications/[id]/analyses/[analysisJobId]/_components/AnalysisWorkspaceClient";
import {
  ANALYSIS_PREVIEW_SCENARIOS,
  type AnalysisPreviewScenario,
  getAnalysisWorkspaceFixture,
} from "#/fixtures/analysis-workspace";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "분석 작업 화면 미리보기",
};

const LABELS: Record<AnalysisPreviewScenario, string> = {
  complete: "준비 완료",
  empty: "미작성",
  history: "이전 분석 비교",
  long: "긴 콘텐츠",
  mixed: "혼합 상태",
};

export default async function AnalysisPreviewPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ scenario?: string }> }>) {
  // Next.js always sets NODE_ENV; the route must be unreachable in production.
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  if (process.env.NODE_ENV === "production") notFound();
  const requested = (await searchParams).scenario;
  const scenario = ANALYSIS_PREVIEW_SCENARIOS.includes(
    requested as AnalysisPreviewScenario,
  )
    ? (requested as AnalysisPreviewScenario)
    : "mixed";
  const fixture = getAnalysisWorkspaceFixture(scenario);

  return (
    <main className="container mx-auto grid gap-6 px-4 py-10">
      <div className="flex flex-wrap gap-2">
        {ANALYSIS_PREVIEW_SCENARIOS.map((item) => (
          <Button
            asChild
            key={item}
            variant={item === scenario ? "default" : "outline"}
          >
            <Link href={`/dev/career-ops/analysis-preview?scenario=${item}`}>
              {LABELS[item]}
            </Link>
          </Button>
        ))}
      </div>
      <AnalysisWorkspaceClient
        analysisJobId={fixture.job.id}
        applicationId={fixture.application.id}
        initialData={fixture}
        preview
      />
    </main>
  );
}
