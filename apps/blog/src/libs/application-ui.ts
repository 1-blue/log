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

export const APPLICATION_STATUS_COLORS: Record<ApplicationStatus, string> = {
  interested:
    "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  preparing:
    "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  applied: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  screening:
    "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  interview:
    "border-cyan-500/25 bg-cyan-500/10 text-cyan-800 dark:text-cyan-300",
  offer:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  rejected:
    "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  withdrawn:
    "border-orange-500/25 bg-orange-500/10 text-orange-800 dark:text-orange-300",
};

export function formatFitScore(score: number | null): string {
  return score === null ? "산정 불가" : `${score}점`;
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
