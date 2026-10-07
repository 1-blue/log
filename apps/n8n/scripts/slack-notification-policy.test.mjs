import { test } from "node:test";
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import {
  classifySlackDelivery,
  slackClassifierCode,
} from "./slack-notification-policy.mjs";
test("native Slack errors are definite failures and never leak the original message", () => {
  for (const [error, code] of [
    ["invalid_auth", "SLACK_AUTHENTICATION_FAILED"],
    ["missing_scope", "SLACK_AUTHENTICATION_FAILED"],
    ["not_in_channel", "SLACK_CHANNEL_UNAVAILABLE"],
    ["is_archived", "SLACK_CHANNEL_UNAVAILABLE"],
    ["invalid_blocks", "SLACK_INVALID_PAYLOAD"],
  ]) {
    const result = classifySlackDelivery({
      error: `Slack error response: '${error}' private-data`,
      target: "job_root",
    });
    assert.equal(result.outcome, "failed");
    assert.equal(result.error.code, code);
    assert.ok(!result.error.message.includes("private-data"));
  }
  assert.equal(
    classifySlackDelivery({ error: "socket timeout", target: "job_root" })
      .outcome,
    "delivery_unknown",
  );
});

test("Workflow accepts Worker newline HMAC for both job and document messages", async () => {
  const workflow = JSON.parse(
    readFileSync(
      new URL("../workflows/career-analysis.json", import.meta.url),
      "utf8",
    ),
  );
  const code = workflow.nodes.find((node) => node.name === "HMAC 요청 검증")
    .parameters.jsCode;
  const run = new Function("$input", "$env", "require", code);
  for (const target of ["job_root", "document"]) {
    const payload = {
      kind: "slack_notification",
      schemaVersion: "1.0.0",
      eventId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      notificationId: crypto.randomUUID(),
      jobPostingId: target === "document" ? null : crypto.randomUUID(),
      documentVersionId: target === "document" ? crypto.randomUUID() : null,
      target,
      threadTs: null,
      text: "fixture",
      blocks: [{}],
    };
    payload.callbackPath = `/v1/internal/slack-notifications/${payload.notificationId}/result`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify(payload);
    const canonical = [
      "v1",
      timestamp,
      payload.eventId,
      payload.requestId,
      "POST",
      "/webhook/career-analysis",
      crypto.createHash("sha256").update(body).digest("hex"),
    ].join("\n");
    const headers = {
      "x-signature-timestamp": timestamp,
      "x-event-id": payload.eventId,
      "x-request-id": payload.requestId,
      "x-signature":
        "v1=" +
        crypto.createHmac("sha256", "fixture").update(canonical).digest("hex"),
    };
    const [item] = run(
      { first: () => ({ json: { headers, body: payload, rawBody: body } }) },
      { WORKER_TO_N8N_SECRET: "fixture" },
      () => crypto,
    );
    assert.equal(item.json.valid, true);
    headers["x-signature"] = "v1=" + "0".repeat(64);
    assert.equal(
      run(
        { first: () => ({ json: { headers, body: payload } }) },
        { WORKER_TO_N8N_SECRET: "fixture" },
        () => crypto,
      )[0].json.valid,
      false,
    );
  }
  for (const node of workflow.nodes)
    assert.ok(
      !node.parameters?.jsCode?.includes(".join('\\\\n')"),
      `${node.name} has a divergent signing canonical`,
    );
});
test("429 waits at most 60 seconds and retries only once", () => {
  assert.equal(
    classifySlackDelivery({ status: 429, attempt: 1 }).shouldRetry,
    false,
  );
  assert.equal(
    classifySlackDelivery({
      status: 429,
      headers: { "retry-after": "5" },
      attempt: 1,
    }).shouldRetry,
    true,
  );
  assert.equal(
    classifySlackDelivery({
      status: 429,
      headers: { "retry-after": "61" },
      attempt: 1,
    }).shouldRetry,
    false,
  );
  assert.equal(
    classifySlackDelivery({
      status: 429,
      headers: { "retry-after": "5" },
      attempt: 2,
    }).shouldRetry,
    false,
  );
});
test("embedded Workflow classifier has the same native-error behavior", async () => {
  const run = new Function(
    "$input",
    "$",
    `return (async()=>{${slackClassifierCode()}})();`,
  );
  const [item] = await run(
    { first: () => ({ json: { error: "not_in_channel" } }) },
    () => ({ first: () => ({ json: { payload: { target: "job_root" } } }) }),
  );
  assert.equal(item.json.error.code, "SLACK_CHANNEL_UNAVAILABLE");
  assert.equal(item.json.outcome, "failed");
});
