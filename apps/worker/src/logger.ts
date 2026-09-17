export type StructuredLog = {
  callbackOutcome?: string;
  collectionRunId?: string;
  contentLength?: number;
  event: string;
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  errorCode?: string;
  failedCount?: number;
  dispatchedCount?: number;
  httpStatus?: number;
  parserVersion?: string;
  source?: string;
  stage?: string;
  schemaIssue?: string;
  staleCount?: number;
  scheduledAt?: string;
  outcome?: string;
};

function serializeLog(entry: StructuredLog): string {
  const sanitized: StructuredLog = { event: entry.event };
  for (const key of [
    "callbackOutcome",
    "collectionRunId",
    "contentLength",
    "requestId",
    "method",
    "path",
    "status",
    "durationMs",
    "errorCode",
    "failedCount",
    "dispatchedCount",
    "httpStatus",
    "parserVersion",
    "source",
    "stage",
    "schemaIssue",
    "staleCount",
    "scheduledAt",
    "outcome",
  ] as const) {
    const value = entry[key];
    if (value !== undefined) Object.assign(sanitized, { [key]: value });
  }
  return JSON.stringify(sanitized);
}

export function logInfo(entry: StructuredLog): void {
  console.log(serializeLog(entry));
}

export function logError(entry: StructuredLog): void {
  console.error(serializeLog(entry));
}
