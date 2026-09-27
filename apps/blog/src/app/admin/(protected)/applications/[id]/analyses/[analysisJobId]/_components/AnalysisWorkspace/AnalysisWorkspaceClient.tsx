"use client";

import Link from "next/link";

import type { AnalysisWorkspace } from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/Tabs";

import { ArrowLeftIcon, LoaderCircleIcon } from "lucide-react";

import { AnalysisInterviewTab } from "./AnalysisInterviewTab";
import { AnalysisRequirementsTab } from "./AnalysisRequirementsTab";
import { AnalysisSummaryTab } from "./AnalysisSummaryTab";
import { PRIORITY_ORDER } from "./AnalysisWorkspaceLabels";
import { PreviewBadge } from "./AnalysisWorkspaceParts";
import { useAnalysisWorkspace } from "./useAnalysisWorkspace";

export default function AnalysisWorkspaceClient({
  analysisJobId,
  applicationId,
  initialData,
  preview = false,
}: Readonly<{
  analysisJobId: string;
  applicationId: string;
  initialData?: AnalysisWorkspace;
  preview?: boolean;
}>) {
  const {
    activeTab,
    answerDrafts,
    answerHistory,
    changeTab,
    createChecklist,
    effectiveMatches,
    error,
    liveReviewedScore,
    load,
    loading,
    moveChecklist,
    notice,
    overallNote,
    patchChecklist,
    pending,
    removeChecklist,
    removeNote,
    result,
    reviews,
    saveAnswer,
    saveNote,
    saveReview,
    setAnswerDrafts,
    setOverallNote,
    setReviews,
    setWorkspace,
    showAnswerHistory,
    workspace,
  } = useAnalysisWorkspace({
    analysisJobId,
    applicationId,
    initialData,
    preview,
  });

  if (loading) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
        <LoaderCircleIcon className="size-4 animate-spin" /> 분석 작업 화면을
        불러오는 중입니다.
      </p>
    );
  }

  if (!workspace) {
    return (
      <section className="grid gap-4">
        <Button asChild className="w-fit" variant="ghost">
          <Link href={`/admin/applications/${applicationId}`}>
            <ArrowLeftIcon /> 지원 상세
          </Link>
        </Button>
        <p className="text-destructive" role="alert">
          {error ?? "분석 작업 화면을 불러오지 못했습니다."}
        </p>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="grid max-w-4xl gap-4">
        <Button asChild className="w-fit" variant="ghost">
          <Link href={`/admin/applications/${applicationId}`}>
            <ArrowLeftIcon /> 지원 상세
          </Link>
        </Button>
        <h2 className="text-2xl font-bold">분석 결과 준비 중</h2>
        <p className="text-muted-foreground">
          분석이 완료된 뒤 요구사항 검토와 면접 준비를 시작할 수 있습니다.
        </p>
      </section>
    );
  }

  const matchById = new Map(
    result.comparison.matches.map((match) => [match.requirementId, match]),
  );
  const completedChecklist = workspace.checklist.filter(
    (item) => item.completedAt,
  ).length;
  const matchCounts = effectiveMatches.reduce(
    (counts, match) => ({
      ...counts,
      [match.status]: counts[match.status] + 1,
    }),
    { matched: 0, missing: 0, partial: 0, unknown: 0 },
  );
  const sortedGaps = [...result.comparison.gaps].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );
  const disabled = pending !== null;
  const isFixture = (workspace.resultMetadata?.executions ?? []).some(
    (execution) => execution.model.startsWith("fixture/"),
  );

  const showInterviewReview =
    workspace.application.status === "interview" ||
    workspace.application.status === "offer" ||
    workspace.application.interviewAt !== null;

  function compareAnalysis(compareTo?: string) {
    if (!workspace) return;
    if (preview) {
      setWorkspace({
        ...workspace,
        comparison:
          workspace.history.find((item) => item.analysisJobId === compareTo) ??
          null,
      });
      return;
    }
    void load(compareTo);
  }

  return (
    <section className="flex w-full flex-col gap-6">
      <Button asChild className="w-fit" variant="ghost">
        <Link href={`/admin/applications/${applicationId}`}>
          <ArrowLeftIcon /> 지원 상세
        </Link>
      </Button>

      {preview ? <PreviewBadge /> : null}
      {isFixture ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          현재 결과는 OpenAI 연동 전 화면 검수를 위한 임시 분석 결과입니다. 실제
          AI 연동 후 이 결과를 교체합니다.
        </p>
      ) : null}
      <div aria-live="polite" className="grid gap-2">
        {error ? (
          <p
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="border-primary/20 bg-primary/5 rounded-md border p-3 text-sm">
            {notice}
          </p>
        ) : null}
      </div>

      <header className="grid gap-3">
        <p className="text-primary text-sm font-semibold">
          {workspace.application.companyName} ·{" "}
          {workspace.application.attemptNumber}차 지원
        </p>
        <h2 className="text-2xl font-bold">{workspace.application.title}</h2>
      </header>

      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList aria-label="분석 작업 영역">
          <TabsTrigger value="summary">분석 요약</TabsTrigger>
          <TabsTrigger value="requirements">요구사항 분석</TabsTrigger>
          <TabsTrigger value="interview">면접 준비</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <AnalysisSummaryTab
            completedChecklist={completedChecklist}
            liveReviewedScore={liveReviewedScore}
            matchCounts={matchCounts}
            result={result}
            workspace={workspace}
          />
        </TabsContent>

        <TabsContent value="requirements">
          <AnalysisRequirementsTab
            disabled={disabled}
            matchById={matchById}
            overallNote={overallNote}
            pending={pending}
            result={result}
            reviews={reviews}
            saveReview={saveReview}
            setOverallNote={setOverallNote}
            setReviews={setReviews}
          />
        </TabsContent>

        <TabsContent value="interview">
          <AnalysisInterviewTab
            answerDrafts={answerDrafts}
            answerHistory={answerHistory}
            completedChecklist={completedChecklist}
            createChecklist={createChecklist}
            disabled={disabled}
            moveChecklist={moveChecklist}
            onCompare={compareAnalysis}
            patchChecklist={patchChecklist}
            removeChecklist={removeChecklist}
            removeNote={removeNote}
            result={result}
            saveAnswer={saveAnswer}
            saveNote={saveNote}
            setAnswerDrafts={setAnswerDrafts}
            showAnswerHistory={showAnswerHistory}
            showInterviewReview={showInterviewReview}
            sortedGaps={sortedGaps}
            workspace={workspace}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
