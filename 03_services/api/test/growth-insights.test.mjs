import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeProcessInsight, deriveProcessInsights, GROWTH_INSIGHT_RULE_VERSION } from "../src/growth-insights.mjs";

const event = (event_type, facts = {}) => ({ event_type, facts });

test("paper practice and independent attempt create bounded factual process evidence", () => {
  const result = deriveProcessInsights([
    event("independent_attempt_recorded", { responseStoredSeparately: true }),
    event("paper_step_completed", { learnerMarkedComplete: true })
  ]);
  assert.equal(result.ruleVersion, GROWTH_INSIGHT_RULE_VERSION);
  assert.deepEqual(result.observations.map((item) => [item.dimension, item.magnitude]), [
    ["independence", 1],
    ["persistence", 1]
  ]);
  assert.equal(result.parentStatements.length, 2);
  assert.equal(assertSafeProcessInsight(result), true);
});

test("help-seeking is neutral context and never produces a negative Growth DNA signal", () => {
  const result = deriveProcessInsights([
    event("independent_attempt_recorded"),
    event("support_requested", { requested: true }),
    event("support_presented", { supportKind: "hint" }),
    event("paper_step_completed")
  ]);
  assert.equal(result.observations.some((item) => item.magnitude < 0 || item.direction === "negative"), false);
  assert.equal(result.observations.some((item) => item.type === "continued_after_support"), true);
  assert.match(result.parentStatements.join(" "), /Requested one piece of support/);
});

test("support request alone does not lower confidence or independence", () => {
  const result = deriveProcessInsights([event("support_requested", { requested: true })]);
  assert.equal(result.observations.length, 0);
  assert.equal(result.parentStatements.length, 1);
});

test("unknown or forbidden inference-shaped events are ignored", () => {
  const result = deriveProcessInsights([
    event("learner_is_weak", { ability: "low" }),
    event("mastery_reached", { stage: 4 })
  ]);
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.parentStatements, []);
});

test("public process insights contain no raw answers or hidden progression vocabulary", () => {
  const result = deriveProcessInsights([
    event("independent_attempt_recorded", { responseStoredSeparately: true }),
    event("support_requested", { requested: true }),
    event("paper_step_completed", { learnerMarkedComplete: true })
  ]);
  const publicText = JSON.stringify(result);
  assert.doesNotMatch(publicText, /protectedAnswer|response_data|current_stage|mastery_evidence|demand_stage|capability_scores/i);
  assert.equal(assertSafeProcessInsight(result), true);
});
