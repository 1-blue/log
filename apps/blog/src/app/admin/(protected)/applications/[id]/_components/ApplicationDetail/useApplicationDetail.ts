"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  type AnalysisDiagnosticsResponse,
  type AnalysisJobResponse,
  type ApplicationDetail,
  type ApplicationStatus,
  type DocumentVersion,
  type JobPostingCollectionRun,
} from "@workspace/contracts";

import { toUtcTimestamp } from "#/libs/application-ui";
import {
  cancelAnalysisJob,
  createAnalysisJob,
  createApplicationAttempt,
  createJobPostingCollection,
  getAnalysisDiagnostics,
  getAnalysisJob,
  getApplication,
  getJobPostingCollection,
  listAnalysisJobs,
  listDocumentVersions,
  listJobPostingCollections,
  recoverStaleAnalysisJob,
  retryAnalysisJob,
  updateApplication,
  updateJobPosting,
  WorkerApiError,
} from "#/libs/worker-client";

function message(error: unknown) {
  return error instanceof WorkerApiError
    ? error.message
    : "요청을 처리하지 못했습니다.";
}

function normalizeOptionalDocumentId(
  value: FormDataEntryValue | null,
): string | null {
  const normalized = String(value ?? "");
  return normalized && normalized !== "none" ? normalized : null;
}

function upsertCollection(
  current: JobPostingCollectionRun[],
  next: JobPostingCollectionRun,
) {
  return [next, ...current.filter((item) => item.id !== next.id)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
}

function upsertAnalysis(
  current: AnalysisJobResponse[],
  next: AnalysisJobResponse,
) {
  return [next, ...current.filter((item) => item.id !== next.id)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
}

export function useApplicationDetail(applicationId: string) {
  const router = useRouter();
  const [application, setApplication] = useState<ApplicationDetail | null>(
    null,
  );
  const [documents, setDocuments] = useState<DocumentVersion[]>([]);
  const [collections, setCollections] = useState<JobPostingCollectionRun[]>([]);
  const [analysisJobs, setAnalysisJobs] = useState<AnalysisJobResponse[]>([]);
  const [analysisDiagnostics, setAnalysisDiagnostics] = useState<
    AnalysisDiagnosticsResponse["data"] | null
  >(null);
  const [manualContent, setManualContent] = useState("");
  const [status, setStatus] = useState<ApplicationStatus>("interested");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisPollingExpired, setAnalysisPollingExpired] = useState(false);
  const [activeTab, setActiveTab] = useState("posting");

  const changeTab = useCallback((value: string) => {
    setActiveTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && ["info", "posting", "analysis"].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [applicationResponse, documentsResponse] = await Promise.all([
        getApplication(applicationId),
        listDocumentVersions({ archived: "exclude" }),
      ]);
      setApplication(applicationResponse.data);
      setStatus(applicationResponse.data.status);
      setDocuments(documentsResponse.data.items);
      try {
        const [collectionsResponse, analysisResponse] = await Promise.all([
          listJobPostingCollections(applicationResponse.data.jobPosting.id),
          listAnalysisJobs(applicationId),
        ]);
        setCollections(collectionsResponse.data.items);
        setAnalysisJobs(analysisResponse.data.items);
        const latest = analysisResponse.data.items[0];
        if (latest && ["failed", "needs_input"].includes(latest.status)) {
          const diagnostics = await getAnalysisDiagnostics(latest.id);
          setAnalysisDiagnostics(diagnostics.data);
        } else {
          setAnalysisDiagnostics(null);
        }
      } catch (caught) {
        setError(message(caught));
      }
    } catch (caught) {
      setError(message(caught));
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCollection = collections.find(
    (item) => item.status === "queued" || item.status === "running",
  );
  const activeCollectionId = activeCollection?.id ?? null;
  const activeAnalysis = analysisJobs.find((item) =>
    ["queued", "running", "retrying"].includes(item.status),
  );
  const activeAnalysisId = activeAnalysis?.id ?? null;

  useEffect(() => {
    if (!application || !activeCollectionId) return;
    const postingId = application.jobPosting.id;
    const runId = activeCollectionId;
    let stopped = false;
    const refresh = async () => {
      try {
        const response = await getJobPostingCollection(postingId, runId);
        if (stopped) return;
        setCollections((current) => upsertCollection(current, response.data));
      } catch (caught) {
        if (!stopped) setError(message(caught));
      }
    };
    const interval = window.setInterval(() => void refresh(), 2_000);
    const timeout = window.setTimeout(() => {
      stopped = true;
      window.clearInterval(interval);
    }, 60_000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [activeCollectionId, application]);

  useEffect(() => {
    if (!activeAnalysisId) return;
    let stopped = false;
    setAnalysisPollingExpired(false);
    const refresh = async () => {
      try {
        const response = await getAnalysisJob(activeAnalysisId);
        if (!stopped) {
          setAnalysisJobs((current) => upsertAnalysis(current, response.data));
          if (["failed", "needs_input"].includes(response.data.status)) {
            const diagnostics = await getAnalysisDiagnostics(activeAnalysisId);
            if (!stopped) setAnalysisDiagnostics(diagnostics.data);
          }
        }
      } catch (caught) {
        if (!stopped) setError(message(caught));
      }
    };
    const interval = window.setInterval(() => void refresh(), 2_000);
    const timeout = window.setTimeout(() => {
      stopped = true;
      window.clearInterval(interval);
      setAnalysisPollingExpired(true);
    }, 5 * 60_000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [activeAnalysisId]);

  async function refreshAnalysis(analysisJobId: string) {
    setPending("analysis-refresh");
    setError(null);
    try {
      const response = await getAnalysisJob(analysisJobId);
      setAnalysisJobs((current) => upsertAnalysis(current, response.data));
      if (["failed", "needs_input"].includes(response.data.status)) {
        const diagnostics = await getAnalysisDiagnostics(analysisJobId);
        setAnalysisDiagnostics(diagnostics.data);
      }
      setAnalysisPollingExpired(
        ["queued", "running", "retrying"].includes(response.data.status),
      );
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  async function recoverStaleAnalysis(analysisJobId: string) {
    setPending("analysis-recover");
    setError(null);
    try {
      const response = await recoverStaleAnalysisJob(analysisJobId);
      setAnalysisJobs((current) => upsertAnalysis(current, response.data.job));
      setAnalysisPollingExpired(false);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  async function retryAnalysis(analysisJobId: string) {
    setPending("analysis-retry");
    setError(null);
    try {
      const response = await retryAnalysisJob(analysisJobId);
      setAnalysisJobs((current) => upsertAnalysis(current, response.data.job));
      setAnalysisDiagnostics(null);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  async function cancelAnalysis(analysisJobId: string) {
    setPending("analysis-cancel");
    setError(null);
    try {
      const response = await cancelAnalysisJob(analysisJobId);
      setAnalysisJobs((current) => upsertAnalysis(current, response.data.job));
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  async function analyze() {
    setPending("analyze");
    setError(null);
    try {
      const response = await createAnalysisJob(applicationId);
      setAnalysisJobs((current) => upsertAnalysis(current, response.data.job));
      setAnalysisDiagnostics(null);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  async function collect(content: string | null) {
    if (!application) return;
    setPending(content === null ? "collect" : "manual-collect");
    setError(null);
    try {
      const response = await createJobPostingCollection(
        application.jobPosting.id,
        { manualContent: content },
      );
      setCollections((current) => upsertCollection(current, response.data));
      if (content !== null) setManualContent("");
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!application) return;
    const data = new FormData(event.currentTarget);
    setPending("save");
    setError(null);
    try {
      const companyName = String(data.get("companyName") ?? "").trim();
      const title = String(data.get("title") ?? "").trim();
      if (
        companyName !== application.jobPosting.companyName ||
        title !== application.jobPosting.title
      ) {
        await updateJobPosting(application.jobPosting.id, {
          companyName,
          title,
        });
      }
      const response = await updateApplication(application.id, {
        appliedOn: String(data.get("appliedOn") ?? "") || null,
        interviewAt: toUtcTimestamp(String(data.get("interviewAt") ?? "")),
        note: String(data.get("note") ?? "").trim() || null,
        portfolioVersionId: application.documentsLockedAt
          ? (application.documents.portfolio?.id ?? null)
          : normalizeOptionalDocumentId(data.get("portfolioVersionId")),
        resumeVersionId: application.documentsLockedAt
          ? (application.documents.resume?.id ?? null)
          : normalizeOptionalDocumentId(data.get("resumeVersionId")),
        status,
      });
      setApplication(response.data);
      setStatus(response.data.status);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  async function setArchived(archived: boolean) {
    if (!application) return;
    setPending("archive");
    setError(null);
    try {
      const response = await updateApplication(application.id, { archived });
      setApplication(response.data);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  async function reapply() {
    if (!application) return;
    setPending("reapply");
    setError(null);
    try {
      const response = await createApplicationAttempt(
        application.jobPosting.id,
        {
          appliedOn: null,
          interviewAt: null,
          note: null,
          portfolioVersionId: application.documents.portfolio?.archivedAt
            ? null
            : (application.documents.portfolio?.id ?? null),
          resumeVersionId: application.documents.resume?.archivedAt
            ? null
            : (application.documents.resume?.id ?? null),
          status: "interested",
        },
      );
      router.push(`/admin/applications/${response.data.id}`);
    } catch (caught) {
      setError(message(caught));
      setPending(null);
    }
  }

  return {
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
  };
}
