import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApiServer } from "../src/server.mjs";

const leago = { id: "learner-leago", username: "leago", display_name: "Leago", parent_id: "parent-siyana" };
const siyana = { id: "learner-siyana", username: "siyana", display_name: "Siyana", parent_id: "parent-siyana" };
const auth = (token) => ({ authorization: `Bearer ${token}` });

function repository(overrides = {}) {
  return {
    findLearnerByCredentials: async (username) => username === "siyana" ? siyana : leago,
    getLearnerHome: async (id) => ({ learner: { id }, todayMissions: id === siyana.id ? [{ title: "Junior Detective Maths" }] : [{ title: "The Lost Fossil" }] }),
    getMissionDetail: async (id) => ({ id, learnerId: id.includes("detective") ? siyana.id : leago.id, title: id.includes("detective") ? "Junior Detective Maths" : "The Lost Fossil", steps: [] }),
    completeMission: async (id, completion) => ({ id, learner_id: siyana.id, status: "completed", attempt_id: 1, ...completion }),
    saveCompanionMessage: async (record) => record,
    getParentSummary: async () => ({ parent: { id: "parent-siyana" }, children: [{ id: leago.id }, { id: siyana.id }] }),
    getMissionAttempts: async () => [],
    parentOwnsLearner: async (parentId, learnerId) => parentId === "parent-siyana" && [leago.id, siyana.id].includes(learnerId),
    ...overrides
  };
}

async function withApi(callback, options = {}) {
  const logs = [];
  const logger = { info: (line) => logs.push(line), error: (line) => logs.push(line) };
  const server = createApiServer({ dependencies: { repository: repository(options.repository), checkDatabase: options.checkDatabase || (async () => true) }, logger });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await callback(`http://127.0.0.1:${server.address().port}`, logs); }
  finally { server.close(); await once(server, "close"); }
}

async function request(origin, path, options = {}) {
  const response = await fetch(`${origin}${path}`, options);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}
function assertError(result, status, code) {
  assert.equal(result.response.status, status); assert.deepEqual(Object.keys(result.body), ["error"]);
  assert.equal(result.body.error.code, code); assert.ok(Array.isArray(result.body.error.details));
}

test("health reports liveness without the database", async () => {
  let checked = false;
  await withApi(async (origin) => { assert.equal((await request(origin, "/health")).response.status, 200); assert.equal(checked, false); },
    { checkDatabase: async () => { checked = true; throw new Error("offline"); } });
});
test("ready succeeds with PostgreSQL and safely reports dependency failure", async () => {
  await withApi(async (origin) => assert.equal((await request(origin, "/ready")).body.database, "connected"));
  await withApi(async (origin) => { const result = await request(origin, "/ready"); assertError(result, 503, "DEPENDENCY_UNAVAILABLE"); assert.doesNotMatch(JSON.stringify(result.body), /password|db\.internal/i); },
    { checkDatabase: async () => { throw new Error("password=secret at db.internal"); } });
});
test("Leago development login remains functional", async () => {
  await withApi(async (origin) => { const result = await request(origin, "/auth/login", { method: "POST", body: JSON.stringify({ username: "leago", password: "atlas123" }) }); assert.equal(result.body.token, "atlas-dev-token-leago"); assert.equal(result.body.user.id, leago.id); });
});
test("Siyana development login is separate from future PEOS identity", async () => {
  await withApi(async (origin) => { const result = await request(origin, "/auth/login", { method: "POST", body: JSON.stringify({ username: "siyana", password: "atlas123" }) }); assert.equal(result.body.token, "atlas-dev-token-siyana"); assert.equal(result.body.authentication, "development"); assert.equal(result.body.user.id, siyana.id); });
});
test("Siyana learner home is learner-specific", async () => {
  await withApi(async (origin) => { const result = await request(origin, `/learners/${siyana.id}/home`, { headers: auth("atlas-dev-token-siyana") }); assert.equal(result.body.learner.id, siyana.id); assert.equal(result.body.todayMissions[0].title, "Junior Detective Maths"); });
});
test("Junior Detective Maths detail is available to Siyana", async () => {
  await withApi(async (origin) => { const result = await request(origin, "/missions/mission-junior-detective-maths", { headers: auth("atlas-dev-token-siyana") }); assert.equal(result.body.title, "Junior Detective Maths"); });
});
test("completion passes Siyana reflection and explanation for persistence", async () => {
  let persisted;
  await withApi(async (origin) => { const result = await request(origin, "/missions/mission-junior-detective-maths/complete", { method: "POST", headers: auth("atlas-dev-token-siyana"), body: JSON.stringify({ explanation: "Five plus two is seven.", reflection: "Detective confident" }) }); assert.equal(result.body.status, "completed"); assert.equal(persisted.reflection, "Detective confident"); }, { repository: { completeMission: async (_id, data) => { persisted = data; return { id: "mission-junior-detective-maths", status: "completed" }; } } });
});
test("authorized parent summary includes Leago and Siyana", async () => {
  await withApi(async (origin) => { const result = await request(origin, "/parents/parent-siyana/summary", { headers: auth("atlas-dev-token-parent") }); assert.deepEqual(result.body.children.map((c) => c.id), [leago.id, siyana.id]); });
});
test("parent can access both authorized learner homes", async () => {
  await withApi(async (origin) => { for (const id of [leago.id, siyana.id]) assert.equal((await request(origin, `/learners/${id}/home`, { headers: auth("atlas-dev-token-parent") })).response.status, 200); });
});
test("learners are isolated from each other's homes and mission history", async () => {
  await withApi(async (origin) => {
    assertError(await request(origin, `/learners/${siyana.id}/home`, { headers: auth("atlas-dev-token-leago") }), 403, "UNAUTHORIZED");
    assertError(await request(origin, `/learners/${leago.id}/mission-history`, { headers: auth("atlas-dev-token-siyana") }), 403, "UNAUTHORIZED");
    assertError(await request(origin, "/missions/mission-junior-detective-maths", { headers: auth("atlas-dev-token-leago") }), 403, "UNAUTHORIZED");
  });
});
test("unauthenticated and unknown development users are denied", async () => {
  await withApi(async (origin) => { assertError(await request(origin, `/learners/${siyana.id}/home`), 401, "UNAUTHENTICATED"); assertError(await request(origin, `/learners/${siyana.id}/home`, { headers: auth("unknown") }), 401, "UNAUTHENTICATED"); });
});
test("learners cannot view parent-only summaries", async () => {
  await withApi(async (origin) => assertError(await request(origin, "/parents/parent-siyana/summary", { headers: auth("atlas-dev-token-siyana") }), 403, "UNAUTHORIZED"));
});
test("Sprint 004 validation and not-found errors remain standardized", async () => {
  await withApi(async (origin) => {
    assertError(await request(origin, "/auth/login", { method: "POST", body: "{" }), 400, "VALIDATION_ERROR");
    assertError(await request(origin, "/health?verbose=true"), 400, "VALIDATION_ERROR");
    assertError(await request(origin, "/missions/not%20valid", { headers: auth("atlas-dev-token-leago") }), 400, "VALIDATION_ERROR");
    assertError(await request(origin, "/unknown"), 404, "NOT_FOUND");
  });
});
test("invalid credentials use standardized 401", async () => {
  await withApi(async (origin) => assertError(await request(origin, "/auth/login", { method: "POST", body: JSON.stringify({ username: "siyana", password: "wrong" }) }), 401, "UNAUTHENTICATED"), { repository: { findLearnerByCredentials: async () => null } });
});
test("unexpected failures and logs do not leak sensitive values", async () => {
  await withApi(async (origin, logs) => { const result = await request(origin, "/missions/mission-lost-fossil", { headers: auth("atlas-dev-token-leago") }); assertError(result, 500, "INTERNAL_ERROR"); assert.doesNotMatch(`${JSON.stringify(result.body)} ${logs}`, /hunter2|SELECT \*/); }, { repository: { getMissionDetail: async () => { throw new Error("hunter2 SELECT *"); } } });
});
test("request logs contain metadata but not authorization", async () => {
  await withApi(async (origin, logs) => { await request(origin, "/health", { headers: auth("secret") }); assert.match(logs.join(" "), /"status":200/); assert.doesNotMatch(logs.join(" "), /Bearer secret/); });
});
