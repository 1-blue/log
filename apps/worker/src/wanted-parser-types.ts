import type {
  JobPostingBodySections,
  JobPostingCollectionErrorCode,
  JobPostingSnapshotSource,
  JobPostingSourceMetadata,
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
