import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHmac, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { updateJobStructure } from "./update-job-structure.mjs";
import { layoutWorkflow } from "./layout-workflow.mjs";

const source = JSON.parse(
  readFileSync(
    new URL("../workflows/career-analysis.json", import.meta.url),
    "utf8",
  ),
);
const node = (name) => source.nodes.find((item) => item.name === name);
const require = createRequire(import.meta.url);
test("structuring has only one first call and one retry, with matching reusing cached facts", () => {
  assert.equal(
    source.nodes.filter(
      (item) =>
        item.type.includes("openAi") ||
        ["문서 자동 OCR", "문서 자동 OCR 재시도"].includes(item.name),
    ).length,
    6,
  );
  assert.equal(
    source.nodes.some((item) => item.name.startsWith("OpenAI 공고 사실 분석")),
    false,
  );
  const run = new Function("$", node("공고 사실 결과 확정").parameters.jsCode);
  const facts = { title: "Example" };
  assert.deepEqual(
    run(() => ({
      first: () => ({
        json: {
          payload: {
            jobPosting: { facts, structureVersion: "job-structure-v2" },
          },
        },
      }),
    }))[0].json.facts,
    facts,
  );
  assert.throws(
    () =>
      run(() => ({
        first: () => ({
          json: { payload: { jobPosting: { facts, structureVersion: "old" } } },
        }),
      })),
    /JOB_STRUCTURE_REQUIRED/,
  );
  assert.equal(
    node("OpenAI 공고 원문 보완").parameters.options.maxTokens,
    16000,
  );
  assert.equal(
    node("OpenAI 공고 원문 보완").parameters.options.textFormat.textOptions
      .name,
    "job_posting_structure",
  );
});
test("provider retry is limited to transient errors", () => {
  const run = (error) =>
    new Function("$input", node("공고 구조화 오류 분류").parameters.jsCode)({
      first: () => ({ json: { error } }),
    })[0].json;
  assert.equal(run({ status: 429, message: "rate limit" }).retryable, true);
  assert.equal(run({ status: 503, message: "unavailable" }).retryable, true);
  for (const error of [
    { status: 429, message: "insufficient_quota" },
    { status: 400, message: "invalid schema" },
    { message: "AI_STRUCTURE_INCOMPLETE" },
    { status: 429, retryAfter: 120 },
    { message: "refusal" },
  ])
    assert.equal(run(error).retryable, false);
});
test("signed automatic collection still rejects non-allowlisted and private URLs", () => {
  const evaluate = (url, manualContent = null) => {
    const payload = {
      schemaVersion: "1.0.0",
      kind: "job_posting_collection",
      collectionRunId: "run",
      eventId: "event",
      requestId: "request",
      jobPosting: { source: "other", url, manualContent },
      callbackPath: "/v1/internal/job-posting-collections/run/complete",
    };
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = JSON.stringify(payload);
    const canonical = [
      "v1",
      timestamp,
      "event",
      "request",
      "POST",
      "/webhook/career-analysis",
      createHash("sha256").update(rawBody).digest("hex"),
    ].join("\n");
    const signature = `v1=${createHmac("sha256", "fixture-secret").update(canonical).digest("hex")}`;
    // Match the secure n8n runner: Buffer/crypto exist, URL is not injected.
    return runInNewContext(
      `(function(){${node("HMAC 요청 검증").parameters.jsCode}\n})()`,
      {
        Buffer,
        require,
        $env: { WORKER_TO_N8N_SECRET: "fixture-secret" },
        $input: {
          first: () => ({
            json: {
              body: payload,
              rawBody,
              headers: {
                "x-signature-timestamp": timestamp,
                "x-event-id": "event",
                "x-request-id": "request",
                "x-signature": signature,
              },
            },
          }),
        },
      },
    )[0].json.valid;
  };
  assert.equal(evaluate("https://www.wanted.co.kr/wd/123"), true);
  for (const url of [
    "http://127.0.0.1/",
    "https://www.wanted.co.kr.evil.test/wd/123",
    "https://www.wanted.co.kr/wd/123?redirect=private",
    "https://www.saramin.co.kr/jobs/123",
    "https://www.wanted.co.kr/wd/123\n",
    "https://user@www.wanted.co.kr/wd/123",
    "https://www.wanted.co.kr:443/wd/123",
    "https://www.wanted.co.kr/wd/123#fragment",
  ])
    assert.equal(evaluate(url), false);
  assert.equal(
    evaluate("https://www.saramin.co.kr/jobs/123", "manual source"),
    true,
  );
});
test("layout regions and nodes never overlap, and every node belongs to one region", () => {
  const result = layoutWorkflow(structuredClone(source));
  const groups = result.nodes.filter(
    (item) => item.type === "n8n-nodes-base.stickyNote",
  );
  assert.deepEqual(
    groups.map((item) => item.name.match(/^GROUP ([\d-]+)/)[1]),
    ["1", "2", "3-1", "3-2", "3-3", "3-4"],
  );
  const rect = (node) => ({
    x: node.position[0],
    y: node.position[1],
    w: node.parameters.width,
    h: node.parameters.height,
  });
  const overlap = (a, b) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (let i = 0; i < groups.length; i++)
    for (let j = i + 1; j < groups.length; j++)
      assert.equal(
        overlap(rect(groups[i]), rect(groups[j])),
        false,
        `${groups[i].name} overlaps ${groups[j].name}`,
      );
  const nodes = result.nodes.filter(
    (item) => item.type !== "n8n-nodes-base.stickyNote",
  );
  for (const item of nodes) {
    const box = {
      x: item.position[0] - 30,
      y: item.position[1] - 30,
      w: 260,
      h: 220,
    };
    assert.equal(
      groups.filter(
        (group) =>
          box.x >= group.position[0] &&
          box.y >= group.position[1] + 100 &&
          box.x + box.w <= group.position[0] + group.parameters.width &&
          box.y + box.h <= group.position[1] + group.parameters.height,
      ).length,
      1,
      item.name,
    );
  }
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++)
      assert.equal(
        overlap(
          { x: nodes[i].position[0], y: nodes[i].position[1], w: 260, h: 220 },
          { x: nodes[j].position[0], y: nodes[j].position[1], w: 260, h: 220 },
        ),
        false,
      );
  for (const group of groups)
    assert.equal(group.parameters.content.split("\n").length, 2);
  assert.deepEqual(layoutWorkflow(structuredClone(result)), result);
});
test("repeat updates do not duplicate accounting or bypass its start records", () => {
  const once = layoutWorkflow(updateJobStructure(structuredClone(source)));
  const twice = layoutWorkflow(updateJobStructure(structuredClone(once)));
  assert.deepEqual(twice, once);
  assert.equal(
    twice.connections["공고 구조화 재시도 대기"].main[0][0].node,
    "OpenAI 공고 원문 보완 재시도 사용량 시작",
  );
  for (const item of twice.nodes.filter(
    (item) => item.type === "n8n-nodes-base.code",
  ))
    assert.doesNotThrow(() => new Function(item.parameters.jsCode), item.name);
});
