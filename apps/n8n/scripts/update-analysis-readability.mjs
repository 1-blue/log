import { readFileSync, writeFileSync } from "node:fs";
const path = new URL("../workflows/career-analysis.json", import.meta.url);
const workflow = JSON.parse(readFileSync(path, "utf8"));
const guide =
  "\n가독성 규칙: summary는 핵심 결론·강점·보완점을 짧은 문단으로 나누고 문단 사이에 줄바꿈을 넣으세요. matches.experienceSummary는 해당 요구사항과 연결되는 경험을 1~2문장으로 요약하세요. 요약은 원문 복사가 아니라 해석이며, 원문에 없는 경험이나 수치·성과를 추가하지 마세요. profileEvidence.excerpt는 요약하지 말고 원문에 정확히 존재하는 연속 문자열을 유지하세요. applicationStrategy.resumeSuggestions와 portfolioSuggestions는 각각 최대 5개로, title(강조할 경험), reason(공고와 연결되는 이유), action(구체적인 문서 수정 방법)을 구분하세요. 기존 resumeFocus와 portfolioFocus도 간단한 전체 방향으로 작성하세요. 없는 경험을 추가하도록 제안하지 말고, 확인되지 않은 내용은 확인이 필요하다고 설명하세요.";
for (const name of ["OpenAI 프로필 비교", "OpenAI 프로필 비교 재시도"]) {
  const node = workflow.nodes.find((node) => node.name === name);
  const message = node.parameters.responses.values.find(
    (message) => message.role === "system",
  );
  if (!message) throw new Error(`System prompt missing: ${name}`);
  if (!message.content.includes("가독성 규칙:")) message.content += guide;
}
for (const node of workflow.nodes)
  if (typeof node.parameters?.jsCode === "string")
    node.parameters.jsCode = node.parameters.jsCode.replaceAll(
      "promptVersion: 'profile-match-v1'",
      "promptVersion: 'profile-match-v2-readability'",
    );
writeFileSync(path, `${JSON.stringify(workflow, null, 2)}\n`);
