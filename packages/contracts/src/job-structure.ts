import * as z from "zod";

import { JobPostingFactsSchema } from "./analysis-results";
import {
  JobPostingAiEvidenceSchema,
  JobPostingSourceMetadataSchema,
} from "./job-postings";

export const JOB_STRUCTURE_VERSION = "job-structure-v2" as const;
export const JOB_STRUCTURE_MODEL = "gpt-5.6-luna" as const;
export const JOB_STRUCTURE_PROMPT_VERSION = "job-structure-v2" as const;

// One response serves both the posting screen and later suitability analysis.
// Incomplete source content is distinct from legitimately unmentioned fields.
export const JobPostingStructuredExtractionSchema = z.strictObject({
  sourceComplete: z.boolean(),
  metadata: JobPostingSourceMetadataSchema,
  facts: JobPostingFactsSchema,
  evidence: z.array(JobPostingAiEvidenceSchema).min(1).max(30),
});
export type JobPostingStructuredExtraction = z.infer<
  typeof JobPostingStructuredExtractionSchema
>;
