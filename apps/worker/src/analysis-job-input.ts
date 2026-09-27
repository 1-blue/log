import {
  ANALYSIS_DISPATCH_DOCUMENT_TEXT_MAX_LENGTH,
  ANALYSIS_DISPATCH_JOB_POSTING_TEXT_MAX_LENGTH,
} from "@workspace/contracts";

const DOCUMENT_TEXT_MAX_LENGTH = 80_000;
const DOCUMENT_TEXT_HEAD_LENGTH = 40_000;
const DOCUMENT_TEXT_MIDDLE_LENGTH = 20_000;
const DOCUMENT_TEXT_TAIL_LENGTH = 20_000;
const OMISSION_MARKER = "\n\n[...중간 일부 생략...]\n\n";
export const JOB_POSTING_TEXT_MAX_LENGTH = 100_000;
export const ANALYSIS_STALE_AFTER_MS = 20 * 60 * 1_000;

function prepareAnalysisDispatchText(
  text: string,
  maxLength: number,
): { inputTextLength: number; text: string; truncated: boolean } {
  const normalized = text.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= maxLength) {
    return {
      inputTextLength: normalized.length,
      text: normalized,
      truncated: false,
    };
  }

  const tailLength = Math.min(8_000, Math.floor(maxLength / 4));
  const headLength = maxLength - tailLength - OMISSION_MARKER.length;
  return {
    inputTextLength: maxLength,
    text: `${normalized.slice(0, headLength)}${OMISSION_MARKER}${normalized.slice(-tailLength)}`,
    truncated: true,
  };
}

export function prepareAnalysisDispatchDocumentText(text: string) {
  return prepareAnalysisDispatchText(
    text,
    ANALYSIS_DISPATCH_DOCUMENT_TEXT_MAX_LENGTH,
  );
}

export function prepareAnalysisDispatchJobPostingText(text: string) {
  return prepareAnalysisDispatchText(
    text,
    ANALYSIS_DISPATCH_JOB_POSTING_TEXT_MAX_LENGTH,
  );
}

export function prepareAnalysisDocumentText(text: string): {
  originalLength: number;
  text: string;
  truncated: boolean;
} {
  const normalized = text.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= DOCUMENT_TEXT_MAX_LENGTH) {
    return {
      originalLength: normalized.length,
      text: normalized,
      truncated: false,
    };
  }

  const middleStart = Math.floor(
    (normalized.length - DOCUMENT_TEXT_MIDDLE_LENGTH) / 2,
  );
  return {
    originalLength: normalized.length,
    text: [
      normalized.slice(0, DOCUMENT_TEXT_HEAD_LENGTH),
      OMISSION_MARKER,
      normalized.slice(middleStart, middleStart + DOCUMENT_TEXT_MIDDLE_LENGTH),
      OMISSION_MARKER,
      normalized.slice(-DOCUMENT_TEXT_TAIL_LENGTH),
    ].join(""),
    truncated: true,
  };
}

export function prepareAnalysisJobPostingText(text: string): string {
  const normalized = text.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= JOB_POSTING_TEXT_MAX_LENGTH) return normalized;
  const tailLength = 20_000;
  const headLength =
    JOB_POSTING_TEXT_MAX_LENGTH - tailLength - OMISSION_MARKER.length;
  return `${normalized.slice(0, headLength)}${OMISSION_MARKER}${normalized.slice(-tailLength)}`;
}
