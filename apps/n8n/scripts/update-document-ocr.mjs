import { readFileSync, writeFileSync } from "node:fs";
import { ocrWorkflowNodes, extractionCallbackCode } from "./document-ocr.mjs";

const path = new URL("../workflows/career-analysis.json", import.meta.url);
const workflow = JSON.parse(readFileSync(path, "utf8"));
const credentials = workflow.nodes.find(
  (node) => node.name === "OpenAI 프로필 비교",
).credentials;
for (const node of ocrWorkflowNodes(credentials)) {
  const index = workflow.nodes.findIndex(
    (existing) => existing.name === node.name,
  );
  if (index < 0) {
    if (node.name !== "문서 PDF 페이지 렌더링")
      throw new Error(`기존 OCR 노드가 없습니다: ${node.name}`);
    workflow.nodes.push(node);
    continue;
  }
  const previous = workflow.nodes[index];
  workflow.nodes[index] = {
    ...node,
    id: previous.id,
    position: previous.position,
    ...(previous.webhookId ? { webhookId: previous.webhookId } : {}),
  };
}
const removed = new Set(["PDF 텍스트 추출", "문서 OCR 판정", "자동 OCR 필요"]);
workflow.nodes = workflow.nodes.filter((node) => !removed.has(node.name));
for (const name of removed) delete workflow.connections[name];
workflow.connections["문서 PDF 다운로드"].main[0] = [
  { node: "문서 PDF 페이지 렌더링", type: "main", index: 0 },
];
workflow.connections["문서 PDF 페이지 렌더링"] = {
  main: [
    [{ node: "문서 OCR 요청 구성", type: "main", index: 0 }],
    [{ node: "문서 OCR 최종 실패", type: "main", index: 0 }],
  ],
};
workflow.nodes.find(
  (node) => node.name === "문서 추출 결과 구성",
).parameters.jsCode = extractionCallbackCode();
writeFileSync(path, `${JSON.stringify(workflow, null, 2)}\n`);
