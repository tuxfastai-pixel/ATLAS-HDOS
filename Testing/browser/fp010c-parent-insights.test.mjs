import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile("02_apps/web/src/app.js", "utf8");

test("parent UI removes direct confidence reflection and labels factual insights", () => {
  assert.doesNotMatch(source, /<strong>Confidence:<\/strong>/);
  assert.match(source, /Learning process & growth insights/);
  assert.match(source, /Atlas needs more factual learning evidence before showing an insight/);
});

test("parent UI contains no learner ranking or hidden progression vocabulary", () => {
  assert.doesNotMatch(source, /weak learner|strong learner|sibling rank|progression stage|mastery score|difficulty level/i);
});
