import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyJobStructuringError,
  parseJobStructureResponse,
} from "./job-structure-error-policy.mjs";

test("parses completed Responses output after reasoning and across text chunks", () => {
  const object = {
    sourceComplete: true,
    metadata: {},
    facts: {},
    evidence: [],
  };
  const text = JSON.stringify(object);
  for (const values of [
    [text],
    [text.slice(0, 18), text.slice(18)],
    [object],
  ]) {
    assert.deepEqual(
      parseJobStructureResponse({
        status: "completed",
        output: [
          { type: "reasoning" },
          {
            type: "message",
            content: values.map((value) => ({
              type: "output_text",
              text: value,
            })),
          },
        ],
      }),
      object,
    );
  }
});

test("incomplete, refused, absent, malformed and non-object output have safe reasons", () => {
  const message = (text) => ({
    status: "completed",
    output: [{ content: [{ type: "output_text", text }] }],
  });
  for (const [response, reason] of [
    [
      {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      },
      "AI_STRUCTURE_TOKEN_LIMIT",
    ],
    [{ status: "incomplete" }, "AI_STRUCTURE_INCOMPLETE"],
    [
      {
        status: "completed",
        output: [{ content: [{ type: "refusal", refusal: "private-data" }] }],
      },
      "AI_STRUCTURE_REFUSAL",
    ],
    [{ status: "completed", output: [] }, "AI_STRUCTURE_OUTPUT_MISSING"],
    [{ status: "completed", output: {} }, "AI_STRUCTURE_OUTPUT_MISSING"],
    [
      { status: "completed", output: [null, { content: [null] }] },
      "AI_STRUCTURE_OUTPUT_MISSING",
    ],
    [message("private-data is not JSON"), "AI_STRUCTURE_JSON_INVALID"],
    [message("[]"), "AI_STRUCTURE_SHAPE_INVALID"],
    [message("null"), "AI_STRUCTURE_SHAPE_INVALID"],
  ]) {
    assert.throws(
      () => parseJobStructureResponse(response),
      (error) => {
        assert.equal(error.message, reason);
        assert.ok(!error.message.includes("private-data"));
        assert.equal(
          classifyJobStructuringError({ error }).code,
          "AI_RESPONSE_INVALID",
        );
        return true;
      },
    );
  }
});

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
