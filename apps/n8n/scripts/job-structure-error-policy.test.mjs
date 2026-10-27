import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyJobStructuringError } from "./job-structure-error-policy.mjs";

test("structuring failures have safe causes and only transient failures can retry", () => {
  for (const [error, code, retryable] of [
    [
      { statusCode: 429, message: "insufficient_quota private-data" },
      "AI_BILLING_LIMIT",
      false,
    ],
    [
      { status: 401, message: "private-data" },
      "AI_AUTHENTICATION_FAILED",
      false,
    ],
    [{ status: 429 }, "AI_RATE_LIMITED", true],
    [{ message: "ETIMEDOUT private-data" }, "AI_TIMEOUT", true],
    [{ status: 503 }, "AI_SERVICE_UNAVAILABLE", true],
    [
      { message: "AI_STRUCTURE_INCOMPLETE private-data" },
      "AI_RESPONSE_INVALID",
      false,
    ],
    [{ message: "Unexpected token in JSON" }, "AI_RESPONSE_INVALID", false],
  ]) {
    const result = classifyJobStructuringError({ error });
    assert.equal(result.code, code);
    assert.equal(result.retryable, retryable);
    assert.ok(!JSON.stringify(result).includes("private-data"));
  }
  assert.equal(
    classifyJobStructuringError({ error: { status: 429, retryAfter: 90 } })
      .retryable,
    false,
  );
});

test("published callbacks preserve precise AI failures without another provider call", () => {
  const workflow = JSON.parse(
    readFileSync(
      new URL("../workflows/career-analysis.json", import.meta.url),
      "utf8",
    ),
  );
  const code = workflow.nodes.find(
    (node) => node.name === "AI 원문 보완 실패 구성",
  ).parameters.jsCode;
  const run = new Function("$input", "$", code);
  const payload = {
    eventId: "event",
    requestId: "request",
    collectionRunId: "run",
    callbackPath: "/callback",
  };
  const [item] = run(
    { first: () => ({ json: { error: { status: 401 } } }) },
    () => ({ first: () => ({ json: { payload } }) }),
  );
  assert.equal(item.json.callback.errorCode, "AI_AUTHENTICATION_FAILED");
  assert.equal(item.json.callback.outcome, "ai_failed");
  assert.equal(item.json.callback.response, null);
});
