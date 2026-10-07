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
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function slackErrorCode(error) {
  const normalized = String(error ?? "").toLowerCase();
  if (
    normalized.includes("auth") ||
    normalized.includes("token") ||
    normalized.includes("missing_scope") ||
    normalized === "not_authed"
  ) {
    return ERROR_CODES.auth;
  }
  if (
    normalized.includes("channel") ||
    normalized === "not_in_channel" ||
    normalized === "is_archived"
  ) {
    return ERROR_CODES.channel;
  }
  return ERROR_CODES.invalid;
}

export function classifySlackDelivery(input) {
  const attempt = Number(input.attempt ?? 1);
  const body =
    input.body && typeof input.body === "object" ? input.body : input;
  const rawError = String(
    typeof input.error === "string"
      ? input.error
      : (input.error?.message ?? input.errorMessage ?? body.error ?? ""),
  );
  const knownError =
    /\b(invalid_auth|not_authed|token_revoked|account_inactive|missing_scope|channel_not_found|not_in_channel|is_archived|invalid_blocks|invalid_arguments|invalid_payload|msg_too_long|restricted_action|ratelimited)\b/i
      .exec(rawError)?.[1]
      ?.toLowerCase();
  const status = Number(
    input.statusCode ??
      input.status ??
      input.error?.httpCode ??
      (typeof body.ok === "boolean" ? 200 : 0),
  );
  const retryAfter = retryAfterSeconds(input.headers);
  const botTarget = input.target !== "error_channel";
  const rateLimited = status === 429 || knownError === "ratelimited";

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

  if (rateLimited && attempt === 1 && retryAfter !== null && retryAfter <= 60) {
    return {
      error: null,
      outcome: null,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfter)),
      shouldRetry: true,
    };
  }

  // n8n's native Slack node throws {error: string} without an HTTP status
  // even for definite Slack API rejections. Classify those before ambiguous
  // transport failures, otherwise root threads stay blocked indefinitely.
  if (
    !knownError &&
    body.ok !== false &&
    !rateLimited &&
    (input.networkError || status === 0 || status >= 500)
  ) {
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

  const errorCode = rateLimited
    ? ERROR_CODES.rate
    : slackErrorCode(knownError ?? body.error ?? rawError);
  return {
    channelId: null,
    error: {
      code: errorCode,
      message: rateLimited
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

export function slackClassifierCode(retry = false) {
  return `const ERROR_CODES=${JSON.stringify(ERROR_CODES)};\n${retryAfterSeconds.toString()}\n${slackErrorCode.toString()}\n${classifySlackDelivery.toString()}
const response=$input.first().json;const payload=$('HMAC 요청 검증').first().json.payload;
const attempt=${retry ? "2" : "1"};
const status=response.slackStatusCode??response.statusCode??response.status;
const result=classifySlackDelivery({...response,status,attempt,target:payload.target,headers:response.headers??response.error?.response?.headers});
return [{json:{...result,slackAttempt:attempt}}];`;
}
