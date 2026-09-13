import { readFile } from "node:fs/promises";

import {
  classifyCallbackFailure,
  classifyOpenAiFailure,
} from "./analysis-retry-policy.mjs";

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
  "OpenAI 공고 사실 분석 재시도",
  "OpenAI 프로필 비교",
  "OpenAI 프로필 비교 재시도",
  "공고 사실 오류 분류",
  "공고 사실 자동 재시도 여부",
  "공고 재시도 대기",
  "프로필 비교 오류 분류",
  "프로필 비교 자동 재시도 여부",
  "프로필 재시도 대기",
  "분석 실패 이벤트 구성",
  "분석 Callback 서명",
  "분석 Callback 전송",
  "분석 Callback 결과 분류",
  "분석 Callback 재시도 여부",
  "분석 Callback 재시도 대기",
  "분석 Callback 최종 실패",
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
assert(hmacCode.includes("payload?.runAttempt"), "실행 회차 검증이 없습니다.");

const expectedOpenAi = [
  ["OpenAI 공고 사실 분석", 6000, "low", "job_posting_facts"],
  ["OpenAI 공고 사실 분석 재시도", 6000, "low", "job_posting_facts"],
  ["OpenAI 프로필 비교", 10000, "medium", "profile_comparison"],
  ["OpenAI 프로필 비교 재시도", 10000, "medium", "profile_comparison"],
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
  assert(node.retryOnFail !== true, `${name}의 포괄 재시도는 금지됩니다.`);
  assert(
    node.onError === "continueErrorOutput",
    `${name}은 오류 분류 출력이 필요합니다.`,
  );
}

for (const name of ["공고 재시도 대기", "프로필 재시도 대기"]) {
  const node = nodes.get(name);
  assert(
    node.type === "n8n-nodes-base.wait",
    `${name}은 Wait 노드여야 합니다.`,
  );
}

for (const name of [
  "분석 시작 이벤트 구성",
  "프로필 분석 Heartbeat 구성",
  "공고 재시도 Heartbeat 구성",
  "프로필 재시도 Heartbeat 구성",
]) {
  const code = nodes.get(name).parameters.jsCode;
  assert(code.includes("runAttempt"), `${name}에 실행 회차가 없습니다.`);
  assert(code.includes("stepAttempt"), `${name}에 단계 회차가 없습니다.`);
  assert(code.includes("retryAt"), `${name}에 재시도 시각 필드가 없습니다.`);
}

for (const name of ["분석 결과 구성", "프로필 재시도 결과 구성"]) {
  assert(
    nodes.get(name).parameters.jsCode.includes("runAttempt"),
    `${name}에 실행 회차가 없습니다.`,
  );
}
for (const name of [
  "공고 사실 결과 확정",
  "공고 사실 재시도 결과 확정",
  "분석 결과 구성",
  "프로필 재시도 결과 구성",
]) {
  assert(
    nodes.get(name).onError === "continueErrorOutput",
    `${name}의 미완료·스키마 오류 분기가 없습니다.`,
  );
}

const callbackSend = nodes.get("분석 Callback 전송");
assert(
  callbackSend.parameters.options.response.response.neverError === true,
  "Callback 응답은 상태 코드를 직접 분류해야 합니다.",
);
assert(
  callbackSend.onError === "continueErrorOutput",
  "Callback 네트워크 오류 분기가 없습니다.",
);
const callbackClassifier =
  nodes.get("분석 Callback 결과 분류").parameters.jsCode;
assert(
  callbackClassifier.includes("status === 429") &&
    callbackClassifier.includes("status >= 500") &&
    callbackClassifier.includes("callbackAttempt < 3"),
  "Callback의 선택적 최대 3회 재시도 정책이 없습니다.",
);

const ids = workflow.nodes.map((node) => node.id);
assert(new Set(ids).size === ids.length, "중복된 n8n 노드 ID가 있습니다.");
for (const [source, outputs] of Object.entries(workflow.connections)) {
  assert(nodes.has(source), `연결 출발 노드가 없습니다: ${source}`);
  for (const targets of outputs.main ?? []) {
    for (const target of targets) {
      assert(
        nodes.has(target.node),
        `연결 대상 노드가 없습니다: ${target.node}`,
      );
    }
  }
}

const reachable = new Set(["수집 요청 수신"]);
const queue = ["수집 요청 수신"];
while (queue.length > 0) {
  const source = queue.shift();
  const outputs = workflow.connections[source]?.main ?? [];
  for (const target of outputs.flat()) {
    if (!reachable.has(target.node)) {
      reachable.add(target.node);
      queue.push(target.node);
    }
  }
}
for (const name of nodes.keys()) {
  assert(reachable.has(name), `도달할 수 없는 n8n 노드가 있습니다: ${name}`);
}

const fixtureNow = Date.parse("2026-09-13T00:00:00.000Z");
const transient = classifyOpenAiFailure({
  attempt: 1,
  error: { status: 503 },
  nowMs: fixtureNow,
  seed: "event-1",
});
assert(transient.automaticRetry, "OpenAI 5xx는 첫 호출에서 재시도해야 합니다.");
assert(
  transient.waitSeconds >= 2 && transient.waitSeconds < 3,
  "Retry-After가 없으면 2초와 결정적 jitter를 사용해야 합니다.",
);
assert(
  !classifyOpenAiFailure({
    attempt: 1,
    error: { message: "insufficient_quota billing limit", status: 429 },
  }).automaticRetry,
  "결제·quota 제한은 자동 재시도하면 안 됩니다.",
);
assert(
  !classifyOpenAiFailure({
    attempt: 1,
    error: { retryAfter: 61, status: 429 },
  }).automaticRetry,
  "60초를 넘는 Retry-After는 Workflow 안에서 기다리면 안 됩니다.",
);
assert(
  !classifyOpenAiFailure({ attempt: 2, error: { status: 500 } }).automaticRetry,
  "OpenAI 단계 호출은 두 번을 초과하면 안 됩니다.",
);
assert(
  classifyOpenAiFailure({
    attempt: 1,
    error: { message: "OpenAI response incomplete" },
  }).code === "OPENAI_INCOMPLETE",
  "미완료 응답은 별도 오류로 분류해야 합니다.",
);
assert(
  !classifyOpenAiFailure({
    attempt: 1,
    error: { message: "Structured schema output is missing" },
  }).automaticRetry,
  "스키마 오류는 자동 재시도하면 안 됩니다.",
);
assert(
  classifyCallbackFailure({ attempt: 2, status: 503 }).shouldRetry,
  "Callback 5xx는 세 번째 전송까지 재시도해야 합니다.",
);
assert(
  !classifyCallbackFailure({ attempt: 1, status: 400 }).shouldRetry,
  "Callback 4xx는 재시도하면 안 됩니다.",
);

const serialized = JSON.stringify(workflow);
assert(
  !/sk-[A-Za-z0-9_-]{16,}/.test(serialized),
  "Workflow에 OpenAI API Key가 포함되어 있습니다.",
);
assert(
  !serialized.includes("OPENAI_API_KEY"),
  "Workflow가 OpenAI 환경변수에 의존합니다.",
);
assert(
  !serialized.includes("message.slice(0, 500)"),
  "외부 오류 원문을 callback으로 전달하면 안 됩니다.",
);

console.log("n8n Workflow 정적 검증을 통과했습니다.");
