import {
  JOB_POSTING_FETCH_MAX_BYTES,
  JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH,
  JOB_POSTING_MANUAL_CONTENT_MIN_LENGTH,
  type JobPostingCollectionErrorCode,
  type JobPostingSnapshotSource,
  type JobPostingSourceMetadata,
} from "@workspace/contracts";

export const WANTED_JSON_LD_PARSER_VERSION = "wanted-jsonld-v1";
export const MANUAL_PARSER_VERSION = "manual-v1";

export class JobPostingParseError extends Error {
  constructor(readonly code: JobPostingCollectionErrorCode) {
    super(code);
    this.name = "JobPostingParseError";
  }
}

export type ParsedJobPosting = {
  contentHashInput: string;
  normalizedContent: string;
  parserVersion: string;
  rawContent: string;
  source: JobPostingSnapshotSource;
  sourceMetadata: JobPostingSourceMetadata;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function decodeEntities(value: string): string {
  const decodeCodePoint = (entity: string, codePoint: number) =>
    Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity;

  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (entity, token: string) => {
      const lower = token.toLowerCase();
      if (lower.startsWith("#x")) {
        return decodeCodePoint(entity, Number.parseInt(lower.slice(2), 16));
      }
      if (lower.startsWith("#")) {
        return decodeCodePoint(entity, Number.parseInt(lower.slice(1), 10));
      }
      return (
        { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' }[
          lower
        ] ?? entity
      );
    },
  );
}

export function normalizeJobPostingText(value: string): string {
  const withBreaks = value
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:div|p|li|h[1-6]|section)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(withBreaks)
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasJobPostingType(value: Record<string, unknown>): boolean {
  const type = value["@type"];
  return (
    type === "JobPosting" ||
    (Array.isArray(type) && type.includes("JobPosting"))
  );
}

function findJobPosting(
  value: unknown,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 8) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (hasJobPostingType(value)) return value;
  if (value["@graph"] !== undefined) {
    const found = findJobPosting(value["@graph"], depth + 1);
    if (found) return found;
  }
  return null;
}

function extractJsonLd(html: string): unknown[] {
  const values: unknown[] = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const attributes = match[1] ?? "";
    if (!/\btype\s*=\s*(["'])application\/ld\+json\1/i.test(attributes)) {
      continue;
    }
    try {
      values.push(JSON.parse((match[2] ?? "").trim()));
    } catch {
      // Other valid JSON-LD scripts may still contain the JobPosting object.
    }
  }
  return values;
}

function canonicalWantedUrl(value: string): string | null {
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

function locationText(value: unknown): string | null {
  if (typeof value === "string") return nullableString(value, 1_000);
  const locations = Array.isArray(value) ? value : [value];
  const parts = locations.flatMap((location) => {
    if (!isRecord(location)) return [];
    const address = isRecord(location.address) ? location.address : location;
    return [
      address.streetAddress,
      address.addressLocality,
      address.addressRegion,
      address.addressCountry,
    ].flatMap((item) => {
      const text = nullableString(item, 300);
      return text ? [text] : [];
    });
  });
  return parts.length ? [...new Set(parts)].join(", ").slice(0, 1_000) : null;
}

function metadataFromPosting(
  posting: Record<string, unknown>,
): JobPostingSourceMetadata {
  const organization = isRecord(posting.hiringOrganization)
    ? posting.hiringOrganization
    : null;
  const employmentType = Array.isArray(posting.employmentType)
    ? posting.employmentType
        .filter((item) => typeof item === "string")
        .join(", ")
    : posting.employmentType;

  return {
    companyName: nullableString(organization?.name, 500),
    datePosted: nullableString(posting.datePosted, 100),
    employmentType: nullableString(employmentType, 300),
    industry: nullableString(posting.industry, 500),
    location: locationText(posting.jobLocation),
    occupationalCategory: nullableString(posting.occupationalCategory, 500),
    title: nullableString(posting.title, 500),
    validThrough: nullableString(posting.validThrough, 100),
  };
}

function buildNormalizedContent(
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

export function parseWantedJobPosting(input: {
  expectedUrl: string;
  html: string;
}): ParsedJobPosting {
  if (
    new TextEncoder().encode(input.html).byteLength >
    JOB_POSTING_FETCH_MAX_BYTES
  ) {
    throw new JobPostingParseError("CONTENT_TOO_LARGE");
  }

  const posting = extractJsonLd(input.html)
    .map((value) => findJobPosting(value))
    .find((value) => value !== null);
  if (!posting) throw new JobPostingParseError("PARSER_STRUCTURE_CHANGED");

  const sourceUrl = nullableString(posting.url, 2_000);
  if (!sourceUrl || canonicalWantedUrl(sourceUrl) !== input.expectedUrl) {
    throw new JobPostingParseError("URL_MISMATCH");
  }

  const metadata = metadataFromPosting(posting);
  const descriptionValue = nullableString(posting.description, 200_000);
  const description = descriptionValue
    ? normalizeJobPostingText(descriptionValue)
    : "";
  if (!metadata.title || !metadata.companyName || !description) {
    throw new JobPostingParseError("INVALID_JOB_POSTING");
  }
  if (description.length > JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH) {
    throw new JobPostingParseError("CONTENT_TOO_LARGE");
  }

  const normalizedContent = buildNormalizedContent(metadata, description);
  return {
    contentHashInput: normalizedContent,
    normalizedContent,
    parserVersion: WANTED_JSON_LD_PARSER_VERSION,
    rawContent: description,
    source: "wanted_json_ld",
    sourceMetadata: metadata,
  };
}

export function parseManualJobPosting(content: string): ParsedJobPosting {
  const normalized = normalizeJobPostingText(content);
  if (
    normalized.length < JOB_POSTING_MANUAL_CONTENT_MIN_LENGTH ||
    normalized.length > JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH
  ) {
    throw new JobPostingParseError("INVALID_JOB_POSTING");
  }
  const metadata: JobPostingSourceMetadata = {
    companyName: null,
    datePosted: null,
    employmentType: null,
    industry: null,
    location: null,
    occupationalCategory: null,
    title: null,
    validThrough: null,
  };
  return {
    contentHashInput: normalized,
    normalizedContent: normalized,
    parserVersion: MANUAL_PARSER_VERSION,
    rawContent: normalized,
    source: "manual",
    sourceMetadata: metadata,
  };
}
