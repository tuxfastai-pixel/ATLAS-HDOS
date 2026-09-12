import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [index, source, styles] = await Promise.all([
  readFile("02_apps/web/src/index.html", "utf8"),
  readFile("02_apps/web/src/pilot-operations.js", "utf8"),
  readFile("02_apps/web/src/styles.css", "utf8")
]);

test("parent page loads the isolated FP-012 pilot operations workspace", () => {
  assert.match(index, /id="pilot-operations-root"/);
  assert.match(index, /src="\.\/pilot-operations\.js"/);
  assert.match(source, /Pilot session workspace/);
  assert.match(source, /Prepare session/);
});

test("pilot workspace keeps paper readiness and factual observation guidance visible", () => {
  assert.match(source, /Have paper and a pencil ready/);
  assert.match(source, /Record only what happened/);
  assert.match(source, /Factual note/);
  assert.match(source, /Save factual note/);
});

test("pilot workspace uses parent-scoped lifecycle endpoints and recovery copy", () => {
  assert.match(source, /\/parents\/\$\{parentId\}\/pilot-sessions/);
  assert.match(source, /\/start/);
  assert.match(source, /\/complete/);
  assert.match(source, /\/observations/);
  assert.match(source, /Your family learning overview is still available/);
  assert.match(styles, /\.pilot-session-form/);
});
