import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function verifyPublishedWorkflow(exported, workflowId, prepared) {
  const workflows = Array.isArray(exported) ? exported : [exported];
  const workflow = workflows.find((item) => item.id === workflowId);
  if (
    !workflow ||
    workflow.active !== true ||
    workflow.isArchived === true ||
    !workflow.versionId ||
    workflow.activeVersionId !== workflow.versionId
  ) {
    throw new Error("Imported workflow version is not published");
  }
  const expected = prepared.nodes.find(
    (node) => node.name === "HMAC 요청 검증",
  );
  const actual = workflow.nodes.find((node) => node.name === expected?.name);
  if (!expected || actual?.parameters?.jsCode !== expected.parameters.jsCode) {
    throw new Error(
      "Published authentication code does not match the prepared version",
    );
  }
}

export async function verifyWebhook(url, fetcher = fetch) {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  // Unsigned requests must reach the workflow and stop before any AI/DB action.
  const body = await response.json().catch(() => null);
  if (response.status !== 401 || body?.error?.code !== "INVALID_SIGNATURE") {
    throw new Error(
      `Webhook authentication probe failed (HTTP ${response.status})`,
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv[2] === "--probe") {
    await verifyWebhook(process.argv[3]);
    console.log(
      "Workflow webhook registration and unsigned-request rejection verified",
    );
  } else {
    verifyPublishedWorkflow(
      JSON.parse(readFileSync(process.argv[2], "utf8")),
      process.argv[3],
      JSON.parse(readFileSync(process.argv[4], "utf8")),
    );
    console.log("Imported workflow version publication verified");
  }
}
