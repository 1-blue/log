import {
  ANALYSIS_DISPATCH_DOCUMENT_TEXT_MAX_LENGTH,
  ANALYSIS_DISPATCH_JOB_POSTING_TEXT_MAX_LENGTH,
  ANALYSIS_INPUT_POLICY_VERSION,
  AnalysisInputAuditSchema,
  AnalysisInputPolicySchema,
  CONTRACT_VERSION,
  DocumentAnalysisProfileSchema,
  JobPostingAnalysisProfileSchema,
  JobPostingFactsSchema,
  type N8nDispatchPayload,
  N8nDispatchPayloadSchema,
  ProfileComparisonSchema,
} from "@workspace/contracts";
import type { Database, Json } from "@workspace/contracts/database";

import type { SupabaseClient } from "@supabase/supabase-js";
import * as z from "zod";

import {
  JOB_POSTING_TEXT_MAX_LENGTH,
  prepareAnalysisDispatchDocumentText,
  prepareAnalysisDispatchJobPostingText,
} from "./analysis-job-input.js";
import { mapConfirmedEvidence } from "./analysis-job-result.js";
import {
  type AnalysisJobRow,
  AnalysisJobServiceError,
  type PostingRow,
} from "./analysis-job-types.js";
import { toOpenAiStructuredOutputSchema } from "./openai-schema.js";

function outputSchemas() {
  return {
    jobPostingFacts: toOpenAiStructuredOutputSchema(
      z.toJSONSchema(JobPostingFactsSchema, { target: "draft-07" }),
    ),
    profileComparison: toOpenAiStructuredOutputSchema(
      z.toJSONSchema(ProfileComparisonSchema, { target: "draft-07" }),
    ),
  };
}

export async function buildAnalysisDispatchPayload(input: {
  eventId: string;
  posting: PostingRow;
  row: AnalysisJobRow;
  supabase: SupabaseClient<Database>;
}): Promise<N8nDispatchPayload> {
  const { eventId, posting, row, supabase } = input;
  const [
    resumeProfileResult,
    portfolioProfileResult,
    postingProfileResult,
    documentsResult,
    resumeEvidenceResult,
    portfolioEvidenceResult,
  ] = await Promise.all([
    row.resume_profile_id
      ? supabase
          .from("document_analysis_profiles")
          .select("*")
          .eq("id", row.resume_profile_id)
          .eq("owner_id", row.owner_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    row.portfolio_profile_id
      ? supabase
          .from("document_analysis_profiles")
          .select("*")
          .eq("id", row.portfolio_profile_id)
          .eq("owner_id", row.owner_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    row.job_posting_profile_id
      ? supabase
          .from("job_posting_analysis_profiles")
          .select("*")
          .eq("id", row.job_posting_profile_id)
          .eq("owner_id", row.owner_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("document_versions")
      .select("id, original_filename, mime_type, file_size, storage_path")
      .eq("owner_id", row.owner_id)
      .in("id", [row.resume_version_id, row.portfolio_version_id]),
    supabase
      .from("document_evidence_reviews")
      .select("*")
      .eq("owner_id", row.owner_id)
      .eq("document_version_id", row.resume_version_id)
      .eq("status", "confirmed")
      .order("updated_at", { ascending: false }),
    supabase
      .from("document_evidence_reviews")
      .select("*")
      .eq("owner_id", row.owner_id)
      .eq("document_version_id", row.portfolio_version_id)
      .eq("status", "confirmed")
      .order("updated_at", { ascending: false }),
  ]);
  if (
    resumeProfileResult.error ||
    portfolioProfileResult.error ||
    postingProfileResult.error ||
    documentsResult.error ||
    resumeEvidenceResult.error ||
    portfolioEvidenceResult.error
  ) {
    throw new AnalysisJobServiceError("unavailable");
  }

  const resumeProfile =
    resumeProfileResult.data?.status === "succeeded"
      ? DocumentAnalysisProfileSchema.safeParse(
          resumeProfileResult.data.profile,
        )
      : null;
  const portfolioProfile =
    portfolioProfileResult.data?.status === "succeeded"
      ? DocumentAnalysisProfileSchema.safeParse(
          portfolioProfileResult.data.profile,
        )
      : null;
  const postingProfile =
    postingProfileResult.data?.status === "succeeded"
      ? JobPostingAnalysisProfileSchema.safeParse(
          postingProfileResult.data.profile,
        )
      : null;
  const documents = documentsResult.data ?? [];
  const resumeConfirmedEvidence = (resumeEvidenceResult.data ?? []).map(
    mapConfirmedEvidence,
  );
  const portfolioConfirmedEvidence = (portfolioEvidenceResult.data ?? []).map(
    mapConfirmedEvidence,
  );
  const signedFile = async (versionId: string) => {
    const document = documents.find((item) => item.id === versionId);
    if (!document) return null;
    const { data, error } = await supabase.storage
      .from("career-documents")
      .createSignedUrl(document.storage_path, 900);
    if (error || !data?.signedUrl) return null;
    return {
      url: data.signedUrl,
      filename: document.original_filename,
      mimeType: "application/pdf" as const,
      fileSize: document.file_size,
    };
  };
  const [resumeFile, portfolioFile] = await Promise.all([
    signedFile(row.resume_version_id),
    signedFile(row.portfolio_version_id),
  ]);
  if (!resumeFile || !portfolioFile) {
    throw new AnalysisJobServiceError("unavailable", {
      reason: "document_file_unavailable",
    });
  }

  const resumeInput = prepareAnalysisDispatchDocumentText(row.resume_text);
  const portfolioInput = prepareAnalysisDispatchDocumentText(
    row.portfolio_text,
  );
  const jobPostingInput = prepareAnalysisDispatchJobPostingText(
    row.job_posting_text,
  );
  const inputPolicy = AnalysisInputPolicySchema.parse({
    version: ANALYSIS_INPUT_POLICY_VERSION,
    documentTextMaxLength: ANALYSIS_DISPATCH_DOCUMENT_TEXT_MAX_LENGTH,
    jobPostingTextMaxLength: ANALYSIS_DISPATCH_JOB_POSTING_TEXT_MAX_LENGTH,
    includesPdf: Boolean(resumeFile && portfolioFile),
    includesProfile: Boolean(
      resumeProfile?.success &&
        portfolioProfile?.success &&
        postingProfile?.success,
    ),
  });
  const parsedPayload = N8nDispatchPayloadSchema.parse({
    analysisJobId: row.id,
    callbacks: {
      eventPath: `/v1/internal/analysis-jobs/${row.id}/events`,
      resultPath: `/v1/internal/analysis-jobs/${row.id}/result`,
    },
    eventId,
    jobPosting: {
      companyName: posting.company_name,
      contentHash: row.job_posting_content_hash,
      id: posting.id,
      snapshotId: row.job_posting_snapshot_id,
      source: posting.source,
      text: jobPostingInput.text,
      sourceTextLength: row.job_posting_text.length,
      inputTextLength: jobPostingInput.inputTextLength,
      inputTextTruncated:
        jobPostingInput.truncated ||
        row.job_posting_text.length >= JOB_POSTING_TEXT_MAX_LENGTH,
      title: posting.title,
      url: posting.canonical_url,
      profileId: row.job_posting_profile_id,
      profileSource: postingProfileResult.data?.source ?? null,
      profile: postingProfile?.success ? postingProfile.data : null,
    },
    kind: "application_analysis",
    outputSchemas: outputSchemas(),
    profile: {
      portfolio: {
        contentHash: row.portfolio_content_hash,
        inputTextLength: portfolioInput.inputTextLength,
        inputTextTruncated: portfolioInput.truncated || row.portfolio_truncated,
        originalLength: row.portfolio_original_length,
        sourceTextLength: row.portfolio_text.length,
        text: portfolioInput.text,
        truncated: row.portfolio_truncated,
        versionId: row.portfolio_version_id,
        profileId: row.portfolio_profile_id,
        profileSource: portfolioProfileResult.data?.source ?? null,
        profile: portfolioProfile?.success ? portfolioProfile.data : null,
        confirmedEvidence: portfolioConfirmedEvidence,
        file: portfolioFile,
      },
      resume: {
        contentHash: row.resume_content_hash,
        inputTextLength: resumeInput.inputTextLength,
        inputTextTruncated: resumeInput.truncated || row.resume_truncated,
        originalLength: row.resume_original_length,
        sourceTextLength: row.resume_text.length,
        text: resumeInput.text,
        truncated: row.resume_truncated,
        versionId: row.resume_version_id,
        profileId: row.resume_profile_id,
        profileSource: resumeProfileResult.data?.source ?? null,
        profile: resumeProfile?.success ? resumeProfile.data : null,
        confirmedEvidence: resumeConfirmedEvidence,
        file: resumeFile,
      },
    },
    requestId: row.request_id,
    runAttempt: row.attempt_count,
    schemaVersion: CONTRACT_VERSION,
    inputPolicy,
  });
  const audit = AnalysisInputAuditSchema.parse({
    documentTextMaxLength: inputPolicy.documentTextMaxLength,
    includesPdf: inputPolicy.includesPdf,
    includesProfile: inputPolicy.includesProfile,
    jobPosting: {
      dispatchLength: jobPostingInput.inputTextLength,
      dispatchTruncated:
        jobPostingInput.truncated ||
        row.job_posting_text.length >= JOB_POSTING_TEXT_MAX_LENGTH,
      originalLength: row.job_posting_text.length,
      storedLength: row.job_posting_text.length,
      storedTruncated: false,
    },
    policyVersion: inputPolicy.version,
    portfolio: {
      dispatchLength: portfolioInput.inputTextLength,
      dispatchTruncated: portfolioInput.truncated || row.portfolio_truncated,
      originalLength: row.portfolio_original_length,
      storedLength: row.portfolio_text.length,
      storedTruncated: row.portfolio_truncated,
      confirmedEvidenceCount: portfolioConfirmedEvidence.length,
    },
    resume: {
      dispatchLength: resumeInput.inputTextLength,
      dispatchTruncated: resumeInput.truncated || row.resume_truncated,
      originalLength: row.resume_original_length,
      storedLength: row.resume_text.length,
      storedTruncated: row.resume_truncated,
      confirmedEvidenceCount: resumeConfirmedEvidence.length,
    },
    jobPostingTextMaxLength: inputPolicy.jobPostingTextMaxLength,
  });
  const { error: auditError } = await supabase
    .from("analysis_jobs")
    .update({ input_audit: audit as unknown as Json })
    .eq("id", row.id)
    .eq("owner_id", row.owner_id);
  if (auditError) throw new AnalysisJobServiceError("unavailable");
  return parsedPayload;
}
