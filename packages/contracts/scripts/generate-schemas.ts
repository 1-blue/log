import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as z from "zod";

import {
  AnalysisEventCallbackSchema,
  AnalysisResultCallbackSchema,
  AnalysisResultSchema,
  DocumentAnalysisProfileSchema,
  DocumentExtractionCallbackSchema,
  JobPostingAiExtractionSchema,
  JobPostingFactsSchema,
  N8nDispatchPayloadSchema,
  N8nDocumentExtractionDispatchPayloadSchema,
  N8nJobPostingExtractionDispatchPayloadSchema,
  ProfileComparisonSchema,
  JobPostingAnalysisProfileSchema,
} from "../src/index.js";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const schemaDirectory = join(rootDirectory, "schemas");
const checkOnly = process.argv.includes("--check");

const schemas = {
  "analysis-event-callback.schema.json": AnalysisEventCallbackSchema,
  "job-posting-facts.schema.json": JobPostingFactsSchema,
  "job-posting-ai-extraction.schema.json": JobPostingAiExtractionSchema,
  "analysis-result-callback.schema.json": AnalysisResultCallbackSchema,
  "analysis-result.schema.json": AnalysisResultSchema,
  "document-analysis-profile.schema.json": DocumentAnalysisProfileSchema,
  "n8n-dispatch.schema.json": N8nDispatchPayloadSchema,
  "n8n-job-posting-extraction.schema.json":
    N8nJobPostingExtractionDispatchPayloadSchema,
  "document-extraction-callback.schema.json": DocumentExtractionCallbackSchema,
  "n8n-document-extraction.schema.json":
    N8nDocumentExtractionDispatchPayloadSchema,
  "profile-comparison.schema.json": ProfileComparisonSchema,
  "job-posting-analysis-profile.schema.json": JobPostingAnalysisProfileSchema,
} as const;

for (const [filename, schema] of Object.entries(schemas)) {
  const generated = `${JSON.stringify(
    z.toJSONSchema(schema, { target: "draft-07" }),
    null,
    2,
  )}\n`;
  const destination = join(schemaDirectory, filename);

  if (checkOnly) {
    const current = await readFile(destination, "utf8");
    if (current !== generated) {
      throw new Error(`${filename} is out of date. Run pnpm generate-schemas.`);
    }
    continue;
  }

  await writeFile(destination, generated, "utf8");
}
