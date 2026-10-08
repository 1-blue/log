import {
  jobPlatformLabel,
  type N8nSlackNotificationDispatchPayload,
  type SlackMessageBlock,
  type SlackNotificationEventType,
} from "@workspace/contracts";
import type { Database, Json } from "@workspace/contracts/database";

import { logError } from "./logger.js";

export type NotificationRow =
  Database["public"]["Tables"]["slack_notifications"]["Row"];
export type PostingRow = Database["public"]["Tables"]["job_postings"]["Row"];
export type ThreadRow =
  Database["public"]["Tables"]["slack_job_threads"]["Row"];

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
  document_uploaded: "문서 업로드 접수",
  document_extraction_succeeded: "문서 AI OCR 완료",
  document_extraction_failed: "문서 AI OCR 실패",
};

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
    logError({
      event: "slack_error_webhook_failed",
      requestId: input.requestId,
    });
    return false;
  }
}

export function formatEnvironment(appBaseUrl: string): string {
  const hostname = new URL(appBaseUrl).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" ? "로컬" : "운영";
}

function adminUrl(appBaseUrl: string, notification: NotificationRow): string {
  if (notification.document_version_id) {
    return new URL(
      `/admin/documents/${notification.document_version_id}`,
      appBaseUrl,
    ).toString();
  }
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
    case "document_uploaded":
      return [
        "PDF 업로드가 완료되었습니다. AI OCR 처리 결과는 별도 알림으로 안내합니다.",
      ];
    case "document_extraction_succeeded":
      return [
        "AI OCR 텍스트가 준비되었습니다. 문서 화면에서 원본과 추출 결과를 확인하세요.",
      ];
    case "document_extraction_failed":
      return [
        "PDF에서 텍스트를 추출하지 못했습니다. 문서 화면에서 원인을 확인하고 재추출하거나 직접 입력하세요.",
      ];
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
  posting: PostingRow | null;
  thread: ThreadRow | null;
  now?: number;
}): Pick<N8nSlackNotificationDispatchPayload, "blocks" | "text" | "threadTs"> {
  const context = contextObject(input.notification.context);
  const companyName = escapeSlackMrkdwn(
    input.posting?.company_name ??
      (stringValue(context.documentType) === "resume"
        ? "이력서"
        : "포트폴리오"),
  );
  const title = escapeSlackMrkdwn(
    input.posting?.title ?? stringValue(context.label) ?? "업로드 문서",
  );
  const eventTitle = EVENT_TITLES[input.notification.event_type];
  const details = formatEventDetails(
    input.notification,
    input.now ?? Date.now(),
  ).map(escapeSlackMrkdwn);
  const link = adminUrl(input.appBaseUrl, input.notification);
  const heading = `*${eventTitle}* · [${formatEnvironment(input.appBaseUrl)}]`;
  const sourceLink =
    input.notification.target === "job_root" && input.posting
      ? `<${escapeSlackMrkdwn(input.posting.canonical_url)}|${escapeSlackMrkdwn(jobPlatformLabel(input.posting.source, input.posting.canonical_url))} 공고 보기>`
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
