import assert from "node:assert/strict";
import test from "node:test";
import { nextSupportDecision, publicSupportItem, SUPPORT_RULE_VERSION, supportContentLeaksAnswer } from "../src/adaptive-support.mjs";

const ladder = [
  { support_position: 1, support_kind: "attention_prompt", content: "Circle the two groups of paw prints in your drawing." },
  { support_position: 2, support_kind: "hint", content: "Start with the group of five, then count on the two extra paw prints one at a time." },
  { support_position: 3, support_kind: "guided_breakdown", content: "Write the first group, then add one paw print and one more on paper." },
  { support_position: 4, support_kind: "worked_analogy", content: "Try a different example first: 3 shells plus 1 shell makes 4 shells. Then return to the paw-print challenge." }
];

test("adaptive support is versioned and requires an independent attempt before help", () => {
  assert.equal(SUPPORT_RULE_VERSION, "adaptive-support-v1");
  const decision = nextSupportDecision({ attemptStatus: "in_progress", independentAttemptRecorded: false, currentSupportPosition: 0, supportItems: ladder });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "independent_attempt_required");
});

test("support advances only one authored rung and never exposes the numeric position", () => {
  const decision = nextSupportDecision({ attemptStatus: "in_progress", independentAttemptRecorded: true, currentSupportPosition: 1, supportItems: ladder });
  assert.equal(decision.nextPosition, 2);
  assert.deepEqual(decision.item, { kind: "hint", content: ladder[1].content });
  assert.equal("support_position" in decision.item, false);
});

test("closed attempts cannot receive support and the final rung does not advance", () => {
  assert.equal(nextSupportDecision({ attemptStatus: "completed", independentAttemptRecorded: true, currentSupportPosition: 1, supportItems: ladder }).allowed, false);
  const final = nextSupportDecision({ attemptStatus: "in_progress", independentAttemptRecorded: true, currentSupportPosition: 4, supportItems: ladder });
  assert.equal(final.reason, "final_support_reached");
  assert.equal(final.nextPosition, 4);
  assert.equal(final.item, null);
});

test("worked analogy uses a different example and learner-facing support does not leak the active answer", () => {
  assert.match(ladder[3].content, /3 shells plus 1 shell makes 4 shells/i);
  for (const item of ladder) assert.equal(supportContentLeaksAnswer(item.content, 7), false);
  assert.equal(supportContentLeaksAnswer("The answer is 7.", 7), true);
});

test("public support projection contains content only and no ability, difficulty, or Growth DNA judgment", () => {
  const item = publicSupportItem(ladder[0]);
  assert.deepEqual(Object.keys(item).sort(), ["content", "kind"]);
  assert.doesNotMatch(JSON.stringify(item), /ability|aptitude|weak|mastery|difficulty|confidence|independence/i);
});
