const ERROR_CODES = {
  auth: "SLACK_AUTHENTICATION_FAILED",
  channel: "SLACK_CHANNEL_UNAVAILABLE",
  invalid: "SLACK_INVALID_PAYLOAD",
  rate: "SLACK_RATE_LIMITED",
  unavailable: "SLACK_SERVICE_UNAVAILABLE",
  unknown: "SLACK_DELIVERY_UNKNOWN",
};

function retryAfterSeconds(headers = {}) {
  const value =
    headers["retry-after"] ??
    headers["Retry-After"] ??
    headers.retryAfter ??
    null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function slackErrorCode(error) {
  const normalized = String(error ?? "").toLowerCase();
  if (
    normalized.includes("auth") ||
    normalized.includes("token") ||
    normalized === "not_authed"
  ) {
    return ERROR_CODES.auth;
  }
  if (normalized.includes("channel") || normalized === "not_in_channel") {
    return ERROR_CODES.channel;
  }
  return ERROR_CODES.invalid;
}

export function classifySlackDelivery(input) {
  const attempt = Number(input.attempt ?? 1);
  const status = Number(input.status ?? 0);
  const body = input.body && typeof input.body === "object" ? input.body : {};
  const retryAfter = retryAfterSeconds(input.headers);
  const botTarget = input.target !== "error_channel";

  if (status >= 200 && status < 300 && (!botTarget || body.ok === true)) {
    return {
      channelId: botTarget ? String(body.channel ?? "") || null : null,
      error: null,
      httpStatus: status,
      messageTs: botTarget ? String(body.ts ?? "") || null : null,
      outcome: "sent",
      retryAfterSeconds: null,
      shouldRetry: false,
    };
  }

  if (
    status === 429 &&
    attempt === 1 &&
    retryAfter !== null &&
    retryAfter <= 60
  ) {
    return {
      error: null,
      outcome: null,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfter)),
      shouldRetry: true,
    };
  }

  if (input.networkError || status === 0 || status >= 500) {
    return {
      channelId: null,
      error: {
        code: ERROR_CODES.unknown,
        message: "Slack 전송 결과를 확인할 수 없습니다.",
        retryable: false,
      },
      httpStatus: status || null,
      messageTs: null,
      outcome: "delivery_unknown",
      retryAfterSeconds: null,
      shouldRetry: false,
    };
  }

  const errorCode =
    status === 429
      ? ERROR_CODES.rate
      : slackErrorCode(body.error ?? input.errorMessage);
  return {
    channelId: null,
    error: {
      code: errorCode,
      message:
        status === 429
          ? "Slack 호출 제한으로 알림을 전송하지 못했습니다."
          : "Slack 설정 또는 요청을 확인해 주세요.",
      retryable: false,
    },
    httpStatus: status || null,
    messageTs: null,
    outcome: "failed",
    retryAfterSeconds: null,
    shouldRetry: false,
  };
}
