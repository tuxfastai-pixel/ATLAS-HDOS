import { authenticationBoundary } from "./auth.mjs";
import { query } from "./db/client.mjs";
import { ApiError } from "./errors.mjs";
import { createResponse } from "./app.mjs";

export async function routeAdaptiveFeedback(req, url) {
  const match = url.pathname.match(/^\/attempts\/(\d+)\/challenges\/([^/]+)\/feedback$/);
  if (!match) return null;
  if (req.method === "OPTIONS") return createResponse(204, null);
  if (req.method !== "GET") return null;

  const identity = authenticationBoundary(req);
  if (!identity) throw new ApiError("UNAUTHENTICATED", "Authentication required");
  if (identity.role !== "learner") throw new ApiError("UNAUTHORIZED", "Learners alone can view their adaptive answer feedback");

  const attemptId = Number(match[1]);
  const challengeVariantId = decodeURIComponent(match[2]);
  const attempt = await query("SELECT learner_id,status FROM mission_attempts WHERE id=$1 LIMIT 1", [attemptId]);
  if (!attempt.rowCount) throw new ApiError("NOT_FOUND", "Attempt not found");
  if (attempt.rows[0].learner_id !== identity.subject) throw new ApiError("UNAUTHORIZED", "Attempt ownership required");

  const result = await query(`SELECT cv.validation_config,lr.response_data
    FROM attempt_challenge_state s
    JOIN challenge_variants cv ON cv.id=s.challenge_variant_id
    LEFT JOIN LATERAL (
      SELECT response_data FROM learning_responses
      WHERE attempt_id=s.attempt_id AND challenge_variant_id=s.challenge_variant_id AND retention_status='retained'
      ORDER BY id DESC LIMIT 1
    ) lr ON TRUE
    WHERE s.attempt_id=$1 AND s.challenge_variant_id=$2 LIMIT 1`, [attemptId, challengeVariantId]);
  if (!result.rowCount) throw new ApiError("NOT_FOUND", "Adaptive challenge not found for this attempt");

  const row = result.rows[0];
  if (!row.response_data) return createResponse(200, { evaluated: false });
  const protectedAnswer = row.validation_config?.protectedAnswer;
  const submitted = row.response_data?.answer;
  const correct = protectedAnswer !== undefined && submitted !== undefined && Number(submitted) === Number(protectedAnswer);

  // Never return the protected answer or the learner's raw response. Only the evaluated outcome crosses this boundary.
  return createResponse(200, { evaluated: true, correct });
}
