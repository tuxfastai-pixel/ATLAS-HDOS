import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const apiPort = 3101;
const webPort = 3100;
const root = fileURLToPath(new URL("../../", import.meta.url));
const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/atlas_hdos_dev";

function start(command, args, env) {
  return spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "ignore"
  });
}

async function run(command, args, env = {}) {
  const child = start(command, args, env);

  return new Promise((resolve, reject) => {
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

async function stop(child) {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
    setTimeout(resolve, 1000);
  });
}

async function waitFor(url, attempts = 30) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function api(path, options = {}) {
  const response = await fetch(`http://localhost:${apiPort}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`${path} failed: ${JSON.stringify(body)}`);
  }

  return body;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

let apiProcess;
let webProcess;

try {
  await run("node", ["03_services/api/src/db/migrate.mjs"], { DATABASE_URL: databaseUrl });
  await run("node", ["03_services/api/src/db/migrate.mjs"], { DATABASE_URL: databaseUrl });
  await run("node", ["03_services/api/src/db/seed.mjs"], { DATABASE_URL: databaseUrl });

  apiProcess = start("node", ["03_services/api/src/server.mjs"], {
    ATLAS_API_PORT: String(apiPort),
    DATABASE_URL: databaseUrl
  });
  webProcess = start("node", ["02_apps/web/server.mjs"], { ATLAS_WEB_PORT: String(webPort) });

  await waitFor(`http://localhost:${apiPort}/health`);
  await waitFor(`http://localhost:${apiPort}/ready`);
  await waitFor(`http://localhost:${webPort}/`);

  const leagoLogin = await api("/auth/login", { method: "POST", body: JSON.stringify({ username: "leago", password: "atlas123" }) });
  assert(leagoLogin.user.name === "Leago", "Leago login failed");
  const siyanaLogin = await api("/auth/login", { method: "POST", body: JSON.stringify({ username: "siyana", password: "atlas123" }) });
  assert(siyanaLogin.user.name === "Siyana", "Siyana login failed");
  const leagoHeaders = { authorization: `Bearer ${leagoLogin.token}` };
  const siyanaHeaders = { authorization: `Bearer ${siyanaLogin.token}` };
  const parentLogin = await api("/auth/login", { method: "POST", body: JSON.stringify({ username: "parent", password: "atlas-parent-123" }) });
  assert(parentLogin.user.role === "parent", "Parent login failed");
  const parentHeaders = { authorization: `Bearer ${parentLogin.token}` };

  const leagoHome = await api(`/learners/${leagoLogin.user.id}/home`, { headers: leagoHeaders });
  assert(leagoHome.todayMissions.some((mission) => mission.title === "The Lost Fossil"), "Leago flow regressed");
  const home = await api(`/learners/${siyanaLogin.user.id}/home`, { headers: siyanaHeaders });
  assert(home.learner.learningLevel === "Foundation Phase", "Siyana profile did not load");
  assert(home.todayMissions.some((mission) => mission.title === "Japanese Greetings"), "Japanese mission missing");
  assert(home.todayMissions.some((mission) => mission.title === "Mandarin Greetings"), "Mandarin mission missing");

  const mission = await api("/missions/mission-junior-detective-maths", { headers: siyanaHeaders });
  assert(mission.title === "Junior Detective Maths" && mission.steps.length === 7, "Junior Detective Maths did not open with its complete flow");
  const siyanaAttempt = await api("/missions/mission-junior-detective-maths/attempts/start", { method: "POST", headers: siyanaHeaders, body: "{}" });
  await api(`/attempts/${siyanaAttempt.id}`, { method: "PATCH", headers: siyanaHeaders, body: JSON.stringify({ currentStep: 3, completedSteps: [0,1,2], responses: { answer: 7 } }) });
  const siyanaResume = await api("/missions/mission-junior-detective-maths/attempts/latest", { headers: siyanaHeaders });
  assert(siyanaResume.currentStep === 3, "Siyana did not resume at the saved step");
  const leagoAttempt = await api("/missions/mission-lost-fossil/attempts/start", { method: "POST", headers: leagoHeaders, body: "{}" });
  await api(`/attempts/${leagoAttempt.id}`, { method: "PATCH", headers: leagoHeaders, body: JSON.stringify({ currentStep: 2, completedSteps: [0,1], responses: { short_text: "Fossils preserve evidence." } }) });
  assert((await api("/missions/mission-lost-fossil/attempts/latest", { headers: leagoHeaders })).currentStep === 2, "Leago did not resume");

  const summary = await api(`/parents/${siyanaLogin.user.parentId}/summary`, { headers: parentHeaders });
  assert(summary.children.some((child) => child.name === "Leago"), "Parent summary omitted Leago");
  const siyanaSummary = summary.children.find((child) => child.name === "Siyana");
  assert(siyanaSummary?.currentMission?.title === "Junior Detective Maths" && siyanaSummary.currentMission.percentage > 0, "Siyana in-progress parent impact missing");

  for (const learnerId of [leagoLogin.user.id, siyanaLogin.user.id]) {
    await api(`/learners/${learnerId}/home`, { headers: parentHeaders });
  }
  const isolated = await fetch(`http://localhost:${apiPort}/learners/${siyanaLogin.user.id}/home`, { headers: leagoHeaders });
  assert(isolated.status === 403, "Leago was not isolated from Siyana");
  const learnerParentSummary = await fetch(`http://localhost:${apiPort}/parents/${siyanaLogin.user.parentId}/summary`, { headers: siyanaHeaders });
  assert(learnerParentSummary.status === 403, "Learner accessed parent-only summary");
  const unknown = await fetch(`http://localhost:${apiPort}/learners/${siyanaLogin.user.id}/home`);
  assert(unknown.status === 401, "Unknown user was not denied");

  await stop(apiProcess);
  apiProcess = start("node", ["03_services/api/src/server.mjs"], { ATLAS_API_PORT: String(apiPort), DATABASE_URL: databaseUrl });
  await waitFor(`http://localhost:${apiPort}/ready`);
  const resumedAfterRestart = await api("/missions/mission-junior-detective-maths/attempts/latest", { headers: siyanaHeaders });
  assert(resumedAfterRestart.currentStep === 3 && resumedAfterRestart.responses.answer === 7, "Saved progress did not survive restart");
  await api(`/attempts/${resumedAfterRestart.id}/complete`, { method: "POST", headers: siyanaHeaders, body: JSON.stringify({ currentStep: 6, completedSteps: [0,1,2,3,4,5,6], responses: { answer: 7, explanation: "I added five and two.", confidence: "I understand" }, explanation: "Five plus two equals seven.", reflection: "I understand" }) });
  await stop(apiProcess);
  apiProcess = start("node", ["03_services/api/src/server.mjs"], { ATLAS_API_PORT: String(apiPort), DATABASE_URL: databaseUrl });
  await waitFor(`http://localhost:${apiPort}/ready`);
  const afterRestart = await api("/missions/mission-junior-detective-maths", { headers: siyanaHeaders });
  assert(afterRestart.status === "completed", "Completion did not survive restart");
  const finalSummary = await api(`/parents/${parentLogin.user.id}/summary`, { headers: parentHeaders });
  assert(finalSummary.children.find((child) => child.name === "Leago")?.currentMission?.percentage > 0, "Parent summary omitted in-progress state");
  assert(finalSummary.children.find((child) => child.name === "Siyana")?.mostRecentCompletedMission === "Junior Detective Maths", "Parent summary omitted completion");

  console.log("Smoke checks passed:");
  console.log("- migration ledger rerun and PostgreSQL seed completed");
  console.log("- Leago, Siyana, and parent development logins work");
  console.log("- Learner-specific home and language missions load");
  console.log("- both guided missions resume; progress and completion persist after restarts");
  console.log("- Parent summary contains separate Leago and Siyana progress");
  console.log("- Parent authorization, learner isolation, and unknown-user denial pass");
} finally {
  await Promise.all([apiProcess && stop(apiProcess), webProcess && stop(webProcess)].filter(Boolean));
}
