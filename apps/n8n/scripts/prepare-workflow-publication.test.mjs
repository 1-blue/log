import assert from "node:assert/strict";
import test from "node:test";
import { preparePublication } from "./prepare-workflow-publication.mjs";

const existing = {
  id: "production",
  active: true,
  name: "production workflow",
  nodes: [
    {
      name: "OpenAI 프로필 비교",
      credentials: {
        openAiApi: { id: "production-openai", name: "production account" },
      },
    },
    { name: "Slack", credentials: { slackApi: { id: "production-slack" } } },
  ],
};
const source = {
  id: "local",
  name: "local workflow",
  versionId: "local-version",
  pinData: { secret: "local fixture" },
  nodes: [
    {
      name: "OpenAI 프로필 비교",
      credentials: { openAiApi: { id: "local-openai" } },
    },
    {
      name: "문서 자동 OCR",
      credentials: { openAiApi: { id: "local-openai" } },
    },
    { name: "Slack", credentials: { slackApi: { id: "local-slack" } } },
  ],
};
test("publication retains existing ID and credentials, including new OCR nodes", () => {
  const result = preparePublication(source, [existing], "production");
  assert.equal(result.id, "production");
  assert.equal(result.name, existing.name);
  assert.equal(result.nodes[1].credentials.openAiApi.id, "production-openai");
  assert.equal(result.nodes[2].credentials.slackApi.id, "production-slack");
  assert.equal(result.pinData, undefined);
  assert.equal(result.versionId, undefined);
  assert.equal(source.nodes[1].credentials.openAiApi.id, "local-openai");
});
test("missing production workflow or credential fails before import", () => {
  assert.throws(() => preparePublication(source, [existing], "missing"));
  assert.throws(() =>
    preparePublication(source, { ...existing, nodes: [] }, "production"),
  );
  assert.throws(() =>
    preparePublication(source, { ...existing, active: false }, "production"),
  );
});
