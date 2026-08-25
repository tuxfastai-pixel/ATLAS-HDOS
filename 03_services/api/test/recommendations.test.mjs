import assert from "node:assert/strict";
import test from "node:test";
import { evidenceFingerprint, RECOMMENDATION_RULE_VERSION, selectRecommendation } from "../src/recommendations.mjs";

const mission = (id, duration = 10, domains = []) => ({ id, title: id, duration_minutes: duration, domains });

test("active attempts win and completed missions without an active retry are excluded", () => {
  const result = selectRecommendation({
    missions: [mission("completed", 1), mission("active", 30), mission("short", 5)],
    attempts: [{ id: 1, mission_id: "completed", status: "completed" }, { id: 2, mission_id: "active", status: "in_progress" }],
    prerequisites: [], observations: []
  });
  assert.equal(result.missionId, "active");
  assert.match(result.reason, /active attempt/);
  assert.equal(result.ruleVersion, RECOMMENDATION_RULE_VERSION);
});

test("prerequisites are enforced before secondary Growth DNA alignment", () => {
  const result = selectRecommendation({ missions: [mission("blocked", 1, ["numeracy"]), mission("eligible", 10)], attempts: [],
    prerequisites: [{ mission_id: "blocked", prerequisite_mission_id: "first" }], observations: [{ id: 1, dimension: "numeracy" }] });
  assert.equal(result.missionId, "eligible");
  assert.deepEqual(result.supportedGrowthAreas, []);
});

test("ordering and evidence fingerprints are stable regardless of input order", () => {
  const evidence = { missions: [mission("b", 10), mission("a", 10)], attempts: [], prerequisites: [], observations: [] };
  assert.equal(selectRecommendation(evidence).missionId, "a");
  assert.equal(evidenceFingerprint(evidence), evidenceFingerprint({ ...evidence, missions: [...evidence.missions].reverse() }));
});

test("fingerprints cover curriculum inputs, saved attempt state, and the active rule version", () => {
  const evidence = {
    missions: [mission("a")],
    attempts: [{ id: 1, mission_id: "a", status: "in_progress", retry_of_attempt_id: null, current_step: 1, completed_steps: [0], last_saved_at: "2026-08-25T00:00:00Z" }],
    prerequisites: [],
    observations: []
  };
  const original = evidenceFingerprint(evidence);
  assert.notEqual(original, evidenceFingerprint({ ...evidence, prerequisites: [{ mission_id: "a", prerequisite_mission_id: "first" }] }));
  assert.notEqual(original, evidenceFingerprint({ ...evidence, missions: [{ ...evidence.missions[0], title: "Changed title" }] }));
  assert.notEqual(original, evidenceFingerprint({ ...evidence, missions: [{ ...evidence.missions[0], duration_minutes: 99 }] }));
  assert.notEqual(original, evidenceFingerprint({ ...evidence, missions: [{ ...evidence.missions[0], domains: ["numeracy"] }] }));
  assert.notEqual(original, evidenceFingerprint({ ...evidence, attempts: [{ ...evidence.attempts[0], current_step: 2 }] }));
  assert.notEqual(original, evidenceFingerprint({ ...evidence, attempts: [{ ...evidence.attempts[0], completed_steps: [0, 1] }] }));
  assert.match(RECOMMENDATION_RULE_VERSION, /^adaptive-learning-v\d+$/);
});
