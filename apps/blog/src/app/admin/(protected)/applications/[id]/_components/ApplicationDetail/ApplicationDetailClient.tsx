"use client";

import Link from "next/link";

import { applicationStatusRequiresDocuments } from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/Tabs";

import { ArrowLeftIcon, LoaderCircleIcon } from "lucide-react";

import { ApplicationAnalysisTab } from "./ApplicationAnalysisTab";
import { ApplicationDetailHeader } from "./ApplicationDetailHeader";
import { ApplicationInfoTab } from "./ApplicationInfoTab";
import { ApplicationPostingTab } from "./ApplicationPostingTab";
import { useApplicationDetail } from "./useApplicationDetail";

export default function ApplicationDetailClient({
  applicationId,
}: Readonly<{ applicationId: string }>) {
  const {
    activeAnalysis,
    activeAnalysisId,
    activeCollection,
    activeTab,
    analysisDiagnostics,
    analysisJobs,
    analysisPollingExpired,
    analyze,
    application,
    cancelAnalysis,
    changeTab,
    collect,
    collections,
    documents,
    error,
    loading,
    manualContent,
    pending,
    reapply,
    recoverStaleAnalysis,
    refreshAnalysis,
    retryAnalysis,
    save,
    setArchived,
    setManualContent,
    setStatus,
    status,
  } = useApplicationDetail(applicationId);

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
        <LoaderCircleIcon className="size-4 animate-spin" /> 지원 정보를
        불러오는 중입니다.
      </div>
    );
  }

  if (!application) {
    return (
      <section className="grid gap-4">
        <Button asChild className="w-fit" variant="ghost">
          <Link href="/admin/applications">
            <ArrowLeftIcon /> 지원 목록
          </Link>
        </Button>
        <p className="text-destructive text-sm" role="alert">
          {error ?? "지원 정보를 찾을 수 없습니다."}
        </p>
      </section>
    );
  }

  const archived = Boolean(application.archivedAt);
  const locked = Boolean(application.documentsLockedAt);
  const documentsRequired = applicationStatusRequiresDocuments(status);
  const resumes = documents.filter((item) => item.documentType === "resume");
  const portfolios = documents.filter(
    (item) => item.documentType === "portfolio",
  );
  const disabled = pending !== null;
  const latestCollection = collections[0] ?? null;
  const latestSnapshot =
    collections.find((item) => item.snapshot)?.snapshot ?? null;
  const metadataDiffers = latestSnapshot
    ? (latestSnapshot.sourceMetadata.companyName !== null &&
        latestSnapshot.sourceMetadata.companyName !==
          application.jobPosting.companyName) ||
      (latestSnapshot.sourceMetadata.title !== null &&
        latestSnapshot.sourceMetadata.title !== application.jobPosting.title)
    : false;
  const selectedResume = documents.find(
    (item) => item.id === application.documents.resume?.id,
  );
  const selectedPortfolio = documents.find(
    (item) => item.id === application.documents.portfolio?.id,
  );
  const analysisReady = Boolean(
    latestSnapshot &&
      selectedResume?.extractionStatus === "ready" &&
      selectedResume.extractedText?.trim() &&
      selectedPortfolio?.extractionStatus === "ready" &&
      selectedPortfolio.extractedText?.trim(),
  );
  const latestAnalysis = analysisJobs[0] ?? null;

  return (
    <section className="flex w-full flex-col gap-6">
      <ApplicationDetailHeader
        application={application}
        archived={archived}
        changeTab={changeTab}
        disabled={disabled}
        error={error}
        locked={locked}
        reapply={reapply}
        setArchived={setArchived}
      />

      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList aria-label="지원 상세 영역">
          <TabsTrigger value="info">지원 정보</TabsTrigger>
          <TabsTrigger value="posting">채용공고</TabsTrigger>
          <TabsTrigger value="analysis">적합도 분석</TabsTrigger>
        </TabsList>

        <TabsContent value="posting">
          <ApplicationPostingTab
            activeCollection={activeCollection}
            collect={collect}
            collections={collections}
            disabled={disabled}
            latestCollection={latestCollection}
            latestSnapshot={latestSnapshot}
            manualContent={manualContent}
            metadataDiffers={metadataDiffers}
            pending={pending}
            setManualContent={setManualContent}
          />
        </TabsContent>

        <TabsContent value="analysis">
          <ApplicationAnalysisTab
            activeAnalysis={activeAnalysis}
            activeAnalysisId={activeAnalysisId}
            analysisDiagnostics={analysisDiagnostics}
            analysisJobs={analysisJobs}
            analysisPollingExpired={analysisPollingExpired}
            analysisReady={analysisReady}
            analyze={analyze}
            application={application}
            cancelAnalysis={cancelAnalysis}
            disabled={disabled}
            latestAnalysis={latestAnalysis}
            latestSnapshot={latestSnapshot}
            pending={pending}
            recoverStaleAnalysis={recoverStaleAnalysis}
            refreshAnalysis={refreshAnalysis}
            retryAnalysis={retryAnalysis}
            selectedPortfolio={selectedPortfolio}
            selectedResume={selectedResume}
          />
        </TabsContent>

        <TabsContent value="info">
          <ApplicationInfoTab
            application={application}
            archived={archived}
            disabled={disabled}
            documentsRequired={documentsRequired}
            locked={locked}
            pending={pending}
            portfolios={portfolios}
            resumes={resumes}
            save={save}
            setStatus={setStatus}
            status={status}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
