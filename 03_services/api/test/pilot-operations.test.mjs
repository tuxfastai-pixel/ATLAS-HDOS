import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApiServer } from "../src/server.mjs";

const sessionId = "11111111-1111-4111-8111-111111111111";
const parentId = "parent-siyana";
const learnerId = "learner-siyana";
const parentHeaders = { authorization: "Bearer atlas-dev-token-parent", "content-type": "application/json" };
const learnerHeaders = { authorization: "Bearer atlas-dev-token-siyana", "content-type": "application/json" };

function pilotRepository() {
  let status = "planned";
  const observations = [];
  const view = () => ({ id: sessionId, parentId, learnerId, status, sessionLabel: "Siyana family pilot session", observations: [...observations] });
  return {
    createPilotSession: async (parent, learner, label) => parent === parentId && learner === learnerId ? { ...view(), sessionLabel: label } : null,
    listPilotSessions: async (parent) => parent === parentId ? [view()] : [],
    getPilotSession: async (parent, id) => parent === parentId && id === sessionId ? view() : null,
    startPilotSession: async (parent, id) => {
      if (parent !== parentId || id !== sessionId || status !== "planned") return null;
      status = "active";
      return view();
    },
    completePilotSession: async (parent, id) => {
      if (parent !== parentId || id !== sessionId || status !== "active") return null;
      status = "completed";
      return view();
    },
    addPilotObservation: async (parent, id, category, observation) => {
      if (parent !== parentId || id !== sessionId || status !== "active") return null;
      const saved = { id: observations.length + 1, sessionId: id, learnerId, category, observation };
      observations.push(saved);
      return saved;
    }
  };
}

async function withApi(callback) {
  const server = createApiServer({ dependencies: { pilotOperations: pilotRepository() }, logger: { info() {}, error() {} } });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { server.close(); await once(server, "close"); }
}

async function request(origin, path, options = {}) {
  const response = await fetch(`${origin}${path}`, options);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

test("owning parent can create, start, observe and complete a pilot session", async () => {
  await withApi(async (origin) => {
    const created = await request(origin, `/parents/${parentId}/pilot-sessions`, {
      method: "POST", headers: parentHeaders,
      body: JSON.stringify({ learnerId, sessionLabel: "Saturday maths session" })
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.status, "planned");

    const started = await request(origin, `/parents/${parentId}/pilot-sessions/${sessionId}/start`, { method: "POST", headers: parentHeaders, body: "{}" });
    assert.equal(started.response.status, 200);
    assert.equal(started.body.status, "active");

    const observed = await request(origin, `/parents/${parentId}/pilot-sessions/${sessionId}/observations`, {
      method: "POST", headers: parentHeaders,
      body: JSON.stringify({ category: "paper_practice", observation: "Siyana wrote the challenge on paper before entering her response." })
    });
    assert.equal(observed.response.status, 201);
    assert.equal(observed.body.category, "paper_practice");

    const completed = await request(origin, `/parents/${parentId}/pilot-sessions/${sessionId}/complete`, { method: "POST", headers: parentHeaders, body: "{}" });
    assert.equal(completed.response.status, 200);
    assert.equal(completed.body.status, "completed");
  });
});

test("learner and unauthenticated users cannot access parent pilot operations", async () => {
  await withApi(async (origin) => {
    assert.equal((await request(origin, `/parents/${parentId}/pilot-sessions`, { headers: learnerHeaders })).response.status, 403);
    assert.equal((await request(origin, `/parents/${parentId}/pilot-sessions`)).response.status, 401);
  });
});

test("pilot observations reject hidden progression and ability labels", async () => {
  await withApi(async (origin) => {
    await request(origin, `/parents/${parentId}/pilot-sessions/${sessionId}/start`, { method: "POST", headers: parentHeaders, body: "{}" });
    for (const observation of ["Progression stage moved up.", "Ability score is high.", "mastery_evidence achieved."]) {
      const result = await request(origin, `/parents/${parentId}/pilot-sessions/${sessionId}/observations`, {
        method: "POST", headers: parentHeaders,
        body: JSON.stringify({ category: "other", observation })
      });
      assert.equal(result.response.status, 400);
    }
  });
});

test("observations can only be recorded while a session is active", async () => {
  await withApi(async (origin) => {
    const beforeStart = await request(origin, `/parents/${parentId}/pilot-sessions/${sessionId}/observations`, {
      method: "POST", headers: parentHeaders,
      body: JSON.stringify({ category: "usability", observation: "Parent needed one extra tap to find the mission." })
    });
    assert.equal(beforeStart.response.status, 409);
  });
});
