import {
  JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH,
  JOB_POSTING_MANUAL_CONTENT_MIN_LENGTH,
  JOB_STRUCTURE_MODEL,
  JOB_STRUCTURE_PROMPT_VERSION,
  JOB_STRUCTURE_VERSION,
  type JobPostingFacts,
  type JobPostingStructuredExtraction,
  JobPostingStructuredExtractionSchema,
} from "@workspace/contracts";

import { jobSourceText } from "./job-source-text.js";

export class JobStructureError extends Error {
  constructor(readonly code: "INVALID_JOB_POSTING" | "CONTENT_TOO_LARGE") {
    super(code);
  }
}

export function validateJobStructure(input: {
  extraction: JobPostingStructuredExtraction;
  sourceText: string;
  collectionRunId: string;
}) {
  const result = JobPostingStructuredExtractionSchema.safeParse(
    input.extraction,
  );
  const sourceText = jobSourceText(input.sourceText);
  if (sourceText.length > JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH)
    throw new JobStructureError("CONTENT_TOO_LARGE");
  if (
    !result.success ||
    sourceText.length < JOB_POSTING_MANUAL_CONTENT_MIN_LENGTH
  )
    throw new JobStructureError("INVALID_JOB_POSTING");
  const extraction = result.data;
  const searchable = sourceText.replace(/\s+/g, " ");
  const contains = (excerpt: string) =>
    searchable.includes(jobSourceText(excerpt).replace(/\s+/g, " "));
  if (
    !extraction.sourceComplete ||
    !extraction.metadata.title?.trim() ||
    !extraction.metadata.companyName?.trim() ||
    !extraction.facts.bodySections.mainResponsibilities ||
    !extraction.facts.bodySections.requirements ||
    !extraction.facts.requirements.some(
      (requirement) => requirement.kind === "required",
    ) ||
    !extraction.evidence.every((item) => contains(item.excerpt))
  )
    throw new JobStructureError("INVALID_JOB_POSTING");
  const evidence = [
    ...extraction.facts.requirements,
    ...extraction.facts.technologies,
    ...extraction.facts.traits,
  ].flatMap((item) => item.evidence);
  if (
    !evidence.every(
      (item) =>
        item.source === "job_posting" &&
        item.sourceVersionId === input.collectionRunId &&
        contains(item.excerpt),
    )
  ) {
    throw new JobStructureError("INVALID_JOB_POSTING");
  }
  if (
    extraction.facts.title !== extraction.metadata.title ||
    extraction.facts.companyName !== extraction.metadata.companyName
  )
    throw new JobStructureError("INVALID_JOB_POSTING");
  const normalizedContent = [
    `회사명: ${extraction.metadata.companyName}`,
    `공고명: ${extraction.metadata.title}`,
    "",
    sourceText,
  ].join("\n");
  return {
    sourceText,
    normalizedContent,
    metadata: extraction.metadata,
    facts: extraction.facts,
    sections: extraction.facts.bodySections,
    contentHashInput: JSON.stringify({
      sourceText,
      version: JOB_STRUCTURE_VERSION,
      prompt: JOB_STRUCTURE_PROMPT_VERSION,
      model: JOB_STRUCTURE_MODEL,
    }),
  };
}

export function bindJobFactsToSnapshot(
  facts: JobPostingFacts,
  snapshotId: string,
): JobPostingFacts {
  const evidence = (
    items: JobPostingFacts["requirements"][number]["evidence"],
  ) => items.map((item) => ({ ...item, sourceVersionId: snapshotId }));
  return {
    ...facts,
    requirements: facts.requirements.map((item) => ({
      ...item,
      evidence: evidence(item.evidence),
    })),
    technologies: facts.technologies.map((item) => ({
      ...item,
      evidence: evidence(item.evidence),
    })),
    traits: facts.traits.map((item) => ({
      ...item,
      evidence: evidence(item.evidence),
    })),
  };
}
