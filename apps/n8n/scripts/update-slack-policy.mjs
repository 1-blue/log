import { readFileSync, writeFileSync } from "node:fs";
import { slackClassifierCode } from "./slack-notification-policy.mjs";
const path = new URL("../workflows/career-analysis.json", import.meta.url);
const workflow = JSON.parse(readFileSync(path, "utf8"));
for (const [name, retry] of [
  ["Slack 결과 분류", false],
  ["Slack 재시도 결과 분류", true],
])
  workflow.nodes.find((node) => node.name === name).parameters.jsCode =
    slackClassifierCode(retry);

const verification = workflow.nodes.find(
  (node) => node.name === "HMAC 요청 검증",
);
verification.parameters.jsCode = verification.parameters.jsCode.replace(
  "payload?.jobPostingId && ['job_root', 'job_thread', 'error_channel'].includes(payload?.target)",
  "(payload?.target === 'document' ? payload?.documentVersionId && payload?.jobPostingId === null : payload?.jobPostingId && !payload?.documentVersionId) && ['job_root', 'job_thread', 'error_channel', 'document'].includes(payload?.target)",
);
// Canonical signing uses actual newlines, not the two characters backslash+n.
for (const node of workflow.nodes)
  if (typeof node.parameters?.jsCode === "string") {
    node.parameters.jsCode = node.parameters.jsCode.replaceAll(
      ".join('\\\\n')",
      ".join('\\n')",
    );
  }
writeFileSync(path, `${JSON.stringify(workflow, null, 2)}\n`);
