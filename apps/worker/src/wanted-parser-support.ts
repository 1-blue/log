import type { JobPostingSourceMetadata } from "@workspace/contracts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function nullableString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  return normalized ? normalized.slice(0, max) : null;
}

export function canonicalWantedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const id = url.pathname.match(/^\/wd\/(\d+)$/)?.[1];
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.wanted.co.kr" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !id
    ) {
      return null;
    }
    return `https://www.wanted.co.kr/wd/${id}`;
  } catch {
    return null;
  }
}

export function buildNormalizedContent(
  metadata: JobPostingSourceMetadata,
  description: string,
): string {
  return [
    metadata.companyName ? `회사명: ${metadata.companyName}` : null,
    metadata.title ? `공고명: ${metadata.title}` : null,
    metadata.location ? `근무지: ${metadata.location}` : null,
    metadata.employmentType ? `고용형태: ${metadata.employmentType}` : null,
    "",
    description,
  ]
    .filter((line) => line !== null)
    .join("\n")
    .trim();
}
