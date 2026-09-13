import { readFile } from "node:fs/promises";

const workflow = JSON.parse(
  await readFile(
    new URL("../workflows/career-analysis.json", import.meta.url),
    "utf8",
  ),
);
const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const name of [
  "HMAC 요청 검증",
  "분석 요청 여부",
  "수동 원문 여부",
  "Wanted HTML 수집",
  "OpenAI 공고 사실 분석",
  "OpenAI 프로필 비교",
  "분석 결과 구성",
  "Worker Callback 전송",
]) {
  assert(nodes.has(name), `필수 n8n 노드가 없습니다: ${name}`);
}

const hmacCode = nodes.get("HMAC 요청 검증").parameters.jsCode;
assert(
  hmacCode.includes("job_posting_collection"),
  "수집 payload 검증이 없습니다.",
);
assert(
  hmacCode.includes("application_analysis"),
  "분석 payload 검증이 없습니다.",
);

const expectedOpenAi = [
  ["OpenAI 공고 사실 분석", 6000, "low", "job_posting_facts"],
  ["OpenAI 프로필 비교", 10000, "medium", "profile_comparison"],
];
for (const [name, maxTokens, effort, schemaName] of expectedOpenAi) {
  const node = nodes.get(name);
  const options = node.parameters.options;
  const format = options.textFormat.textOptions;
  assert(
    node.type === "@n8n/n8n-nodes-langchain.openAi",
    `${name} 노드 타입이 다릅니다.`,
  );
  assert(node.typeVersion === 2.2, `${name}은 OpenAI V2.2여야 합니다.`);
  assert(
    node.parameters.modelId.value === "gpt-5.4-mini-2026-03-17",
    `${name} 모델이 고정되지 않았습니다.`,
  );
  assert(
    options.store === false,
    `${name}은 OpenAI 응답을 저장하면 안 됩니다.`,
  );
  assert(options.serviceTier === "default", `${name} service tier가 다릅니다.`);
  assert(options.maxTokens === maxTokens, `${name} 토큰 제한이 다릅니다.`);
  assert(
    options.reasoning.reasoningOptions.effort === effort,
    `${name} reasoning 설정이 다릅니다.`,
  );
  assert(
    format.type === "json_schema" && format.strict === true,
    `${name} Structured Outputs 설정이 없습니다.`,
  );
  assert(format.name === schemaName, `${name} 출력 스키마 이름이 다릅니다.`);
  assert(
    node.maxTries === 2 && node.waitBetweenTries === 2000,
    `${name} 재시도 제한이 다릅니다.`,
  );
}

const serialized = JSON.stringify(workflow);
assert(
  !/sk-[A-Za-z0-9_-]{16,}/.test(serialized),
  "Workflow에 OpenAI API Key가 포함되어 있습니다.",
);
assert(
  !serialized.includes("OPENAI_API_KEY"),
  "Workflow가 OpenAI 환경변수에 의존합니다.",
);

console.log("n8n Workflow 정적 검증을 통과했습니다.");
