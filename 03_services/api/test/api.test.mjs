import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApiServer } from "../src/server.mjs";

const leago = { id: "learner-leago", username: "leago", display_name: "Leago", parent_id: "parent-siyana" };
const siyana = { id: "learner-siyana", username: "siyana", display_name: "Siyana", parent_id: "parent-siyana" };
const auth = (token) => ({ authorization: `Bearer ${token}` });

function repository(overrides = {}) {
  return {
    findLearnerByCredentials: async (username) => username === "parent" ? null : username === "siyana" ? siyana : leago,
    findParentByCredentials: async (username) => username === "parent" ? { id: "parent-siyana", name: "Founding Parent", username: "parent" } : null,
    getLearnerHome: async (id) => ({ learner: { id }, todayMissions: id === siyana.id ? [{ title: "Junior Detective Maths" }] : [{ title: "The Lost Fossil" }] }),
    getMissionDetail: async (id) => ({ id, learnerId: id.includes("detective") ? siyana.id : leago.id, title: id.includes("detective") ? "Junior Detective Maths" : "The Lost Fossil", steps: Array.from({ length: 7 }, (_, order) => ({ order })) }),
    completeMission: async (id, completion) => ({ id, learner_id: siyana.id, status: "completed", attempt_id: 1, ...completion }),
    saveCompanionMessage: async (record) => record,
    getParentSummary: async () => ({ parent: { id: "parent-siyana" }, children: [{ id: leago.id }, { id: siyana.id }] }),
    getMissionAttempts: async () => [],
    getGrowthDna: async (id) => ({ learnerId: id, dimensions: [{ dimension: "numeracy", currentLevel: 52, evidenceCount: 1, confidenceInSignal: "low", explanation: "Completed a numeracy mission." }], recentChanges: [], modelVersion: "atlas-growth-dna-v1", ruleVersion: "growth-dna-rules-v1" }),
    getLearnerObservations: async () => [{ observationType: "mission_domain_numeracy", dimension: "numeracy", direction: "positive", magnitude: 2, evidenceSummary: "Completed a mission with numeracy practice.", sourceMission: "Junior Detective Maths", observedAt: new Date(0).toISOString() }],
    getRecommendation: async (id) => ({ learnerId: id, missionId: "mission-junior-detective-maths", title: "Junior Detective Maths", reason: "Continue your active attempt in Junior Detective Maths.", rulesApplied: ["active-attempt-priority"], supportedGrowthAreas: ["numeracy"], ruleVersion: "adaptive-learning-v1" }),
    recalculateRecommendation: async (id) => ({ learnerId: id, missionId: "mission-junior-detective-maths", title: "Junior Detective Maths", reason: "Available next.", rulesApplied: [], supportedGrowthAreas: [], ruleVersion: "adaptive-learning-v1" }),
    getRecommendationHistory: async () => [],
    startOrResumeAttempt: async (missionId, learnerId) => ({ id: 41, missionId, learnerId, status: "in_progress", currentStep: 0, completedSteps: [], responses: {} }),
    getLatestAttempt: async (missionId, learnerId) => ({ id: 41, missionId, learnerId, status: "in_progress", currentStep: 2, completedSteps: [0,1], responses: { answer: 7 } }),
    getAttempt: async () => ({ id: 41, missionId: "mission-junior-detective-maths", learnerId: siyana.id, status: "in_progress" }),
    saveAttempt: async (id, data) => ({ id, ...data, status: "in_progress" }),
    completeAttempt: async (id, _learnerId, data) => ({ id, ...data, status: "completed" }),
    abandonAttempt: async (id) => ({ id, status: "abandoned" }),
    retryAttempt: async (id, learnerId) => ({ id: 42, retryOfAttemptId: id, learnerId, status: "in_progress" }),
    redactAttemptResponses: async (id) => ({ id, status: "completed", responses: {}, retentionStatus: "redacted" }),
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


test("parent development login returns a parent role", async () => {
  await withApi(async (origin) => { const result=await request(origin,"/auth/login",{method:"POST",body:JSON.stringify({username:"parent",password:"atlas-parent-123"})}); assert.equal(result.body.user.role,"parent"); });
});
test("attempt start, save, resume, and complete use shared guided routes", async () => {
  await withApi(async (origin) => { const headers=auth("atlas-dev-token-siyana");
    assert.equal((await request(origin,"/missions/mission-junior-detective-maths/attempts/start",{method:"POST",headers,body:"{}"})).body.status,"in_progress");
    const progress={currentStep:2,completedSteps:[0,1],responses:{answer:7}};
    assert.equal((await request(origin,"/attempts/41",{method:"PATCH",headers,body:JSON.stringify(progress)})).body.currentStep,2);
    assert.equal((await request(origin,"/missions/mission-junior-detective-maths/attempts/latest",{headers})).body.currentStep,2);
    const done={...progress,explanation:"I added five and two.",reflection:"I understand"};
    assert.equal((await request(origin,"/attempts/41/complete",{method:"POST",headers,body:JSON.stringify(done)})).body.status,"completed");
  });
});
test("attempt validation and ownership prevent unsafe changes", async () => {
  await withApi(async (origin) => {
    assertError(await request(origin,"/attempts/41",{method:"PATCH",headers:auth("atlas-dev-token-leago"),body:JSON.stringify({currentStep:0,completedSteps:[],responses:{}})}),403,"UNAUTHORIZED");
    assertError(await request(origin,"/attempts/41",{method:"PATCH",headers:auth("atlas-dev-token-parent"),body:JSON.stringify({currentStep:0,completedSteps:[],responses:{}})}),403,"UNAUTHORIZED");
    assertError(await request(origin,"/attempts/41",{method:"PATCH",headers:auth("atlas-dev-token-siyana"),body:JSON.stringify({currentStep:99,completedSteps:[],responses:{}})}),400,"VALIDATION_ERROR");
  });
});
test("completed attempts cannot be modified", async () => {
  await withApi(async (origin) => assertError(await request(origin,"/attempts/41",{method:"PATCH",headers:auth("atlas-dev-token-siyana"),body:JSON.stringify({currentStep:0,completedSteps:[],responses:{}})}),409,"CONFLICT"), { repository:{getAttempt:async()=>({id:41,missionId:"mission-junior-detective-maths",learnerId:siyana.id,status:"completed"})} });
});
test("Siyana response validation rejects invalid answers and confidence", async () => {
  await withApi(async (origin) => { const headers=auth("atlas-dev-token-siyana");
    assertError(await request(origin,"/attempts/41",{method:"PATCH",headers,body:JSON.stringify({currentStep:1,completedSteps:[0],responses:{answer:"seven"}})}),400,"VALIDATION_ERROR");
    assertError(await request(origin,"/attempts/41",{method:"PATCH",headers,body:JSON.stringify({currentStep:1,completedSteps:[0],responses:{confidence:"perfect"}})}),400,"VALIDATION_ERROR");
  });
});
test("owning learner can abandon but parent cannot", async () => {
  await withApi(async (origin) => {
    const abandoned = await request(origin, "/attempts/41/abandon", { method: "POST", headers: auth("atlas-dev-token-siyana"), body: "{}" });
    assert.equal(abandoned.body.status, "abandoned");
    assertError(await request(origin, "/attempts/41/abandon", { method: "POST", headers: auth("atlas-dev-token-parent"), body: "{}" }), 403, "UNAUTHORIZED");
  });
});
test("abandoned and completed attempts are immutable", async () => {
  for (const status of ["abandoned", "completed"]) {
    await withApi(async (origin) => assertError(await request(origin, "/attempts/41", { method: "PATCH", headers: auth("atlas-dev-token-siyana"), body: JSON.stringify({ currentStep: 0, completedSteps: [], responses: {} }) }), 409, "CONFLICT"),
      { repository: { getAttempt: async () => ({ id: 41, missionId: "mission-junior-detective-maths", learnerId: siyana.id, status }) } });
  }
});
test("completed attempt retry is explicit and preserves lineage", async () => {
  await withApi(async (origin) => {
    const result = await request(origin, "/attempts/41/retry", { method: "POST", headers: auth("atlas-dev-token-siyana"), body: "{}" });
    assert.equal(result.response.status, 201);
    assert.equal(result.body.retryOfAttemptId, 41);
    assert.equal(result.body.status, "in_progress");
  }, { repository: { getAttempt: async () => ({ id: 41, missionId: "mission-junior-detective-maths", learnerId: siyana.id, status: "completed" }) } });
});
test("response redaction returns no learner content and keeps attempt metadata", async () => {
  await withApi(async (origin) => {
    const result = await request(origin, "/attempts/41/redact", { method: "POST", headers: auth("atlas-dev-token-siyana"), body: JSON.stringify({ deletionReason: "retention period ended" }) });
    assert.equal(result.body.id, 41);
    assert.equal(result.body.retentionStatus, "redacted");
    assert.deepEqual(result.body.responses, {});
    assert.doesNotMatch(JSON.stringify(result.body), /retention period ended|secret answer/);
  }, { repository: { getAttempt: async () => ({ id: 41, missionId: "mission-junior-detective-maths", learnerId: siyana.id, status: "completed" }) } });
});
test("retry and redaction enforce learner ownership", async () => {
  await withApi(async (origin) => {
    for (const action of ["retry", "redact"]) assertError(await request(origin, `/attempts/41/${action}`, { method: "POST", headers: auth("atlas-dev-token-leago"), body: JSON.stringify({ deletionReason: "requested" }) }), 403, "UNAUTHORIZED");
  }, { repository: { getAttempt: async () => ({ id: 41, missionId: "mission-junior-detective-maths", learnerId: siyana.id, status: "completed" }) } });
});

test("Growth DNA endpoints enforce ownership and expose minimized evidence only", async () => {
  await withApi(async (origin) => {
    const own = await request(origin, `/learners/${siyana.id}/growth-dna`, { headers: auth("atlas-dev-token-siyana") });
    assert.equal(own.body.learnerId, siyana.id);
    assert.equal(own.body.dimensions[0].confidenceInSignal, "low");
    const observations = await request(origin, `/learners/${siyana.id}/observations?limit=10`, { headers: auth("atlas-dev-token-parent") });
    assert.equal(observations.body.observations[0].dimension, "numeracy");
    assert.doesNotMatch(JSON.stringify(observations.body), /response_data|secret answer|metadata/);
    assertError(await request(origin, `/learners/${siyana.id}/growth-dna`, { headers: auth("atlas-dev-token-leago") }), 403, "UNAUTHORIZED");
    assertError(await request(origin, `/learners/${siyana.id}/observations`), 401, "UNAUTHENTICATED");
  });
});

test("recommendation endpoints are explainable and preserve linked-parent boundaries", async () => {
  await withApi(async (origin) => {
    const own = await request(origin, `/learners/${siyana.id}/recommendation`, { headers: auth("atlas-dev-token-siyana") });
    assert.equal(own.body.recommendation.missionId, "mission-junior-detective-maths");
    assert.deepEqual(own.body.recommendation.supportedGrowthAreas, ["numeracy"]);
    assert.equal((await request(origin, `/learners/${siyana.id}/recommendations`, { headers: auth("atlas-dev-token-parent") })).body.recommendations.length, 1);
    assert.equal((await request(origin, `/learners/${siyana.id}/recommendations/recalculate`, { method: "POST", headers: auth("atlas-dev-token-siyana"), body: "{}" })).response.status, 200);
    assert.deepEqual((await request(origin, `/learners/${siyana.id}/recommendation-history`, { headers: auth("atlas-dev-token-parent") })).body.history, []);
    assertError(await request(origin, `/learners/${siyana.id}/recommendation`, { headers: auth("atlas-dev-token-leago") }), 403, "UNAUTHORIZED");
  });
});
