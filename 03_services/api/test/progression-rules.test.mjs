import test from "node:test";
import assert from "node:assert/strict";
import { classifyProgressionEvidence, evaluateProgression, PROGRESSION_RULE_VERSION, stageName } from "../src/progression-rules.mjs";

const strong = (overrides = {}) => ({ correct: true, independentAttemptRecorded: true, paperCompleted: true, supportPosition: 0, contextType: "same_context", scaffoldProfile: "standard", ...overrides });

 test("discreet progression is versioned and internal stage names are stable", () => {
  assert.equal(PROGRESSION_RULE_VERSION, "discreet-progression-v1");
  assert.equal(stageName(0), "understanding");
  assert.equal(stageName(4), "mastery_evidence");
});

test("one correct challenge never advances the learner", () => {
  const decision = evaluateProgression({ currentStage: 0, evidence: [strong()] });
  assert.equal(decision.movement, "hold");
  assert.equal(decision.nextStage, 0);
});

test("two strong challenges advance only one bounded step from understanding", () => {
  const decision = evaluateProgression({ currentStage: 0, evidence: [strong(), strong({ contextType: "varied_representation" })] });
  assert.equal(decision.movement, "up");
  assert.equal(decision.nextStage, 1);
});

test("help-seeking with a correct response is supported success, not negative evidence", () => {
  assert.equal(classifyProgressionEvidence(strong({ supportPosition: 3 })), "supported_success");
  const decision = evaluateProgression({ currentStage: 2, evidence: [strong({ supportPosition: 3 })] });
  assert.equal(decision.movement, "hold");
  assert.equal(decision.nextStage, 2);
});

test("one unsuccessful challenge never lowers demand", () => {
  const decision = evaluateProgression({ currentStage: 3, evidence: [{ ...strong(), correct: false }] });
  assert.equal(decision.movement, "hold");
  assert.equal(decision.nextStage, 3);
});

test("three recent unsuccessful challenges lower demand by only one step", () => {
  const unsuccessful = { ...strong(), correct: false };
  const decision = evaluateProgression({ currentStage: 3, evidence: [unsuccessful, unsuccessful, unsuccessful] });
  assert.equal(decision.movement, "down");
  assert.equal(decision.nextStage, 2);
});

test("transfer evidence is required before transfer can move toward fluency", () => {
  const held = evaluateProgression({ currentStage: 2, evidence: [strong(), strong(), strong()] });
  assert.equal(held.nextStage, 2);
  const advanced = evaluateProgression({ currentStage: 2, evidence: [strong(), strong(), strong({ contextType: "transfer" })] });
  assert.equal(advanced.nextStage, 3);
});

test("mastery evidence requires repeated reduced-scaffold success and remains bounded", () => {
  const evidence = [strong(), strong({ scaffoldProfile: "reduced", contextType: "transfer" }), strong({ scaffoldProfile: "reduced", contextType: "transfer" }), strong()];
  const decision = evaluateProgression({ currentStage: 3, evidence });
  assert.equal(decision.nextStage, 4);
  assert.equal(evaluateProgression({ currentStage: 4, evidence }).nextStage, 4);
});
