import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  instrumentAiCalls,
  readAiTokenUsage,
  usageSigningCode,
  usageResponseStatus,
} from "./ai-usage-policy.mjs";

test("usage keeps cache writes and missing usage is not zero", () => {
  assert.equal(readAiTokenUsage({}), null);
  assert.equal(readAiTokenUsage({ usage: { input_tokens: 100 } }), null);
  assert.deepEqual(
    readAiTokenUsage({
      usage: {
        input_tokens: 100,
        output_tokens: 10,
        input_tokens_details: { cached_tokens: 20, cache_write_tokens: 30 },
      },
    }),
    {
      inputTokens: 100,
      outputTokens: 10,
      cachedInputTokens: 20,
      cacheWriteTokens: 30,
    },
  );
  assert.equal(
    readAiTokenUsage({
      usage: {
        input_tokens: 5,
        output_tokens: 1,
        input_tokens_details: { cached_tokens: 6 },
      },
    }),
    null,
  );
  assert.equal(usageResponseStatus({ status: "incomplete" }), "failed");
  assert.equal(usageResponseStatus({}, true), "failed");
});
test("signed callbacks use the same newline canonical format as the Worker", async () => {
  const callback = {
    eventId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
  };
  const run = new Function(
    "$input",
    "$env",
    "require",
    `return (async()=>{${usageSigningCode()}})();`,
  );
  const [item] = await run(
    { first: () => ({ json: { callback } }) },
    {
      WORKER_CALLBACK_URL: "https://worker.example/v1/internal",
      WORKER_CALLBACK_SECRET: "fixture-secret",
    },
    () => ({ createHash, createHmac }),
  );
  const canonical = [
    "v1",
    item.json.headers.timestamp,
    callback.eventId,
    callback.requestId,
    "POST",
    "/v1/internal/ai-usage",
    createHash("sha256").update(item.json.body).digest("hex"),
  ].join("\n");
  assert.equal(
    item.json.headers.signature,
    "v1=" +
      createHmac("sha256", "fixture-secret").update(canonical).digest("hex"),
  );
  assert.equal(
    item.json.callbackUrl,
    "https://worker.example/v1/internal/ai-usage",
  );
});
test("every AI node has accounting before and after both outcomes, without double instrumentation", () => {
  const workflow = JSON.parse(
    readFileSync(
      new URL("../workflows/career-analysis.json", import.meta.url),
      "utf8",
    ),
  );
  const before = workflow.nodes.length;
  instrumentAiCalls(workflow);
  assert.equal(workflow.nodes.length, before);
  const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));
  const aiNodes = workflow.nodes.filter(
    (node) =>
      node.type === "@n8n/n8n-nodes-langchain.openAi" ||
      ["문서 자동 OCR", "문서 자동 OCR 재시도"].includes(node.name),
  );
  assert.equal(aiNodes.length, 7);
  for (const ai of aiNodes) {
    const prefix = `${ai.name} 사용량`;
    assert.ok(nodes.has(`${prefix} 시작`));
    assert.equal(nodes.get(`${prefix} 시작 기록`).retryOnFail, true);
    assert.equal(
      nodes.get(`${prefix} 시작 기록`).onError,
      "continueErrorOutput",
    );
    assert.equal(
      workflow.connections[`${prefix} 시작 기록`].main[1][0].node,
      `${prefix} 기록 실패`,
    );
    assert.deepEqual(
      workflow.connections[`${prefix} 기록 실패`].main[0],
      workflow.connections[`${prefix} 오류 전달`].main[0],
    );
    assert.equal(
      workflow.connections[`${prefix} 시작 기록`].main[0][0].node,
      `${prefix} 입력 복원`,
    );
    assert.equal(
      workflow.connections[ai.name].main[0][0].node,
      `${prefix} 응답`,
    );
    assert.equal(
      workflow.connections[ai.name].main[1][0].node,
      `${prefix} 오류`,
    );
    assert.equal(
      nodes.get(`${prefix} 응답 기록`).onError,
      "continueRegularOutput",
    );
  }
});

test("accounting preserves the source input before AI, including job extraction sourceText", () => {
  const workflow = JSON.parse(
    readFileSync(
      new URL("../workflows/career-analysis.json", import.meta.url),
      "utf8",
    ),
  );
  const start = workflow.nodes.find(
    (node) => node.name === "OpenAI 공고 원문 보완 사용량 시작",
  );
  const source = { sourceText: "original full job content" };
  const payload = {
    requestId: crypto.randomUUID(),
    collectionRunId: crypto.randomUUID(),
  };
  const run = new Function("$input", "$", "require", start.parameters.jsCode);
  const [item] = run(
    { first: () => ({ json: source }) },
    () => ({ first: () => ({ json: { payload } }) }),
    () => ({ randomUUID }),
  );
  assert.deepEqual(item.json.original, source);
  const restore = workflow.nodes.find(
    (node) => node.name === "OpenAI 공고 원문 보완 사용량 입력 복원",
  );
  const [restored] = new Function("$", restore.parameters.jsCode)(() => ({
    first: () => item,
  }));
  assert.deepEqual(restored.json, source);
});
