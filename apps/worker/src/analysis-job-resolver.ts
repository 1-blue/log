import type { Database } from "@workspace/contracts/database";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AnalysisJobServiceError,
  type ApplicationRow,
  type DocumentProfileRow,
  type DocumentRow,
  type JobPostingProfileRow,
  type PostingRow,
  type SnapshotRow,
} from "./analysis-job-types.js";

export type ResolvedAnalysisInputs = {
  application: ApplicationRow;
  posting: PostingRow;
  snapshot: SnapshotRow;
  resume: DocumentRow;
  portfolio: DocumentRow;
  resumeProfile: DocumentProfileRow | null;
  portfolioProfile: DocumentProfileRow | null;
  postingProfile: JobPostingProfileRow | null;
};

export async function resolveAnalysisInputs(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  applicationId: string,
): Promise<ResolvedAnalysisInputs> {
  const { data: application, error } = await supabase
    .from("applications")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw new AnalysisJobServiceError("unavailable");
  if (!application) throw new AnalysisJobServiceError("not_found");

  const { data: posting, error: postingError } = await supabase
    .from("job_postings")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("id", application.job_posting_id)
    .maybeSingle();
  if (postingError || !posting)
    throw new AnalysisJobServiceError("unavailable");

  const { data: snapshot, error: snapshotError } = await supabase
    .from("job_posting_snapshots")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("job_posting_id", posting.id)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (snapshotError) throw new AnalysisJobServiceError("unavailable");
  if (!snapshot) {
    throw new AnalysisJobServiceError("conflict", {
      reason: "collection_required",
    });
  }

  const { data: selections, error: selectionError } = await supabase
    .from("application_documents")
    .select("document_type, document_version_id")
    .eq("owner_id", ownerId)
    .eq("application_id", applicationId);
  if (selectionError) throw new AnalysisJobServiceError("unavailable");
  const resumeId = selections.find(
    (item) => item.document_type === "resume",
  )?.document_version_id;
  const portfolioId = selections.find(
    (item) => item.document_type === "portfolio",
  )?.document_version_id;
  if (!resumeId || !portfolioId) {
    throw new AnalysisJobServiceError("conflict", {
      reason: "document_selection_required",
    });
  }

  const { data: documents, error: documentError } = await supabase
    .from("document_versions")
    .select("*")
    .eq("owner_id", ownerId)
    .in("id", [resumeId, portfolioId]);
  if (documentError) throw new AnalysisJobServiceError("unavailable");
  const resume = documents.find((item) => item.id === resumeId);
  const portfolio = documents.find((item) => item.id === portfolioId);
  if (!resume || !portfolio) throw new AnalysisJobServiceError("unavailable");
  if (
    resume.extraction_status !== "ready" ||
    portfolio.extraction_status !== "ready" ||
    !resume.extracted_text?.trim() ||
    !portfolio.extracted_text?.trim()
  ) {
    throw new AnalysisJobServiceError("conflict", {
      reason: "document_text_required",
    });
  }

  const [resumeProfileResult, portfolioProfileResult, postingProfileResult] =
    await Promise.all([
      supabase
        .from("document_analysis_profiles")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("document_version_id", resume.id)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("document_analysis_profiles")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("document_version_id", portfolio.id)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("job_posting_analysis_profiles")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("snapshot_id", snapshot.id)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  if (
    resumeProfileResult.error ||
    portfolioProfileResult.error ||
    postingProfileResult.error
  ) {
    throw new AnalysisJobServiceError("unavailable");
  }

  return {
    application,
    posting,
    snapshot,
    resume,
    portfolio,
    resumeProfile: resumeProfileResult.data,
    portfolioProfile: portfolioProfileResult.data,
    postingProfile: postingProfileResult.data,
  };
}
