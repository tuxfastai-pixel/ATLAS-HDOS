import { authenticationBoundary } from "./auth.mjs";
import { checkDatabase } from "./db/client.mjs";
import * as repository from "./db/repository.mjs";
import { ApiError, errorBody, normalizeError } from "./errors.mjs";
import { optionalIdentifier, readJson, rejectQueryParameters, requireStrings, validateIdentifier } from "./validation.mjs";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
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
    const normalized = username.toLowerCase();
    const learner = await db.findLearnerByCredentials(normalized, password);
    if (learner) return createResponse(200, { token: `atlas-dev-token-${learner.username}`, authentication: "development", user: { id: learner.id, name: learner.display_name, role: "learner", parentId: learner.parent_id } });
    const parent = await db.findParentByCredentials(normalized, password);
    if (!parent) throw new ApiError("UNAUTHENTICATED", "Authentication required");
    return createResponse(200, { token: "atlas-dev-token-parent", authentication: "development", user: { id: parent.id, name: parent.name, role: "parent" } });
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
    if (identity.role !== "learner") throw new ApiError("UNAUTHORIZED", "Learners alone can modify attempts");
    const completion = requireStrings(await readJson(req), ["explanation", "reflection"]);
    const mission = await db.completeMission(missionId, completion);
    if (!mission) throw new ApiError("NOT_FOUND", "Mission not found");
    return createResponse(200, { status: mission.status, missionId: mission.id, attemptId: mission.attempt_id, xpAwarded: 25, updatedDomains: detail.domains || [] });
  }

  const startMatch = url.pathname.match(/^\/missions\/([^/]+)\/attempts\/start$/);
  if (req.method === "POST" && startMatch) {
    const detail = await db.getMissionDetail(validateIdentifier(startMatch[1], "path", "missionId"));
    if (!detail) throw new ApiError("NOT_FOUND", "Mission not found");
    requireIdentity(identity);
    if (identity.role !== "learner" || identity.subject !== detail.learnerId) throw new ApiError("UNAUTHORIZED", "Learners can modify only their own attempts");
    const attempt = await db.startOrResumeAttempt(detail.id, identity.subject);
    if (!attempt) throw new ApiError("CONFLICT", "Completed missions require the explicit Retry action");
    return createResponse(200, attempt);
  }

  const latestMatch = url.pathname.match(/^\/missions\/([^/]+)\/attempts\/latest$/);
  if (req.method === "GET" && latestMatch) {
    const detail = await db.getMissionDetail(validateIdentifier(latestMatch[1], "path", "missionId"));
    if (!detail) throw new ApiError("NOT_FOUND", "Mission not found");
    requireIdentity(identity);
    if (identity.role !== "learner" || identity.subject !== detail.learnerId) throw new ApiError("UNAUTHORIZED", "Learners can resume only their own attempts");
    const attempt = await db.getLatestAttempt(detail.id, identity.subject);
    if (!attempt) throw new ApiError("NOT_FOUND", "No resumable attempt found");
    return createResponse(200, attempt);
  }

  const attemptMatch = url.pathname.match(/^\/attempts\/(\d+)(\/complete)?$/);
  if (attemptMatch && ((req.method === "PATCH" && !attemptMatch[2]) || (req.method === "POST" && attemptMatch[2]))) {
    requireIdentity(identity);
    if (identity.role !== "learner") throw new ApiError("UNAUTHORIZED", "Learners alone can modify attempts");
    const attempt = await db.getAttempt(Number(attemptMatch[1]));
    if (!attempt) throw new ApiError("NOT_FOUND", "Attempt not found");
    if (attempt.learnerId !== identity.subject) throw new ApiError("UNAUTHORIZED", "Attempt ownership required");
    if (attempt.status !== "in_progress") throw new ApiError("CONFLICT", "Completed or abandoned attempts cannot be modified");
    const detail = await db.getMissionDetail(attempt.missionId);
    const body = await readJson(req);
    const currentStep = body.currentStep;
    const completedSteps = body.completedSteps;
    const responses = body.responses;
    const invalid = !Number.isInteger(currentStep) || currentStep < 0 || currentStep >= detail.steps.length ||
      !Array.isArray(completedSteps) || completedSteps.some((step) => !Number.isInteger(step) || step < 0 || step >= detail.steps.length) ||
      !responses || Array.isArray(responses) || typeof responses !== "object";
    if (invalid) throw new ApiError("VALIDATION_ERROR", "Request validation failed", { details: [{ location: "body", field: "progress", message: "Steps and responses must match the mission" }] });
    const allowedConfidence = ["I need help", "I am getting it", "I understand", "I can explain it"];
    if (responses.confidence !== undefined && !allowedConfidence.includes(responses.confidence)) throw new ApiError("VALIDATION_ERROR", "Request validation failed", { details: [{ location: "body", field: "responses.confidence", message: "Choose a supported confidence response" }] });
    if (detail.id.includes("detective") && responses.answer !== undefined && (!Number.isInteger(responses.answer) || responses.answer < 0 || responses.answer > 100)) throw new ApiError("VALIDATION_ERROR", "Request validation failed", { details: [{ location: "body", field: "responses.answer", message: "Siyana's answer must be a number from 0 to 100" }] });
    if (attemptMatch[2]) {
      const completion = requireStrings(body, ["explanation", "reflection"]);
      const completed = await db.completeAttempt(attempt.id, identity.subject, { currentStep, completedSteps, responses, ...completion });
      if (!completed) throw new ApiError("CONFLICT", "Attempt can no longer be completed");
      return createResponse(200, completed);
    }
    return createResponse(200, await db.saveAttempt(attempt.id, { currentStep, completedSteps: [...new Set(completedSteps)], responses }));
  }

  const lifecycleMatch = url.pathname.match(/^\/attempts\/(\d+)\/(abandon|retry|redact)$/);
  if (req.method === "POST" && lifecycleMatch) {
    requireIdentity(identity);
    if (identity.role !== "learner") throw new ApiError("UNAUTHORIZED", "Learners alone can manage attempts");
    const attempt = await db.getAttempt(Number(lifecycleMatch[1]));
    if (!attempt) throw new ApiError("NOT_FOUND", "Attempt not found");
    if (attempt.learnerId !== identity.subject) throw new ApiError("UNAUTHORIZED", "Attempt ownership required");
    const action = lifecycleMatch[2];
    if (action === "abandon") {
      if (attempt.status !== "in_progress") throw new ApiError("CONFLICT", "Only an in-progress attempt can be abandoned");
      const abandoned = await db.abandonAttempt(attempt.id);
      if (!abandoned) throw new ApiError("CONFLICT", "Attempt can no longer be abandoned");
      return createResponse(200, abandoned);
    }
    if (action === "retry") {
      if (attempt.status !== "completed") throw new ApiError("CONFLICT", "Only a completed attempt can be retried");
      const retry = await db.retryAttempt(attempt.id, identity.subject);
      if (!retry) throw new ApiError("CONFLICT", "Attempt can no longer be retried");
      return createResponse(201, retry);
    }
    if (!['completed', 'abandoned'].includes(attempt.status)) throw new ApiError("CONFLICT", "Only closed attempts can be redacted");
    const body = requireStrings(await readJson(req), ["deletionReason"]);
    const redacted = await db.redactAttemptResponses(attempt.id, body.deletionReason);
    if (!redacted) throw new ApiError("CONFLICT", "Attempt responses are already redacted");
    return createResponse(200, redacted);
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
