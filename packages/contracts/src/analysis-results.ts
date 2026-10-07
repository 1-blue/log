import * as z from "zod";

import {
  AnalysisRequirementKindSchema,
  EvidenceSchema,
  MatchStatusSchema,
  PrioritySchema,
} from "./common";
import { JobPostingBodySectionsSchema } from "./job-postings";

export const AnalysisRequirementSchema = z.strictObject({
  id: z.string().min(1).max(100),
  kind: AnalysisRequirementKindSchema,
  text: z.string().min(1).max(2_000),
  evidence: z.array(EvidenceSchema).min(1).max(10),
});

export const AnalysisTechnologySchema = z.strictObject({
  name: z.string().min(1).max(200),
  category: z.string().max(200).nullable(),
  evidence: z.array(EvidenceSchema).min(1).max(10),
});

export const AnalysisTraitSchema = z.strictObject({
  text: z.string().min(1).max(1_000),
  evidence: z.array(EvidenceSchema).min(1).max(10),
});

export const RequirementMatchSchema = z.strictObject({
  requirementId: z.string().min(1).max(100),
  status: MatchStatusSchema,
  rationale: z.string().min(1).max(2_000),
  experienceSummary: z.string().max(1_000).nullable().default(null),
  profileEvidence: z.array(EvidenceSchema).max(10),
});

export const ProfileComparisonSchema = z.strictObject({
  summary: z.string().min(1).max(3_000),
  matches: z.array(RequirementMatchSchema).max(40),
  gaps: z
    .array(
      z.strictObject({
        title: z.string().min(1).max(300),
        description: z.string().min(1).max(2_000),
        priority: PrioritySchema,
        requirementIds: z.array(z.string().min(1).max(100)).max(10),
        evidence: z.array(EvidenceSchema).max(10),
        actions: z.array(z.string().min(1).max(1_000)).max(10),
      }),
    )
    .max(20),
  interviewQuestions: z
    .array(
      z.strictObject({
        category: z.string().min(1).max(200),
        question: z.string().min(1).max(2_000),
        intent: z.string().min(1).max(2_000),
        priority: PrioritySchema,
        requirementIds: z.array(z.string().min(1).max(100)).max(10),
        answerOutline: z.string().max(3_000).nullable().default(null),
        modelAnswer: z.string().max(5_000).nullable().default(null),
        answerEvidence: z.array(EvidenceSchema).max(10).default([]),
      }),
    )
    .max(30),
  applicationStrategy: z.strictObject({
    motivationDraft: z.string().max(5_000).nullable(),
    keyMessages: z.array(z.string().min(1).max(1_000)).max(10),
    resumeFocus: z.string().max(2_000).nullable(),
    portfolioFocus: z.string().max(2_000).nullable(),
    resumeSuggestions: z
      .array(
        z.strictObject({
          title: z.string().min(1).max(200),
          reason: z.string().min(1).max(1_000),
          action: z.string().min(1).max(1_000),
        }),
      )
      .max(5)
      .default([]),
    portfolioSuggestions: z
      .array(
        z.strictObject({
          title: z.string().min(1).max(200),
          reason: z.string().min(1).max(1_000),
          action: z.string().min(1).max(1_000),
        }),
      )
      .max(5)
      .default([]),
    warnings: z.array(z.string().min(1).max(1_000)).max(10),
  }),
  warnings: z.array(z.string().min(1).max(1_000)).max(20),
});

export type ProfileComparison = z.infer<typeof ProfileComparisonSchema>;

export const JobPostingFactsSchema = z.strictObject({
  title: z.string().max(500).nullable(),
  companyName: z.string().max(500).nullable(),
  summary: z.string().min(1).max(5_000),
  bodySections: JobPostingBodySectionsSchema,
  requirements: z.array(AnalysisRequirementSchema).max(40),
  technologies: z.array(AnalysisTechnologySchema).max(40),
  traits: z.array(AnalysisTraitSchema).max(20),
  warnings: z.array(z.string().min(1).max(1_000)).max(20),
});

export type JobPostingFacts = z.infer<typeof JobPostingFactsSchema>;

export const AnalysisResultSchema = z.strictObject({
  job: JobPostingFactsSchema,
  comparison: ProfileComparisonSchema,
  fitScore: z.number().int().min(0).max(100),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

const MATCH_WEIGHTS: Record<z.infer<typeof MatchStatusSchema>, number> = {
  matched: 1,
  partial: 0.5,
  missing: 0,
  unknown: 0,
};

export function calculateAnalysisFitScore(
  requirements: JobPostingFacts["requirements"],
  matches: ProfileComparison["matches"],
): number {
  const matchByRequirement = new Map(
    matches.map((match) => [match.requirementId, match.status]),
  );
  const scoreKind = (kind: z.infer<typeof AnalysisRequirementKindSchema>) => {
    const relevant = requirements.filter(
      (requirement) => requirement.kind === kind,
    );
    if (relevant.length === 0) return null;
    return (
      relevant.reduce(
        (total, requirement) =>
          total +
          (MATCH_WEIGHTS[matchByRequirement.get(requirement.id) ?? "unknown"] ??
            0),
        0,
      ) / relevant.length
    );
  };

  const required = scoreKind("required");
  const preferred = scoreKind("preferred");
  if (required === null && preferred === null) return 0;
  if (required === null) return Math.round((preferred ?? 0) * 100);
  if (preferred === null) return Math.round(required * 100);
  return Math.round(required * 70 + preferred * 30);
}
