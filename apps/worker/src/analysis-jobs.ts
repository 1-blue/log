import {
  ANALYSIS_JOB_MAX_RUN_ATTEMPTS,
  AnalysisDiagnosticEventSchema,
  type AnalysisDiagnostics,
  AnalysisErrorCodeSchema,
  type AnalysisEventCallback,
  type AnalysisResultCallback,
  AnalysisResultSchema,
  CONTRACT_VERSION,
} from "@workspace/contracts";
import type { Database, Json } from "@workspace/contracts/database";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { buildAnalysisDispatchPayload } from "./analysis-job-dispatch.js";
import {
  ANALYSIS_STALE_AFTER_MS,
  prepareAnalysisDispatchDocumentText,
  prepareAnalysisDispatchJobPostingText,
  prepareAnalysisDocumentText,
  prepareAnalysisJobPostingText,
} from "./analysis-job-input.js";
import { resolveAnalysisInputs } from "./analysis-job-resolver.js";
import {
  mapAnalysisJob,
  sanitizeAnalysisResult,
  validateAnalysisSemantics,
} from "./analysis-job-result.js";
import {
  type AnalysisJobRow,
  type AnalysisJobService,
  AnalysisJobServiceError,
  type AnalysisResultRow,
  type Dispatch,
  type PostingRow,
} from "./analysis-job-types.js";
import { sha256Hex } from "./idempotency.js";
import { dispatchToN8n, N8nDispatchError } from "./n8n.js";

export {
  ANALYSIS_STALE_AFTER_MS,
  prepareAnalysisDispatchDocumentText,
  prepareAnalysisDispatchJobPostingText,
  prepareAnalysisDocumentText,
  prepareAnalysisJobPostingText,
};
export { mapAnalysisJob, sanitizeAnalysisResult, validateAnalysisSemantics };
export { AnalysisJobServiceError };
export type { AnalysisJobService };

function createSupabaseAdminClient(env: CloudflareBindings) {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
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

  private isStale(row: AnalysisJobRow, now = Date.now()) {
    if (!["queued", "running", "retrying"].includes(row.status)) return false;
    const heartbeat = Date.parse(
      row.last_heartbeat_at ?? row.updated_at ?? row.created_at,
    );
    return (
      Number.isFinite(heartbeat) && now - heartbeat >= ANALYSIS_STALE_AFTER_MS
    );
  }

  private async recoverStaleRow(
    ownerId: string,
    analysisJobId: string,
    row?: AnalysisJobRow,
  ): Promise<AnalysisJobRow> {
    const current = row ?? (await this.getRow(analysisJobId, ownerId));
    if (!this.isStale(current)) return current;

    const { data, error } = await this.supabase.rpc(
      "recover_stale_analysis_job",
      {
        p_analysis_job_id: analysisJobId,
        p_cutoff: new Date(Date.now() - ANALYSIS_STALE_AFTER_MS).toISOString(),
        p_owner_id: ownerId,
      },
    );
    if (error || !data) throw new AnalysisJobServiceError("unavailable");
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
  ) {
    return buildAnalysisDispatchPayload({
      eventId,
      posting,
      row,
      supabase: this.supabase,
    });
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
    const row = await this.recoverStaleRow(
      ownerId,
      analysisJobId,
      await this.getRow(analysisJobId, ownerId),
    );
    return mapAnalysisJob(row, await this.getResult(row.id));
  }

  async diagnostics(ownerId: string, analysisJobId: string) {
    const row = await this.recoverStaleRow(
      ownerId,
      analysisJobId,
      await this.getRow(analysisJobId, ownerId),
    );
    const [eventsResult, executionsResult, result] = await Promise.all([
      this.supabase
        .from("analysis_job_events")
        .select(
          "event_id,event_type,status,stage,step,message,error_code,error_retryable,occurred_at",
        )
        .eq("analysis_job_id", analysisJobId)
        .eq("owner_id", ownerId)
        .order("occurred_at", { ascending: false })
        .limit(100),
      this.supabase
        .from("analysis_step_executions")
        .select(
          "step,model,prompt_version,response_id,input_tokens,output_tokens,latency_ms,attempt_count",
        )
        .eq("analysis_job_id", analysisJobId)
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: true }),
      this.getResult(analysisJobId),
    ]);
    if (eventsResult.error || executionsResult.error) {
      throw new AnalysisJobServiceError("unavailable");
    }

    const events = (eventsResult.data ?? []).map((event) =>
      AnalysisDiagnosticEventSchema.parse({
        eventId: event.event_id,
        eventType: event.event_type,
        status: event.status,
        stage: event.stage,
        step: event.step,
        message: event.message,
        errorCode: AnalysisErrorCodeSchema.safeParse(event.error_code).success
          ? event.error_code
          : null,
        retryable: event.error_retryable,
        occurredAt: event.occurred_at,
      }),
    );
    const executions = (executionsResult.data ?? []).map((execution) => ({
      step: execution.step as "job_facts" | "profile_comparison",
      model: execution.model,
      promptVersion: execution.prompt_version,
      responseId: execution.response_id,
      inputTokens: execution.input_tokens,
      outputTokens: execution.output_tokens,
      latencyMs: execution.latency_ms,
      attemptCount: execution.attempt_count,
    }));
    const job = mapAnalysisJob(row, result);
    const nextAction =
      row.status === "failed"
        ? row.attempt_count < ANALYSIS_JOB_MAX_RUN_ATTEMPTS
          ? "retry"
          : "start_new_analysis"
        : row.status === "needs_input"
          ? "check_input"
          : row.status === "queued" ||
              row.status === "running" ||
              row.status === "retrying"
            ? this.isStale(row)
              ? "recover_stale"
              : "wait"
            : "none";
    return {
      job,
      events,
      executions,
      nextAction,
    } satisfies AnalysisDiagnostics;
  }

  async recoverStale(ownerId: string, analysisJobId: string) {
    const row = await this.recoverStaleRow(ownerId, analysisJobId);
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
    return resolveAnalysisInputs(this.supabase, ownerId, applicationId);
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
    const failValidation = () => {
      // A terminal result callback can be rejected after the workflow has
      // already finished its provider work. Persist that rejection as a
      // terminal failure so the job cannot remain stuck in `running` while
      // n8n retries or reports the rejected callback.
      return this.event({
        schemaVersion: CONTRACT_VERSION,
        // The provider callback event is not inserted when validation fails.
        // Use a new event ID so the terminal failure cannot be treated as a
        // duplicate of the rejected result callback.
        eventId: crypto.randomUUID(),
        requestId: input.requestId,
        analysisJobId: input.analysisJobId,
        runAttempt: input.runAttempt,
        eventType: "failed",
        status: "failed",
        stage: "saving",
        step: "profile_comparison",
        stepAttempt: 1,
        retryAt: null,
        message: "분석 결과 검증에 실패했습니다.",
        error: {
          code: "OPENAI_SCHEMA_INVALID",
          message: "AI 결과의 계약 또는 근거 검증에 실패했습니다.",
          retryable: false,
        },
        occurredAt: new Date().toISOString(),
      });
    };
    const parsed = AnalysisResultSchema.safeParse(input.result);
    if (!parsed.success) return failValidation();
    const sanitizedCandidate = sanitizeAnalysisResult(parsed.data, row);
    const sanitizedParsed = AnalysisResultSchema.safeParse(sanitizedCandidate);
    if (!sanitizedParsed.success) return failValidation();
    const sanitized = sanitizedParsed.data;
    const semantic = validateAnalysisSemantics(sanitized, row);
    if (!semantic.ok) return failValidation();

    const { data, error } = await this.supabase.rpc("complete_analysis_job", {
      p_analysis_job_id: row.id,
      p_event_id: input.eventId,
      p_executions: input.executions as unknown as Json,
      p_job_posting_facts: sanitized.job as unknown as Json,
      p_occurred_at: input.occurredAt,
      p_result: sanitized as unknown as Json,
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
