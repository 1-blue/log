import assert from "node:assert/strict";
import test from "node:test";
import {
  verifyPublishedWorkflow,
  verifyWebhook,
  waitForWebhook,
} from "./verify-workflow-publication.mjs";

const prepared = {
  nodes: [{ name: "HMAC 요청 검증", parameters: { jsCode: "verify" } }],
};
const exported = {
  ...prepared,
  id: "production",
  active: true,
  versionId: "new",
  activeVersionId: "new",
};
test("publication must refer to the imported version and its authentication code", () => {
  assert.doesNotThrow(() =>
    verifyPublishedWorkflow([exported], "production", prepared),
  );
  for (const change of [
    { active: false },
    { isArchived: true },
    { activeVersionId: "old" },
    { activeVersionId: null },
    { id: "other" },
    { nodes: [] },
  ])
    assert.throws(() =>
      verifyPublishedWorkflow(
        { ...exported, ...change },
        "production",
        prepared,
      ),
    );
});
test("startup registration is awaited, but unexpected acceptance never passes or retries", async () => {
  let calls = 0,
    waits = 0;
  await waitForWebhook("https://example.test", {
    fetcher: async () =>
      ++calls === 1
        ? Response.json({}, { status: 404 })
        : Response.json(
            { error: { code: "INVALID_SIGNATURE" } },
            { status: 401 },
          ),
    wait: async () => {
      waits++;
    },
  });
  assert.equal(calls, 2);
  assert.equal(waits, 1);
  calls = 0;
  await assert.rejects(
    waitForWebhook("https://example.test", {
      fetcher: async () => {
        calls++;
        return Response.json({}, { status: 200 });
      },
      wait: async () => assert.fail("must not retry an accepting endpoint"),
    }),
  );
  assert.equal(calls, 1);
  await assert.rejects(
    waitForWebhook("https://example.test", {
      fetcher: async () => Response.json({}, { status: 404 }),
      wait: async () => {},
      attempts: 2,
    }),
  );
});
test("only the registered webhook rejecting unsigned input passes, without AI work", async () => {
  await verifyWebhook(
    "https://example.test/webhook/career-analysis",
    async (_url, init) => {
      assert.equal(init.body, "{}");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.Authorization, undefined);
      return Response.json(
        { error: { code: "INVALID_SIGNATURE" } },
        { status: 401 },
      );
    },
  );
  for (const status of [200, 404, 500]) {
    await assert.rejects(
      verifyWebhook("https://example.test", async () =>
        Response.json({}, { status }),
      ),
      /probe failed/,
    );
  }
  await assert.rejects(
    verifyWebhook("https://example.test", async () =>
      Response.json({ error: { code: "OTHER" } }, { status: 401 }),
    ),
    /probe failed/,
  );
});
