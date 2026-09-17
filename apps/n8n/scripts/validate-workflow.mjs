import { readFile } from "node:fs/promises";

import {
  classifyCallbackFailure,
  classifyOpenAiFailure,
} from "./analysis-retry-policy.mjs";
import { classifyCollectionFetch } from "./collection-policy.mjs";
import { classifySlackDelivery } from "./slack-notification-policy.mjs";

const workflow = JSON.parse(
  await readFile(
    new URL("../workflows/career-analysis.json", import.meta.url),
    "utf8",
  ),
);
const fixtures = JSON.parse(
  await readFile(
    new URL("./workflow-policy-fixtures.json", import.meta.url),
    "utf8",
  ),
);
const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  workflow.versionId === fixtures.workflowVersionId,
  "fixture가 현재 Workflow versionId와 동기화되지 않았습니다.",
);
assert(
  workflow.meta?.careerOpsPolicyVersion === fixtures.policyVersion,
  "fixture와 Workflow 정책 버전이 일치하지 않습니다.",
);

for (const name of [
  "HMAC 요청 검증",
  "Slack 알림 요청 여부",
  "Slack 에러 채널 여부",
  "Slack Bot 메시지 전송",
  "Slack 에러 Webhook 전송",
  "Slack 결과 분류",
  "Slack 429 재시도 여부",
  "Slack 재시도 대기",
  "Slack 재시도 회차 증가",
  "Slack 재시도 에러 채널 여부",
  "Slack Bot 메시지 재시도",
  "Slack 에러 Webhook 재시도",
  "Slack 재시도 결과 분류",
  "Slack Callback 구성",
  "Slack Callback 서명",
  "Slack Callback 전송",
  "분석 요청 여부",
  "문서 추출 요청 여부",
  "문서 PDF 다운로드",
  "PDF 텍스트 추출",
  "문서 추출 결과 구성",
  "문서 추출 실패 구성",
  "AI 원문 보완 요청 여부",
  "AI 원문 보완 준비",
  "OpenAI 공고 원문 보완",
  "AI 원문 보완 결과 구성",
  "AI 원문 보완 실패 구성",
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
assert(
  hmacCode.includes("slack_notification"),
  "Slack 알림 payload 검증이 없습니다.",
);
assert(
  hmacCode.includes("job_posting_extraction"),
  "AI 원문 보완 payload 검증이 없습니다.",
);
assert(
  hmacCode.includes("document_extraction"),
  "문서 추출 payload 검증이 없습니다.",
);
assert(hmacCode.includes("payload?.runAttempt"), "실행 회차 검증이 없습니다.");

const documentDownload = nodes.get("문서 PDF 다운로드");
assert(
  documentDownload.parameters.options.response.response.responseFormat ===
    "file",
  "문서 다운로드는 PDF binary 응답을 사용해야 합니다.",
);
assert(
  documentDownload.parameters.options.response.response.fullResponse === false,
  "문서 다운로드는 전체 HTTP 응답을 본문으로 변환하면 안 됩니다.",
);
const documentExtract = nodes.get("PDF 텍스트 추출");
assert(
  documentExtract.type === "n8n-nodes-base.extractFromFile" &&
    documentExtract.parameters.operation === "pdf" &&
    documentExtract.parameters.binaryPropertyName === "data",
  "PDF 텍스트 추출 노드 설정이 올바르지 않습니다.",
);

const expectedOpenAi = [
  ["OpenAI 공고 원문 보완", 4000, "medium", "job_posting_ai_extraction"],
  ["OpenAI 공고 사실 분석", 6000, "medium", "job_posting_facts"],
  ["OpenAI 공고 사실 분석 재시도", 6000, "medium", "job_posting_facts"],
  ["OpenAI 프로필 비교", 32000, "high", "profile_comparison"],
  ["OpenAI 프로필 비교 재시도", 32000, "high", "profile_comparison"],
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
    node.parameters.modelId.value === "gpt-5.6-luna",
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
    typeof format.schema === "string" &&
      format.schema.includes("JSON.stringify(") &&
      !format.schema.includes("JSON.stringify(JSON.stringify("),
    `${name} Schema는 JSON 문자열로 직렬화해야 합니다.`,
  );
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

for (const name of ["Slack Bot 메시지 전송", "Slack Bot 메시지 재시도"]) {
  const node = nodes.get(name);
  assert(
    node.parameters.url === "https://slack.com/api/chat.postMessage",
    `${name}은 Slack 공식 메시지 API를 사용해야 합니다.`,
  );
  assert(
    node.parameters.nodeCredentialType === "slackApi",
    `${name}은 n8n Slack Credential을 사용해야 합니다.`,
  );
  assert(
    node.parameters.body.includes("thread_ts") &&
      node.parameters.body.includes("reply_broadcast: false") &&
      node.parameters.body.includes("unfurl_links: false"),
    `${name}의 스레드 또는 unfurl 정책이 없습니다.`,
  );
}
for (const name of ["Slack 에러 Webhook 전송", "Slack 에러 Webhook 재시도"]) {
  const node = nodes.get(name);
  assert(
    node.parameters.url === "={{ $env.SLACK_ERROR_WEBHOOK_URL }}",
    `${name}은 에러 채널 Webhook 환경변수를 사용해야 합니다.`,
  );
}
const slackClassifier = nodes.get("Slack 결과 분류").parameters.jsCode;
assert(
  slackClassifier.includes("status === 429") &&
    slackClassifier.includes("retryAfter <= 60") &&
    slackClassifier.includes("SLACK_DELIVERY_UNKNOWN"),
  "Slack 응답의 단일 재시도와 불명확 전송 분류가 없습니다.",
);
assert(
  nodes.get("Slack Callback 전송").parameters.options.response.response
    .neverError === true,
  "Slack 결과 callback은 Worker 응답 상태를 오류 원문 없이 종료해야 합니다.",
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
for (const fixture of fixtures.collection) {
  const input = { ...fixture.input };
  if (Number.isInteger(input.bodyRepeat))
    input.body = "x".repeat(input.bodyRepeat);
  const result = classifyCollectionFetch(input);
  assert(
    result.outcome === fixture.expected.outcome,
    `수집 fixture 실패 (${fixture.name}): outcome`,
  );
  if (fixture.expected.responseNull) {
    assert(
      result.response === null,
      `수집 fixture 실패 (${fixture.name}): response`,
    );
  }
  if (fixture.expected.status) {
    assert(
      result.response?.status === fixture.expected.status,
      `수집 fixture 실패 (${fixture.name}): status`,
    );
  }
  if (typeof fixture.expected.bodyPresent === "boolean") {
    assert(
      Boolean(result.response?.body) === fixture.expected.bodyPresent,
      `수집 fixture 실패 (${fixture.name}): body`,
    );
  }
}

for (const fixture of fixtures.openAi) {
  const result = classifyOpenAiFailure({
    ...fixture.input,
    nowMs: fixtureNow,
    seed: fixture.name,
  });
  assert(
    result.code === fixture.expected.code,
    `OpenAI fixture 실패 (${fixture.name}): code`,
  );
  assert(
    result.automaticRetry === fixture.expected.automaticRetry,
    `OpenAI fixture 실패 (${fixture.name}): retry`,
  );
}

for (const fixture of fixtures.callback) {
  const result = classifyCallbackFailure(fixture.input);
  assert(
    result.retryable === fixture.expected.retryable,
    `Callback fixture 실패 (${fixture.name}): retryable`,
  );
  assert(
    result.shouldRetry === fixture.expected.shouldRetry,
    `Callback fixture 실패 (${fixture.name}): retry`,
  );
}

for (const fixture of fixtures.slack) {
  const result = classifySlackDelivery(fixture.input);
  assert(
    result.outcome === fixture.expected.outcome,
    `Slack fixture 실패 (${fixture.name}): outcome`,
  );
  assert(
    result.shouldRetry === fixture.expected.shouldRetry,
    `Slack fixture 실패 (${fixture.name}): retry`,
  );
  if (fixture.expected.errorCode) {
    assert(
      result.error?.code === fixture.expected.errorCode,
      `Slack fixture 실패 (${fixture.name}): error code`,
    );
  }
}

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

const slackSuccess = classifySlackDelivery({
  attempt: 1,
  body: { channel: "C0123456789", ok: true, ts: "1710000000.000001" },
  status: 200,
  target: "job_root",
});
assert(
  slackSuccess.outcome === "sent" &&
    slackSuccess.channelId === "C0123456789" &&
    slackSuccess.messageTs === "1710000000.000001",
  "Slack Bot 성공 응답의 channel과 ts를 보존해야 합니다.",
);
assert(
  classifySlackDelivery({
    attempt: 1,
    headers: { "retry-after": "30" },
    status: 429,
    target: "job_thread",
  }).shouldRetry,
  "60초 이하의 Slack 429는 한 번 재시도해야 합니다.",
);
assert(
  !classifySlackDelivery({
    attempt: 2,
    headers: { "retry-after": "1" },
    status: 429,
    target: "job_thread",
  }).shouldRetry,
  "Slack 알림은 두 번을 초과해 전송하면 안 됩니다.",
);
assert(
  classifySlackDelivery({
    attempt: 1,
    networkError: true,
    target: "job_root",
  }).outcome === "delivery_unknown",
  "네트워크 오류는 중복 방지를 위해 delivery_unknown이어야 합니다.",
);
assert(
  classifySlackDelivery({
    attempt: 1,
    body: { error: "invalid_auth", ok: false },
    status: 200,
    target: "job_root",
  }).error.code === "SLACK_AUTHENTICATION_FAILED",
  "Slack 설정 오류를 구체적인 코드로 분류해야 합니다.",
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
  !/xox[baprs]-[A-Za-z0-9-]+/.test(serialized),
  "Workflow에 Slack Token이 포함되어 있습니다.",
);
assert(
  !/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/.test(serialized),
  "Workflow에 Slack Webhook URL이 포함되어 있습니다.",
);
assert(
  !serialized.includes("message.slice(0, 500)"),
  "외부 오류 원문을 callback으로 전달하면 안 됩니다.",
);

console.log("n8n Workflow 정적 검증을 통과했습니다.");
