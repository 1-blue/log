import { readFileSync, writeFileSync } from "node:fs";

const output = process.argv[2];
if (!output) throw new Error("미게시 검증용 JSON 저장 경로를 지정하세요.");
const workflow = JSON.parse(
  readFileSync(
    new URL("../workflows/career-analysis.json", import.meta.url),
    "utf8",
  ),
);
workflow.name = "[QA 미게시] Career Ops 배치 검증";
workflow.active = false;
workflow.pinData = {};
for (const key of [
  "id",
  "versionId",
  "activeVersionId",
  "createdAt",
  "updatedAt",
  "shared",
])
  delete workflow[key];
for (const node of workflow.nodes) {
  delete node.credentials;
  if (node.type === "n8n-nodes-base.webhook") {
    node.disabled = true;
    node.parameters.path = "career-layout-preview-only";
    delete node.webhookId;
  }
}
writeFileSync(output, JSON.stringify(workflow, null, 2), { mode: 0o600 });
