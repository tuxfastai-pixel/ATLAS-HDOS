import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile("02_apps/web/src/app.js", "utf8");
const feedbackRoute = await readFile("03_services/api/src/adaptive-feedback.mjs", "utf8");

test("question-bearing learner steps require a digital response before advancing", () => {
  assert.match(source, /function inferredResponseType\(step\)/);
  assert.match(source, /instruction\.includes\("\?"\)/);
  assert.match(source, /function canAdvance\(\)\{return hasCurrentResponse\(\)&&adaptiveStepReady\(\);\}/);
  assert.match(source, /Answer this step before moving on\./);
});

test("maths questions render an answer field and adaptive attempts use the submitted response", () => {
  assert.match(source, /how many\|how much\|what number\|total\|altogether/);
  assert.match(source, /data-response="answer" type="number"/);
  assert.match(source, /Check my answer/);
  assert.match(source, /responseForCurrentStep\(\)/);
});

test("choice steps give persistent selection and a child-facing continue cue", () => {
  assert.match(source, /aria-pressed=/);
  assert.match(source, /choice-selected/);
  assert.match(source, /Great — I’ve recorded that\./);
  assert.match(source, /Tap Next to continue your mission/);
});

test("responses are retained per mission step rather than reusing one answer across steps", () => {
  assert.match(source, /stepResponseKey=\(index=state\.step\)=>`step_\$\{index\+1\}`/);
  assert.match(source, /savedStepResponse/);
});

test("adaptive answer checking returns only an evaluated outcome and child-facing feedback", () => {
  assert.match(source, /\/feedback/);
  assert.match(source, /Yes — that answer is correct!/);
  assert.match(source, /Not quite yet — keep thinking\./);
  assert.match(source, /ask Atlas for a little help/i);
  assert.match(feedbackRoute, /return createResponse\(200, \{ evaluated: true, correct \}\)/);
  assert.doesNotMatch(feedbackRoute, /createResponse\(200, \{[^}]*protectedAnswer/);
  assert.doesNotMatch(feedbackRoute, /createResponse\(200, \{[^}]*submitted/);
});

test("correct answers do not present remediation as the primary next action", () => {
  assert.match(source, /requestSupport&&!player\.answerFeedback\?\.correct/);
  assert.match(source, /Finish your paper step, then continue when you are ready\./);
});
