import { checkDatabase } from "./db/client.mjs";
import {
  completeMission,
  findLearnerByCredentials,
  getLearnerHome,
  getMissionDetail,
  getParentSummary,
  saveCompanionMessage
} from "./db/repository.mjs";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization"
};

export function createResponse(status, body) {
  return {
    status,
    headers: jsonHeaders,
    body: JSON.stringify(body)
  };
}

export async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
  }

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function mockCompanionReply(message = "") {
  const text = message.toLowerCase();

  if (text.includes("fossil")) {
    return "A fossil is preserved evidence of a living thing from long ago. Try explaining it as a clue from ancient Earth.";
  }

  if (text.includes("complete") || text.includes("done")) {
    return "Strong work. Your next step is to tell Siyana one thing the fossil helped you discover.";
  }

  return "I can help you think through the mission. Start with one observation, then explain what it might mean.";
}

export async function routeRequest(req, url) {
  if (req.method === "OPTIONS") {
    return createResponse(204, {});
  }

  if (req.method === "GET" && url.pathname === "/health") {
    try {
      await checkDatabase();
      return createResponse(200, { ok: true, service: "atlas-api", database: "connected" });
    } catch (error) {
      return createResponse(503, { ok: false, service: "atlas-api", database: "unavailable", error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").toLowerCase();
    const learner = await findLearnerByCredentials(username, body.password || "");

    if (!learner) {
      return createResponse(401, { error: "Invalid Atlas development credentials" });
    }

    return createResponse(200, {
      token: "atlas-dev-token-leago",
      user: {
        id: learner.id,
        name: learner.display_name,
        role: "learner",
        parentId: learner.parent_id
      }
    });
  }

  const homeMatch = url.pathname.match(/^\/learners\/([^/]+)\/home$/);
  if (req.method === "GET" && homeMatch) {
    const home = await getLearnerHome(homeMatch[1]);
    return home ? createResponse(200, home) : createResponse(404, { error: "Learner not found" });
  }

  const missionMatch = url.pathname.match(/^\/missions\/([^/]+)$/);
  if (req.method === "GET" && missionMatch) {
    const mission = await getMissionDetail(missionMatch[1]);
    return mission ? createResponse(200, mission) : createResponse(404, { error: "Mission not found" });
  }

  const completeMatch = url.pathname.match(/^\/missions\/([^/]+)\/complete$/);
  if (req.method === "POST" && completeMatch) {
    const mission = await completeMission(completeMatch[1]);
    if (!mission) {
      return createResponse(404, { error: "Mission not found" });
    }

    return createResponse(200, {
      status: mission.status,
      missionId: mission.id,
      xpAwarded: 25,
      updatedDomains: ["Communication", "Thinking", "Science"]
    });
  }

  if (req.method === "POST" && url.pathname === "/companion/message") {
    const body = await readJson(req);
    const reply = mockCompanionReply(body.message);
    const record = await saveCompanionMessage({
      learnerId: body.learnerId || "learner-leago",
      missionId: body.missionId || null,
      message: body.message || "",
      reply
    });
    return createResponse(200, record);
  }

  const parentMatch = url.pathname.match(/^\/parents\/([^/]+)\/summary$/);
  if (req.method === "GET" && parentMatch) {
    const summary = await getParentSummary(parentMatch[1]);
    return summary ? createResponse(200, summary) : createResponse(404, { error: "Parent not found" });
  }

  return createResponse(404, { error: "Atlas API route not found" });
}
