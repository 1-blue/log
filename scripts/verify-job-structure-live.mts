/** Paid opt-in check. Default is a no-network dry-run; never calls Career Ops APIs. */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { estimateAiCostUsd } from "../packages/contracts/src/ai-usage.ts";
import { JOB_STRUCTURE_MODEL } from "../packages/contracts/src/job-structure.ts";
import {
  jobStructureOutputSchema,
  validateJobStructure,
  JobStructureError,
} from "../apps/worker/src/job-structure.ts";
import { toOpenAiStructuredOutputSchema } from "../apps/worker/src/openai-schema.ts";
import { readAiTokenUsage } from "../apps/n8n/scripts/ai-usage-policy.mjs";
import { jobStructureLiveFixtures } from "../apps/n8n/scripts/job-structure-live-fixtures.mjs";

const args = process.argv.slice(2);
const option = (name: string) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const repeat = Number(option("--repeat") ?? 1);
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 3)
  throw Error("repeat must be 1..3");
const selected = option("--cases")?.split(",");
const extraSource = option("--source-file");
if (extraSource)
  jobStructureLiveFixtures.push({
    id: "incident-regression",
    source: "saramin",
    sourceText: await readFile(
      resolve(new URL("../", import.meta.url).pathname, extraSource),
      "utf8",
    ),
    usable: true,
  });
const fixtures = jobStructureLiveFixtures.filter(
  (item) => !selected || selected.includes(item.id),
);
if (!fixtures.length || (selected && selected.length !== fixtures.length))
  throw Error("Unknown fixture");
const workflow = JSON.parse(
  await readFile(
    new URL("../apps/n8n/workflows/career-analysis.json", import.meta.url),
    "utf8",
  ),
);
const ai = workflow.nodes.find(
  (node: { name: string }) => node.name === "OpenAI 공고 원문 보완",
);
const resultCode = workflow.nodes.find(
  (node: { name: string }) => node.name === "AI 원문 보완 결과 구성",
).parameters.jsCode;
const schemaModes = args.includes("--compare-schema")
  ? [true, false]
  : [args.includes("--legacy-schema")];
const cases = Array.from({ length: repeat }, (_, attempt) =>
  fixtures.flatMap((fixture) =>
    schemaModes.map((legacySchema) => {
      const payload = {
        schemaVersion: "1.0.0",
        kind: "job_posting_extraction",
        eventId: randomUUID(),
        requestId: randomUUID(),
        collectionRunId: randomUUID(),
        jobPosting: {
          sourceText: fixture.sourceText,
          source: fixture.source,
          url: "https://example.com/job/verification",
        },
        callbackPath: "/test-only-not-dispatched",
        outputSchema: legacySchema
          ? toOpenAiStructuredOutputSchema(jobStructureOutputSchema())
          : jobStructureOutputSchema(),
      };
      const getNode = () => ({ first: () => ({ json: { payload } }) });
      const expression = ai.parameters.responses.values[1].content
        .slice(3, -2)
        .trim();
      const userContent = new Function("$", "$json", `return (${expression});`)(
        getNode,
        { sourceText: fixture.sourceText },
      );
      return {
        id: `${fixture.id}${args.includes("--compare-schema") ? (legacySchema ? "-legacy" : "-validated") : ""}-${attempt + 1}`,
        legacySchema,
        fixture,
        payload,
        userContent,
      };
    }),
  ),
).flat();
if (cases.length > 24) throw Error("At most 24 paid calls per run");
console.log(
  JSON.stringify({
    execute: args.includes("--execute"),
    model: JOB_STRUCTURE_MODEL,
    calls: cases.length,
    fixtures: cases.map((c) => c.id),
  }),
);
if (!args.includes("--execute")) process.exit(0);

let responses;
const transport = option("--transport");
if (transport) {
  // The adapter may run native n8n nodes with an existing Credential reference.
  // No credential value is passed to this script or stored in the report.
  const child = execFile(
    process.execPath,
    [resolve(new URL("../", import.meta.url).pathname, transport)],
    {
      timeout: 900_000,
      maxBuffer: 10_000_000,
    },
  );
  child.stdin!.end(
    JSON.stringify({
      parameters: ai.parameters,
      cases: cases.map(({ id, payload, userContent }) => ({
        id,
        payload,
        userContent,
      })),
    }),
  );
  const output = await new Promise<string>((yes, no) => {
    let out = "";
    child.stdout!.on("data", (c) => (out += c));
    child.on("error", () => no(Error("Test transport failed")));
    child.on("close", (code) =>
      code === 0 ? yes(out) : no(Error("Test transport failed")),
    );
  });
  responses = JSON.parse(output);
} else {
  if (!process.env.OPENAI_API_KEY)
    throw Error("Set OPENAI_API_KEY or provide --transport; no call made");
  const base = new URL(
    process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1/",
  );
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw Error(
      "AI test endpoint must use HTTPS without credentials, query or fragment",
    );
  const url = new URL(base.href.replace(/\/$/, "") + "/responses");
  responses = [];
  for (const c of cases) {
    const response = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(180_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: JOB_STRUCTURE_MODEL,
        store: false,
        service_tier: "default",
        max_output_tokens: ai.parameters.options.maxTokens,
        reasoning: {
          effort: ai.parameters.options.reasoning.reasoningOptions.effort,
        },
        input: [
          {
            role: "system",
            content: ai.parameters.responses.values[0].content,
          },
          { role: "user", content: c.userContent },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "job_posting_structure",
            strict: true,
            schema: c.payload.outputSchema,
          },
          verbosity: "low",
        },
      }),
    });
    const data = await response.json();
    responses.push({
      id: c.id,
      response: response.ok
        ? data
        : { status: "provider_error", httpStatus: response.status },
    });
  }
}
const results = cases.map((c) => {
  const response = responses.find(
    (r: { id: string }) => r.id === c.id,
  )?.response;
  const usage = readAiTokenUsage(response);
  const base = {
    id: c.id,
    legacySchema: c.legacySchema,
    responseStatus: response?.status,
    usage,
    estimatedCostUsd: usage
      ? estimateAiCostUsd(JOB_STRUCTURE_MODEL, usage, "default")
      : null,
  };
  try {
    const callback = new Function("$input", "$", "Buffer", resultCode)(
      { first: () => ({ json: response }) },
      () => ({ first: () => ({ json: { payload: c.payload } }) }),
      Buffer,
    )[0].json.callback;
    const parsed = validateJobStructure({
      extraction: callback.extraction,
      sourceText: callback.response.body,
      collectionRunId: c.payload.collectionRunId,
    });
    if (!c.fixture.usable) throw Error("UNUSABLE_SOURCE_ACCEPTED");
    if (c.fixture.noRequirements && parsed.facts.requirements.length)
      throw Error("FABRICATED_REQUIREMENTS");
    if (
      c.fixture.excludedRequirements?.some(
        (term: string) =>
          parsed.facts.requirements.some((r) => r.text.includes(term)) ||
          parsed.facts.technologies.some((r) => r.name.includes(term)),
      )
    )
      throw Error("UNRELATED_REQUIREMENTS");
    return {
      ...base,
      passed: true,
      requirements: parsed.facts.requirements.length,
      warnings: parsed.facts.warnings.length,
    };
  } catch (error) {
    const expected =
      error instanceof JobStructureError &&
      error.code === "SOURCE_NOT_JOB_POSTING" &&
      !c.fixture.usable;
    return {
      ...base,
      passed: expected,
      code:
        error instanceof JobStructureError
          ? error.code
          : "TEST_RESPONSE_FAILED",
      schemaIssue:
        error instanceof JobStructureError ? error.schemaIssue : undefined,
      reason:
        error instanceof Error &&
        /^(AI_STRUCTURE_[A-Z_]+|UNUSABLE_SOURCE_ACCEPTED|FABRICATED_REQUIREMENTS|UNRELATED_REQUIREMENTS)$/.test(
          error.message,
        )
          ? error.message
          : undefined,
    };
  }
});
const report = {
  at: new Date().toISOString(),
  model: JOB_STRUCTURE_MODEL,
  legacySchema: args.includes("--legacy-schema"),
  compareSchema: args.includes("--compare-schema"),
  calls: cases.length,
  passed: results.filter((r) => r.passed).length,
  unpricedCalls: results.filter((r) => r.estimatedCostUsd === null).length,
  estimatedCostUsd: results.some((r) => r.estimatedCostUsd === null)
    ? null
    : results.reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0),
  results,
};
await mkdir(new URL("../.local/", import.meta.url), {
  recursive: true,
  mode: 0o700,
});
const reportPath = new URL(
  `../.local/job-structure-live-${Date.now()}.json`,
  import.meta.url,
);
await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
if (results.some((r) => !r.passed)) {
  await writeFile(
    new URL(reportPath.href.replace(/\.json$/, "-responses.json")),
    JSON.stringify(
      responses.map(
        (r: {
          id: string;
          response: { status?: string; output?: unknown };
        }) => ({
          id: r.id,
          response: { status: r.response?.status, output: r.response?.output },
        }),
      ),
      null,
      2,
    ),
    { mode: 0o600 },
  );
}
console.log(
  JSON.stringify({ ...report, reportPath: reportPath.pathname }, null, 2),
);
if (results.some((r) => !r.passed)) process.exitCode = 1;
