import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

test("publication transfers private copied files to the runtime owner before reading", () => {
  const dir = mkdtempSync(join(tmpdir(), "career-publication-permissions-"));
  try {
    mkdirSync(join(dir, "workflows"));
    mkdirSync(join(dir, "scripts"));
    mkdirSync(join(dir, ".deployment-state"));
    const workflowFile = join(dir, "workflows/career-analysis.json");
    writeFileSync(workflowFile, "{}", { mode: 0o600 });
    writeFileSync(
      join(dir, ".deployment-state/career-analysis-baseline.json"),
      "{}",
      { mode: 0o600 },
    );
    writeFileSync(join(dir, "scripts/prepare-workflow-publication.mjs"), "", {
      mode: 0o600,
    });
    const logFile = join(dir, "calls.jsonl");
    const ownerMarker = join(dir, "ownership-ready");
    writeFileSync(
      join(dir, "docker"),
      `#!${process.execPath} --
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PUBLICATION_TEST_LOG, JSON.stringify(args) + "\\n");
if (args.includes("id")) {
  console.log(args.at(-1) === "-u" ? "1012" : "1013");
} else if (args.includes("chown")) {
  if (!args.includes("--user") || !args.includes("1012:1013")) process.exit(22);
  fs.writeFileSync(process.env.PUBLICATION_TEST_MARKER, "ready");
} else if (args.includes("node")) {
  if (!fs.existsSync(process.env.PUBLICATION_TEST_MARKER)) process.exit(23);
} else if (args.includes("ps")) console.log("n8n running");
`,
      { mode: 0o700 },
    );
    execFileSync(
      "bash",
      [
        fileURLToPath(
          new URL("./publish-workflow-production.sh", import.meta.url),
        ),
        "production",
        workflowFile,
      ],
      {
        cwd: dir,
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          PUBLICATION_TEST_LOG: logFile,
          PUBLICATION_TEST_MARKER: ownerMarker,
        },
        stdio: "pipe",
      },
    );
    const calls = readFileSync(logFile, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const ownership = calls.findIndex((args) => args.includes("chown"));
    const helper = calls.findIndex((args) => args.includes("node"));
    assert.ok(ownership >= 0 && ownership < helper);
    assert.ok(calls[ownership].includes("/tmp/career-analysis-baseline.json"));
    assert.equal(
      readFileSync(
        join(dir, ".deployment-state/career-analysis-baseline.json"),
        "utf8",
      ),
      "{}",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
