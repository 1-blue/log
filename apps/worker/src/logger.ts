export type StructuredLog = {
  event: string;
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  errorCode?: string;
  failedCount?: number;
  dispatchedCount?: number;
  staleCount?: number;
  scheduledAt?: string;
};

function serializeLog(entry: StructuredLog): string {
  const sanitized: StructuredLog = { event: entry.event };
  for (const key of [
    "requestId",
    "method",
    "path",
    "status",
    "durationMs",
    "errorCode",
    "failedCount",
    "dispatchedCount",
    "staleCount",
    "scheduledAt",
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
