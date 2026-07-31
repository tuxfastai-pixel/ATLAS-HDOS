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
  const parentHeaders = { authorization: "Bearer atlas-dev-token-parent" };

  const leagoHome = await api(`/learners/${leagoLogin.user.id}/home`, { headers: leagoHeaders });
  assert(leagoHome.todayMissions.some((mission) => mission.title === "The Lost Fossil"), "Leago flow regressed");
  const home = await api(`/learners/${siyanaLogin.user.id}/home`, { headers: siyanaHeaders });
  assert(home.learner.learningLevel === "Foundation Phase", "Siyana profile did not load");
  assert(home.todayMissions.some((mission) => mission.title === "Japanese Greetings"), "Japanese mission missing");
  assert(home.todayMissions.some((mission) => mission.title === "Mandarin Greetings"), "Mandarin mission missing");

  const mission = await api("/missions/mission-junior-detective-maths", { headers: siyanaHeaders });
  assert(mission.title === "Junior Detective Maths" && mission.steps.length === 6, "Junior Detective Maths did not open with its complete flow");
  await api("/missions/mission-junior-detective-maths/complete", {
    method: "POST", headers: siyanaHeaders,
    body: JSON.stringify({ explanation: "Five plus two equals seven.", reflection: "I feel detective confident." })
  });

  const summary = await api(`/parents/${siyanaLogin.user.parentId}/summary`, { headers: parentHeaders });
  assert(summary.children.some((child) => child.name === "Leago"), "Parent summary omitted Leago");
  const siyanaSummary = summary.children.find((child) => child.name === "Siyana");
  assert(siyanaSummary?.progressHistory.some((event) => event.summary.includes("Junior Detective Maths")), "Siyana parent impact missing");

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
  const afterRestart = await api("/missions/mission-junior-detective-maths", { headers: siyanaHeaders });
  assert(afterRestart.status === "completed", "Siyana completion did not persist after API restart");
  const history = await api(`/learners/${siyanaLogin.user.id}/mission-history`, { headers: siyanaHeaders });
  assert(history.attempts[0]?.reflection === "I feel detective confident.", "Siyana reflection did not persist");

  console.log("Smoke checks passed:");
  console.log("- PostgreSQL migration and seed completed");
  console.log("- Leago and Siyana development logins work");
  console.log("- Learner-specific home and language missions load");
  console.log("- Junior Detective Maths completion and reflection persist after restart");
  console.log("- Parent summary contains separate Leago and Siyana progress");
  console.log("- Parent authorization, learner isolation, and unknown-user denial pass");
} finally {
  await Promise.all([apiProcess && stop(apiProcess), webProcess && stop(webProcess)].filter(Boolean));
}
