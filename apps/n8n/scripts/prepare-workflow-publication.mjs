import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const absent = Symbol("absent");
const equal = (left, right) => {
  if (left === absent || right === absent) return left === right;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => equal(item, right[index]))
    );
  if (left && right && typeof left === "object" && typeof right === "object")
    return (
      Object.keys(left).length === Object.keys(right).length &&
      Object.keys(left).every(
        (key) => key in right && equal(left[key], right[key]),
      )
    );
  return left === right;
};
function merge(base, local, remote, path) {
  if (equal(local, remote) || equal(remote, base)) return local;
  if (equal(local, base)) return remote;
  if (
    Array.isArray(base) &&
    Array.isArray(local) &&
    Array.isArray(remote) &&
    base.length === local.length &&
    base.length === remote.length
  )
    return local.map((item, index) =>
      merge(base[index], item, remote[index], `${path}[${index}]`),
    );
  const object = (value) =>
    value !== absent &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
  if ([base, local, remote].every(object)) {
    const result = {};
    for (const key of new Set([
      ...Object.keys(base),
      ...Object.keys(local),
      ...Object.keys(remote),
    ])) {
      const value = merge(
        key in base ? base[key] : absent,
        key in local ? local[key] : absent,
        key in remote ? remote[key] : absent,
        `${path}.${key}`,
      );
      if (value !== absent) result[key] = value;
    }
    return result;
  }
  throw new Error(
    `원격·로컬 설정 충돌: ${path}. 기존 운영 설정을 확인한 뒤 다시 배포하세요.`,
  );
}
// n8n re-exports omitted defaults and empty options differently. For nodes
// intentionally removed locally, only new/non-empty values need manual review.
function changedRemoteValue(base, remote) {
  if (equal(base, remote) || remote === undefined || remote === null)
    return false;
  if (Array.isArray(remote))
    return (
      remote.length > 0 &&
      (!Array.isArray(base) ||
        remote.length !== base.length ||
        remote.some((item, index) => changedRemoteValue(base[index], item)))
    );
  if (typeof remote === "object")
    return Object.keys(remote).some((key) =>
      changedRemoteValue(base?.[key], remote[key]),
    );
  return base !== remote;
}
const executionKeys = [
  "parameters",
  "type",
  "typeVersion",
  "disabled",
  "onError",
  "retryOnFail",
  "maxTries",
  "waitBetweenTries",
  "alwaysOutputData",
  "executeOnce",
  "continueOnFail",
  "notes",
  "notesInFlow",
];

export function preparePublication(source, exported, workflowId, baseline) {
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
  if (!baseline || !Array.isArray(baseline.nodes))
    throw new Error(
      "이전 배포 원본이 없습니다. 원격 수정 보존을 검증할 수 없어 import를 중단합니다.",
    );
  const localNames = new Set(source.nodes.map((node) => node.name));
  const baseNodes = new Map(baseline.nodes.map((node) => [node.name, node]));
  const remoteNodes = new Map(existing.nodes.map((node) => [node.name, node]));
  for (const node of existing.nodes) {
    if (node.type === "n8n-nodes-base.stickyNote") continue;
    const previous = baseNodes.get(node.name);
    if (!previous && !localNames.has(node.name))
      throw new Error(
        `원격에만 추가된 운영 노드가 있습니다: ${node.name}. import를 중단합니다.`,
      );
    if (
      previous &&
      !localNames.has(node.name) &&
      executionKeys.some((key) => changedRemoteValue(previous[key], node[key]))
    )
      throw new Error(
        `제거 예정 노드에 원격 수정이 있습니다: ${node.name}. import를 중단합니다.`,
      );
  }
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
    if (node.type !== "n8n-nodes-base.stickyNote" && baseNodes.has(node.name)) {
      const base = baseNodes.get(node.name),
        remote = remoteNodes.get(node.name);
      if (!remote)
        throw new Error(
          `원격에서 삭제한 노드가 로컬에 남아 있습니다: ${node.name}`,
        );
      for (const key of executionKeys) {
        const value = merge(
          key in base ? base[key] : absent,
          key in node ? node[key] : absent,
          key in remote ? remote[key] : absent,
          `${node.name}.${key}`,
        );
        if (value === absent) delete node[key];
        else node[key] = structuredClone(value);
      }
    }
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
  workflow.settings = merge(
    baseline.settings ?? {},
    source.settings ?? {},
    existing.settings ?? {},
    "settings",
  );
  workflow.connections = merge(
    baseline.connections ?? {},
    source.connections ?? {},
    existing.connections ?? {},
    "connections",
  );
  return workflow;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [sourcePath, existingPath, outputPath, workflowId, baselinePath] =
    process.argv.slice(2);
  if (
    !sourcePath ||
    !existingPath ||
    !outputPath ||
    !workflowId ||
    !baselinePath
  )
    throw new Error(
      "source existing output workflowId baseline 인자가 필요합니다.",
    );
  const workflow = preparePublication(
    JSON.parse(readFileSync(sourcePath, "utf8")),
    JSON.parse(readFileSync(existingPath, "utf8")),
    workflowId,
    JSON.parse(readFileSync(baselinePath, "utf8")),
  );
  writeFileSync(outputPath, JSON.stringify(workflow, null, 2), { mode: 0o600 });
}
