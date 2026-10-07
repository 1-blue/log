import { readFileSync, writeFileSync } from "node:fs";
import { instrumentAiCalls } from "./ai-usage-policy.mjs";
const path = new URL("../workflows/career-analysis.json", import.meta.url);
const workflow = JSON.parse(readFileSync(path, "utf8"));
instrumentAiCalls(workflow);
writeFileSync(path, `${JSON.stringify(workflow, null, 2)}\n`);
