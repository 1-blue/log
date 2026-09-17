import {
  ANALYSIS_JOB_MAX_RUN_ATTEMPTS,
  type AnalysisEventCallback,
  type AnalysisJobResponse,
  type AnalysisResult,
  type AnalysisResultCallback,
  DocumentAnalysisProfileSchema,
  AnalysisResultSchema,
  calculateAnalysisFitScore,
  CONTRACT_VERSION,
  type Evidence,
  JobPostingFactsSchema,
  type N8nDispatchPayload,
  ProfileComparisonSchema,
  JobPostingAnalysisProfileSchema,
} from "@workspace/contracts";
import type { Database, Json } from "@workspace/contracts/database";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as z from "zod";

import { sha256Hex } from "./idempotency.js";
import { dispatchToN8n, N8nDispatchError } from "./n8n.js";
import { toOpenAiStructuredOutputSchema } from "./openai-schema.js";

type AnalysisJobRow = Database["public"]["Tables"]["analysis_jobs"]["Row"];
type AnalysisResultRow =
  Database["public"]["Tables"]["analysis_results"]["Row"];
type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];
type DocumentRow = Database["public"]["Tables"]["document_versions"]["Row"];
type PostingRow = Database["public"]["Tables"]["job_postings"]["Row"];
type SnapshotRow = Database["public"]["Tables"]["job_posting_snapshots"]["Row"];
type DocumentProfileRow =
  Database["public"]["Tables"]["document_analysis_profiles"]["Row"];
type JobPostingProfileRow =
  Database["public"]["Tables"]["job_posting_analysis_profiles"]["Row"];

const DOCUMENT_TEXT_MAX_LENGTH = 80_000;
const DOCUMENT_TEXT_HEAD_LENGTH = 40_000;
const DOCUMENT_TEXT_MIDDLE_LENGTH = 20_000;
const DOCUMENT_TEXT_TAIL_LENGTH = 20_000;
const OMISSION_MARKER = "\n\n[...중간 일부 생략...]\n\n";
const JOB_POSTING_TEXT_MAX_LENGTH = 100_000;

type Dispatch = (
  payload: N8nDispatchPayload,
  env: CloudflareBindings,
) => Promise<void>;

export class AnalysisJobServiceError extends Error {
  constructor(
    readonly kind: "conflict" | "not_found" | "unavailable" | "validation",
    readonly details: Record<string, string> | null = null,
  ) {
    super(kind);
    this.name = "AnalysisJobServiceError";
  }
}

export interface AnalysisJobService {
  cancel(ownerId: string, analysisJobId: string): Promise<AnalysisJobResponse>;
  complete(input: AnalysisResultCallback): Promise<AnalysisJobResponse>;
  create(
    ownerId: string,
    applicationId: string,
    requestId: string,
  ): Promise<AnalysisJobResponse>;
  event(input: AnalysisEventCallback): Promise<AnalysisJobResponse>;
  failStale(cutoff: string, limit: number): Promise<string[]>;
  get(ownerId: string, analysisJobId: string): Promise<AnalysisJobResponse>;
  list(ownerId: string, applicationId: string): Promise<AnalysisJobResponse[]>;
  retry(ownerId: string, analysisJobId: string): Promise<AnalysisJobResponse>;
}

export function prepareAnalysisDocumentText(text: string): {
  originalLength: number;
  text: string;
  truncated: boolean;
} {
  const normalized = text.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= DOCUMENT_TEXT_MAX_LENGTH) {
    return {
      originalLength: normalized.length,
      text: normalized,
      truncated: false,
    };
  }

  const middleStart = Math.floor(
    (normalized.length - DOCUMENT_TEXT_MIDDLE_LENGTH) / 2,
  );
  return {
    originalLength: normalized.length,
    text: [
      normalized.slice(0, DOCUMENT_TEXT_HEAD_LENGTH),
      OMISSION_MARKER,
      normalized.slice(middleStart, middleStart + DOCUMENT_TEXT_MIDDLE_LENGTH),
      OMISSION_MARKER,
      normalized.slice(-DOCUMENT_TEXT_TAIL_LENGTH),
    ].join(""),
    truncated: true,
  };
}

export function prepareAnalysisJobPostingText(text: string): string {
  const normalized = text.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= JOB_POSTING_TEXT_MAX_LENGTH) return normalized;
  const tailLength = 20_000;
  const headLength =
    JOB_POSTING_TEXT_MAX_LENGTH - tailLength - OMISSION_MARKER.length;
  return `${normalized.slice(0, headLength)}${OMISSION_MARKER}${normalized.slice(-tailLength)}`;
}

function createSupabaseAdminClient(env: CloudflareBindings) {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

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

function lastError(row: AnalysisJobRow) {
  if (!row.error_code || !row.error_message) return null;
  return {
    code: row.error_code,
    message: row.error_message,
    retryable: row.error_retryable,
  };
}

export function mapAnalysisJob(
  row: AnalysisJobRow,
  resultRow: AnalysisResultRow | null,
): AnalysisJobResponse {
  const parsedResult = resultRow
    ? AnalysisResultSchema.safeParse(resultRow.result)
    : null;
  if (parsedResult && !parsedResult.success) {
    throw new AnalysisJobServiceError("unavailable");
  }
  return {
    applicationId: row.application_id,
    attemptCount: row.attempt_count,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    id: row.id,
    jobPostingId: row.job_posting_id,
    jobPostingSnapshotId: row.job_posting_snapshot_id,
    lastHeartbeatAt: row.last_heartbeat_at,
    lastError: lastError(row),
    portfolioVersionId: row.portfolio_version_id,
    requestId: row.request_id,
    retryAt: row.retry_at,
    result: parsedResult?.data ?? null,
    resumeVersionId: row.resume_version_id,
    stage: row.stage,
    startedAt: row.started_at,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function evidenceMatchesSource(
  evidence: Evidence,
  job: AnalysisJobRow,
): boolean {
  const source =
    evidence.source === "job_posting"
      ? { id: job.job_posting_snapshot_id, text: job.job_posting_text }
      : evidence.source === "resume"
        ? { id: job.resume_version_id, text: job.resume_text }
        : { id: job.portfolio_version_id, text: job.portfolio_text };
  return (
    evidence.sourceVersionId === source.id &&
    source.text.includes(evidence.excerpt.trim())
  );
}

export function validateAnalysisSemantics(
  result: AnalysisResult,
  job: AnalysisJobRow,
): { ok: true } | { ok: false; reason: string } {
  const ids = result.job.requirements.map((item) => item.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length)
    return { ok: false, reason: "duplicate_requirement_id" };

  const jobEvidence = [
    ...result.job.requirements.flatMap((item) => item.evidence),
    ...result.job.technologies.flatMap((item) => item.evidence),
    ...result.job.traits.flatMap((item) => item.evidence),
  ];
  if (
    jobEvidence.some(
      (evidence) =>
        evidence.source !== "job_posting" ||
        !evidenceMatchesSource(evidence, job),
    )
  ) {
    return { ok: false, reason: "invalid_job_evidence" };
  }

  const matchIds = result.comparison.matches.map((item) => item.requirementId);
  if (
    new Set(matchIds).size !== matchIds.length ||
    matchIds.length !== ids.length ||
    matchIds.some((id) => !uniqueIds.has(id))
  ) {
    return { ok: false, reason: "invalid_requirement_match" };
  }

  for (const match of result.comparison.matches) {
    if (
      match.profileEvidence.some(
        (evidence) =>
          evidence.source === "job_posting" ||
          !evidenceMatchesSource(evidence, job),
      ) ||
      ((match.status === "matched" || match.status === "partial") &&
        match.profileEvidence.length === 0)
    ) {
      return { ok: false, reason: "invalid_profile_evidence" };
    }
  }

  const references = [
    ...result.comparison.gaps.flatMap((gap) => gap.requirementIds),
    ...result.comparison.interviewQuestions.flatMap(
      (question) => question.requirementIds,
    ),
  ];
  if (references.some((id) => !uniqueIds.has(id))) {
    return { ok: false, reason: "unknown_requirement_reference" };
  }
  if (
    result.comparison.gaps
      .flatMap((gap) => gap.evidence)
      .some((evidence) => !evidenceMatchesSource(evidence, job))
  ) {
    return { ok: false, reason: "invalid_gap_evidence" };
  }

  for (const question of result.comparison.interviewQuestions) {
    if (
      question.answerEvidence.some(
        (evidence) =>
          evidence.source === "job_posting" ||
          !evidenceMatchesSource(evidence, job),
      )
    ) {
      return { ok: false, reason: "invalid_answer_evidence" };
    }
    if (question.modelAnswer !== null && question.answerEvidence.length === 0) {
      return { ok: false, reason: "answer_without_evidence" };
    }
  }

  const score = calculateAnalysisFitScore(
    result.job.requirements,
    result.comparison.matches,
  );
  if (score !== result.fitScore)
    return { ok: false, reason: "invalid_fit_score" };
  return { ok: true };
}

class SupabaseAnalysisJobService implements AnalysisJobService {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly env: CloudflareBindings,
    private readonly dispatch: Dispatch,
  ) {}

  private async getResult(jobId: string): Promise<AnalysisResultRow | null> {
    const { data, error } = await this.supabase
      .from("analysis_results")
      .select("*")
      .eq("analysis_job_id", jobId)
      .maybeSingle();
    if (error) throw new AnalysisJobServiceError("unavailable");
    return data;
  }

  private async getRow(
    jobId: string,
    ownerId?: string,
  ): Promise<AnalysisJobRow> {
    let query = this.supabase.from("analysis_jobs").select("*").eq("id", jobId);
    if (ownerId) query = query.eq("owner_id", ownerId);
    const { data, error } = await query.maybeSingle();
    if (error) throw new AnalysisJobServiceError("unavailable");
    if (!data) throw new AnalysisJobServiceError("not_found");
    return data;
  }

  private async getPosting(row: AnalysisJobRow): Promise<PostingRow> {
    const { data, error } = await this.supabase
      .from("job_postings")
      .select("*")
      .eq("id", row.job_posting_id)
      .eq("owner_id", row.owner_id)
      .maybeSingle();
    if (error || !data) throw new AnalysisJobServiceError("unavailable");
    return data;
  }

  private async buildDispatchPayload(
    row: AnalysisJobRow,
    posting: PostingRow,
    eventId: string,
  ): Promise<N8nDispatchPayload> {
    const [
      resumeProfileResult,
      portfolioProfileResult,
      postingProfileResult,
      documentsResult,
    ] = await Promise.all([
      row.resume_profile_id
        ? this.supabase
            .from("document_analysis_profiles")
            .select("*")
            .eq("id", row.resume_profile_id)
            .eq("owner_id", row.owner_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      row.portfolio_profile_id
        ? this.supabase
            .from("document_analysis_profiles")
            .select("*")
            .eq("id", row.portfolio_profile_id)
            .eq("owner_id", row.owner_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      row.job_posting_profile_id
        ? this.supabase
            .from("job_posting_analysis_profiles")
            .select("*")
            .eq("id", row.job_posting_profile_id)
            .eq("owner_id", row.owner_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      this.supabase
        .from("document_versions")
        .select("id, original_filename, mime_type, file_size, storage_path")
        .eq("owner_id", row.owner_id)
        .in("id", [row.resume_version_id, row.portfolio_version_id]),
    ]);
    if (
      resumeProfileResult.error ||
      portfolioProfileResult.error ||
      postingProfileResult.error ||
      documentsResult.error
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
    const signedFile = async (versionId: string) => {
      const document = documents.find((item) => item.id === versionId);
      if (!document) return null;
      const { data, error } = await this.supabase.storage
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
    return {
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
        text: row.job_posting_text,
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
          originalLength: row.portfolio_original_length,
          text: row.portfolio_text,
          truncated: row.portfolio_truncated,
          versionId: row.portfolio_version_id,
          profileId: row.portfolio_profile_id,
          profileSource: portfolioProfileResult.data?.source ?? null,
          profile: portfolioProfile?.success ? portfolioProfile.data : null,
          file: portfolioFile,
        },
        resume: {
          contentHash: row.resume_content_hash,
          originalLength: row.resume_original_length,
          text: row.resume_text,
          truncated: row.resume_truncated,
          versionId: row.resume_version_id,
          profileId: row.resume_profile_id,
          profileSource: resumeProfileResult.data?.source ?? null,
          profile: resumeProfile?.success ? resumeProfile.data : null,
          file: resumeFile,
        },
      },
      requestId: row.request_id,
      runAttempt: row.attempt_count,
      schemaVersion: CONTRACT_VERSION,
    };
  }

  private async beginAttempt(row: AnalysisJobRow): Promise<AnalysisJobRow> {
    const { data, error } = await this.supabase.rpc("begin_analysis_attempt", {
      p_analysis_job_id: row.id,
      p_event_id: crypto.randomUUID(),
      p_owner_id: row.owner_id,
    });
    if (error || !data) {
      if (error?.code === "23514") {
        const reason =
          row.attempt_count >= ANALYSIS_JOB_MAX_RUN_ATTEMPTS
            ? "analysis_attempts_exhausted"
            : "analysis_not_failed";
        throw new AnalysisJobServiceError("conflict", { reason });
      }
      throw new AnalysisJobServiceError("unavailable");
    }
    return data;
  }

  private async markDispatchFailed(
    row: AnalysisJobRow,
    retryable: boolean,
  ): Promise<AnalysisJobRow> {
    const { data, error } = await this.supabase.rpc("record_analysis_event", {
      p_analysis_job_id: row.id,
      p_error_code: "DISPATCH_FAILED",
      p_error_message: "분석 Workflow 호출에 실패했습니다.",
      p_error_retryable: retryable,
      p_event_id: crypto.randomUUID(),
      p_event_type: "failed",
      p_message: "분석 Workflow 호출에 실패했습니다.",
      p_occurred_at: new Date().toISOString(),
      p_run_attempt: row.attempt_count,
      p_stage: "dispatching",
      p_status: "failed",
    });
    if (error || !data) throw new AnalysisJobServiceError("unavailable");
    return data;
  }

  private async dispatchAttempt(
    row: AnalysisJobRow,
    posting: PostingRow,
  ): Promise<AnalysisJobRow> {
    try {
      await this.dispatch(
        await this.buildDispatchPayload(row, posting, crypto.randomUUID()),
        this.env,
      );
      return row;
    } catch (dispatchError) {
      const mapped =
        dispatchError instanceof N8nDispatchError ? dispatchError : null;
      return this.markDispatchFailed(row, mapped?.retryable ?? true);
    }
  }

  async get(ownerId: string, analysisJobId: string) {
    const row = await this.getRow(analysisJobId, ownerId);
    return mapAnalysisJob(row, await this.getResult(row.id));
  }

  async list(ownerId: string, applicationId: string) {
    const { data, error } = await this.supabase
      .from("analysis_jobs")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new AnalysisJobServiceError("unavailable");
    const results = await Promise.all(
      data.map((row) => this.getResult(row.id)),
    );
    return data.map((row, index) =>
      mapAnalysisJob(row, results[index] ?? null),
    );
  }

  private async resolveInputs(ownerId: string, applicationId: string) {
    const { data: application, error } = await this.supabase
      .from("applications")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("id", applicationId)
      .maybeSingle();
    if (error) throw new AnalysisJobServiceError("unavailable");
    if (!application) throw new AnalysisJobServiceError("not_found");

    const { data: posting, error: postingError } = await this.supabase
      .from("job_postings")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("id", application.job_posting_id)
      .maybeSingle();
    if (postingError || !posting)
      throw new AnalysisJobServiceError("unavailable");

    const { data: snapshot, error: snapshotError } = await this.supabase
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

    const { data: selections, error: selectionError } = await this.supabase
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

    const { data: documents, error: documentError } = await this.supabase
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
        this.supabase
          .from("document_analysis_profiles")
          .select("*")
          .eq("owner_id", ownerId)
          .eq("document_version_id", resume.id)
          .eq("status", "succeeded")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        this.supabase
          .from("document_analysis_profiles")
          .select("*")
          .eq("owner_id", ownerId)
          .eq("document_version_id", portfolio.id)
          .eq("status", "succeeded")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        this.supabase
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
    } satisfies {
      application: ApplicationRow;
      posting: PostingRow;
      snapshot: SnapshotRow;
      resume: DocumentRow;
      portfolio: DocumentRow;
      resumeProfile: DocumentProfileRow | null;
      portfolioProfile: DocumentProfileRow | null;
      postingProfile: JobPostingProfileRow | null;
    };
  }

  async create(ownerId: string, applicationId: string, requestId: string) {
    const {
      application,
      posting,
      snapshot,
      resume,
      portfolio,
      resumeProfile,
      portfolioProfile,
      postingProfile,
    } = await this.resolveInputs(ownerId, applicationId);
    const resumeInput = prepareAnalysisDocumentText(resume.extracted_text!);
    const portfolioInput = prepareAnalysisDocumentText(
      portfolio.extracted_text!,
    );
    const resumeHash = await sha256Hex(resumeInput.text);
    const portfolioHash = await sha256Hex(portfolioInput.text);
    const jobPostingText = prepareAnalysisJobPostingText(
      snapshot.normalized_content,
    );
    const jobPostingHash = await sha256Hex(jobPostingText);

    const { data: row, error } = await this.supabase
      .from("analysis_jobs")
      .insert({
        application_id: application.id,
        job_posting_content_hash: jobPostingHash,
        job_posting_id: posting.id,
        job_posting_snapshot_id: snapshot.id,
        job_posting_text: jobPostingText,
        job_posting_profile_id: postingProfile?.id ?? null,
        owner_id: ownerId,
        portfolio_content_hash: portfolioHash,
        portfolio_original_length: portfolioInput.originalLength,
        portfolio_text: portfolioInput.text,
        portfolio_truncated: portfolioInput.truncated,
        portfolio_version_id: portfolio.id,
        portfolio_profile_id: portfolioProfile?.id ?? null,
        request_id: requestId,
        resume_content_hash: resumeHash,
        resume_original_length: resumeInput.originalLength,
        resume_text: resumeInput.text,
        resume_truncated: resumeInput.truncated,
        resume_version_id: resume.id,
        resume_profile_id: resumeProfile?.id ?? null,
        stage: "dispatching",
      })
      .select("*")
      .single();
    if (error || !row) {
      if (error?.code === "23505") {
        throw new AnalysisJobServiceError("conflict", {
          reason: "analysis_in_progress",
        });
      }
      throw new AnalysisJobServiceError("unavailable");
    }

    const started = await this.beginAttempt(row);
    const dispatched = await this.dispatchAttempt(started, posting);
    return mapAnalysisJob(dispatched, null);
  }

  async retry(ownerId: string, analysisJobId: string) {
    const row = await this.getRow(analysisJobId, ownerId);
    if (row.status !== "failed") {
      throw new AnalysisJobServiceError("conflict", {
        reason: "analysis_not_failed",
      });
    }
    if (row.attempt_count >= ANALYSIS_JOB_MAX_RUN_ATTEMPTS) {
      throw new AnalysisJobServiceError("conflict", {
        reason: "analysis_attempts_exhausted",
      });
    }

    const started = await this.beginAttempt(row);
    const dispatched = await this.dispatchAttempt(
      started,
      await this.getPosting(started),
    );
    return mapAnalysisJob(dispatched, await this.getResult(dispatched.id));
  }

  async cancel(ownerId: string, analysisJobId: string) {
    const { data, error } = await this.supabase.rpc("cancel_analysis_job", {
      p_analysis_job_id: analysisJobId,
      p_event_id: crypto.randomUUID(),
      p_owner_id: ownerId,
    });
    if (error || !data) {
      if (error?.code === "P0002") {
        throw new AnalysisJobServiceError("not_found");
      }
      if (error?.code === "23514") {
        throw new AnalysisJobServiceError("conflict", {
          reason: "analysis_not_active",
        });
      }
      throw new AnalysisJobServiceError("unavailable");
    }
    return mapAnalysisJob(data, await this.getResult(data.id));
  }

  async failStale(cutoff: string, limit: number) {
    const { data, error } = await this.supabase.rpc(
      "fail_stale_analysis_jobs",
      {
        p_cutoff: cutoff,
        p_limit: limit,
      },
    );
    if (error) throw new AnalysisJobServiceError("unavailable");
    return data ?? [];
  }

  async event(input: AnalysisEventCallback) {
    const row = await this.getRow(input.analysisJobId);
    if (row.request_id !== input.requestId) {
      throw new AnalysisJobServiceError("validation");
    }
    const { data, error } = await this.supabase.rpc("record_analysis_event", {
      p_analysis_job_id: input.analysisJobId,
      p_error_code: input.error?.code,
      p_error_message: input.error?.message,
      p_error_retryable: input.error?.retryable ?? false,
      p_event_id: input.eventId,
      p_event_type: input.eventType,
      p_message: input.message ?? undefined,
      p_occurred_at: input.occurredAt,
      p_retry_at: input.retryAt ?? undefined,
      p_run_attempt: input.runAttempt,
      p_stage: input.stage ?? undefined,
      p_step: input.step ?? undefined,
      p_step_attempt: input.stepAttempt ?? undefined,
      p_status: input.status,
    });
    if (error || !data) {
      if (error?.code === "23514")
        throw new AnalysisJobServiceError("conflict");
      throw new AnalysisJobServiceError("unavailable");
    }
    return mapAnalysisJob(data, await this.getResult(data.id));
  }

  async complete(input: AnalysisResultCallback) {
    const row = await this.getRow(input.analysisJobId);
    if (row.request_id !== input.requestId) {
      throw new AnalysisJobServiceError("validation");
    }
    if (
      input.runAttempt < row.attempt_count ||
      ["cancelled", "failed", "needs_input", "succeeded"].includes(row.status)
    ) {
      return mapAnalysisJob(row, await this.getResult(row.id));
    }
    if (input.runAttempt !== row.attempt_count) {
      throw new AnalysisJobServiceError("conflict", {
        reason: "analysis_attempt_mismatch",
      });
    }
    const parsed = AnalysisResultSchema.safeParse(input.result);
    if (!parsed.success) throw new AnalysisJobServiceError("validation");
    const semantic = validateAnalysisSemantics(parsed.data, row);
    if (!semantic.ok) {
      throw new AnalysisJobServiceError("validation", {
        reason: semantic.reason,
      });
    }

    const { data, error } = await this.supabase.rpc("complete_analysis_job", {
      p_analysis_job_id: row.id,
      p_event_id: input.eventId,
      p_executions: input.executions as unknown as Json,
      p_job_posting_facts: parsed.data.job as unknown as Json,
      p_occurred_at: input.occurredAt,
      p_result: parsed.data as unknown as Json,
      p_run_attempt: input.runAttempt,
      p_schema_version: input.schemaVersion,
    });
    if (error || !data) {
      if (error?.code === "23514")
        throw new AnalysisJobServiceError("conflict");
      throw new AnalysisJobServiceError("unavailable");
    }
    return mapAnalysisJob(data, await this.getResult(data.id));
  }
}

export function createAnalysisJobService(
  env: CloudflareBindings,
): AnalysisJobService {
  return new SupabaseAnalysisJobService(
    createSupabaseAdminClient(env),
    env,
    dispatchToN8n,
  );
}
