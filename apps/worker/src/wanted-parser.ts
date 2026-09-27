import {
  JOB_POSTING_FETCH_MAX_BYTES,
  JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH,
  JOB_POSTING_MANUAL_CONTENT_MIN_LENGTH,
  type JobPostingAiExtraction,
  type JobPostingBodySections,
  type JobPostingCollectionErrorCode,
  type JobPostingSnapshotSource,
  type JobPostingSourceMetadata,
} from "@workspace/contracts";

import {
  decodeEntities,
  extractJobPostingSections,
  normalizeJobPostingText,
  removeWantedNonPostingContent,
} from "./wanted-parser-text.js";

export {
  extractJobPostingSections,
  normalizeJobPostingText,
} from "./wanted-parser-text.js";

export const WANTED_JSON_LD_PARSER_VERSION = "wanted-jsonld-v1";
export const WANTED_HTML_PARSER_VERSION = "wanted-html-v1";
export const WANTED_AI_PARSER_VERSION = "wanted-ai-v1";
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
  sections: JobPostingBodySections;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  return normalized ? normalized.slice(0, max) : null;
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

function attributeValue(tag: string, attribute: string): string | null {
  const match = tag.match(
    new RegExp(
      `\\b${attribute}\\s*=\\s*(?:(["'])([\\s\\S]*?)\\1|([^\\s>]+))`,
      "i",
    ),
  );
  return match?.[2] ?? match?.[3] ?? null;
}

function firstAttributeValue(
  html: string,
  tagName: string,
  attribute: string,
  predicate?: (tag: string) => boolean,
): string | null {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  for (const match of html.matchAll(pattern)) {
    const tag = match[0] ?? "";
    if (predicate && !predicate(tag)) continue;
    const value = attributeValue(tag, attribute);
    if (value) return decodeEntities(value);
  }
  return null;
}

function firstTagText(
  html: string,
  tagName: string,
  predicate?: (tag: string) => boolean,
): string | null {
  const pattern = new RegExp(
    `<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}\\s*>`,
    "gi",
  );
  for (const match of html.matchAll(pattern)) {
    const tag = match[1] ?? "";
    if (predicate && !predicate(tag)) continue;
    const text = normalizeJobPostingText(match[2] ?? "");
    if (text) return text;
  }
  return null;
}

function visibleHtml(html: string): string {
  const container =
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1] ??
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/i)?.[1] ??
    html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ??
    html;

  return container
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<(script|style|noscript|template|svg|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      "",
    )
    .replace(/<(header|footer|nav)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .trim();
}

function visibleJobPostingDescription(html: string): string {
  return removeWantedNonPostingContent(
    normalizeJobPostingText(visibleHtml(html)),
  );
}

function stripTitleSuffix(value: string): string {
  return value.replace(/\s*[|·-]\s*(?:wanted|원티드).*$/i, "").trim();
}

function htmlMetadata(html: string): JobPostingSourceMetadata {
  const title =
    firstTagText(html, "h1") ??
    firstAttributeValue(html, "meta", "content", (tag) =>
      /\b(?:property|name)\s*=\s*["']og:title["']/i.test(tag),
    ) ??
    firstTagText(html, "title");

  const companyName =
    html.match(/\bdata-company-name\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] ??
    firstTagText(html, "a", (tag) => /(?:^|["'\s])\/company\//i.test(tag));

  return {
    companyName: companyName ? nullableString(companyName, 500) : null,
    datePosted: null,
    employmentType: null,
    industry: null,
    location: null,
    occupationalCategory: null,
    title: title ? nullableString(stripTitleSuffix(title), 500) : null,
    validThrough: null,
  };
}

function htmlCanonicalUrl(html: string): string | null {
  const canonical = firstAttributeValue(html, "link", "href", (tag) =>
    /\brel\s*=\s*["']canonical["']/i.test(tag),
  );
  if (canonical) return canonical;
  return firstAttributeValue(html, "meta", "content", (tag) =>
    /\b(?:property|name)\s*=\s*["']og:url["']/i.test(tag),
  );
}

function parseWantedHtmlFallback(input: {
  expectedUrl: string;
  html: string;
}): ParsedJobPosting {
  const canonicalUrl = htmlCanonicalUrl(input.html);
  if (canonicalUrl && canonicalWantedUrl(canonicalUrl) !== input.expectedUrl) {
    throw new JobPostingParseError("URL_MISMATCH");
  }

  const content = visibleHtml(input.html);
  const metadata = htmlMetadata(input.html);
  const description = removeWantedNonPostingContent(
    normalizeJobPostingText(content),
  );
  const hasJobSections =
    /(?:주요\s*업무|자격\s*요건|우대\s*사항|포지션\s*상세|responsibilities|requirements|preferred)/i.test(
      description,
    );

  if (!metadata.title || !metadata.companyName || !hasJobSections) {
    throw new JobPostingParseError("PARSER_STRUCTURE_CHANGED");
  }
  if (
    !description ||
    description.length < JOB_POSTING_MANUAL_CONTENT_MIN_LENGTH
  ) {
    throw new JobPostingParseError("INVALID_JOB_POSTING");
  }
  if (description.length > JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH) {
    throw new JobPostingParseError("CONTENT_TOO_LARGE");
  }

  const normalizedContent = buildNormalizedContent(metadata, description);
  return {
    contentHashInput: normalizedContent,
    normalizedContent,
    parserVersion: WANTED_HTML_PARSER_VERSION,
    rawContent: description,
    source: "wanted_html",
    sourceMetadata: metadata,
    sections: extractJobPostingSections(description),
  };
}

export function parseAiExtractedJobPosting(input: {
  expectedUrl: string;
  extraction: JobPostingAiExtraction;
  html: string;
}): ParsedJobPosting {
  const canonicalUrl = htmlCanonicalUrl(input.html);
  if (canonicalUrl && canonicalWantedUrl(canonicalUrl) !== input.expectedUrl) {
    throw new JobPostingParseError("URL_MISMATCH");
  }

  const sourceText = normalizeJobPostingText(visibleHtml(input.html));
  const title = nullableString(input.extraction.title, 500);
  const companyName = nullableString(input.extraction.companyName, 500);
  const description = nullableString(input.extraction.description, 100_000);
  const evidence = input.extraction.evidence
    .map((item) => normalizeJobPostingText(item.excerpt))
    .filter((item) => item && sourceText.includes(item));

  if (!title || !companyName || !description) {
    throw new JobPostingParseError("INVALID_JOB_POSTING");
  }
  if (description.length < JOB_POSTING_MANUAL_CONTENT_MIN_LENGTH) {
    throw new JobPostingParseError("INVALID_JOB_POSTING");
  }
  if (!evidence.length) {
    throw new JobPostingParseError("INVALID_JOB_POSTING");
  }

  const metadata: JobPostingSourceMetadata = {
    companyName,
    datePosted: null,
    employmentType: null,
    industry: null,
    location: null,
    occupationalCategory: null,
    title,
    validThrough: null,
  };
  const normalizedContent = buildNormalizedContent(metadata, description);
  return {
    contentHashInput: normalizedContent,
    normalizedContent,
    parserVersion: WANTED_AI_PARSER_VERSION,
    rawContent: description,
    source: "wanted_ai",
    sourceMetadata: metadata,
    sections: extractJobPostingSections(description),
  };
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
  if (posting) {
    const sourceUrl = nullableString(posting.url, 2_000);
    if (sourceUrl && canonicalWantedUrl(sourceUrl) !== input.expectedUrl) {
      throw new JobPostingParseError("URL_MISMATCH");
    }

    const metadata = metadataFromPosting(posting);
    const descriptionValue = nullableString(posting.description, 200_000);
    const description = descriptionValue
      ? normalizeJobPostingText(descriptionValue)
      : "";
    if (
      metadata.title &&
      metadata.companyName &&
      description &&
      description.length <= JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH
    ) {
      // Wanted's JSON-LD is useful for identity and metadata, but its
      // description can be a shortened SEO representation of the posting.
      // Prefer the validated visible posting body when it contains the real
      // section structure; otherwise keep the JSON-LD-only fallback.
      try {
        const visibleDescription = visibleJobPostingDescription(input.html);
        const visibleSections = extractJobPostingSections(visibleDescription);
        const hasStructuredBody = Object.values(visibleSections).some(Boolean);
        if (
          hasStructuredBody &&
          visibleDescription.length >
            buildNormalizedContent(metadata, description).length
        ) {
          return {
            contentHashInput: buildNormalizedContent(
              metadata,
              visibleDescription,
            ),
            normalizedContent: buildNormalizedContent(
              metadata,
              visibleDescription,
            ),
            parserVersion: WANTED_HTML_PARSER_VERSION,
            rawContent: visibleDescription,
            source: "wanted_html",
            sourceMetadata: {
              ...htmlMetadata(input.html),
              companyName: metadata.companyName,
              title: metadata.title,
            },
            sections: visibleSections,
          };
        }
      } catch {
        // A valid JSON-LD posting remains an acceptable source when the
        // rendered HTML layout is unavailable or has changed.
      }
      const normalizedContent = buildNormalizedContent(metadata, description);
      return {
        contentHashInput: normalizedContent,
        normalizedContent,
        parserVersion: WANTED_JSON_LD_PARSER_VERSION,
        rawContent: description,
        source: "wanted_json_ld",
        sourceMetadata: metadata,
        sections: extractJobPostingSections(description),
      };
    }
  }

  try {
    return parseWantedHtmlFallback(input);
  } catch (error) {
    if (
      posting &&
      error instanceof JobPostingParseError &&
      error.code === "PARSER_STRUCTURE_CHANGED"
    ) {
      throw new JobPostingParseError("INVALID_JOB_POSTING");
    }
    throw error;
  }
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
    sections: extractJobPostingSections(normalized),
  };
}
