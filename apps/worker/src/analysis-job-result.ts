import {
  type AnalysisJobResponse,
  type AnalysisResult,
  AnalysisResultSchema,
  calculateAnalysisFitScore,
  type DocumentEvidenceReview,
  DocumentEvidenceReviewSchema,
  type Evidence,
} from "@workspace/contracts";

import {
  type AnalysisJobRow,
  AnalysisJobServiceError,
  type AnalysisResultRow,
  type DocumentEvidenceReviewRow,
} from "./analysis-job-types.js";

function lastError(row: AnalysisJobRow) {
  if (!row.error_code || !row.error_message) return null;
  return {
    code: row.error_code,
    message: row.error_message,
    retryable: row.error_retryable,
  };
}

export function mapAnalysisJob(
  row: AnalysisJobRow,
  resultRow: AnalysisResultRow | null,
): AnalysisJobResponse {
  const parsedResult = resultRow
    ? AnalysisResultSchema.safeParse(resultRow.result)
    : null;
  if (parsedResult && !parsedResult.success) {
    throw new AnalysisJobServiceError("unavailable");
  }
  return {
    applicationId: row.application_id,
    attemptCount: row.attempt_count,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    id: row.id,
    jobPostingId: row.job_posting_id,
    jobPostingSnapshotId: row.job_posting_snapshot_id,
    lastHeartbeatAt: row.last_heartbeat_at,
    lastError: lastError(row),
    portfolioVersionId: row.portfolio_version_id,
    requestId: row.request_id,
    retryAt: row.retry_at,
    result: parsedResult?.data ?? null,
    resumeVersionId: row.resume_version_id,
    stage: row.stage,
    startedAt: row.started_at,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function evidenceMatchesSource(
  evidence: Evidence,
  job: AnalysisJobRow,
): boolean {
  const source =
    evidence.source === "job_posting"
      ? { id: job.job_posting_snapshot_id, text: job.job_posting_text }
      : evidence.source === "resume"
        ? { id: job.resume_version_id, text: job.resume_text }
        : { id: job.portfolio_version_id, text: job.portfolio_text };
  return (
    evidence.sourceVersionId === source.id &&
    source.text.includes(evidence.excerpt.trim())
  );
}

export function mapConfirmedEvidence(
  row: DocumentEvidenceReviewRow,
): DocumentEvidenceReview {
  return DocumentEvidenceReviewSchema.parse({
    createdAt: row.created_at,
    documentVersionId: row.document_version_id,
    evidenceKey: row.evidence_key,
    excerpt: row.excerpt,
    id: row.id,
    note: row.note,
    observation: row.observation,
    page: row.page,
    profileId: row.profile_id,
    section: row.section,
    status: row.status,
    updatedAt: row.updated_at,
  });
}

/**
 * Keep only citations that can be found in the exact document version used by
 * this analysis. Provider output occasionally paraphrases a profile summary
 * instead of quoting the source PDF; that citation must not be persisted as
 * if it were a verified fact.
 */
export function sanitizeAnalysisResult(
  result: AnalysisResult,
  job: AnalysisJobRow,
): AnalysisResult {
  let removedEvidence = 0;
  const filterEvidence = (
    evidence: Evidence[],
    predicate: (item: Evidence) => boolean = (item) =>
      evidenceMatchesSource(item, job),
  ) => {
    const filtered = evidence.filter(predicate);
    removedEvidence += evidence.length - filtered.length;
    return filtered;
  };

  const jobFacts = {
    ...result.job,
    requirements: result.job.requirements.map((requirement) => ({
      ...requirement,
      evidence: filterEvidence(
        requirement.evidence,
        (item) =>
          item.source === "job_posting" && evidenceMatchesSource(item, job),
      ),
    })),
    technologies: result.job.technologies.map((technology) => ({
      ...technology,
      evidence: filterEvidence(
        technology.evidence,
        (item) =>
          item.source === "job_posting" && evidenceMatchesSource(item, job),
      ),
    })),
    traits: result.job.traits.map((trait) => ({
      ...trait,
      evidence: filterEvidence(
        trait.evidence,
        (item) =>
          item.source === "job_posting" && evidenceMatchesSource(item, job),
      ),
    })),
  };

  const matches = result.comparison.matches.map((match) => {
    const profileEvidence = filterEvidence(
      match.profileEvidence,
      (item) =>
        item.source !== "job_posting" && evidenceMatchesSource(item, job),
    );
    const status =
      (match.status === "matched" || match.status === "partial") &&
      profileEvidence.length === 0
        ? "unknown"
        : match.status;
    return {
      ...match,
      profileEvidence,
      status,
      experienceSummary:
        profileEvidence.length > 0 ? match.experienceSummary : null,
    };
  });

  const gaps = result.comparison.gaps.map((gap) => ({
    ...gap,
    evidence: filterEvidence(gap.evidence),
  }));
  const interviewQuestions = result.comparison.interviewQuestions.map(
    (question) => {
      const answerEvidence = filterEvidence(
        question.answerEvidence,
        (item) =>
          item.source !== "job_posting" && evidenceMatchesSource(item, job),
      );
      return {
        ...question,
        answerEvidence,
        modelAnswer: answerEvidence.length > 0 ? question.modelAnswer : null,
      };
    },
  );

  const warnings =
    removedEvidence > 0
      ? [
          ...result.comparison.warnings,
          "일부 개인 자료 근거가 원문에서 확인되지 않아 해당 항목을 확인 불가로 처리했습니다.",
        ].slice(-20)
      : result.comparison.warnings;
  const comparison = {
    ...result.comparison,
    gaps,
    interviewQuestions,
    matches,
    warnings,
  };

  return {
    job: jobFacts,
    comparison,
    fitScore: calculateAnalysisFitScore(jobFacts.requirements, matches),
  };
}

export function validateAnalysisSemantics(
  result: AnalysisResult,
  job: AnalysisJobRow,
): { ok: true } | { ok: false; reason: string } {
  const ids = result.job.requirements.map((item) => item.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length)
    return { ok: false, reason: "duplicate_requirement_id" };

  const jobEvidence = [
    ...result.job.requirements.flatMap((item) => item.evidence),
    ...result.job.technologies.flatMap((item) => item.evidence),
    ...result.job.traits.flatMap((item) => item.evidence),
  ];
  if (
    jobEvidence.some(
      (evidence) =>
        evidence.source !== "job_posting" ||
        !evidenceMatchesSource(evidence, job),
    )
  ) {
    return { ok: false, reason: "invalid_job_evidence" };
  }

  const matchIds = result.comparison.matches.map((item) => item.requirementId);
  if (
    new Set(matchIds).size !== matchIds.length ||
    matchIds.length !== ids.length ||
    matchIds.some((id) => !uniqueIds.has(id))
  ) {
    return { ok: false, reason: "invalid_requirement_match" };
  }

  for (const match of result.comparison.matches) {
    if (
      match.profileEvidence.some(
        (evidence) =>
          evidence.source === "job_posting" ||
          !evidenceMatchesSource(evidence, job),
      ) ||
      ((match.status === "matched" || match.status === "partial") &&
        match.profileEvidence.length === 0)
    ) {
      return { ok: false, reason: "invalid_profile_evidence" };
    }
  }

  const references = [
    ...result.comparison.gaps.flatMap((gap) => gap.requirementIds),
    ...result.comparison.interviewQuestions.flatMap(
      (question) => question.requirementIds,
    ),
  ];
  if (references.some((id) => !uniqueIds.has(id))) {
    return { ok: false, reason: "unknown_requirement_reference" };
  }
  if (
    result.comparison.gaps
      .flatMap((gap) => gap.evidence)
      .some((evidence) => !evidenceMatchesSource(evidence, job))
  ) {
    return { ok: false, reason: "invalid_gap_evidence" };
  }

  for (const question of result.comparison.interviewQuestions) {
    if (
      question.answerEvidence.some(
        (evidence) =>
          evidence.source === "job_posting" ||
          !evidenceMatchesSource(evidence, job),
      )
    ) {
      return { ok: false, reason: "invalid_answer_evidence" };
    }
    if (question.modelAnswer !== null && question.answerEvidence.length === 0) {
      return { ok: false, reason: "answer_without_evidence" };
    }
  }

  const score = calculateAnalysisFitScore(
    result.job.requirements,
    result.comparison.matches,
  );
  if (score !== result.fitScore)
    return { ok: false, reason: "invalid_fit_score" };
  return { ok: true };
}
