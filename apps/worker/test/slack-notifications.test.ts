import {
  type SlackNotificationResponse,
  SlackNotificationResponseSchema,
} from "@workspace/contracts";
import type { Database } from "@workspace/contracts/database";

import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createSignedHeaders, N8nDispatchError } from "../src/n8n.js";
import {
  escapeSlackMrkdwn,
  formatSlackNotification,
  sendSlackErrorWebhook,
  type SlackNotificationService,
  SupabaseSlackNotificationService,
} from "../src/slack-notifications.js";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const POSTING_ID = "00000000-0000-4000-8000-000000000002";
const NOTIFICATION_ID = "00000000-0000-4000-8000-000000000003";
const NOTIFICATION_EVENT_ID = "00000000-0000-4000-8000-000000000004";
const CALLBACK_EVENT_ID = "00000000-0000-4000-8000-000000000005";
const REQUEST_ID = "00000000-0000-4000-8000-000000000006";
const timestamp = "2026-09-14T00:00:00.000Z";

const env: CloudflareBindings = {
  ADMIN_API_RATE_LIMITER: {} as RateLimit,
  ADMIN_USER_ID: OWNER_ID,
  APP_BASE_URL: "http://localhost:3000",
  N8N_CALLBACK_SECRET: "test-callback-secret",
  N8N_WEBHOOK_SECRET: "test-webhook-secret",
  N8N_WEBHOOK_URL: "http://localhost:5678/webhook/career-analysis",
  PUBLIC_API_RATE_LIMITER: {} as RateLimit,
  SLACK_ERROR_WEBHOOK_URL: "https://hooks.slack.com/services/test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  SUPABASE_URL: "https://example.supabase.co",
};

type NotificationRow =
  Database["public"]["Tables"]["slack_notifications"]["Row"];
type PostingRow = Database["public"]["Tables"]["job_postings"]["Row"];

const notification: NotificationRow = {
  analysis_job_id: null,
  application_id: null,
  attempt_count: 1,
  channel_id: null,
  collection_run_id: null,
  completion_event_id: null,
  context: {
    email: "private@example.com",
    fitScore: 86,
    gaps: [
      { title: "관측성 <실무>" },
      { title: "워크플로 복구" },
      { title: "비용 최적화" },
      { title: "표시하지 않을 네 번째 값" },
    ],
    startedAt: "2026-09-13T23:58:30.000Z",
    summary: "민감하지 않은 분석 요약 & 결과",
    interviewAnswer: "외부로 보내면 안 되는 답변",
  },
  created_at: timestamp,
  dedupe_key: "analysis:test:succeeded",
  dispatched_at: timestamp,
  error_code: null,
  error_message: null,
  error_retryable: false,
  event_id: NOTIFICATION_EVENT_ID,
  event_type: "analysis_succeeded",
  finished_at: null,
  http_status: null,
  id: NOTIFICATION_ID,
  job_posting_id: POSTING_ID,
  message_ts: null,
  not_before: timestamp,
  owner_id: OWNER_ID,
  request_id: REQUEST_ID,
  route_key: "job_channel",
  status: "dispatching",
  target: "job_thread",
  updated_at: timestamp,
};

const posting: PostingRow = {
  canonical_url: "https://www.wanted.co.kr/wd/384409",
  company_name: "미리디 & 파트너",
  created_at: timestamp,
  external_id: "384409",
  id: POSTING_ID,
  owner_id: OWNER_ID,
  search_text: null,
  source: "wanted",
  title: "AX Engineer <Infra>",
  updated_at: timestamp,
};

const response: SlackNotificationResponse = {
  analysisJobId: null,
  applicationId: null,
  attemptCount: 1,
  channelId: "C0123456789",
  collectionRunId: null,
  createdAt: timestamp,
  dispatchedAt: timestamp,
  error: null,
  eventId: NOTIFICATION_EVENT_ID,
  eventType: "analysis_succeeded",
  finishedAt: timestamp,
  httpStatus: 200,
  id: NOTIFICATION_ID,
  jobPostingId: POSTING_ID,
  messageTs: "1710000000.000001",
  requestId: REQUEST_ID,
  status: "sent",
  target: "job_thread",
  updatedAt: timestamp,
};

describe("Slack notification formatting", () => {
  it("escapes external values, caps details, and reuses the job thread", () => {
    const formatted = formatSlackNotification({
      appBaseUrl: "http://localhost:3000",
      notification,
      now: Date.parse(timestamp),
      posting,
      thread: {
        channel_id: "C0123456789",
        created_at: timestamp,
        job_posting_id: POSTING_ID,
        owner_id: OWNER_ID,
        root_notification_id: "00000000-0000-4000-8000-000000000099",
        status: "ready",
        thread_ts: "1710000000.000001",
        updated_at: timestamp,
      },
    });

    const serialized = JSON.stringify(formatted);
    expect(formatted.threadTs).toBe("1710000000.000001");
    expect(formatted.text.length).toBeLessThanOrEqual(2_000);
    expect(serialized).toContain("미리디 &amp; 파트너");
    expect(serialized).toContain("AX Engineer &lt;Infra&gt;");
    expect(serialized).toContain("경과 시간: 1분 30초");
    expect(serialized).not.toContain("표시하지 않을 네 번째 값");
    expect(serialized).not.toContain("resume");
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("외부로 보내면 안 되는 답변");
  });

  it("adds the public Wanted link only to a root notification", () => {
    const formatted = formatSlackNotification({
      appBaseUrl: "https://blog.example.com",
      notification: {
        ...notification,
        event_type: "job_posting_registered",
        target: "job_root",
      },
      now: Date.parse(timestamp),
      posting,
      thread: null,
    });
    expect(JSON.stringify(formatted.blocks)).toContain(posting.canonical_url);
    expect(formatted.threadTs).toBeNull();
  });

  it("escapes Slack mrkdwn control characters", () => {
    expect(escapeSlackMrkdwn("A & <B>")).toBe("A &amp; &lt;B&gt;");
  });
});

describe("Slack notification callback API", () => {
  it("verifies HMAC identifiers, completes the outbox, and drains the next item", async () => {
    const complete = vi.fn(async () => response);
    const drain = vi.fn(async () => []);
    const service: SlackNotificationService = {
      complete,
      drain,
      failStale: vi.fn(async () => []),
    };
    const app = createApp({ slackNotificationServiceFactory: () => service });
    const callback = {
      channelId: response.channelId,
      error: null,
      eventId: CALLBACK_EVENT_ID,
      httpStatus: 200,
      messageTs: response.messageTs,
      notificationEventId: NOTIFICATION_EVENT_ID,
      notificationId: NOTIFICATION_ID,
      occurredAt: timestamp,
      outcome: "sent" as const,
      requestId: REQUEST_ID,
      schemaVersion: "1.0.0" as const,
    };
    const body = new TextEncoder().encode(JSON.stringify(callback));
    const path = `/v1/internal/slack-notifications/${NOTIFICATION_ID}/result`;
    const headers = await createSignedHeaders({
      body,
      eventId: CALLBACK_EVENT_ID,
      method: "POST",
      path,
      requestId: REQUEST_ID,
      secret: "test-callback-secret",
      timestamp: Math.floor(Date.now() / 1_000),
    });
    const result = await app.request(
      `http://localhost:8787${path}`,
      { body, headers, method: "POST" },
      env,
    );

    expect(result.status).toBe(200);
    expect(
      SlackNotificationResponseSchema.safeParse(
        (await result.json<{ data: unknown }>()).data,
      ).success,
    ).toBe(true);
    expect(complete).toHaveBeenCalledWith(callback);
    expect(drain).toHaveBeenCalledWith(2);
  });

  it("rejects an unsigned callback", async () => {
    const service: SlackNotificationService = {
      complete: vi.fn(async () => response),
      drain: vi.fn(async () => []),
      failStale: vi.fn(async () => []),
    };
    const app = createApp({ slackNotificationServiceFactory: () => service });
    const result = await app.request(
      `http://localhost:8787/v1/internal/slack-notifications/${NOTIFICATION_ID}/result`,
      {
        body: "{}",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
      {} as CloudflareBindings,
    );
    expect(result.status).toBe(401);
    expect(service.complete).not.toHaveBeenCalled();
  });
});

describe("Slack notification outbox dispatcher", () => {
  function supabaseFixture(options?: { dispatchFailure?: boolean }) {
    const thread = {
      channel_id: "C0123456789",
      created_at: timestamp,
      job_posting_id: POSTING_ID,
      owner_id: OWNER_ID,
      root_notification_id: "00000000-0000-4000-8000-000000000099",
      status: "ready",
      thread_ts: "1710000000.000001",
      updated_at: timestamp,
    };
    const failedRow: NotificationRow = {
      ...notification,
      error_code: "N8N_DISPATCH_FAILED",
      error_message: "n8n에서 Slack 알림 요청을 받지 못했습니다.",
      error_retryable: true,
      finished_at: timestamp,
      status: "failed",
    };
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_slack_notifications") {
        return { data: [notification], error: null };
      }
      if (name === "fail_slack_notification_dispatch") {
        return { data: failedRow, error: null };
      }
      return { data: null, error: null };
    });
    const from = vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "job_postings" ? posting : thread,
            error: null,
          }),
        }),
      }),
    }));
    const dispatch = options?.dispatchFailure
      ? vi.fn(async () => {
          throw new N8nDispatchError("unavailable", true);
        })
      : vi.fn(async () => undefined);
    const fetcher = vi.fn(async () => new Response("ok", { status: 200 }));
    const service = new SupabaseSlackNotificationService(
      { from, rpc } as never,
      env,
      dispatch,
      fetcher,
    );
    return { dispatch, fetcher, rpc, service };
  }

  it("claims and sends a strict payload to the shared n8n webhook", async () => {
    const fixture = supabaseFixture();
    await expect(fixture.service.drain(2)).resolves.toHaveLength(1);
    expect(fixture.rpc).toHaveBeenCalledWith("claim_slack_notifications", {
      p_limit: 2,
    });
    expect(fixture.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackPath: `/v1/internal/slack-notifications/${NOTIFICATION_ID}/result`,
        kind: "slack_notification",
        notificationId: NOTIFICATION_ID,
        target: "job_thread",
        threadTs: "1710000000.000001",
      }),
      env,
    );
    expect(fixture.fetcher).not.toHaveBeenCalled();
  });

  it("isolates n8n dispatch failure and attempts the error webhook once", async () => {
    const fixture = supabaseFixture({ dispatchFailure: true });
    await expect(fixture.service.drain(2)).resolves.toEqual([
      expect.objectContaining({ status: "failed" }),
    ]);
    expect(fixture.rpc).toHaveBeenCalledWith(
      "fail_slack_notification_dispatch",
      expect.objectContaining({ p_notification_id: NOTIFICATION_ID }),
    );
    expect(fixture.fetcher).toHaveBeenCalledOnce();
  });
});

describe("direct Slack error webhook fallback", () => {
  it("attempts delivery once and never logs the webhook URL", async () => {
    const fetcher = vi.fn(async () => new Response("failed", { status: 500 }));
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(
      sendSlackErrorWebhook({
        fetcher,
        requestId: REQUEST_ID,
        text: "n8n 전달 실패",
        url: "https://hooks.slack.com/services/secret",
      }),
    ).resolves.toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(error.mock.calls.flat().join(" ")).not.toContain("secret");
    error.mockRestore();
  });
});
