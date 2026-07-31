import { authenticationBoundary } from "./auth.mjs";
import { checkDatabase } from "./db/client.mjs";
import * as repository from "./db/repository.mjs";
import { ApiError, errorBody, normalizeError } from "./errors.mjs";
import { optionalIdentifier, readJson, rejectQueryParameters, requireStrings, validateIdentifier } from "./validation.mjs";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,x-request-id"
};

export function createResponse(status, body, headers = {}) {
  return { status, headers: { ...jsonHeaders, ...headers }, body: status === 204 ? "" : JSON.stringify(body) };
}

export function mockCompanionReply(message = "") {
  const text = message.toLowerCase();
  if (text.includes("fossil")) return "A fossil is preserved evidence of a living thing from long ago. Try explaining it as a clue from ancient Earth.";
  if (text.includes("complete") || text.includes("done")) return "Strong work. Your next step is to tell someone at home one thing the fossil helped you discover.";
  return "I can help you think through the mission. Start with one observation, then explain what it might mean.";
}

function requireIdentity(identity) {
  if (!identity) throw new ApiError("UNAUTHENTICATED", "Authentication required");
  return identity;
}

async function authorizeLearner(identity, learnerId, db) {
  requireIdentity(identity);
  if (identity.role === "learner" && identity.subject === learnerId) return;
  if (identity.role === "parent" && await db.parentOwnsLearner(identity.subject, learnerId)) return;
  throw new ApiError("UNAUTHORIZED", "You are not authorized to access this learner");
}

export async function routeRequest(req, url, dependencies = {}) {
  const db = dependencies.repository || repository;
  const databaseCheck = dependencies.checkDatabase || checkDatabase;
  const identity = authenticationBoundary(req);
  rejectQueryParameters(url);

  if (req.method === "OPTIONS") return createResponse(204, null);
  if (req.method === "GET" && url.pathname === "/health") return createResponse(200, { ok: true, service: "atlas-api" });
  if (req.method === "GET" && url.pathname === "/ready") {
    try {
      await databaseCheck();
      return createResponse(200, { ok: true, service: "atlas-api", database: "connected" });
    } catch (cause) {
      throw new ApiError("DEPENDENCY_UNAVAILABLE", "A required dependency is unavailable", { cause });
    }
  }

  if (req.method === "POST" && url.pathname === "/auth/login") {
    const { username, password } = requireStrings(await readJson(req), ["username", "password"]);
    const learner = await db.findLearnerByCredentials(username.toLowerCase(), password);
    if (!learner) throw new ApiError("UNAUTHENTICATED", "Authentication required");
    return createResponse(200, { token: `atlas-dev-token-${learner.username}`, authentication: "development", user: { id: learner.id, name: learner.display_name, role: "learner", parentId: learner.parent_id } });
  }

  const homeMatch = url.pathname.match(/^\/learners\/([^/]+)\/home$/);
  if (req.method === "GET" && homeMatch) {
    const learnerId = validateIdentifier(homeMatch[1], "path", "learnerId");
    await authorizeLearner(identity, learnerId, db);
    const home = await db.getLearnerHome(learnerId);
    if (!home) throw new ApiError("NOT_FOUND", "Learner not found");
    return createResponse(200, home);
  }

  const missionMatch = url.pathname.match(/^\/missions\/([^/]+)$/);
  if (req.method === "GET" && missionMatch) {
    const mission = await db.getMissionDetail(validateIdentifier(missionMatch[1], "path", "missionId"));
    if (!mission) throw new ApiError("NOT_FOUND", "Mission not found");
    await authorizeLearner(identity, mission.learnerId, db);
    return createResponse(200, mission);
  }

  const completeMatch = url.pathname.match(/^\/missions\/([^/]+)\/complete$/);
  if (req.method === "POST" && completeMatch) {
    const missionId = validateIdentifier(completeMatch[1], "path", "missionId");
    const detail = await db.getMissionDetail(missionId);
    if (!detail) throw new ApiError("NOT_FOUND", "Mission not found");
    await authorizeLearner(identity, detail.learnerId, db);
    const completion = requireStrings(await readJson(req), ["explanation", "reflection"]);
    const mission = await db.completeMission(missionId, completion);
    if (!mission) throw new ApiError("NOT_FOUND", "Mission not found");
    return createResponse(200, { status: mission.status, missionId: mission.id, attemptId: mission.attempt_id, xpAwarded: 25, updatedDomains: detail.domains || [] });
  }

  if (req.method === "POST" && url.pathname === "/companion/message") {
    const body = await readJson(req);
    const { message } = requireStrings(body, ["message"]);
    const learnerId = body.learnerId === undefined ? "learner-leago" : validateIdentifier(body.learnerId, "body", "learnerId");
    await authorizeLearner(identity, learnerId, db);
    const missionId = optionalIdentifier(body, "missionId");
    return createResponse(200, await db.saveCompanionMessage({ learnerId, missionId, message, reply: mockCompanionReply(message) }));
  }

  const parentMatch = url.pathname.match(/^\/parents\/([^/]+)\/summary$/);
  if (req.method === "GET" && parentMatch) {
    const parentId = validateIdentifier(parentMatch[1], "path", "parentId");
    requireIdentity(identity);
    if (identity.role !== "parent" || identity.subject !== parentId) throw new ApiError("UNAUTHORIZED", "Parent-only summary access required");
    const summary = await db.getParentSummary(parentId);
    if (!summary) throw new ApiError("NOT_FOUND", "Parent not found");
    return createResponse(200, summary);
  }


  const historyMatch = url.pathname.match(/^\/learners\/([^/]+)\/mission-history$/);
  if (req.method === "GET" && historyMatch) {
    const learnerId = validateIdentifier(historyMatch[1], "path", "learnerId");
    await authorizeLearner(identity, learnerId, db);
    return createResponse(200, { learnerId, attempts: await db.getMissionAttempts(learnerId) });
  }

  throw new ApiError("NOT_FOUND", "Atlas API route not found");
}

export function errorResponse(error) {
  const safeError = normalizeError(error);
  return createResponse(safeError.status, errorBody(safeError));
}
