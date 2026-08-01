import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const html=await readFile(new URL("../../02_apps/web/src/index.html",import.meta.url),"utf8");
const app=await readFile(new URL("../../02_apps/web/src/app.js",import.meta.url),"utf8");
test("login surface supports learner and explicit parent credentials",()=>{assert.match(html,/autocomplete="username"/);assert.match(html,/current-password/);assert.match(app,/user\.role==="parent"/);});
test("shared player exposes save, resume, previous, next and completion controls",()=>{for(const id of ["previous-step","next-step","save-exit","complete-mission","mission-progress"])assert.match(html,new RegExp(`id="${id}"`));assert.match(app,/attempts\/start/);});
test("Siyana and Leago response controls share accessible rendering",()=>{assert.match(app,/type="number"/);assert.match(app,/I need help/);assert.match(app,/research note/i);assert.match(app,/<fieldset>/);});
test("parent summaries keep child progress fields separate",()=>{assert.match(app,/currentMission/);assert.match(app,/mostRecentCompletedMission/);assert.match(app,/confidenceReflection/);});
test("retry and confirmed abandonment are accessible explicit actions",()=>{assert.match(html,/id="abandon-attempt"/);assert.match(html,/aria-live="polite"/);assert.match(app,/Retry mission/);assert.match(app,/window\.confirm/);assert.match(app,/\/retry/);assert.match(app,/\/abandon/);});

test("learner Growth DNA and child-separated parent insights use cautious language", () => {
  assert.match(html, /Atlas Growth DNA/);
  assert.match(html, /developing signals, not grades or fixed facts/);
  assert.match(app, /Why Atlas is showing this/);
  assert.match(app, /growthInsights/);
  assert.doesNotMatch(`${html}${app}`, /sibling rank|better than|worse than/i);
});
