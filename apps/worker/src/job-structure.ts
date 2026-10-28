import {
  JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH,
  JOB_POSTING_MANUAL_CONTENT_MIN_LENGTH,
  JOB_STRUCTURE_MODEL,
  JOB_STRUCTURE_PROMPT_VERSION,
  JOB_STRUCTURE_VERSION,
  type JobPostingCollectionErrorCode,
  type JobPostingFacts,
  JobPostingStructuredExtractionSchema,
} from "@workspace/contracts";

import * as z from "zod";

import { jobSourceText } from "./job-source-text.js";
import { toOpenAiStructuredOutputSchema } from "./openai-schema.js";

const diagnosticFields = new Set([
  "sourceComplete",
  "metadata",
  "facts",
  "evidence",
  "title",
  "companyName",
  "datePosted",
  "validThrough",
  "employmentType",
  "location",
  "industry",
  "occupationalCategory",
  "summary",
  "bodySections",
  "requirements",
  "technologies",
  "traits",
  "warnings",
  "id",
  "kind",
  "text",
  "name",
  "category",
  "source",
  "sourceVersionId",
  "section",
  "excerpt",
  "context",
  "companyIntroduction",
  "positionIntroduction",
  "expectations",
  "mainResponsibilities",
  "preferred",
  "employmentConditions",
  "process",
  "benefits",
  "deadline",
  "other",
]);

function safeSchemaIssues(error: z.ZodError): string {
  return JSON.stringify(
    error.issues.slice(0, 10).map((issue) => ({
      code: issue.code,
      path: issue.path
        .slice(0, 10)
        .map((part) =>
          typeof part === "number"
            ? Math.min(part, 9999)
            : diagnosticFields.has(String(part))
              ? part
              : "*",
        ),
    })),
  );
}

export function jobStructureOutputSchema() {
  return toOpenAiStructuredOutputSchema(
    z.toJSONSchema(JobPostingStructuredExtractionSchema, {
      target: "draft-07",
    }),
    { preserveValidationConstraints: true },
  );
}

export class JobStructureError extends Error {
  constructor(
    readonly code: JobPostingCollectionErrorCode,
    readonly schemaIssue?: string,
  ) {
    super(code);
  }
}

export function validateJobStructure(input: {
  extraction: unknown;
  sourceText: string;
  collectionRunId: string;
}) {
  const result = JobPostingStructuredExtractionSchema.safeParse(
    input.extraction,
  );
  const sourceText = jobSourceText(input.sourceText);
  if (sourceText.length > JOB_POSTING_MANUAL_CONTENT_MAX_LENGTH)
    throw new JobStructureError("CONTENT_TOO_LARGE");
  if (sourceText.length < JOB_POSTING_MANUAL_CONTENT_MIN_LENGTH)
    throw new JobStructureError("SOURCE_TEXT_EMPTY");
  if (!result.success)
    throw new JobStructureError(
      "AI_RESPONSE_INVALID",
      safeSchemaIssues(result.error),
    );
  const extraction = result.data;
  const searchable = sourceText.replace(/\s+/g, " ");
  const contains = (excerpt: string) => {
    const quote = jobSourceText(excerpt).replace(/\s+/g, " ");
    return quote.length > 0 && searchable.includes(quote);
  };
  const separateQuotes = <T extends { excerpt: string }>(
    items: T[],
    limit: number,
  ): T[] => {
    const normalized = items.flatMap((item) => {
      if (contains(item.excerpt)) return [item];
      const lines = item.excerpt
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      // A model may collect non-adjacent source lines into one quote. Keep
      // them as distinct verbatim citations, never as a fabricated sentence.
      if (lines.length < 2 || !lines.every(contains))
        throw new JobStructureError("AI_EVIDENCE_MISMATCH");
      return lines.map((excerpt) => ({ ...item, excerpt }));
    });
    if (normalized.length > limit)
      throw new JobStructureError("AI_EVIDENCE_MISMATCH");
    return normalized;
  };
  // A usable posting need not describe duties, qualifications, benefits or a
  // deadline. Missing fields must stay unknown instead of being invented.
  if (!extraction.sourceComplete)
    throw new JobStructureError("SOURCE_NOT_JOB_POSTING");
  extraction.evidence = separateQuotes(extraction.evidence, 30);
  for (const items of [
    extraction.facts.requirements,
    extraction.facts.technologies,
    extraction.facts.traits,
  ])
    for (const item of items) item.evidence = separateQuotes(item.evidence, 10);
  const evidence = [
    ...extraction.facts.requirements,
    ...extraction.facts.technologies,
    ...extraction.facts.traits,
  ].flatMap((item) => item.evidence);
  if (
    !evidence.every(
      (item) =>
        item.source === "job_posting" &&
        item.sourceVersionId === input.collectionRunId,
    )
  )
    throw new JobStructureError("AI_SOURCE_MISMATCH");
  if (!evidence.every((item) => contains(item.excerpt)))
    throw new JobStructureError("AI_EVIDENCE_MISMATCH");
  // IDs are local labels at this stage: no comparison or snapshot references
  // exist yet. Resolve model-generated collisions without dropping any facts.
  if (
    new Set(extraction.facts.requirements.map((item) => item.id)).size !==
    extraction.facts.requirements.length
  )
    extraction.facts.requirements = extraction.facts.requirements.map(
      (item, index) => ({
        ...item,
        id: `${item.kind}-${index + 1}`,
      }),
    );
  if (
    extraction.facts.title !== extraction.metadata.title ||
    extraction.facts.companyName !== extraction.metadata.companyName
  )
    throw new JobStructureError("AI_METADATA_MISMATCH");
  const missing = [
    !extraction.metadata.title?.trim() && "공고 제목",
    !extraction.metadata.companyName?.trim() && "회사명",
    !extraction.facts.bodySections.mainResponsibilities?.trim() && "주요 업무",
    !extraction.facts.bodySections.requirements?.trim() && "자격요건",
    !extraction.facts.bodySections.preferred?.trim() && "우대사항",
  ].filter(Boolean);
  const warnings = [
    ...(missing.length
      ? [
          `원문에서 ${missing.join("·")}을 확인하지 못했습니다. 미기재 또는 복사 누락일 수 있으니 원문을 확인해 주세요. 없는 정보는 추측하지 않았습니다.`,
        ]
      : []),
    ...(extraction.facts.requirements.length === 0
      ? [
          "비교할 필수·우대 요구사항이 없어 적합도 점수를 산정할 수 없습니다. 0점이나 불합격을 의미하지 않습니다.",
        ]
      : []),
    ...extraction.facts.warnings,
  ];
  const facts = {
    ...extraction.facts,
    warnings: [...new Set(warnings)].slice(0, 20),
  };
  const normalizedContent = [
    ...(extraction.metadata.companyName
      ? [`회사명: ${extraction.metadata.companyName}`]
      : []),
    ...(extraction.metadata.title
      ? [`공고명: ${extraction.metadata.title}`]
      : []),
    "",
    sourceText,
  ].join("\n");
  return {
    sourceText,
    normalizedContent,
    metadata: extraction.metadata,
    facts,
    sections: facts.bodySections,
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
