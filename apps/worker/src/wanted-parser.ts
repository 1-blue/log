import {
  JOB_POSTING_FETCH_MAX_BYTES,
  JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH,
  JOB_POSTING_MANUAL_CONTENT_MIN_LENGTH,
  type JobPostingAiExtraction,
  type JobPostingCollectionErrorCode,
  type JobPostingBodySections,
  JobPostingBodySectionsSchema,
  type JobPostingSnapshotSource,
  type JobPostingSourceMetadata,
} from "@workspace/contracts";

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

const WANTED_NON_POSTING_MARKERS = [
  /^(?:더 많은 포지션을 찾아 볼까요\??|탐색하기)$/i,
  /^(?:지원할 만한 매력적인 포지션들이 기다리고 있어요\.?|포지션 탐색)$/i,
  /^(?:©\s*저작권자|본 채용정보는|원티드랩의 동의 없이)/i,
  /^(?:관련 채용공고|추천 포지션|채용공고 더보기)$/i,
];

function removeWantedNonPostingContent(value: string): string {
  const lines = value.split("\n");
  const cutoff = lines.findIndex((line) =>
    WANTED_NON_POSTING_MARKERS.some((marker) => marker.test(line.trim())),
  );
  return (cutoff >= 0 ? lines.slice(0, cutoff) : lines).join("\n").trim();
}

function cleanSectionValue(key: SectionKey, value: string): string | null {
  const cleaned = removeWantedNonPostingContent(value).trim();
  if (!cleaned) return null;
  if (
    key === "technologies" &&
    /^(?:풀\s*)?태그(?:\s*[|·])?$/i.test(cleaned.replace(/\n/g, " "))
  ) {
    return null;
  }
  return cleaned;
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

type SectionKey = keyof JobPostingBodySections;

const SECTION_HEADINGS: Array<{ key: SectionKey; pattern: RegExp }> = [
  { key: "companyIntroduction", pattern: /^회사\s*소개$/i },
  { key: "positionIntroduction", pattern: /^(?:직무|포지션)\s*소개$/i },
  { key: "expectations", pattern: /^기대\s*모습$/i },
  {
    key: "mainResponsibilities",
    pattern: /^(?:주요\s*업무|담당\s*업무|responsibilities)$/i,
  },
  { key: "requirements", pattern: /^(?:자격\s*요건|자격요건|requirements)$/i },
  { key: "preferred", pattern: /^(?:우대\s*사항|우대사항|preferred)$/i },
  {
    key: "employmentConditions",
    pattern: /^(?:고용\s*조건|근무\s*조건|employment\s*conditions?)$/i,
  },
  {
    key: "process",
    pattern: /^(?:채용\s*절차|전형\s*절차|진행\s*절차|process)$/i,
  },
  { key: "benefits", pattern: /^(?:복리\s*후생|복지|benefits?)$/i },
  {
    key: "technologies",
    pattern: /^(?:기술\s*스택|기술스택|사용\s*기술|technologies?)$/i,
  },
  { key: "traits", pattern: /^(?:인재상|traits?)$/i },
  { key: "deadline", pattern: /^(?:마감일|마감|deadline)$/i },
  { key: "location", pattern: /^(?:근무\s*지역|근무지|location)$/i },
];

const SECTION_MAX_LENGTH: Record<SectionKey, number> = {
  companyIntroduction: 20_000,
  positionIntroduction: 20_000,
  expectations: 20_000,
  mainResponsibilities: 30_000,
  requirements: 30_000,
  preferred: 30_000,
  employmentConditions: 10_000,
  process: 10_000,
  benefits: 10_000,
  technologies: 10_000,
  traits: 10_000,
  deadline: 2_000,
  location: 2_000,
  other: 20_000,
};

function sectionHeading(line: string): { key: SectionKey } | null {
  const candidate = line
    .replace(/^[\s\-•·▸▶|]+|[\s:：]+$/g, "")
    .replace(/[\t ]+/g, " ")
    .trim();
  return (
    SECTION_HEADINGS.find(({ pattern }) => pattern.test(candidate)) ?? null
  );
}

export function extractJobPostingSections(
  description: string,
): JobPostingBodySections {
  const sections: Record<SectionKey, string | null> = {
    companyIntroduction: null,
    positionIntroduction: null,
    expectations: null,
    mainResponsibilities: null,
    requirements: null,
    preferred: null,
    employmentConditions: null,
    process: null,
    benefits: null,
    technologies: null,
    traits: null,
    deadline: null,
    location: null,
    other: null,
  };
  let current: SectionKey | null = null;
  const other: string[] = [];
  const content = Object.fromEntries(
    Object.keys(sections).map((key) => [key, []]),
  ) as unknown as Record<SectionKey, string[]>;

  const sectionBoundary =
    /(?:회사\s*소개|(?:직무|포지션)\s*소개|기대\s*모습|주요\s*업무|담당\s*업무|자격\s*요건|자격요건|우대\s*사항|우대사항|고용\s*조건|근무\s*조건|채용\s*절차|전형\s*절차|복리\s*후생|기술\s*스택|기술스택|인재상|마감일|근무\s*지역|근무지)/gi;
  const sectionSafeText = description.replace(sectionBoundary, "\n$&\n");
  for (const rawLine of sectionSafeText.split("\n")) {
    const line = rawLine.trim();
    const heading = sectionHeading(line);
    if (heading) {
      current = heading.key;
      continue;
    }
    if (!line) continue;
    if (current) content[current].push(line);
    else other.push(line);
  }

  for (const { key } of SECTION_HEADINGS) {
    const value = cleanSectionValue(key, content[key].join("\n"));
    sections[key] = value ? value.slice(0, SECTION_MAX_LENGTH[key]) : null;
  }
  const otherText = cleanSectionValue("other", other.join("\n"));
  sections.other = otherText
    ? otherText.slice(0, SECTION_MAX_LENGTH.other)
    : null;
  return JobPostingBodySectionsSchema.parse(sections);
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
