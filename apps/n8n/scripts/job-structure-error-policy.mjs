// This function is also embedded into n8n Code nodes. Keep it self-contained,
// deterministic and free of raw provider messages in the returned diagnostics.
export function classifyJobStructuringError(input) {
  const error = input?.error ?? input ?? {};
  const status = Number(
    error.status ??
      error.statusCode ??
      error.httpCode ??
      error.cause?.status ??
      0,
  );
  const message = [
    typeof error === "string" ? error : error.message,
    error.description,
    error.code,
    error.cause?.code,
    error.response?.body?.error?.code,
  ]
    .filter(Boolean)
    .join(" ");
  const wait = Number(error.retryAfter ?? error.headers?.["retry-after"] ?? 2);
  let code = "AI_STRUCTURING_FAILED";
  if (/billing|insufficient_quota|quota|credit|payment/i.test(message))
    code = "AI_BILLING_LIMIT";
  else if (
    status === 401 ||
    status === 403 ||
    /invalid_api_key|authentication/i.test(message)
  )
    code = "AI_AUTHENTICATION_FAILED";
  else if (/timeout|timed out|ETIMEDOUT|aborted/i.test(message))
    code = "AI_TIMEOUT";
  else if (status === 429) code = "AI_RATE_LIMITED";
  else if (
    status >= 500 ||
    /ECONNRESET|ENOTFOUND|network|fetch failed/i.test(message)
  )
    code = "AI_SERVICE_UNAVAILABLE";
  else if (
    /schema|structured|json|syntax|refusal|refused|incomplete|AI_STRUCTURE/i.test(
      message,
    )
  )
    code = "AI_RESPONSE_INVALID";
  const canRetry = [
    "AI_TIMEOUT",
    "AI_RATE_LIMITED",
    "AI_SERVICE_UNAVAILABLE",
  ].includes(code);
  return {
    code,
    canRetry,
    retryable: canRetry && Number.isFinite(wait) && wait >= 0 && wait <= 60,
    waitSeconds: Number.isFinite(wait) ? Math.max(2, Math.ceil(wait)) : 2,
  };
}
