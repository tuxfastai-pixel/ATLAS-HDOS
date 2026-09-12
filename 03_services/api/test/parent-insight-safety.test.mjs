import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApiServer } from "../src/server.mjs";

async function withServer(callback) {
  const repository = {
    getParentSummary: async () => ({
      parent: { id: "parent-siyana", name: "Founding Parent" },
      children: [{
        id: "learner-siyana",
        name: "Siyana",
        confidenceReflection: "RAW_LEARNER_REFLECTION_MUST_NOT_LEAK",
        growthInsights: [{
          insight: "Completed the paper-practice step during the learning activity.",
          dimension: "persistence",
          whyAtlasIsShowingThis: "Atlas recorded minimized paper practice evidence from Junior Detective Maths."
        }]
      }]
    })
  };
  const server = createApiServer({ dependencies: { repository, checkDatabase: async () => true }, logger: { info() {}, error() {} } });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("parent summary removes learner confidence reflection and keeps factual process evidence", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/parents/parent-siyana/summary`, {
      headers: { authorization: "Bearer atlas-dev-token-parent" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    const serialized = JSON.stringify(body);
    assert.equal(Object.hasOwn(body.children[0], "confidenceReflection"), false);
    assert.doesNotMatch(serialized, /RAW_LEARNER_REFLECTION_MUST_NOT_LEAK/);
    assert.match(serialized, /Completed the paper-practice step/);
    assert.doesNotMatch(serialized, /weak learner|strong learner|mastery score|difficulty level|progression stage|sibling rank/i);
  });
});
