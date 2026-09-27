import {
  JOB_POSTING_FETCH_MAX_BYTES,
  JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH,
  JOB_POSTING_MANUAL_CONTENT_MIN_LENGTH,
  type JobPostingAiExtraction,
  type JobPostingSourceMetadata,
} from "@workspace/contracts";

import {
  htmlCanonicalUrl,
  htmlMetadata,
  parseWantedHtmlFallback,
  visibleHtml,
  visibleJobPostingDescription,
} from "./wanted-parser-html.js";
import {
  findJsonLdJobPosting,
  metadataFromPosting,
} from "./wanted-parser-jsonld.js";
import {
  buildNormalizedContent,
  canonicalWantedUrl,
  nullableString,
} from "./wanted-parser-support.js";
import {
  extractJobPostingSections,
  normalizeJobPostingText,
} from "./wanted-parser-text.js";
import {
  JobPostingParseError,
  MANUAL_PARSER_VERSION,
  type ParsedJobPosting,
  WANTED_AI_PARSER_VERSION,
  WANTED_HTML_PARSER_VERSION,
  WANTED_JSON_LD_PARSER_VERSION,
} from "./wanted-parser-types.js";

export {
  extractJobPostingSections,
  normalizeJobPostingText,
} from "./wanted-parser-text.js";
export {
  JobPostingParseError,
  MANUAL_PARSER_VERSION,
  type ParsedJobPosting,
  WANTED_AI_PARSER_VERSION,
  WANTED_HTML_PARSER_VERSION,
  WANTED_JSON_LD_PARSER_VERSION,
} from "./wanted-parser-types.js";

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

  const posting = findJsonLdJobPosting(input.html);
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
      // Wanted's JSON-LD can contain a shortened SEO description. Prefer a
      // longer visible body only when it also preserves posting sections.
      try {
        const visibleDescription = visibleJobPostingDescription(input.html);
        const visibleSections = extractJobPostingSections(visibleDescription);
        const hasStructuredBody = Object.values(visibleSections).some(Boolean);
        if (
          hasStructuredBody &&
          visibleDescription.length >
            buildNormalizedContent(metadata, description).length
        ) {
          const normalizedContent = buildNormalizedContent(
            metadata,
            visibleDescription,
          );
          return {
            contentHashInput: normalizedContent,
            normalizedContent,
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
        // Valid JSON-LD remains acceptable when rendered HTML is unavailable.
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
