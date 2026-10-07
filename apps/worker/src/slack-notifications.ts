import {
  CONTRACT_VERSION,
  type N8nSlackNotificationDispatchPayload,
  type SlackNotificationListItem,
  type SlackNotificationResponse,
  type SlackNotificationResultCallback,
} from "@workspace/contracts";
import type { Database } from "@workspace/contracts/database";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { dispatchToN8n, N8nDispatchError } from "./n8n.js";
import {
  formatEnvironment,
  formatSlackNotification,
  type NotificationRow,
  type PostingRow,
  sendSlackErrorWebhook,
  type ThreadRow,
  truncateSlackText,
} from "./slack-notification-formatter.js";
import { mapSlackNotification } from "./slack-notification-mappers.js";

export {
  escapeSlackMrkdwn,
  formatSlackNotification,
  sendSlackErrorWebhook,
  truncateSlackText,
} from "./slack-notification-formatter.js";

type N8nDispatch = (
  payload: N8nSlackNotificationDispatchPayload,
  env: CloudflareBindings,
) => Promise<void>;

type Fetcher = typeof fetch;

function createSupabaseAdminClient(env: CloudflareBindings) {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export class SlackNotificationServiceError extends Error {
  constructor(readonly kind: "conflict" | "not_found" | "unavailable") {
    super(kind);
    this.name = "SlackNotificationServiceError";
  }
}

export interface SlackNotificationService {
  list(ownerId: string): Promise<SlackNotificationListItem[]>;
  retry(
    ownerId: string,
    id: string,
    expectedUpdatedAt: string,
    confirmUnknown: boolean,
  ): Promise<SlackNotificationResponse>;
  complete(
    input: SlackNotificationResultCallback,
  ): Promise<SlackNotificationResponse>;
  drain(limit?: number): Promise<SlackNotificationResponse[]>;
  failStale(cutoff: string, limit: number): Promise<string[]>;
}

export class SupabaseSlackNotificationService
  implements SlackNotificationService
{
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly env: CloudflareBindings,
    private readonly dispatch: N8nDispatch = dispatchToN8n,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  private async getPosting(id: string): Promise<PostingRow> {
    const { data, error } = await this.supabase
      .from("job_postings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) throw new SlackNotificationServiceError("unavailable");
    return data;
  }

  private async getThread(id: string): Promise<ThreadRow | null> {
    const { data, error } = await this.supabase
      .from("slack_job_threads")
      .select("*")
      .eq("job_posting_id", id)
      .maybeSingle();
    if (error) throw new SlackNotificationServiceError("unavailable");
    return data;
  }

  private async alertDispatchFailure(row: NotificationRow): Promise<void> {
    const posting = row.job_posting_id
      ? await this.getPosting(row.job_posting_id).catch(() => null)
      : null;
    const text = truncateSlackText(
      `[${formatEnvironment(this.env.APP_BASE_URL)}] ${row.status === "delivery_unknown" ? "Slack 알림의 전달 결과를 확인하지 못했습니다." : "Slack 알림을 n8n에 전달하지 못했습니다."} ` +
        `${posting ? `${posting.company_name} — ${posting.title} / ` : ""}` +
        `Request ID: ${row.request_id}`,
      2_000,
    );
    await sendSlackErrorWebhook({
      fetcher: this.fetcher,
      requestId: row.request_id,
      text,
      url: this.env.SLACK_ERROR_WEBHOOK_URL,
    });
  }

  private async dispatchOne(row: NotificationRow): Promise<NotificationRow> {
    try {
      const [posting, thread] = await Promise.all([
        row.job_posting_id ? this.getPosting(row.job_posting_id) : null,
        row.job_posting_id ? this.getThread(row.job_posting_id) : null,
      ]);
      const message = formatSlackNotification({
        appBaseUrl: this.env.APP_BASE_URL,
        notification: row,
        posting,
        thread,
      });
      const payload: N8nSlackNotificationDispatchPayload = {
        ...message,
        callbackPath: `/v1/internal/slack-notifications/${row.id}/result`,
        eventId: row.event_id,
        jobPostingId: row.job_posting_id,
        documentVersionId: row.document_version_id,
        kind: "slack_notification",
        notificationId: row.id,
        requestId: row.request_id,
        schemaVersion: CONTRACT_VERSION,
        target: row.target,
      };
      await this.dispatch(payload, this.env);
      return row;
    } catch (error) {
      const dispatchError = error instanceof N8nDispatchError ? error : null;
      const ambiguous =
        dispatchError?.kind === "timeout" ||
        dispatchError?.kind === "unavailable" ||
        (dispatchError?.kind === "rejected" && dispatchError.retryable);
      const { data, error: databaseError } = ambiguous
        ? await this.supabase.rpc("mark_slack_dispatch_unknown", {
            p_notification_id: row.id,
          })
        : await this.supabase.rpc("fail_slack_notification_dispatch", {
            p_error_message: "n8n에서 Slack 알림 요청을 받지 못했습니다.",
            p_notification_id: row.id,
            p_retryable: dispatchError?.retryable ?? true,
          });
      if (databaseError || !data)
        throw new SlackNotificationServiceError("unavailable");
      await this.alertDispatchFailure(data);
      return data;
    }
  }

  async drain(limit = 2): Promise<SlackNotificationResponse[]> {
    const { data, error } = await this.supabase.rpc(
      "claim_slack_notifications",
      {
        p_limit: limit,
      },
    );
    if (error) throw new SlackNotificationServiceError("unavailable");
    const dispatched = await Promise.all(
      (data ?? []).map((row) => this.dispatchOne(row)),
    );
    return dispatched.map(mapSlackNotification);
  }

  async complete(input: SlackNotificationResultCallback) {
    const { data, error } = await this.supabase.rpc(
      "complete_slack_notification",
      {
        p_channel_id: input.channelId as string,
        p_completion_event_id: input.eventId,
        p_error_code: (input.error?.code ?? null) as string,
        p_error_message: (input.error?.message ?? null) as string,
        p_error_retryable: input.error?.retryable ?? false,
        p_http_status: input.httpStatus as number,
        p_message_ts: input.messageTs as string,
        p_notification_event_id: input.notificationEventId,
        p_notification_id: input.notificationId,
        p_occurred_at: input.occurredAt,
        p_outcome: input.outcome,
      },
    );
    if (error || !data) {
      if (error?.code === "P0002")
        throw new SlackNotificationServiceError("not_found");
      if (error?.code === "23505" || error?.code === "23514")
        throw new SlackNotificationServiceError("conflict");
      throw new SlackNotificationServiceError("unavailable");
    }
    return mapSlackNotification(data);
  }

  async failStale(cutoff: string, limit: number): Promise<string[]> {
    const { data, error } = await this.supabase.rpc(
      "fail_stale_slack_notifications",
      { p_cutoff: cutoff, p_limit: limit },
    );
    if (error) throw new SlackNotificationServiceError("unavailable");
    return data ?? [];
  }

  async list(ownerId: string): Promise<SlackNotificationListItem[]> {
    const { data, error } = await this.supabase
      .from("slack_notifications")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100);
    if (error) throw new SlackNotificationServiceError("unavailable");
    const postingIds = [
      ...new Set(
        (data ?? []).flatMap((row) =>
          row.job_posting_id ? [row.job_posting_id] : [],
        ),
      ),
    ];
    const threads = postingIds.length
      ? await this.supabase
          .from("slack_job_threads")
          .select("*")
          .eq("owner_id", ownerId)
          .in("job_posting_id", postingIds)
      : { data: [], error: null };
    if (threads.error) throw new SlackNotificationServiceError("unavailable");
    const postings = postingIds.length
      ? await this.supabase
          .from("job_postings")
          .select("id,company_name,title")
          .eq("owner_id", ownerId)
          .in("id", postingIds)
      : { data: [], error: null };
    if (postings.error) throw new SlackNotificationServiceError("unavailable");
    const missingRoots = (threads.data ?? [])
      .filter(
        (thread) =>
          thread.status !== "ready" &&
          !data?.some((row) => row.id === thread.root_notification_id),
      )
      .map((thread) => thread.root_notification_id);
    const roots = missingRoots.length
      ? await this.supabase
          .from("slack_notifications")
          .select("*")
          .eq("owner_id", ownerId)
          .in("id", missingRoots)
      : { data: [], error: null };
    if (roots.error) throw new SlackNotificationServiceError("unavailable");
    return [...(data ?? []), ...(roots.data ?? [])].map((row) => {
      const context =
        row.context &&
        typeof row.context === "object" &&
        !Array.isArray(row.context)
          ? row.context
          : {};
      const posting = postings.data?.find(
        (posting) => posting.id === row.job_posting_id,
      );
      const label = [
        context.label,
        posting?.company_name ?? context.companyName,
        posting?.title ?? context.title,
      ]
        .filter((value) => typeof value === "string")
        .join(" · ")
        .slice(0, 1000);
      const thread = threads.data?.find(
        (thread) => thread.job_posting_id === row.job_posting_id,
      );
      return {
        ...mapSlackNotification(row),
        label: label || row.event_type,
        blockedByRootId:
          row.status === "queued" &&
          row.target === "job_thread" &&
          thread?.status !== "ready"
            ? (thread?.root_notification_id ?? null)
            : null,
      };
    });
  }

  async retry(
    ownerId: string,
    id: string,
    expectedUpdatedAt: string,
    confirmUnknown: boolean,
  ) {
    const { data, error } = await this.supabase.rpc(
      "retry_slack_notification",
      {
        p_owner_id: ownerId,
        p_notification_id: id,
        p_expected_updated_at: expectedUpdatedAt,
        p_confirm_unknown: confirmUnknown,
      },
    );
    if (error || !data)
      throw new SlackNotificationServiceError(
        error?.code === "P0002"
          ? "not_found"
          : error?.code === "23514"
            ? "conflict"
            : "unavailable",
      );
    return mapSlackNotification(data);
  }
}

export function createSlackNotificationService(
  env: CloudflareBindings,
): SlackNotificationService {
  return new SupabaseSlackNotificationService(
    createSupabaseAdminClient(env),
    env,
  );
}
