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
  await waitFor(`http://localhost:${webPort}/`);

  const login = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "leago", password: "atlas123" })
  });
  assert(login.user.name === "Leago", "Leago login did not return the expected learner");

  const homeBefore = await api(`/learners/${login.user.id}/home`);
  assert(homeBefore.todayMissions.some((mission) => mission.title === "The Lost Fossil"), "Learner home did not include The Lost Fossil");

  const mission = await api("/missions/mission-lost-fossil");
  assert(mission.title === "The Lost Fossil", "Mission detail did not open The Lost Fossil");

  const companion = await api("/companion/message", {
    method: "POST",
    body: JSON.stringify({
      learnerId: login.user.id,
      missionId: mission.id,
      message: "What is a fossil?"
    })
  });
  assert(companion.reply.includes("fossil"), "Companion did not return the expected mock response");

  const complete = await api("/missions/mission-lost-fossil/complete", {
    method: "POST",
    body: "{}"
  });
  assert(complete.status === "completed", "Mission completion did not update status");

  const summaryBeforeRestart = await api(`/parents/${login.user.parentId}/summary`);
  assert(summaryBeforeRestart.children[0].completedMissionCount === 1, "Parent summary did not update after mission completion");

  await stop(apiProcess);
  apiProcess = start("node", ["03_services/api/src/server.mjs"], {
    ATLAS_API_PORT: String(apiPort),
    DATABASE_URL: databaseUrl
  });
  await waitFor(`http://localhost:${apiPort}/health`);

  const missionAfterRestart = await api("/missions/mission-lost-fossil");
  assert(missionAfterRestart.status === "completed", "Mission completion did not persist after API restart");

  const summaryAfterRestart = await api(`/parents/${login.user.parentId}/summary`);
  assert(summaryAfterRestart.children[0].completedMissionCount === 1, "Parent summary did not persist after API restart");
  assert(summaryAfterRestart.children[0].highlights.some((highlight) => highlight.includes("The Lost Fossil")), "Parent summary did not include completed mission highlight after restart");

  console.log("Smoke checks passed:");
  console.log("- PostgreSQL migration and seed commands completed");
  console.log("- API health confirms database connectivity");
  console.log("- Web app serves locally");
  console.log("- Leago can log in");
  console.log("- Learner home includes today's missions");
  console.log("- The Lost Fossil opens");
  console.log("- Companion mock response is persisted");
  console.log("- Mission completion persists after API restart");
  console.log("- Parent summary persists after API restart");
} finally {
  await Promise.all([apiProcess && stop(apiProcess), webProcess && stop(webProcess)].filter(Boolean));
}
