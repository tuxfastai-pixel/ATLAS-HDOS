import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApiServer } from "../src/server.mjs";

const learner = { id: "learner-leago", display_name: "Leago", parent_id: "parent-siyana" };

function repository(overrides = {}) {
  return {
    findLearnerByCredentials: async () => learner,
    getLearnerHome: async () => ({ learner: { id: learner.id } }),
    getMissionDetail: async () => ({ id: "mission-one" }),
    completeMission: async () => ({ id: "mission-one", status: "completed" }),
    saveCompanionMessage: async (record) => record,
    getParentSummary: async () => ({ parent: { id: "parent-siyana" } }),
    ...overrides
  };
}

async function withApi(callback, options = {}) {
  const logs = [];
  const logger = { info: (line) => logs.push(line), error: (line) => logs.push(line) };
  const server = createApiServer({
    dependencies: { repository: repository(options.repository), checkDatabase: options.checkDatabase || (async () => true) },
    logger
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await callback(origin, logs);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function request(origin, path, options) {
  const response = await fetch(`${origin}${path}`, options);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

function assertError(result, status, code) {
  assert.equal(result.response.status, status);
  assert.deepEqual(Object.keys(result.body), ["error"]);
  assert.equal(result.body.error.code, code);
  assert.equal(typeof result.body.error.message, "string");
  assert.ok(Array.isArray(result.body.error.details));
}

test("health reports process liveness without checking the database", async () => {
  let checked = false;
  await withApi(async (origin) => {
    const result = await request(origin, "/health");
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body, { ok: true, service: "atlas-api" });
    assert.equal(checked, false);
  }, { checkDatabase: async () => { checked = true; throw new Error("offline"); } });
});

test("ready succeeds when the database is connected", async () => {
  await withApi(async (origin) => {
    const result = await request(origin, "/ready");
    assert.equal(result.response.status, 200);
    assert.equal(result.body.database, "connected");
  });
});

test("ready returns a controlled 503 without dependency details", async () => {
  await withApi(async (origin) => {
    const result = await request(origin, "/ready");
    assertError(result, 503, "DEPENDENCY_UNAVAILABLE");
    assert.doesNotMatch(JSON.stringify(result.body), /password|SELECT secret|offline at db\.internal/i);
  }, { checkDatabase: async () => { throw new Error("password=p4ss SELECT secret offline at db.internal"); } });
});

test("a valid login retains the development flow", async () => {
  await withApi(async (origin) => {
    const result = await request(origin, "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "leago", password: "atlas123" }) });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.user.id, "learner-leago");
    assert.ok(result.response.headers.get("x-request-id"));
  });
});

test("invalid credentials use the standardized 401 response", async () => {
  await withApi(async (origin) => {
    const result = await request(origin, "/auth/login", { method: "POST", body: JSON.stringify({ username: "leago", password: "wrong" }) });
    assertError(result, 401, "UNAUTHENTICATED");
  }, { repository: { findLearnerByCredentials: async () => null } });
});

test("invalid JSON and missing fields return validation errors", async () => {
  await withApi(async (origin) => {
    const malformed = await request(origin, "/auth/login", { method: "POST", body: "{" });
    assertError(malformed, 400, "VALIDATION_ERROR");
    const missing = await request(origin, "/auth/login", { method: "POST", body: JSON.stringify({ username: "leago" }) });
    assertError(missing, 400, "VALIDATION_ERROR");
    assert.equal(missing.body.error.details[0].field, "password");
  });
});

test("malformed identifiers and unknown query parameters are rejected", async () => {
  await withApi(async (origin) => {
    assertError(await request(origin, "/missions/not%20valid"), 400, "VALIDATION_ERROR");
    assertError(await request(origin, "/health?verbose=true"), 400, "VALIDATION_ERROR");
  });
});

test("unknown routes and missing resources use standardized 404 errors", async () => {
  await withApi(async (origin) => {
    assertError(await request(origin, "/unknown"), 404, "NOT_FOUND");
    assertError(await request(origin, "/missions/missing"), 404, "NOT_FOUND");
  }, { repository: { getMissionDetail: async () => null } });
});

test("unexpected database failures return safe 500 responses and safe logs", async () => {
  await withApi(async (origin, logs) => {
    const result = await request(origin, "/missions/mission-one");
    assertError(result, 500, "INTERNAL_ERROR");
    const combined = `${JSON.stringify(result.body)} ${logs.join(" ")}`;
    assert.doesNotMatch(combined, /DATABASE_URL|hunter2|SELECT \* FROM credentials/);
    assert.match(logs.join(" "), /api_error/);
  }, { repository: { getMissionDetail: async () => { throw new Error("DATABASE_URL=postgres://user:hunter2@db SELECT * FROM credentials"); } } });
});

test("database uniqueness failures use the safe conflict contract", async () => {
  await withApi(async (origin) => {
    const result = await request(origin, "/companion/message", { method: "POST", body: JSON.stringify({ message: "hello" }) });
    assertError(result, 409, "CONFLICT");
    assert.doesNotMatch(JSON.stringify(result.body), /duplicate key|companion_messages/);
  }, { repository: { saveCompanionMessage: async () => { throw Object.assign(new Error("duplicate key in companion_messages"), { code: "23505" }); } } });
});

test("request logs contain metadata but not sensitive headers or bodies", async () => {
  await withApi(async (origin, logs) => {
    await request(origin, "/health", { headers: { authorization: "Bearer secret", cookie: "session=secret", "x-request-id": "test-request" } });
    const line = logs.join(" ");
    assert.match(line, /"requestId":"test-request"/);
    assert.match(line, /"method":"GET"/);
    assert.match(line, /"status":200/);
    assert.match(line, /"durationMs":/);
    assert.doesNotMatch(line, /Bearer secret|session=secret/);
  });
});
