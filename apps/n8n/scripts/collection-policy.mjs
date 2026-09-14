export const COLLECTION_FETCH_MAX_BYTES = 600_000;

export function classifyCollectionFetch(input) {
  const errorText = String(input.error?.message ?? input.message ?? "");
  const status = Number(input.statusCode);
  if (input.error || !Number.isInteger(status)) {
    return {
      outcome: /timeout|timed out|aborted/i.test(errorText)
        ? "timeout"
        : "network_error",
      response: null,
    };
  }

  const body =
    typeof input.body === "string"
      ? input.body
      : JSON.stringify(input.body ?? "");
  const bodyBytes = Buffer.byteLength(body, "utf8");
  const declaredLength = Number(input.headers?.["content-length"]);
  return {
    outcome: "response",
    response: {
      body: bodyBytes > COLLECTION_FETCH_MAX_BYTES ? "" : body,
      contentLength: Number.isFinite(declaredLength)
        ? declaredLength
        : bodyBytes,
      contentType: input.headers?.["content-type"] ?? null,
      status,
    },
  };
}
