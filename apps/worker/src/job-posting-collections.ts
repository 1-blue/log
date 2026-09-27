import {
  CONTRACT_VERSION,
  type CreateJobPostingCollectionRequest,
  JOB_POSTING_FETCH_MAX_BYTES,
  JobPostingAiExtractionSchema,
  type JobPostingBodySections,
  type JobPostingCollectionCallback,
  type JobPostingCollectionErrorCode,
  type JobPostingCollectionRun,
  type JobPostingSourceMetadata,
  type N8nJobPostingCollectionDispatchPayload,
  type N8nJobPostingExtractionDispatchPayload,
} from "@workspace/contracts";
import type { Database, Json } from "@workspace/contracts/database";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as z from "zod";

import { sha256Hex } from "./idempotency.js";
import {
  mapJobPostingCollectionRun,
  type SnapshotRow,
  terminalForHttpStatus,
} from "./job-posting-collection-mappers.js";
import { logInfo } from "./logger.js";
import { dispatchToN8n, N8nDispatchError } from "./n8n.js";
import {
  findOpenAiUnsupportedSchemaKeys,
  toOpenAiStructuredOutputSchema,
} from "./openai-schema.js";
import {
  JobPostingParseError,
  parseAiExtractedJobPosting,
  parseManualJobPosting,
  parseWantedJobPosting,
} from "./wanted-parser.js";

type PostingRow = Database["public"]["Tables"]["job_postings"]["Row"];

type Dispatch = (
  payload:
    | N8nJobPostingCollectionDispatchPayload
    | N8nJobPostingExtractionDispatchPayload,
  env: CloudflareBindings,
) => Promise<void>;

export class JobPostingCollectionServiceError extends Error {
  constructor(
    readonly kind: "conflict" | "not_found" | "unavailable" | "validation",
    readonly details: Record<string, string> | null = null,
  ) {
    super(kind);
    this.name = "JobPostingCollectionServiceError";
  }
}

export interface JobPostingCollectionService {
  complete(
    input: JobPostingCollectionCallback,
  ): Promise<JobPostingCollectionRun>;
  create(
    ownerId: string,
    jobPostingId: string,
    requestId: string,
    input: CreateJobPostingCollectionRequest,
  ): Promise<JobPostingCollectionRun>;
  get(
    ownerId: string,
    collectionRunId: string,
  ): Promise<JobPostingCollectionRun>;
  list(
    ownerId: string,
    jobPostingId: string,
  ): Promise<JobPostingCollectionRun[]>;
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

class SupabaseJobPostingCollectionService
  implements JobPostingCollectionService
{
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly env: CloudflareBindings,
    private readonly dispatch: Dispatch,
  ) {}

  private async getPosting(
    ownerId: string,
    jobPostingId: string,
  ): Promise<PostingRow> {
    const { data, error } = await this.supabase
      .from("job_postings")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("id", jobPostingId)
      .maybeSingle();
    if (error) throw new JobPostingCollectionServiceError("unavailable");
    if (!data) throw new JobPostingCollectionServiceError("not_found");
    return data;
  }

  private async getSnapshot(
    snapshotId: string | null,
  ): Promise<SnapshotRow | null> {
    if (!snapshotId) return null;
    const { data, error } = await this.supabase
      .from("job_posting_snapshots")
      .select("*")
      .eq("id", snapshotId)
      .maybeSingle();
    if (error || !data)
      throw new JobPostingCollectionServiceError("unavailable");
    return data;
  }

  private async completeTerminal(input: {
    collectionRunId: string;
    contentHash?: string;
    errorCode?: JobPostingCollectionErrorCode;
    eventId: string;
    fetchedAt?: string;
    httpStatus?: number | null;
    normalizedContent?: string;
    ownerId: string;
    parserVersion?: string;
    rawContent?: string;
    retryable?: boolean;
    snapshotSource?: "wanted_json_ld" | "wanted_html" | "wanted_ai" | "manual";
    sourceMetadata?: JobPostingSourceMetadata;
    sections?: JobPostingBodySections;
    status: "failed" | "needs_input" | "succeeded";
  }): Promise<JobPostingCollectionRun> {
    const { data, error } = await this.supabase.rpc(
      "complete_job_posting_collection_v2",
      {
        p_collection_run_id: input.collectionRunId,
        p_content_hash: input.contentHash,
        p_error_code: input.errorCode,
        p_event_id: input.eventId,
        p_fetched_at: input.fetchedAt,
        p_http_status: input.httpStatus ?? undefined,
        p_normalized_content: input.normalizedContent,
        p_owner_id: input.ownerId,
        p_parser_version: input.parserVersion,
        p_raw_content: input.rawContent,
        p_retryable: input.retryable ?? false,
        p_snapshot_source: input.snapshotSource,
        p_source_metadata: input.sourceMetadata as Json | undefined,
        p_sections: input.sections as Json | undefined,
        p_status: input.status,
      },
    );
    if (error || !data) {
      if (error?.code === "P0002") {
        throw new JobPostingCollectionServiceError("not_found");
      }
      if (error?.code === "23514") {
        throw new JobPostingCollectionServiceError("conflict", {
          reason: "collection_already_completed",
        });
      }
      throw new JobPostingCollectionServiceError("unavailable");
    }
    logInfo({
      callbackOutcome: input.status === "succeeded" ? "completed" : "terminal",
      collectionRunId: input.collectionRunId,
      errorCode: input.errorCode,
      event: "job_posting_collection_terminal",
      httpStatus: input.httpStatus ?? undefined,
      parserVersion: input.parserVersion,
      requestId: data.request_id,
      source: input.snapshotSource,
      stage: "persist",
      status: input.status === "succeeded" ? 200 : undefined,
    });
    return mapJobPostingCollectionRun(
      data,
      await this.getSnapshot(data.snapshot_id),
    );
  }

  async create(
    ownerId: string,
    jobPostingId: string,
    requestId: string,
    input: CreateJobPostingCollectionRequest,
  ): Promise<JobPostingCollectionRun> {
    const posting = await this.getPosting(ownerId, jobPostingId);
    const eventId = crypto.randomUUID();
    const mode = input.manualContent === null ? "automatic" : "manual";
    const { data: run, error } = await this.supabase
      .from("job_posting_collection_runs")
      .insert({
        job_posting_id: jobPostingId,
        mode,
        owner_id: ownerId,
        request_id: requestId,
      })
      .select("*")
      .single();

    if (error || !run) {
      if (error?.code === "23505") {
        throw new JobPostingCollectionServiceError("conflict", {
          reason: "collection_in_progress",
        });
      }
      throw new JobPostingCollectionServiceError("unavailable");
    }

    const payload: N8nJobPostingCollectionDispatchPayload = {
      callbackPath: `/v1/internal/job-posting-collections/${run.id}/complete`,
      collectionRunId: run.id,
      eventId,
      jobPosting: {
        id: posting.id,
        manualContent: input.manualContent,
        source: "wanted",
        url: posting.canonical_url,
      },
      kind: "job_posting_collection",
      requestId,
      schemaVersion: CONTRACT_VERSION,
    };

    try {
      await this.dispatch(payload, this.env);
      const { error: updateError } = await this.supabase
        .from("job_posting_collection_runs")
        .update({ started_at: new Date().toISOString(), status: "running" })
        .eq("id", run.id)
        .eq("status", "queued");
      if (updateError)
        throw new JobPostingCollectionServiceError("unavailable");
      return this.get(ownerId, run.id);
    } catch (dispatchError) {
      if (dispatchError instanceof JobPostingCollectionServiceError)
        throw dispatchError;
      const retryable =
        dispatchError instanceof N8nDispatchError
          ? dispatchError.retryable
          : true;
      return this.completeTerminal({
        collectionRunId: run.id,
        errorCode: "DISPATCH_FAILED",
        eventId,
        ownerId,
        retryable,
        status: "failed",
      });
    }
  }

  async get(
    ownerId: string,
    collectionRunId: string,
  ): Promise<JobPostingCollectionRun> {
    const { data, error } = await this.supabase
      .from("job_posting_collection_runs")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("id", collectionRunId)
      .maybeSingle();
    if (error) throw new JobPostingCollectionServiceError("unavailable");
    if (!data) throw new JobPostingCollectionServiceError("not_found");
    return mapJobPostingCollectionRun(
      data,
      await this.getSnapshot(data.snapshot_id),
    );
  }

  async list(
    ownerId: string,
    jobPostingId: string,
  ): Promise<JobPostingCollectionRun[]> {
    await this.getPosting(ownerId, jobPostingId);
    const { data, error } = await this.supabase
      .from("job_posting_collection_runs")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("job_posting_id", jobPostingId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new JobPostingCollectionServiceError("unavailable");
    const snapshots = await Promise.all(
      data.map((row) => this.getSnapshot(row.snapshot_id)),
    );
    return data.map((row, index) =>
      mapJobPostingCollectionRun(row, snapshots[index] ?? null),
    );
  }

  async complete(
    input: JobPostingCollectionCallback,
  ): Promise<JobPostingCollectionRun> {
    const { data: run, error } = await this.supabase
      .from("job_posting_collection_runs")
      .select("*")
      .eq("id", input.collectionRunId)
      .maybeSingle();
    if (error) throw new JobPostingCollectionServiceError("unavailable");
    if (!run) throw new JobPostingCollectionServiceError("not_found");
    if (run.request_id !== input.requestId) {
      throw new JobPostingCollectionServiceError("conflict", {
        reason: "request_id_mismatch",
      });
    }

    if (input.outcome === "timeout" || input.outcome === "network_error") {
      return this.completeTerminal({
        collectionRunId: run.id,
        errorCode: input.outcome === "timeout" ? "TIMEOUT" : "NETWORK_ERROR",
        eventId: input.eventId,
        ownerId: run.owner_id,
        retryable: true,
        status: "failed",
      });
    }

    const response = input.response;
    if (!response) throw new JobPostingCollectionServiceError("validation");
    logInfo({
      callbackOutcome: input.outcome,
      collectionRunId: input.collectionRunId,
      contentLength: response.contentLength ?? response.body.length,
      event: "job_posting_collection_callback_received",
      httpStatus: response.status,
      requestId: input.requestId,
      stage: "callback",
    });
    const httpTerminal = terminalForHttpStatus(response.status);
    if (httpTerminal) {
      return this.completeTerminal({
        collectionRunId: run.id,
        errorCode: httpTerminal.code,
        eventId: input.eventId,
        httpStatus: response.status,
        ownerId: run.owner_id,
        retryable: httpTerminal.retryable,
        status: httpTerminal.status,
      });
    }

    if (
      input.outcome === "response" &&
      !response.contentType?.toLowerCase().includes("text/html")
    ) {
      return this.completeTerminal({
        collectionRunId: run.id,
        errorCode: "INVALID_CONTENT_TYPE",
        eventId: input.eventId,
        httpStatus: response.status,
        ownerId: run.owner_id,
        status: "needs_input",
      });
    }

    if (
      (response.contentLength !== null &&
        response.contentLength > JOB_POSTING_FETCH_MAX_BYTES) ||
      new TextEncoder().encode(response.body).byteLength >
        JOB_POSTING_FETCH_MAX_BYTES
    ) {
      return this.completeTerminal({
        collectionRunId: run.id,
        errorCode: "CONTENT_TOO_LARGE",
        eventId: input.eventId,
        httpStatus: response.status,
        ownerId: run.owner_id,
        status: "needs_input",
      });
    }

    const posting = await this.getPosting(run.owner_id, run.job_posting_id);
    try {
      if (input.outcome === "ai_extraction" && !input.extraction) {
        throw new JobPostingCollectionServiceError("validation");
      }
      const parsed =
        input.outcome === "manual"
          ? parseManualJobPosting(response.body)
          : input.outcome === "ai_extraction"
            ? parseAiExtractedJobPosting({
                expectedUrl: posting.canonical_url,
                extraction: input.extraction!,
                html: response.body,
              })
            : parseWantedJobPosting({
                expectedUrl: posting.canonical_url,
                html: response.body,
              });
      return this.completeTerminal({
        collectionRunId: run.id,
        contentHash: await sha256Hex(parsed.contentHashInput),
        eventId: input.eventId,
        fetchedAt: input.occurredAt,
        httpStatus: response.status,
        normalizedContent: parsed.normalizedContent,
        ownerId: run.owner_id,
        parserVersion: parsed.parserVersion,
        rawContent: parsed.rawContent,
        snapshotSource: parsed.source,
        sourceMetadata: parsed.sourceMetadata,
        sections: parsed.sections,
        status: "succeeded",
      });
    } catch (parseError) {
      if (!(parseError instanceof JobPostingParseError)) throw parseError;

      logInfo({
        callbackOutcome: input.outcome,
        collectionRunId: run.id,
        errorCode: parseError.code,
        event: "job_posting_collection_parse_failed",
        httpStatus: response.status,
        requestId: input.requestId,
        stage: "parse",
      });

      if (
        input.outcome === "response" &&
        parseError.code === "PARSER_STRUCTURE_CHANGED"
      ) {
        const extractionPayload: N8nJobPostingExtractionDispatchPayload = {
          callbackPath: `/v1/internal/job-posting-collections/${run.id}/complete`,
          collectionRunId: run.id,
          eventId: crypto.randomUUID(),
          jobPosting: {
            html: response.body,
            id: posting.id,
            source: "wanted",
            url: posting.canonical_url,
          },
          kind: "job_posting_extraction",
          outputSchema: toOpenAiStructuredOutputSchema(
            z.toJSONSchema(JobPostingAiExtractionSchema, {
              target: "draft-07",
            }),
          ),
          requestId: run.request_id,
          schemaVersion: CONTRACT_VERSION,
        };

        const unsupportedSchemaKeys = findOpenAiUnsupportedSchemaKeys(
          z.toJSONSchema(JobPostingAiExtractionSchema, {
            target: "draft-07",
          }),
        );
        logInfo({
          collectionRunId: run.id,
          event: "job_posting_ai_extraction_dispatched",
          requestId: run.request_id,
          schemaIssue: unsupportedSchemaKeys.join(",") || undefined,
          stage: "ai_dispatch",
        });

        try {
          await this.dispatch(extractionPayload, this.env);
          return this.get(run.owner_id, run.id);
        } catch (dispatchError) {
          const retryable =
            dispatchError instanceof N8nDispatchError
              ? dispatchError.retryable
              : true;
          return this.completeTerminal({
            collectionRunId: run.id,
            errorCode: "DISPATCH_FAILED",
            eventId: extractionPayload.eventId,
            ownerId: run.owner_id,
            retryable,
            status: "failed",
          });
        }
      }

      return this.completeTerminal({
        collectionRunId: run.id,
        errorCode: parseError.code,
        eventId: input.eventId,
        httpStatus: response.status,
        ownerId: run.owner_id,
        status: "needs_input",
      });
    }
  }
}

export function createJobPostingCollectionService(
  env: CloudflareBindings,
  dispatch: Dispatch = dispatchToN8n,
): JobPostingCollectionService {
  return new SupabaseJobPostingCollectionService(
    createSupabaseAdminClient(env),
    env,
    dispatch,
  );
}
