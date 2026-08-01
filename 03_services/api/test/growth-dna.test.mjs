import assert from "node:assert/strict";
import test from "node:test";
import { completionObservations, lifecycleObservations, OBSERVATION_RULE_VERSION } from "../src/growth-dna.mjs";

test("versioned completion rules are deterministic, bounded, and explainable", () => {
  const input = { retryOfAttemptId: 7, confidence: "I need help", hasExplanation: true, completedStepRatio: 7, domains: ["Foundation Mathematics"] };
  const first = completionObservations(input);
  assert.deepEqual(first, completionObservations(input));
  assert.equal(OBSERVATION_RULE_VERSION, "growth-dna-rules-v1");
  assert.ok(first.some((item) => item.type === "completion_after_retry" && item.magnitude === 3));
  assert.ok(first.some((item) => item.type === "confidence_support_recommended" && item.direction === "neutral"));
  assert.ok(first.some((item) => item.dimension === "numeracy"));
  assert.ok(first.every((item) => item.magnitude >= 0 && item.magnitude <= 5 && item.summary));
});

test("abandonment is a neutral support observation rather than a negative label", () => {
  const [observation] = lifecycleObservations("mission_abandoned", { completedStepRatio: 2 });
  assert.equal(observation.direction, "neutral");
  assert.equal(observation.magnitude, 0);
  assert.match(observation.summary, /not a failure/i);
  assert.doesNotMatch(JSON.stringify(observation), /lazy|weak|problematic/i);
});

test("story and explanation evidence creates literacy and communication signals", () => {
  const observations = completionObservations({ hasExplanation: true, domains: ["Story", "Reading"], completedStepRatio: 3 });
  assert.ok(observations.some((item) => item.dimension === "literacy"));
  assert.ok(observations.some((item) => item.dimension === "communication"));
});
