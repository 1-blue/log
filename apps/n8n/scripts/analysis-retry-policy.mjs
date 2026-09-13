const BILLING_PATTERN =
  /billing|credit|quota|spend|usage[_ -]?limit|insufficient_quota/i;
const TIMEOUT_PATTERN = /timeout|timed out|aborted|etimedout/i;
const NETWORK_PATTERN = /network|econnreset|econnrefused|fetch failed|socket/i;

function statusOf(error) {
  const status = Number(
    error?.statusCode ??
      error?.status ??
      error?.httpCode ??
      error?.response?.status,
  );
  return Number.isInteger(status) ? status : null;
}

function messageOf(error) {
  return String(
    error?.message ?? error?.description ?? error?.error?.message ?? "",
  );
}

function retryAfterOf(error) {
  const value =
    error?.response?.headers?.["retry-after"] ??
    error?.headers?.["retry-after"] ??
    error?.retryAfter;
  if (value === undefined || value === null) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function deterministicJitter(seed) {
  let hash = 0;
  for (const character of String(seed)) {
    hash = (hash * 31 + character.charCodeAt(0)) % 1_000;
  }
  return hash / 1_000;
}

export function classifyOpenAiFailure({
  attempt,
  error,
  nowMs = Date.now(),
  seed = "",
}) {
  const status = statusOf(error);
  const message = messageOf(error);
  const retryAfter = retryAfterOf(error);
  let code = "OPENAI_INVALID_REQUEST";
  let retryable = false;

  if (/incomplete/i.test(message)) {
    code = "OPENAI_INCOMPLETE";
  } else if (/structured|schema/i.test(message)) {
    code = "OPENAI_SCHEMA_INVALID";
  } else if (BILLING_PATTERN.test(message)) {
    code = "OPENAI_BILLING_LIMIT";
  } else if (status === 401 || status === 403) {
    code = "OPENAI_AUTHENTICATION_FAILED";
  } else if (TIMEOUT_PATTERN.test(message)) {
    code = "OPENAI_TIMEOUT";
    retryable = true;
  } else if (status === 429) {
    code = "OPENAI_RATE_LIMITED";
    retryable = true;
  } else if (
    (status !== null && status >= 500) ||
    NETWORK_PATTERN.test(message)
  ) {
    code = "OPENAI_UNAVAILABLE";
    retryable = true;
  }

  const waitSeconds = retryAfter ?? 2 + deterministicJitter(seed);
  const automaticRetry = retryable && attempt < 2 && waitSeconds <= 60;
  return {
    automaticRetry,
    code,
    retryAt: automaticRetry
      ? new Date(nowMs + waitSeconds * 1_000).toISOString()
      : null,
    retryable,
    waitSeconds,
  };
}

export function classifyCallbackFailure({ attempt, error, status }) {
  const message = messageOf(error);
  const numericStatus = Number(status);
  const retryable =
    numericStatus === 429 ||
    numericStatus >= 500 ||
    TIMEOUT_PATTERN.test(message) ||
    NETWORK_PATTERN.test(message);
  return {
    retryable,
    shouldRetry: retryable && attempt < 3,
  };
}
