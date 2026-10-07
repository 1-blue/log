import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function preparePublication(source, exported, workflowId) {
  if (!/^[A-Za-z0-9_-]+$/.test(workflowId))
    throw new Error("운영 Workflow ID가 올바르지 않습니다.");
  const candidates = Array.isArray(exported) ? exported : [exported];
  const existing = candidates.find((workflow) => workflow.id === workflowId);
  if (!existing || !Array.isArray(existing.nodes))
    throw new Error(
      "기존 운영 Workflow를 찾지 못했습니다. import를 중단합니다.",
    );
  if (existing.active !== true)
    throw new Error(
      "지정한 Workflow는 현재 운영에 게시되지 않았습니다. 실제 운영 ID를 확인하세요.",
    );
  const workflow = structuredClone(source);
  workflow.id = existing.id;
  workflow.name = existing.name;
  workflow.active = false;
  for (const key of [
    "versionId",
    "activeVersionId",
    "createdAt",
    "updatedAt",
    "shared",
    "pinData",
  ])
    delete workflow[key];
  for (const node of workflow.nodes) {
    if (!node.credentials) continue;
    const previous = existing.nodes.find((item) => item.name === node.name);
    for (const kind of Object.keys(node.credentials)) {
      const preferred =
        previous?.credentials?.[kind] ??
        (kind === "openAiApi"
          ? existing.nodes.find((item) => item.name === "OpenAI 프로필 비교")
              ?.credentials?.[kind]
          : null);
      const refs = new Map(
        existing.nodes
          .map((item) => item.credentials?.[kind])
          .filter((ref) => ref?.id)
          .map((ref) => [ref.id, ref]),
      );
      const ref = preferred ?? (refs.size === 1 ? [...refs.values()][0] : null);
      if (!ref?.id)
        throw new Error(`운영 Credential 참조를 확인하지 못했습니다: ${kind}`);
      node.credentials[kind] = structuredClone(ref);
    }
  }
  return workflow;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [sourcePath, existingPath, outputPath, workflowId] =
    process.argv.slice(2);
  if (!sourcePath || !existingPath || !outputPath || !workflowId)
    throw new Error("source existing output workflowId 인자가 필요합니다.");
  const workflow = preparePublication(
    JSON.parse(readFileSync(sourcePath, "utf8")),
    JSON.parse(readFileSync(existingPath, "utf8")),
    workflowId,
  );
  writeFileSync(outputPath, JSON.stringify(workflow, null, 2), { mode: 0o600 });
}
