import * as z from "zod";

export const JOB_PLATFORM_LABELS: Readonly<Record<string, string>> = {
  wanted: "원티드",
  rocketpunch: "로켓펀치",
  saramin: "사람인",
  jobkorea: "잡코리아",
  zighang: "직행",
  rallit: "랠릿",
  remember: "리멤버",
  jumpit: "점핏",
  company: "자사 홈페이지",
  other: "기타",
};

// Specific hosts must precede their parent platform (Jumpit → Saramin).
const PLATFORM_HOSTS: readonly [string, string][] = [
  ["jumpit.saramin.co.kr", "jumpit"],
  ["jumpit.co.kr", "jumpit"],
  ["wanted.co.kr", "wanted"],
  ["rocketpunch.com", "rocketpunch"],
  ["saramin.co.kr", "saramin"],
  ["jobkorea.co.kr", "jobkorea"],
  ["zighang.com", "zighang"],
  ["rallit.com", "rallit"],
  ["career.rememberapp.co.kr", "remember"],
];

export function detectJobPlatform(value: string): string {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      PLATFORM_HOSTS.find(
        ([domain]) => host === domain || host.endsWith(`.${domain}`),
      )?.[1] ?? "other"
    );
  } catch {
    return "other";
  }
}

export function jobPlatformLabel(source: string, url?: string): string {
  const label = JOB_PLATFORM_LABELS[source] ?? "기타";
  if ((source === "other" || !JOB_PLATFORM_LABELS[source]) && url) {
    try {
      return `${label} · ${new URL(url).hostname}`;
    } catch {
      /* invalid legacy URL */
    }
  }
  return label;
}

export const JobPostingUrlSchema = z
  .url()
  .max(2_000)
  .refine((value) => {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      host.includes(".") &&
      !host.endsWith(".") &&
      !/^\d+(?:\.\d+){3}$/.test(host) &&
      !host.includes(":") &&
      !/(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host)
    );
  }, "A public HTTPS job URL without credentials or fragment is required");

export function canonicalJobPostingUrl(value: string): string {
  const url = new URL(JobPostingUrlSchema.parse(value));
  // Keep query parameters that can identify a posting (e.g. Saramin rec_idx).
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || ["gclid", "fbclid"].includes(key.toLowerCase()))
      url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (
    detectJobPlatform(url.href) === "wanted" &&
    /^\/wd\/\d+\/?$/.test(url.pathname)
  ) {
    url.hostname = "www.wanted.co.kr";
    url.pathname = url.pathname.replace(/\/$/, "");
  }
  return url.href;
}

// URL acceptance is not fetch permission. Unknown/unreviewed platforms use the
// manual-input path; the fetcher must additionally enforce DNS/redirect SSRF rules.
export function canAutomaticallyCollectJobUrl(value: string): boolean {
  try {
    const url = new URL(canonicalJobPostingUrl(value));
    return (
      url.hostname === "www.wanted.co.kr" &&
      /^\/wd\/\d+$/.test(url.pathname) &&
      !url.search
    );
  } catch {
    return false;
  }
}
