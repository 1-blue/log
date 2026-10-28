// This function is also embedded into n8n Code nodes. Keep it self-contained,
// deterministic and free of raw provider messages in the returned diagnostics.
export function parseJobStructureResponse(response) {
  if (response?.status !== "completed") {
    const reason = response?.incomplete_details?.reason;
    throw new Error(
      reason === "max_output_tokens"
        ? "AI_STRUCTURE_TOKEN_LIMIT"
        : "AI_STRUCTURE_INCOMPLETE",
    );
  }
  if (!Array.isArray(response.output))
    throw new Error("AI_STRUCTURE_OUTPUT_MISSING");
  const content = response.output.flatMap((item) =>
    Array.isArray(item?.content) ? item.content : [],
  );
  if (content.some((item) => item?.type === "refusal"))
    throw new Error("AI_STRUCTURE_REFUSAL");
  const texts = content
    .filter((item) => item?.type === "output_text")
    .map((item) => item.text);
  if (!texts.length) throw new Error("AI_STRUCTURE_OUTPUT_MISSING");
  let extraction;
  try {
    extraction =
      texts.length === 1 && typeof texts[0] === "object"
        ? texts[0]
        : JSON.parse(texts.join(""));
  } catch {
    // JSON.parse messages can include the original source text.
    throw new Error("AI_STRUCTURE_JSON_INVALID");
  }
  if (
    !extraction ||
    typeof extraction !== "object" ||
    Array.isArray(extraction)
  )
    throw new Error("AI_STRUCTURE_SHAPE_INVALID");
  return extraction;
}

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
