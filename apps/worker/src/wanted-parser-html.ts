import {
  JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH,
  JOB_POSTING_MANUAL_CONTENT_MIN_LENGTH,
  type JobPostingSourceMetadata,
} from "@workspace/contracts";

import {
  buildNormalizedContent,
  canonicalWantedUrl,
  nullableString,
} from "./wanted-parser-support.js";
import {
  decodeEntities,
  extractJobPostingSections,
  normalizeJobPostingText,
  removeWantedNonPostingContent,
} from "./wanted-parser-text.js";
import {
  JobPostingParseError,
  type ParsedJobPosting,
  WANTED_HTML_PARSER_VERSION,
} from "./wanted-parser-types.js";

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

export function visibleHtml(html: string): string {
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

export function visibleJobPostingDescription(html: string): string {
  return removeWantedNonPostingContent(
    normalizeJobPostingText(visibleHtml(html)),
  );
}

function stripTitleSuffix(value: string): string {
  return value.replace(/\s*[|·-]\s*(?:wanted|원티드).*$/i, "").trim();
}

export function htmlMetadata(html: string): JobPostingSourceMetadata {
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

export function htmlCanonicalUrl(html: string): string | null {
  const canonical = firstAttributeValue(html, "link", "href", (tag) =>
    /\brel\s*=\s*["']canonical["']/i.test(tag),
  );
  if (canonical) return canonical;
  return firstAttributeValue(html, "meta", "content", (tag) =>
    /\b(?:property|name)\s*=\s*["']og:url["']/i.test(tag),
  );
}

export function parseWantedHtmlFallback(input: {
  expectedUrl: string;
  html: string;
}): ParsedJobPosting {
  const canonicalUrl = htmlCanonicalUrl(input.html);
  if (canonicalUrl && canonicalWantedUrl(canonicalUrl) !== input.expectedUrl) {
    throw new JobPostingParseError("URL_MISMATCH");
  }

  const metadata = htmlMetadata(input.html);
  const description = visibleJobPostingDescription(input.html);
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
