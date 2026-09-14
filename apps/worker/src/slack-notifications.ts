import {
  CONTRACT_VERSION,
  type N8nSlackNotificationDispatchPayload,
  type SlackMessageBlock,
  SlackNotificationErrorCodeSchema,
  type SlackNotificationEventType,
  type SlackNotificationResponse,
  type SlackNotificationResultCallback,
} from "@workspace/contracts";
import type { Database, Json } from "@workspace/contracts/database";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { dispatchToN8n, N8nDispatchError } from "./n8n.js";

type NotificationRow =
  Database["public"]["Tables"]["slack_notifications"]["Row"];
type PostingRow = Database["public"]["Tables"]["job_postings"]["Row"];
type ThreadRow = Database["public"]["Tables"]["slack_job_threads"]["Row"];

type N8nDispatch = (
  payload: N8nSlackNotificationDispatchPayload,
  env: CloudflareBindings,
) => Promise<void>;

type Fetcher = typeof fetch;

const STATUS_LABELS: Record<string, string> = {
  applied: "지원 완료",
  archived: "보관",
  interested: "관심",
  interview: "면접",
  offer: "오퍼",
  preparing: "지원 준비",
  rejected: "불합격",
  screening: "서류 검토",
  withdrawn: "지원 철회",
};

const EVENT_TITLES: Record<SlackNotificationEventType, string> = {
  analysis_cancelled: "분석 취소",
  analysis_failed: "분석 실패",
  analysis_queued: "분석 접수",
  analysis_retrying: "분석 재시도",
  analysis_succeeded: "분석 완료",
  application_status_changed: "지원 상태 변경",
  collection_failed: "공고 수집 실패",
  collection_needs_input: "공고 원문 입력 필요",
  collection_succeeded: "공고 수집 완료",
  interview_scheduled: "면접 일정 등록",
  job_posting_registered: "채용공고 등록",
};

function createSupabaseAdminClient(env: CloudflareBindings) {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function contextObject(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

function stringValue(value: Json | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function escapeSlackMrkdwn(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function truncateSlackText(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  return `${value.slice(0, Math.max(0, maximum - 1)).trimEnd()}…`;
}

export async function sendSlackErrorWebhook(input: {
  fetcher?: Fetcher;
  requestId: string;
  text: string;
  url: string;
}): Promise<boolean> {
  try {
    const response = await (input.fetcher ?? fetch)(input.url, {
      body: JSON.stringify({
        blocks: [
          {
            text: {
              text: escapeSlackMrkdwn(truncateSlackText(input.text, 2_000)),
              type: "mrkdwn",
              verbatim: true,
            },
            type: "section",
          },
        ],
        text: truncateSlackText(input.text, 2_000),
        unfurl_links: false,
        unfurl_media: false,
      }),
      headers: { "Content-Type": "application/json; charset=utf-8" },
      method: "POST",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error("Slack webhook rejected the request");
    return true;
  } catch {
    console.error(
      JSON.stringify({
        event: "slack_error_webhook_failed",
        requestId: input.requestId,
      }),
    );
    return false;
  }
}

function formatEnvironment(appBaseUrl: string): string {
  const hostname = new URL(appBaseUrl).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" ? "로컬" : "운영";
}

function adminUrl(appBaseUrl: string, notification: NotificationRow): string {
  if (notification.application_id && notification.analysis_job_id) {
    return new URL(
      `/admin/applications/${notification.application_id}/analyses/${notification.analysis_job_id}`,
      appBaseUrl,
    ).toString();
  }
  if (notification.application_id) {
    return new URL(
      `/admin/applications/${notification.application_id}`,
      appBaseUrl,
    ).toString();
  }
  return new URL("/admin/applications", appBaseUrl).toString();
}

function formatElapsed(milliseconds: number | null): string | null {
  if (milliseconds === null || milliseconds < 0) return null;
  const seconds = Math.round(milliseconds / 1_000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}분 ${seconds % 60}초`;
}

function formatKoreanDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatEventDetails(
  notification: NotificationRow,
  now: number,
): string[] {
  const context = contextObject(notification.context);
  switch (notification.event_type) {
    case "collection_succeeded":
      return [
        `수집 방식: ${stringValue(context.mode) === "manual" ? "수동 입력" : "자동 수집"}`,
        ...(stringValue(context.parserVersion)
          ? [`파서: ${stringValue(context.parserVersion)}`]
          : []),
        ...(stringValue(context.finishedAt)
          ? [
              `수집 시각: ${formatKoreanDateTime(stringValue(context.finishedAt)!)}`,
            ]
          : []),
      ];
    case "analysis_queued":
      return [
        `분석 작업: ${notification.analysis_job_id ?? "확인 필요"}`,
        `실행 회차: ${numberValue(context.runAttempt) ?? 1}`,
        ...(stringValue(context.resumeVersionId)
          ? [
              `이력서 버전: ${stringValue(context.resumeVersionId)!.slice(0, 8)}`,
            ]
          : []),
        ...(stringValue(context.portfolioVersionId)
          ? [
              `포트폴리오 버전: ${stringValue(context.portfolioVersionId)!.slice(0, 8)}`,
            ]
          : []),
      ];
    case "analysis_succeeded": {
      const fitScore = numberValue(context.fitScore);
      const summary = stringValue(context.summary);
      const startedAt = stringValue(context.startedAt);
      const elapsed = startedAt
        ? formatElapsed(now - Date.parse(startedAt))
        : null;
      const gaps = Array.isArray(context.gaps)
        ? context.gaps
            .slice(0, 3)
            .map((gap) => contextObject(gap))
            .map((gap) => stringValue(gap.title))
            .filter((gap): gap is string => Boolean(gap))
        : [];
      return [
        ...(fitScore === null ? [] : [`적합도: ${Math.round(fitScore)}점`]),
        ...(summary ? [`요약: ${truncateSlackText(summary, 400)}`] : []),
        ...(gaps.length ? [`핵심 보완: ${gaps.join(", ")}`] : []),
        ...(elapsed ? [`경과 시간: ${elapsed}`] : []),
      ];
    }
    case "application_status_changed": {
      const from = stringValue(context.fromStatus);
      const to = stringValue(context.toStatus);
      return from && to
        ? [`${STATUS_LABELS[from] ?? from} → ${STATUS_LABELS[to] ?? to}`]
        : [];
    }
    case "interview_scheduled": {
      const interviewAt = stringValue(context.interviewAt);
      return interviewAt
        ? [`면접 일시: ${formatKoreanDateTime(interviewAt)}`]
        : [];
    }
    case "analysis_retrying":
    case "analysis_failed":
    case "collection_failed":
    case "collection_needs_input":
      return [
        `오류 코드: ${stringValue(context.errorCode) ?? "UNKNOWN"}`,
        ...(stringValue(context.stage)
          ? [`실패 단계: ${stringValue(context.stage)}`]
          : []),
        `재시도 가능: ${context.retryable === true ? "예" : "아니요"}`,
      ];
    case "analysis_cancelled":
      return ["관리자가 분석 작업을 취소했습니다."];
    case "job_posting_registered":
      return ["공고별 알림 스레드를 시작합니다."];
  }
}

export function formatSlackNotification(input: {
  appBaseUrl: string;
  notification: NotificationRow;
  posting: PostingRow;
  thread: ThreadRow | null;
  now?: number;
}): Pick<N8nSlackNotificationDispatchPayload, "blocks" | "text" | "threadTs"> {
  const companyName = escapeSlackMrkdwn(input.posting.company_name);
  const title = escapeSlackMrkdwn(input.posting.title);
  const eventTitle = EVENT_TITLES[input.notification.event_type];
  const details = formatEventDetails(
    input.notification,
    input.now ?? Date.now(),
  ).map(escapeSlackMrkdwn);
  const link = adminUrl(input.appBaseUrl, input.notification);
  const heading = `*${eventTitle}* · [${formatEnvironment(input.appBaseUrl)}]`;
  const sourceLink =
    input.notification.target === "job_root"
      ? `<${input.posting.canonical_url}|Wanted 공고 보기>`
      : null;
  const body = [`*${companyName}* — ${title}`, sourceLink, ...details]
    .filter(Boolean)
    .join("\n");
  const blocks: SlackMessageBlock[] = [
    {
      text: {
        text: truncateSlackText(heading, 3_000),
        type: "mrkdwn",
        verbatim: true,
      },
      type: "section",
    },
    {
      text: {
        text: truncateSlackText(body, 3_000),
        type: "mrkdwn",
        verbatim: true,
      },
      type: "section",
    },
    {
      text: {
        text: `<${link}|관리자 화면에서 확인> · Request ID: \`${input.notification.request_id}\``,
        type: "mrkdwn",
        verbatim: true,
      },
      type: "section",
    },
  ];
  const text = truncateSlackText(
    `[${formatEnvironment(input.appBaseUrl)}] ${eventTitle}: ${companyName} — ${title}${details.length ? ` / ${details.join(" / ")}` : ""}`,
    2_000,
  );
  return {
    blocks,
    text,
    threadTs:
      input.notification.target === "job_thread"
        ? (input.thread?.thread_ts ?? null)
        : null,
  };
}

function mapNotification(row: NotificationRow): SlackNotificationResponse {
  const parsedErrorCode = row.error_code
    ? SlackNotificationErrorCodeSchema.safeParse(row.error_code)
    : null;
  return {
    analysisJobId: row.analysis_job_id,
    applicationId: row.application_id,
    attemptCount: row.attempt_count,
    channelId: row.channel_id,
    collectionRunId: row.collection_run_id,
    createdAt: row.created_at,
    dispatchedAt: row.dispatched_at,
    error:
      row.error_code && row.error_message
        ? {
            code: parsedErrorCode?.success
              ? parsedErrorCode.data
              : "SLACK_SERVICE_UNAVAILABLE",
            message: row.error_message,
            retryable: row.error_retryable,
          }
        : null,
    eventId: row.event_id,
    eventType: row.event_type,
    finishedAt: row.finished_at,
    httpStatus: row.http_status,
    id: row.id,
    jobPostingId: row.job_posting_id,
    messageTs: row.message_ts,
    requestId: row.request_id,
    status: row.status,
    target: row.target,
    updatedAt: row.updated_at,
  };
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
    return dispatched.map(mapNotification);
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
    return mapNotification(data);
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
