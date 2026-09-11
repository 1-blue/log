import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as z from "zod";

import {
  AnalysisEventCallbackSchema,
  AnalysisResultCallbackSchema,
  AnalysisResultSchema,
  N8nDispatchPayloadSchema
} from "../src/index.js";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const schemaDirectory = join(rootDirectory, "schemas");
const checkOnly = process.argv.includes("--check");

const schemas = {
  "analysis-event-callback.schema.json": AnalysisEventCallbackSchema,
  "analysis-result-callback.schema.json": AnalysisResultCallbackSchema,
  "analysis-result.schema.json": AnalysisResultSchema,
  "n8n-dispatch.schema.json": N8nDispatchPayloadSchema
} as const;

for (const [filename, schema] of Object.entries(schemas)) {
  const generated = `${JSON.stringify(
    z.toJSONSchema(schema, { target: "draft-07" }),
    null,
    2
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
