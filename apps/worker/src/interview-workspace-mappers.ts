import {
  ANALYSIS_DISPATCH_DOCUMENT_TEXT_MAX_LENGTH,
  ANALYSIS_DISPATCH_JOB_POSTING_TEXT_MAX_LENGTH,
  ANALYSIS_INPUT_POLICY_VERSION,
  type AnalysisInputAudit,
  AnalysisInputAuditSchema,
  type AnalysisMatchCounts,
  type AnalysisRequirementReview,
  type AnalysisResult,
  AnalysisResultSchema,
  type AnalysisReview,
  AnalysisStepSchema,
  calculateAnalysisFitScore,
  type InterviewAnswerRevision,
  type InterviewChecklistItem,
  type InterviewNote,
} from "@workspace/contracts";

import {
  prepareAnalysisDispatchDocumentText,
  prepareAnalysisDispatchJobPostingText,
} from "./analysis-job-input.js";
import type {
  AnalysisJobRow,
  AnalysisResultRow,
  AnalysisReviewRow,
  AnswerRow,
  ChecklistRow,
  DocumentRow,
  ExecutionRow,
  NoteRow,
  RequirementReviewRow,
  SnapshotRow,
} from "./interview-workspace-types.js";
import { InterviewWorkspaceServiceError } from "./interview-workspace-types.js";

export function evidenceContext(
  sourceText: string,
  excerpt: string,
): string | null {
  const needle = excerpt.trim();
  const index = sourceText.indexOf(needle);
  if (index < 0) return null;

  // Display only the enclosing paragraph, not adjacent project/skill sections.
  // Keep source whitespace and quotation unchanged. A large paragraph is
  // reduced at sentence boundaries with explicit omissions, never mid-word.
  const before = sourceText.slice(0, index);
  const lastBreak = before.lastIndexOf("\n\n");
  const paragraphStart = lastBreak < 0 ? 0 : lastBreak + 2;
  const nextBreak = sourceText.indexOf("\n\n", index + needle.length);
  const paragraphEnd = nextBreak < 0 ? sourceText.length : nextBreak;
  const paragraph = sourceText
    .slice(Math.max(0, paragraphStart), paragraphEnd)
    .trim();
  if (paragraph.length <= 4_000) return paragraph || null;
  const sentenceBoundaries = [
    ...sourceText.matchAll(/[.!?。！？](?=\s|$)/g),
  ].map((match) => match.index! + 1);
  const start = sentenceBoundaries
    .filter((end) => end <= index && end >= index - 700)
    .pop();
  const end = sentenceBoundaries.find(
    (end) => end >= index + needle.length && end <= index + needle.length + 700,
  );
  const context = sourceText
    .slice(start ?? index, end ?? index + needle.length)
    .trim();
  return `… 앞부분 생략 …\n\n${context}\n\n… 뒷부분 생략 …`;
}

export function enrichResultEvidence(
  result: AnalysisResult,
  job: AnalysisJobRow,
): AnalysisResult {
  const sourceText = {
    job_posting: job.job_posting_text,
    portfolio: job.portfolio_text,
    resume: job.resume_text,
  } as const;
  const enrich = (
    evidence: AnalysisResult["job"]["requirements"][number]["evidence"][number],
  ) => ({
    ...evidence,
    context: evidenceContext(sourceText[evidence.source], evidence.excerpt),
  });

  return {
    ...result,
    comparison: {
      ...result.comparison,
      gaps: result.comparison.gaps.map((gap) => ({
        ...gap,
        evidence: gap.evidence.map(enrich),
      })),
      interviewQuestions: result.comparison.interviewQuestions.map(
        (question) => ({
          ...question,
          answerEvidence: question.answerEvidence.map(enrich),
        }),
      ),
      matches: result.comparison.matches.map((match) => ({
        ...match,
        profileEvidence: match.profileEvidence.map(enrich),
      })),
    },
    job: {
      ...result.job,
      requirements: result.job.requirements.map((requirement) => ({
        ...requirement,
        evidence: requirement.evidence.map(enrich),
      })),
      technologies: result.job.technologies.map((technology) => ({
        ...technology,
        evidence: technology.evidence.map(enrich),
      })),
      traits: result.job.traits.map((trait) => ({
        ...trait,
        evidence: trait.evidence.map(enrich),
      })),
    },
  };
}

export function normalizedLength(value: string): number {
  return value.normalize("NFKC").replace(/\r\n?/g, "\n").trim().length;
}

export function mapInputAudit(
  job: AnalysisJobRow,
  snapshot: SnapshotRow,
  resume: DocumentRow,
  portfolio: DocumentRow,
): AnalysisInputAudit {
  const recorded = AnalysisInputAuditSchema.safeParse(job.input_audit);
  if (recorded.success) return recorded.data;

  const jobPostingStoredLength = normalizedLength(job.job_posting_text);
  const jobPostingOriginalLength = normalizedLength(
    snapshot.normalized_content,
  );
  const resumeInput = prepareAnalysisDispatchDocumentText(job.resume_text);
  const portfolioInput = prepareAnalysisDispatchDocumentText(
    job.portfolio_text,
  );
  const jobPostingInput = prepareAnalysisDispatchJobPostingText(
    job.job_posting_text,
  );

  return {
    documentTextMaxLength: ANALYSIS_DISPATCH_DOCUMENT_TEXT_MAX_LENGTH,
    includesPdf: Boolean(resume.storage_path && portfolio.storage_path),
    includesProfile: Boolean(
      job.resume_profile_id &&
        job.portfolio_profile_id &&
        job.job_posting_profile_id,
    ),
    jobPosting: {
      dispatchLength: jobPostingInput.inputTextLength,
      dispatchTruncated: jobPostingInput.truncated,
      originalLength: jobPostingOriginalLength,
      storedLength: jobPostingStoredLength,
      storedTruncated: jobPostingStoredLength < jobPostingOriginalLength,
      confirmedEvidenceCount: 0,
    },
    policyVersion: ANALYSIS_INPUT_POLICY_VERSION,
    portfolio: {
      dispatchLength: portfolioInput.inputTextLength,
      dispatchTruncated: portfolioInput.truncated,
      originalLength: job.portfolio_original_length,
      storedLength: normalizedLength(job.portfolio_text),
      storedTruncated: job.portfolio_truncated,
      confirmedEvidenceCount: 0,
    },
    jobPostingTextMaxLength: ANALYSIS_DISPATCH_JOB_POSTING_TEXT_MAX_LENGTH,
    resume: {
      dispatchLength: resumeInput.inputTextLength,
      dispatchTruncated: resumeInput.truncated,
      originalLength: job.resume_original_length,
      storedLength: normalizedLength(job.resume_text),
      storedTruncated: job.resume_truncated,
      confirmedEvidenceCount: 0,
    },
  };
}

export function mapAnswer(row: AnswerRow): InterviewAnswerRevision {
  return {
    answer: row.answer,
    createdAt: row.created_at,
    id: row.id,
    questionId: row.question_id,
    revision: row.revision,
  };
}

export function mapChecklist(row: ChecklistRow): InterviewChecklistItem {
  return {
    analysisJobId: row.analysis_job_id,
    archivedAt: row.archived_at,
    completedAt: row.completed_at,
    content: row.content,
    createdAt: row.created_at,
    id: row.id,
    position: row.position,
    priority: row.priority,
    source: row.source,
    sourceKey: row.source_key,
    updatedAt: row.updated_at,
  };
}

export function mapNote(row: NoteRow): InterviewNote {
  return {
    analysisJobId: row.analysis_job_id,
    applicationId: row.application_id,
    archivedAt: row.archived_at,
    content: row.content,
    createdAt: row.created_at,
    followUpActions: row.follow_up_actions,
    id: row.id,
    improvements: row.improvements,
    interviewedAt: row.interviewed_at,
    questionsAsked: row.questions_asked,
    roundLabel: row.round_label,
    updatedAt: row.updated_at,
    wentWell: row.went_well,
  };
}

export function mapExecution(row: ExecutionRow) {
  const parsed = AnalysisStepSchema.safeParse({
    attemptCount: row.attempt_count,
    inputTokens: row.input_tokens,
    latencyMs: row.latency_ms,
    model: row.model,
    outputTokens: row.output_tokens,
    promptVersion: row.prompt_version,
    responseId: row.response_id,
    step: row.step,
  });
  if (!parsed.success) throw new InterviewWorkspaceServiceError("unavailable");
  return parsed.data;
}

export function countMatches(
  matches: { status: "matched" | "missing" | "partial" | "unknown" }[],
): AnalysisMatchCounts {
  const counts: AnalysisMatchCounts = {
    matched: 0,
    missing: 0,
    partial: 0,
    unknown: 0,
  };
  for (const match of matches) counts[match.status] += 1;
  return counts;
}

export function mapReview(
  review: AnalysisReviewRow | null,
  requirements: RequirementReviewRow[],
): AnalysisReview {
  return {
    overallNote: review?.overall_note ?? null,
    requirements: requirements.map(
      (item): AnalysisRequirementReview => ({
        note: item.note,
        overrideStatus: item.override_status,
        requirementId: item.requirement_id,
      }),
    ),
    updatedAt: review?.updated_at ?? null,
  };
}

export function reviewedScore(
  resultRow: AnalysisResultRow | null,
  reviews: RequirementReviewRow[],
): number | null {
  if (!resultRow) return null;
  const parsed = AnalysisResultSchema.safeParse(resultRow.result);
  if (!parsed.success) throw new InterviewWorkspaceServiceError("unavailable");
  const overrides = new Map(
    reviews
      .filter((review) => review.override_status !== null)
      .map((review) => [review.requirement_id, review.override_status!]),
  );
  return calculateAnalysisFitScore(
    parsed.data.job.requirements,
    parsed.data.comparison.matches.map((match) => ({
      ...match,
      status: overrides.get(match.requirementId) ?? match.status,
    })),
  );
}

export function evidenceCoverage(result: AnalysisResult | null): number | null {
  if (!result) return null;
  const requirements = result.job.requirements;
  if (requirements.length === 0) return null;
  const matches = new Map(
    result.comparison.matches.map((match) => [match.requirementId, match]),
  );
  const verified = requirements.filter((requirement) =>
    (matches.get(requirement.id)?.profileEvidence ?? []).some(
      (evidence) =>
        evidence.source === "resume" || evidence.source === "portfolio",
    ),
  ).length;
  return Math.round((verified / requirements.length) * 100);
}
