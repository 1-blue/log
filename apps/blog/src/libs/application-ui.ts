import type { ApplicationStatus } from "@workspace/contracts";

export const APPLICATION_STATUS_OPTIONS = [
  ["interested", "관심"],
  ["preparing", "지원 준비"],
  ["applied", "지원 완료"],
  ["screening", "서류 전형"],
  ["interview", "면접"],
  ["offer", "최종 합격"],
  ["rejected", "불합격"],
  ["withdrawn", "지원 철회"],
] as const satisfies readonly (readonly [ApplicationStatus, string])[];

export function getApplicationStatusLabel(status: ApplicationStatus): string {
  return (
    APPLICATION_STATUS_OPTIONS.find(([value]) => value === status)?.[1] ??
    status
  );
}

export function toUtcTimestamp(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toLocalDateTimeInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function formatApplicationDate(value: string | null): string {
  if (!value) return "미정";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    ...(value.includes("T") ? { timeStyle: "short" } : {}),
  }).format(new Date(value.includes("T") ? value : `${value}T00:00:00`));
}
