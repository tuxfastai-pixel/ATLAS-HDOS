import { authenticationBoundary } from "./auth.mjs";
import { createResponse } from "./app.mjs";
import * as pilotRepository from "./db/pilot-operations.mjs";
import { ApiError } from "./errors.mjs";
import { readJson, validateIdentifier } from "./validation.mjs";

const CATEGORIES = new Set(["engagement","usability","support","paper_practice","recovery","other"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_OBSERVATION_PATTERNS = /mastery_evidence|demand_stage|progression stage|ability score|intelligence score|sibling rank|sibling comparison/i;

function requireParent(identity, parentId) {
  if (!identity) throw new ApiError("UNAUTHENTICATED", "Authentication required");
  if (identity.role !== "parent" || identity.subject !== parentId) {
    throw new ApiError("UNAUTHORIZED", "Parent pilot operations are available only to the owning parent");
  }
}

function requireSessionId(value) {
  if (!UUID.test(value)) throw new ApiError("VALIDATION_ERROR", "Request validation failed", {
    details: [{ location: "path", field: "sessionId", message: "sessionId must be a UUID" }]
  });
  return value;
}

function requireObservation(body) {
  const category = body?.category;
  const observation = typeof body?.observation === "string" ? body.observation.trim() : "";
  if (!CATEGORIES.has(category)) throw new ApiError("VALIDATION_ERROR", "Request validation failed", {
    details: [{ location: "body", field: "category", message: "Choose a supported factual observation category" }]
  });
  if (!observation || observation.length > 500) throw new ApiError("VALIDATION_ERROR", "Request validation failed", {
    details: [{ location: "body", field: "observation", message: "Observation must contain 1 to 500 characters" }]
  });
  if (FORBIDDEN_OBSERVATION_PATTERNS.test(observation)) throw new ApiError("VALIDATION_ERROR", "Request validation failed", {
    details: [{ location: "body", field: "observation", message: "Record factual pilot events without hidden progression, ranking, or ability labels" }]
  });
  return { category, observation };
}

export async function routePilotOperations(req, url, dependencies = {}) {
  if (!url.pathname.includes("/pilot-sessions")) return null;
  if (req.method === "OPTIONS") return createResponse(204, null);

  const db = dependencies.pilotOperations || pilotRepository;
  const identity = authenticationBoundary(req);

  const collection = url.pathname.match(/^\/parents\/([^/]+)\/pilot-sessions$/);
  if (collection) {
    const parentId = validateIdentifier(collection[1], "path", "parentId");
    requireParent(identity, parentId);
    if (req.method === "GET") return createResponse(200, { parentId, sessions: await db.listPilotSessions(parentId) });
    if (req.method === "POST") {
      const body = await readJson(req);
      const learnerId = validateIdentifier(body?.learnerId, "body", "learnerId");
      const sessionLabel = typeof body?.sessionLabel === "string" ? body.sessionLabel.trim() : "";
      if (!sessionLabel || sessionLabel.length > 120) throw new ApiError("VALIDATION_ERROR", "Request validation failed", {
        details: [{ location: "body", field: "sessionLabel", message: "sessionLabel must contain 1 to 120 characters" }]
      });
      const session = await db.createPilotSession(parentId, learnerId, sessionLabel);
      if (!session) throw new ApiError("UNAUTHORIZED", "Parent can create sessions only for their own learner");
      return createResponse(201, session);
    }
    throw new ApiError("NOT_FOUND", "Route not found");
  }

  const item = url.pathname.match(/^\/parents\/([^/]+)\/pilot-sessions\/([^/]+)(?:\/(start|complete|observations))?$/);
  if (!item) return null;
  const parentId = validateIdentifier(item[1], "path", "parentId");
  const sessionId = requireSessionId(item[2]);
  const action = item[3] || null;
  requireParent(identity, parentId);

  if (!action && req.method === "GET") {
    const session = await db.getPilotSession(parentId, sessionId);
    if (!session) throw new ApiError("NOT_FOUND", "Pilot session not found");
    return createResponse(200, session);
  }

  if (action === "start" && req.method === "POST") {
    const session = await db.startPilotSession(parentId, sessionId);
    if (!session) throw new ApiError("CONFLICT", "Only a planned pilot session can be started");
    return createResponse(200, session);
  }

  if (action === "complete" && req.method === "POST") {
    const session = await db.completePilotSession(parentId, sessionId);
    if (!session) throw new ApiError("CONFLICT", "Only an active pilot session can be completed");
    return createResponse(200, session);
  }

  if (action === "observations" && req.method === "POST") {
    const { category, observation } = requireObservation(await readJson(req));
    const saved = await db.addPilotObservation(parentId, sessionId, category, observation);
    if (!saved) throw new ApiError("CONFLICT", "Observations can be added only while the pilot session is active");
    return createResponse(201, saved);
  }

  throw new ApiError("NOT_FOUND", "Route not found");
}
