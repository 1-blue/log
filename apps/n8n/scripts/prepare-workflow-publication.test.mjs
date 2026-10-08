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
const baseline = structuredClone(source);
test("publication retains existing ID and credentials, including new OCR nodes", () => {
  const base = structuredClone(baseline);
  base.nodes = base.nodes.filter((node) => node.name !== "문서 자동 OCR");
  const result = preparePublication(source, [existing], "production", base);
  assert.equal(result.id, "production");
  assert.equal(result.name, existing.name);
  assert.equal(result.nodes[1].credentials.openAiApi.id, "production-openai");
  assert.equal(result.nodes[2].credentials.slackApi.id, "production-slack");
  assert.equal(result.pinData, undefined);
  assert.equal(result.versionId, undefined);
  assert.equal(source.nodes[1].credentials.openAiApi.id, "local-openai");
});
test("missing production workflow or credential fails before import", () => {
  assert.throws(() =>
    preparePublication(source, [existing], "missing", baseline),
  );
  assert.throws(() =>
    preparePublication(
      source,
      { ...existing, nodes: [] },
      "production",
      baseline,
    ),
  );
  assert.throws(() =>
    preparePublication(
      source,
      { ...existing, active: false },
      "production",
      baseline,
    ),
  );
});
test("remote Slack edits and settings survive while local prompt changes are applied", () => {
  const base = {
    nodes: [
      { name: "Slack", parameters: { channel: "old", text: "text" } },
      { name: "AI", parameters: { prompt: "old", limit: 4000 } },
    ],
    settings: { executionOrder: "v1" },
    connections: {},
  };
  const local = structuredClone(base);
  local.nodes[1].parameters.prompt = "new";
  local.nodes[1].parameters.limit = 16000;
  const remote = {
    ...structuredClone(base),
    id: "production",
    name: "production",
    active: true,
  };
  remote.nodes[0].parameters.channel = "remote-channel";
  remote.settings.binaryMode = "separate";
  const result = preparePublication(
    local,
    [remote, { id: "test-only", nodes: [] }],
    "production",
    base,
  );
  assert.equal(result.nodes[0].parameters.channel, "remote-channel");
  assert.equal(result.nodes[1].parameters.prompt, "new");
  assert.equal(result.nodes[1].parameters.limit, 16000);
  assert.equal(result.settings.binaryMode, "separate");
  assert.deepEqual(result.connections, {});
});
test("ambiguous edits, remote-added nodes and absent baseline stop before import", () => {
  const base = {
    nodes: [{ name: "AI", parameters: { prompt: "old" } }],
    connections: {},
  };
  const local = structuredClone(base);
  local.nodes[0].parameters.prompt = "local";
  const remote = { ...structuredClone(base), id: "production", active: true };
  remote.nodes[0].parameters.prompt = "remote";
  assert.throws(
    () => preparePublication(local, remote, "production", base),
    /설정 충돌/,
  );
  assert.throws(
    () => preparePublication(local, remote, "production"),
    /이전 배포 원본/,
  );
  remote.nodes.push({
    name: "manual operational node",
    type: "code",
    parameters: {},
  });
  assert.throws(
    () => preparePublication(local, remote, "production", base),
    /원격에만 추가/,
  );
});
test("removed obsolete nodes permit n8n default pruning but not remote code edits", () => {
  const base = {
    nodes: [
      {
        name: "Obsolete",
        type: "code",
        parameters: { jsCode: "original", options: { defaultOption: false } },
      },
    ],
    connections: {},
  };
  const remote = { ...structuredClone(base), id: "production", active: true };
  remote.nodes[0].parameters.options = {};
  assert.doesNotThrow(() =>
    preparePublication(
      { nodes: [], connections: {} },
      remote,
      "production",
      base,
    ),
  );
  remote.nodes[0].parameters.jsCode = "manual change";
  assert.throws(
    () =>
      preparePublication(
        { nodes: [], connections: {} },
        remote,
        "production",
        base,
      ),
    /제거 예정/,
  );
});
