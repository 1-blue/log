import {
  CONTRACT_VERSION,
  type N8nSlackNotificationDispatchPayload,
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
    const posting = await this.getPosting(row.job_posting_id).catch(() => null);
    const text = truncateSlackText(
      `[${formatEnvironment(this.env.APP_BASE_URL)}] Slack 알림을 n8n에 전달하지 못했습니다. ` +
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
        this.getPosting(row.job_posting_id),
        this.getThread(row.job_posting_id),
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
      const { data, error: databaseError } = await this.supabase.rpc(
        "fail_slack_notification_dispatch",
        {
          p_error_message: "n8n에서 Slack 알림 요청을 받지 못했습니다.",
          p_notification_id: row.id,
          p_retryable: dispatchError?.retryable ?? true,
        },
      );
      if (databaseError || !data)
        throw new SlackNotificationServiceError("unavailable");
      await this.alertDispatchFailure(row);
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
}

export function createSlackNotificationService(
  env: CloudflareBindings,
): SlackNotificationService {
  return new SupabaseSlackNotificationService(
    createSupabaseAdminClient(env),
    env,
  );
}
