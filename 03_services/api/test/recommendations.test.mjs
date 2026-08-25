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
