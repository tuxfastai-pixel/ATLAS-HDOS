import { randomUUID } from "node:crypto";
import { query, withTransaction } from "./client.mjs";
import { completionObservations, GROWTH_DIMENSIONS, GROWTH_DNA_MODEL_VERSION, lifecycleObservations, OBSERVATION_RULE_VERSION, storeObservations } from "../growth-dna.mjs";
import { evidenceFingerprint, RECOMMENDATION_RULE_VERSION, selectRecommendation } from "../recommendations.mjs";
import { nextSupportDecision, publicSupportItem, SUPPORT_RULE_VERSION, supportContentLeaksAnswer } from "../adaptive-support.mjs";
import { ApiError } from "../errors.mjs";

async function invalidateRecommendation(client, learnerId) {
  await client.query("DELETE FROM mission_recommendations WHERE learner_id=$1", [learnerId]);
}

async function lockLearnerRecommendationState(client, learnerId) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 9))", [learnerId]);
}

export async function findLearnerByCredentials(username, password) {
  const result = await query(
    `
      SELECT
        learners.id,
        learners.parent_id,
        learners.username,
        learners.display_name,
        learners.grade,
        learners.journey
      FROM learners
      INNER JOIN learner_credentials
        ON learner_credentials.learner_id = learners.id
      WHERE lower(learners.username) = lower($1)
        AND learner_credentials.password_dev_only = $2
      LIMIT 1
    `,
    [username, password]
  );
  return result.rows[0] || null;
}

export async function findParentByCredentials(username, password) {
  const result = await query(`SELECT parents.id, parents.name, parent_credentials.username
    FROM parents JOIN parent_credentials ON parent_credentials.parent_id = parents.id
    WHERE lower(parent_credentials.username) = lower($1) AND parent_credentials.password_dev_only = $2 LIMIT 1`, [username, password]);
  return result.rows[0] || null;
}

export async function getLearnerById(learnerId) {
  const result = await query(
    `
      SELECT id, parent_id, username, display_name, grade, journey, learning_level,
             primary_language, secondary_language, international_language,
             interests, focus_areas, next_focus, family_mission, companion_message
      FROM learners
      WHERE id = $1
      LIMIT 1
    `,
    [learnerId]
  );
  return result.rows[0] || null;
}

export async function parentOwnsLearner(parentId, learnerId) {
  const result = await query("SELECT 1 FROM learners WHERE parent_id = $1 AND id = $2 LIMIT 1", [parentId, learnerId]);
  return result.rowCount === 1;
}

export async function getLearnerHome(learnerId) {
  const learner = await getLearnerById(learnerId);
  if (!learner) return null;
  const [missionsResult, scoresResult] = await Promise.all([
    query(`SELECT id, title, duration_minutes, domains, status FROM missions WHERE learner_id = $1 ORDER BY duration_minutes DESC, title ASC`, [learnerId]),
    query(`SELECT domain, score, trend FROM capability_scores WHERE learner_id = $1 ORDER BY domain ASC`, [learnerId])
  ]);
  return {
    learner: {
      id: learner.id, name: learner.display_name, grade: learner.grade, journey: learner.journey,
      learningLevel: learner.learning_level,
      languages: { primary: learner.primary_language, secondary: learner.secondary_language, international: learner.international_language },
      interests: learner.interests, focusAreas: learner.focus_areas
    },
    companionMessage: learner.companion_message,
    todayMissions: missionsResult.rows.map((mission) => ({
      id: mission.id, title: mission.title, durationMinutes: mission.duration_minutes, domains: mission.domains, status: mission.status
    })),
    capabilityScores: scoresResult.rows
  };
}

export async function getMissionDetail(missionId) {
  const missionResult = await query(`SELECT id, learner_id, title, summary, duration_minutes, domains, status, completed_at FROM missions WHERE id = $1 LIMIT 1`, [missionId]);
  const mission = missionResult.rows[0];
  if (!mission) return null;
  const [objectivesResult, stepsResult] = await Promise.all([
    query(`SELECT objective_text FROM mission_objectives WHERE mission_id = $1 ORDER BY objective_order ASC`, [missionId]),
    query(`SELECT step_order, step_type, title, instruction FROM mission_steps WHERE mission_id = $1 ORDER BY step_order ASC`, [missionId])
  ]);
  return {
    id: mission.id, learnerId: mission.learner_id, title: mission.title, durationMinutes: mission.duration_minutes,
    domains: mission.domains, status: mission.status, completedAt: mission.completed_at, summary: mission.summary,
    objectives: objectivesResult.rows.map((row) => row.objective_text),
    steps: stepsResult.rows.map((step) => ({ order: step.step_order, type: step.step_type, title: step.title, instruction: step.instruction }))
  };
}

export async function missionHasAdaptiveConfig(missionId) {
  const result = await query("SELECT 1 FROM mission_step_learning_config WHERE mission_id=$1 LIMIT 1", [missionId]);
  return result.rowCount === 1;
}

export async function completeMission(missionId, { explanation = "Completed during the mission.", reflection = "Ready to keep learning." } = {}) {
  return withTransaction(async (client) => {
    const owner = await client.query("SELECT learner_id FROM missions WHERE id=$1", [missionId]);
    if (!owner.rowCount) return null;
    await lockLearnerRecommendationState(client, owner.rows[0].learner_id);
    const configured = await client.query("SELECT 1 FROM mission_step_learning_config WHERE mission_id=$1 LIMIT 1", [missionId]);
    if (configured.rowCount) throw new ApiError("CONFLICT", "Adaptive missions must use the guided attempt completion flow");
    const result = await client.query(
      `WITH completed AS (
         UPDATE missions SET status='completed', completed_at=COALESCE(completed_at,NOW()) WHERE id=$1 RETURNING id, learner_id, title, status
       ), attempt AS (
         INSERT INTO mission_attempts (mission_id,learner_id,status,explanation,reflection)
         SELECT id,learner_id,'completed',$2,$3 FROM completed RETURNING id
       ), event AS (
         INSERT INTO progress_events (learner_id,mission_id,event_type,summary)
         SELECT learner_id,id,'mission_completed','Completed ' || title FROM completed
       )
       SELECT completed.id,completed.learner_id,completed.status,attempt.id AS attempt_id FROM completed CROSS JOIN attempt`,
      [missionId, explanation, reflection]
    );
    if (result.rowCount) await invalidateRecommendation(client, result.rows[0].learner_id);
    return result.rows[0] || null;
  });
}

export async function saveCompanionMessage({ learnerId, missionId, message, reply }) {
  const result = await query(`INSERT INTO companion_messages (learner_id, mission_id, user_message, mock_reply)
    VALUES ($1,$2,$3,$4) RETURNING learner_id, mission_id, user_message, mock_reply, created_at`,
    [learnerId, missionId || null, message, reply]);
  const row = result.rows[0];
  return { learnerId: row.learner_id, missionId: row.mission_id, message: row.user_message, reply: row.mock_reply, createdAt: row.created_at };
}

export async function getParentSummary(parentId) {
  const parentResult = await query("SELECT id, name FROM parents WHERE id=$1 LIMIT 1", [parentId]);
  const parent = parentResult.rows[0];
  if (!parent) return null;
  const children = await query(`SELECT l.id, l.display_name, l.next_focus, l.family_mission,
    (SELECT json_build_object('title',m.title,'percentage',
      CASE WHEN cardinality(ms.completed_steps)=0 THEN 0 ELSE round(cardinality(ms.completed_steps)*100.0/(SELECT count(*) FROM mission_steps st WHERE st.mission_id=m.id)) END)
      FROM mission_attempts ms JOIN missions m ON m.id=ms.mission_id WHERE ms.learner_id=l.id AND ms.status='in_progress' ORDER BY ms.last_saved_at DESC LIMIT 1) current_mission,
    (SELECT m.title FROM mission_attempts ma JOIN missions m ON m.id=ma.mission_id WHERE ma.learner_id=l.id AND ma.status='completed' ORDER BY ma.completed_at DESC LIMIT 1) recent_completed,
    (SELECT COALESCE(ma.response_data->>'confidence', ma.reflection) FROM mission_attempts ma WHERE ma.learner_id=l.id AND ma.status='completed' ORDER BY ma.completed_at DESC LIMIT 1) confidence
    FROM learners l WHERE l.parent_id=$1 ORDER BY l.display_name`, [parentId]);
  const observationResult = await query(`SELECT o.learner_id,o.evidence_summary,o.dimension,o.observation_type,m.title
    FROM learner_observations o JOIN missions m ON m.id=o.mission_id JOIN learners l ON l.id=o.learner_id
    WHERE l.parent_id=$1 ORDER BY o.observed_at DESC,o.id DESC`, [parentId]);
  const recommendations = await Promise.all(children.rows.map((child) => getRecommendation(child.id)));
  return { parent: { id: parent.id, name: parent.name }, children: children.rows.map((child, index) => ({
    id: child.id, name: child.display_name, currentMission: child.current_mission,
    mostRecentCompletedMission: child.recent_completed, confidenceReflection: child.confidence,
    nextFocus: child.next_focus, familyMission: child.family_mission, recommendation: recommendations[index],
    growthInsights: observationResult.rows.filter((item) => item.learner_id === child.id).slice(0, 3).map((item) => ({
      insight: item.evidence_summary, dimension: item.dimension,
      whyAtlasIsShowingThis: `Atlas recorded minimized ${item.observation_type.replaceAll('_', ' ')} evidence from ${item.title}.`
    }))
  })) };
}

export async function getGrowthDna(learnerId) {
  const learner = await getLearnerById(learnerId);
  if (!learner) return null;
  const [dimensions, recent] = await Promise.all([
    query("SELECT * FROM learner_growth_dimensions WHERE learner_id=$1", [learnerId]),
    query(`SELECT o.observation_type,o.dimension,o.direction,o.magnitude,o.evidence_summary,o.observed_at,m.title
      FROM learner_observations o JOIN missions m ON m.id=o.mission_id WHERE o.learner_id=$1 ORDER BY o.observed_at DESC,o.id DESC LIMIT 5`, [learnerId])
  ]);
  const byDimension = new Map(dimensions.rows.map((row) => [row.dimension, row]));
  return { learnerId, dimensions: GROWTH_DIMENSIONS.map((dimension) => {
    const row = byDimension.get(dimension);
    return row ? { dimension, currentLevel: row.current_level, evidenceCount: row.evidence_count, lastObservedAt: row.last_observed_at,
      trend: row.trend, confidenceInSignal: row.confidence_in_signal, explanation: row.explanation, updatedAt: row.updated_at } :
      { dimension, currentLevel: 50, evidenceCount: 0, lastObservedAt: null, trend: "insufficient_evidence", confidenceInSignal: "low", explanation: "Atlas needs more mission evidence before describing this developmental signal.", updatedAt: null };
  }), recentChanges: recent.rows.map(publicObservation), generatedAt: new Date().toISOString(), modelVersion: GROWTH_DNA_MODEL_VERSION, ruleVersion: OBSERVATION_RULE_VERSION };
}

function publicObservation(row) {
  return { observationType: row.observation_type, dimension: row.dimension, direction: row.direction, magnitude: row.magnitude,
    evidenceSummary: row.evidence_summary, sourceMission: row.title, observedAt: row.observed_at };
}

export async function getLearnerObservations(learnerId, limit = 20, offset = 0) {
  const result = await query(`SELECT o.observation_type,o.dimension,o.direction,o.magnitude,o.evidence_summary,o.observed_at,m.title
    FROM learner_observations o JOIN missions m ON m.id=o.mission_id WHERE o.learner_id=$1
    ORDER BY o.observed_at DESC,o.id DESC LIMIT $2 OFFSET $3`, [learnerId, limit, offset]);
  return result.rows.map(publicObservation);
}

export async function getMissionAttempts(learnerId) {
  const result = await query(`SELECT id, mission_id, status, retry_of_attempt_id, retention_status,
    created_at, completed_at, abandoned_at FROM mission_attempts WHERE learner_id=$1 ORDER BY created_at DESC`, [learnerId]);
  return result.rows.map((row) => ({
    id: Number(row.id), missionId: row.mission_id, status: row.status,
    retryOfAttemptId: row.retry_of_attempt_id && Number(row.retry_of_attempt_id), retentionStatus: row.retention_status,
    createdAt: row.created_at, completedAt: row.completed_at, abandonedAt: row.abandoned_at
  }));
}

function attemptView(row) {
  if (!row) return null;
  const redacted = row.retention_status === "redacted";
  return { id: Number(row.id), missionId: row.mission_id, learnerId: row.learner_id, status: row.status,
    currentStep: row.current_step, completedSteps: row.completed_steps, responses: redacted ? {} : row.response_data,
    retryOfAttemptId: row.retry_of_attempt_id && Number(row.retry_of_attempt_id), retentionStatus: row.retention_status,
    retainedUntil: row.retained_until, startedAt: row.started_at, lastSavedAt: row.last_saved_at,
    completedAt: row.completed_at, abandonedAt: row.abandoned_at, deletedAt: row.deleted_at };
}

async function initializeAdaptiveState(client, attempt) {
  await client.query(`INSERT INTO attempt_challenge_state
    (attempt_id,learner_id,mission_id,challenge_variant_id,step_order)
    SELECT $1,$2,$3,cfg.challenge_variant_id,cfg.step_order
    FROM mission_step_learning_config cfg WHERE cfg.mission_id=$3
    ON CONFLICT (attempt_id,challenge_variant_id) DO NOTHING`, [attempt.id, attempt.learner_id, attempt.mission_id]);
}

async function adaptiveChallengeView(client, attempt, challengeVariantId = null) {
  const params = [attempt.id, attempt.mission_id];
  let challengeFilter = "cfg.step_order=$3";
  params.push(Number(attempt.current_step) + 1);
  if (challengeVariantId) {
    challengeFilter = "cfg.challenge_variant_id=$3";
    params[2] = challengeVariantId;
  }
  const result = await client.query(`SELECT
      cfg.step_order,cfg.paper_practice_required,cfg.independent_attempt_required,cfg.concept_id,cfg.challenge_variant_id,
      cv.prompt,cv.response_type,cv.validation_kind,
      s.current_support_position,s.independent_attempt_recorded,s.paper_prompted,s.paper_confirmed,s.paper_step_completed,s.state_version,
      li.support_kind AS current_support_kind,li.content AS current_support_content
    FROM mission_step_learning_config cfg
    JOIN challenge_variants cv ON cv.id=cfg.challenge_variant_id AND cv.active=TRUE
    JOIN attempt_challenge_state s ON s.attempt_id=$1 AND s.challenge_variant_id=cfg.challenge_variant_id
    LEFT JOIN support_ladder_items li ON li.challenge_variant_id=cfg.challenge_variant_id AND li.support_position=s.current_support_position
    WHERE cfg.mission_id=$2 AND ${challengeFilter} LIMIT 1`, params);
  const row = result.rows[0];
  if (!row) return { attempt: attemptView(attempt), challenge: null, stateVersion: null, permittedActions: {} };
  const support = row.current_support_position > 0 ? publicSupportItem({ support_kind: row.current_support_kind, content: row.current_support_content }) : null;
  return {
    attempt: attemptView(attempt),
    challenge: {
      id: row.challenge_variant_id,
      stepOrder: row.step_order,
      prompt: row.prompt,
      responseType: row.response_type,
      paperPractice: {
        required: row.paper_practice_required,
        prompted: row.paper_prompted,
        confirmedWritten: row.paper_confirmed,
        stepCompleted: row.paper_step_completed
      },
      support,
      supportComplete: Number(row.current_support_position) >= 4
    },
    stateVersion: row.state_version,
    permittedActions: {
      confirmWritten: row.paper_practice_required && !row.paper_confirmed,
      recordIndependentAttempt: (!row.paper_practice_required || row.paper_confirmed) && !row.independent_attempt_recorded,
      requestSupport: row.independent_attempt_recorded && Number(row.current_support_position) < 4,
      completePaperStep: row.paper_practice_required && row.paper_confirmed && !row.paper_step_completed
    }
  };
}

async function getOwnedAttemptForAdaptive(client, attemptId, learnerId) {
  const result = await client.query("SELECT * FROM mission_attempts WHERE id=$1 AND learner_id=$2 FOR UPDATE", [attemptId, learnerId]);
  if (!result.rowCount) throw new ApiError("NOT_FOUND", "Attempt not found");
  if (result.rows[0].status !== "in_progress") throw new ApiError("CONFLICT", "Closed attempts cannot change adaptive support state");
  await initializeAdaptiveState(client, result.rows[0]);
  return result.rows[0];
}

async function loadAdaptiveMutationContext(client, attemptId, learnerId, challengeVariantId, stateVersion, idempotencyKey) {
  await lockLearnerRecommendationState(client, learnerId);
  const attempt = await getOwnedAttemptForAdaptive(client, attemptId, learnerId);
  const duplicate = await client.query("SELECT 1 FROM learning_interaction_events WHERE idempotency_key=$1 LIMIT 1", [idempotencyKey]);
  if (duplicate.rowCount) return { attempt, duplicate: true };
  const context = await client.query(`SELECT cfg.*,cv.validation_config,cv.validation_kind,cv.response_type,s.*
    FROM mission_step_learning_config cfg
    JOIN challenge_variants cv ON cv.id=cfg.challenge_variant_id
    JOIN attempt_challenge_state s ON s.attempt_id=$1 AND s.challenge_variant_id=cfg.challenge_variant_id
    WHERE cfg.mission_id=$2 AND cfg.challenge_variant_id=$3
    FOR UPDATE OF s`, [attemptId, attempt.mission_id, challengeVariantId]);
  if (!context.rowCount) throw new ApiError("NOT_FOUND", "Adaptive challenge not found for this attempt");
  const row = context.rows[0];
  if (Number(row.state_version) !== Number(stateVersion)) throw new ApiError("CONFLICT", "Adaptive player state is stale");
  return { attempt, row, duplicate: false };
}

async function nextEventSequence(client, attemptId) {
  const result = await client.query("SELECT COALESCE(MAX(event_sequence),0)::bigint + 1 AS next FROM learning_interaction_events WHERE attempt_id=$1", [attemptId]);
  return Number(result.rows[0].next);
}

async function insertInteractionEvent(client, { idempotencyKey, learnerId, missionId, attemptId, stepOrder, conceptId, challengeVariantId, eventType, facts = {} }) {
  const sequence = await nextEventSequence(client, attemptId);
  const result = await client.query(`INSERT INTO learning_interaction_events
    (event_uuid,idempotency_key,learner_id,mission_id,attempt_id,step_order,concept_id,challenge_variant_id,event_type,event_sequence,facts,rule_context_version)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12) RETURNING id`,
    [randomUUID(), idempotencyKey, learnerId, missionId, attemptId, stepOrder, conceptId, challengeVariantId, eventType, sequence, JSON.stringify(facts), SUPPORT_RULE_VERSION]);
  if (process.env.NODE_ENV === "test" && process.env.ATLAS_TEST_ADAPTIVE_FAILURE === "after_event_insert") throw new Error("Injected adaptive event failure");
  return Number(result.rows[0].id);
}

async function updateChallengeState(client, attemptId, challengeVariantId, assignments, values) {
  const sets = assignments.map((column, index) => `${column}=$${index + 3}`);
  const result = await client.query(`UPDATE attempt_challenge_state SET ${sets.join(",")}, state_version=state_version+1, updated_at=NOW()
    WHERE attempt_id=$1 AND challenge_variant_id=$2 RETURNING *`, [attemptId, challengeVariantId, ...values]);
  if (process.env.NODE_ENV === "test" && process.env.ATLAS_TEST_ADAPTIVE_FAILURE === "after_state_update") throw new Error("Injected adaptive state failure");
  return result.rows[0];
}

export async function getAdaptivePlayer(attemptId, learnerId) {
  const attemptResult = await query("SELECT * FROM mission_attempts WHERE id=$1 AND learner_id=$2", [attemptId, learnerId]);
  if (!attemptResult.rowCount) return null;
  const attempt = attemptResult.rows[0];
  const existingState = await query("SELECT 1 FROM attempt_challenge_state WHERE attempt_id=$1 LIMIT 1", [attemptId]);
  if (!existingState.rowCount && attempt.status === "in_progress") {
    await withTransaction(async (client) => {
      await lockLearnerRecommendationState(client, learnerId);
      const locked = await client.query("SELECT * FROM mission_attempts WHERE id=$1 AND learner_id=$2 FOR UPDATE", [attemptId, learnerId]);
      if (locked.rowCount) await initializeAdaptiveState(client, locked.rows[0]);
    });
  }
  const client = { query };
  return adaptiveChallengeView(client, attempt);
}

export async function confirmPaperWritten(attemptId, learnerId, challengeVariantId, { stateVersion, idempotencyKey }) {
  return withTransaction(async (client) => {
    const context = await loadAdaptiveMutationContext(client, attemptId, learnerId, challengeVariantId, stateVersion, idempotencyKey);
    if (context.duplicate) return adaptiveChallengeView(client, context.attempt, challengeVariantId);
    const row = context.row;
    if (!row.paper_practice_required) throw new ApiError("CONFLICT", "Paper confirmation is not configured for this challenge");
    if (row.paper_confirmed) throw new ApiError("CONFLICT", "Paper writing was already confirmed");
    if (!row.paper_prompted) {
      await insertInteractionEvent(client, {
        idempotencyKey: `${idempotencyKey}:prompted`, learnerId, missionId: context.attempt.mission_id, attemptId,
        stepOrder: row.step_order, conceptId: row.concept_id, challengeVariantId, eventType: "paper_practice_prompted",
        facts: { promptVersion: "paper-practice-v1" }
      });
    }
    await insertInteractionEvent(client, {
      idempotencyKey, learnerId, missionId: context.attempt.mission_id, attemptId,
      stepOrder: row.step_order, conceptId: row.concept_id, challengeVariantId, eventType: "learner_confirmed_written",
      facts: { learnerConfirmed: true }
    });
    await updateChallengeState(client, attemptId, challengeVariantId, ["paper_prompted","paper_confirmed"], [true, true]);
    return adaptiveChallengeView(client, context.attempt, challengeVariantId);
  });
}

export async function recordAdaptiveAttempt(attemptId, learnerId, challengeVariantId, { response, stateVersion, idempotencyKey }) {
  return withTransaction(async (client) => {
    const context = await loadAdaptiveMutationContext(client, attemptId, learnerId, challengeVariantId, stateVersion, idempotencyKey);
    if (context.duplicate) return adaptiveChallengeView(client, context.attempt, challengeVariantId);
    const row = context.row;
    if (row.independent_attempt_recorded) throw new ApiError("CONFLICT", "Independent attempt was already recorded");
    if (row.paper_practice_required && !row.paper_confirmed) throw new ApiError("CONFLICT", "Confirm writing the challenge on paper before recording the independent attempt");
    const eventId = await insertInteractionEvent(client, {
      idempotencyKey, learnerId, missionId: context.attempt.mission_id, attemptId,
      stepOrder: row.step_order, conceptId: row.concept_id, challengeVariantId, eventType: "independent_attempt_recorded",
      facts: { responseProvided: true }
    });
    await client.query(`INSERT INTO learning_responses
      (interaction_event_id,attempt_id,learner_id,mission_id,challenge_variant_id,step_order,response_kind,response_data)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [eventId, attemptId, learnerId, context.attempt.mission_id, challengeVariantId, row.step_order, row.response_type, JSON.stringify(response)]);
    await updateChallengeState(client, attemptId, challengeVariantId, ["independent_attempt_recorded"], [true]);
    return adaptiveChallengeView(client, context.attempt, challengeVariantId);
  });
}

export async function requestAdaptiveSupport(attemptId, learnerId, challengeVariantId, { stateVersion, idempotencyKey }) {
  return withTransaction(async (client) => {
    const context = await loadAdaptiveMutationContext(client, attemptId, learnerId, challengeVariantId, stateVersion, idempotencyKey);
    if (context.duplicate) return adaptiveChallengeView(client, context.attempt, challengeVariantId);
    const row = context.row;
    const supportItems = await client.query("SELECT support_position,support_kind,content FROM support_ladder_items WHERE challenge_variant_id=$1 ORDER BY support_position", [challengeVariantId]);
    const decision = nextSupportDecision({
      attemptStatus: context.attempt.status,
      independentAttemptRecorded: row.independent_attempt_recorded,
      currentSupportPosition: row.current_support_position,
      supportItems: supportItems.rows
    });
    if (!decision.allowed) throw new ApiError("CONFLICT", decision.reason === "independent_attempt_required" ? "Make an independent attempt before asking for support" : "Support is not available for this attempt");
    if (!decision.item) throw new ApiError("CONFLICT", "You have reached the final scaffold. Try the challenge again or take a pause");
    const protectedAnswer = row.validation_config?.protectedAnswer;
    if (supportContentLeaksAnswer(decision.item.content, protectedAnswer)) throw new ApiError("INTERNAL_ERROR", "Authored support content failed answer-leak protection");
    await insertInteractionEvent(client, {
      idempotencyKey, learnerId, missionId: context.attempt.mission_id, attemptId,
      stepOrder: row.step_order, conceptId: row.concept_id, challengeVariantId, eventType: "support_requested",
      facts: { requested: true }
    });
    await insertInteractionEvent(client, {
      idempotencyKey: `${idempotencyKey}:presented`, learnerId, missionId: context.attempt.mission_id, attemptId,
      stepOrder: row.step_order, conceptId: row.concept_id, challengeVariantId, eventType: "support_presented",
      facts: { supportKind: decision.item.kind }
    });
    await updateChallengeState(client, attemptId, challengeVariantId, ["current_support_position"], [decision.nextPosition]);
    return adaptiveChallengeView(client, context.attempt, challengeVariantId);
  });
}

export async function completePaperStep(attemptId, learnerId, challengeVariantId, { stateVersion, idempotencyKey }) {
  return withTransaction(async (client) => {
    const context = await loadAdaptiveMutationContext(client, attemptId, learnerId, challengeVariantId, stateVersion, idempotencyKey);
    if (context.duplicate) return adaptiveChallengeView(client, context.attempt, challengeVariantId);
    const row = context.row;
    if (!row.paper_practice_required || !row.paper_confirmed) throw new ApiError("CONFLICT", "Confirm writing on paper before completing the paper step");
    if (row.paper_step_completed) throw new ApiError("CONFLICT", "Paper step was already marked complete");
    await insertInteractionEvent(client, {
      idempotencyKey, learnerId, missionId: context.attempt.mission_id, attemptId,
      stepOrder: row.step_order, conceptId: row.concept_id, challengeVariantId, eventType: "paper_step_completed",
      facts: { learnerMarkedComplete: true }
    });
    await updateChallengeState(client, attemptId, challengeVariantId, ["paper_step_completed"], [true]);
    return adaptiveChallengeView(client, context.attempt, challengeVariantId);
  });
}

export async function startOrResumeAttempt(missionId, learnerId) {
  return withTransaction(async (client) => {
    await lockLearnerRecommendationState(client, learnerId);
    const existing = await client.query(`SELECT * FROM mission_attempts WHERE mission_id=$1 AND learner_id=$2 AND status='in_progress' ORDER BY last_saved_at DESC LIMIT 1`, [missionId, learnerId]);
    if (existing.rowCount) {
      await initializeAdaptiveState(client, existing.rows[0]);
      return attemptView(existing.rows[0]);
    }
    const completed = await client.query(`SELECT 1 FROM mission_attempts WHERE mission_id=$1 AND learner_id=$2 AND status='completed' LIMIT 1`, [missionId, learnerId]);
    if (completed.rowCount) return null;
    const result = await client.query(`INSERT INTO mission_attempts
      (mission_id,learner_id,status,current_step,completed_steps,response_data)
      VALUES ($1,$2,'in_progress',0,ARRAY[]::INTEGER[],'{}'::JSONB) RETURNING *`, [missionId, learnerId]);
    await initializeAdaptiveState(client, result.rows[0]);
    await client.query("UPDATE missions SET status='in_progress' WHERE id=$1 AND status <> 'completed'", [missionId]);
    await invalidateRecommendation(client, learnerId);
    return attemptView(result.rows[0]);
  });
}

export async function getLatestAttempt(missionId, learnerId) {
  const result = await query(`SELECT * FROM mission_attempts WHERE mission_id=$1 AND learner_id=$2 AND status='in_progress' ORDER BY last_saved_at DESC LIMIT 1`, [missionId, learnerId]);
  return attemptView(result.rows[0]);
}

export async function getAttempt(attemptId) {
  const result = await query("SELECT * FROM mission_attempts WHERE id=$1", [attemptId]);
  return attemptView(result.rows[0]);
}

export async function saveAttempt(attemptId, { currentStep, completedSteps, responses }) {
  return withTransaction(async (client) => {
    const owner = await client.query("SELECT learner_id FROM mission_attempts WHERE id=$1", [attemptId]);
    if (!owner.rowCount) return null;
    await lockLearnerRecommendationState(client, owner.rows[0].learner_id);
    const result = await client.query(`UPDATE mission_attempts SET current_step=$2, completed_steps=$3,
      response_data=$4::jsonb, last_saved_at=NOW() WHERE id=$1 AND status='in_progress' RETURNING *`,
      [attemptId, currentStep, completedSteps, JSON.stringify(responses)]);
    if (result.rowCount) await storeObservations(client, { attemptId, learnerId: result.rows[0].learner_id, missionId: result.rows[0].mission_id }, lifecycleObservations("progress_saved", { completedStepRatio: completedSteps.length }));
    if (result.rowCount) await invalidateRecommendation(client, result.rows[0].learner_id);
    return attemptView(result.rows[0]);
  });
}

export async function completeAttempt(attemptId, learnerId, data) {
  return withTransaction(async (client) => {
    await lockLearnerRecommendationState(client, learnerId);
    const owned = await client.query("SELECT * FROM mission_attempts WHERE id=$1 AND learner_id=$2 FOR UPDATE", [attemptId, learnerId]);
    if (!owned.rowCount || owned.rows[0].status !== "in_progress") return null;
    await initializeAdaptiveState(client, owned.rows[0]);
    const required = await client.query(`SELECT cfg.paper_practice_required,s.independent_attempt_recorded,s.paper_confirmed,s.paper_step_completed
      FROM mission_step_learning_config cfg
      JOIN attempt_challenge_state s ON s.attempt_id=$1 AND s.challenge_variant_id=cfg.challenge_variant_id
      WHERE cfg.mission_id=$2`, [attemptId, owned.rows[0].mission_id]);
    if (required.rows.some((row) => !row.independent_attempt_recorded || (row.paper_practice_required && (!row.paper_confirmed || !row.paper_step_completed)))) return null;
    const result = await client.query(`UPDATE mission_attempts SET status='completed', current_step=$2,
      completed_steps=$3, response_data=$4::jsonb, explanation=$5, reflection=$6,
      last_saved_at=NOW(), completed_at=NOW() WHERE id=$1 RETURNING *`,
      [attemptId, data.currentStep, data.completedSteps, JSON.stringify(data.responses), data.explanation, data.reflection]);
    const attempt = result.rows[0];
    await client.query("UPDATE missions SET status='completed', completed_at=NOW() WHERE id=$1", [attempt.mission_id]);
    if (process.env.NODE_ENV === "test" && process.env.ATLAS_TEST_COMPLETION_FAILURE === "after_attempt_update") throw new Error("Injected completion failure");
    await client.query(`INSERT INTO progress_events (learner_id, mission_id, event_type, summary)
      SELECT learner_id, id, 'mission_completed', 'Completed ' || title FROM missions WHERE id=$1`, [attempt.mission_id]);
    const mission = await client.query("SELECT domains FROM missions WHERE id=$1", [attempt.mission_id]);
    await storeObservations(client, { attemptId, learnerId, missionId: attempt.mission_id }, completionObservations({
      retryOfAttemptId: attempt.retry_of_attempt_id, confidence: data.responses.confidence,
      hasExplanation: Boolean(data.explanation?.trim()), completedStepRatio: data.completedSteps.length, domains: mission.rows[0].domains
    }));
    await invalidateRecommendation(client, learnerId);
    if (process.env.NODE_ENV === "test" && process.env.ATLAS_TEST_GROWTH_DNA_FAILURE === "after_profile_update") throw new Error("Injected Growth DNA failure");
    return attemptView(attempt);
  });
}

export async function abandonAttempt(attemptId) {
  return withTransaction(async (client) => {
    const owner = await client.query("SELECT learner_id FROM mission_attempts WHERE id=$1", [attemptId]);
    if (!owner.rowCount) return null;
    await lockLearnerRecommendationState(client, owner.rows[0].learner_id);
    const result = await client.query(`UPDATE mission_attempts SET status='abandoned', abandoned_at=NOW(), last_saved_at=NOW()
      WHERE id=$1 AND status='in_progress' RETURNING *`, [attemptId]);
    if (!result.rowCount) return null;
    const attempt = result.rows[0];
    const completed = await client.query("SELECT 1 FROM mission_attempts WHERE mission_id=$1 AND status='completed' LIMIT 1", [attempt.mission_id]);
    if (!completed.rowCount) await client.query("UPDATE missions SET status='not_started', completed_at=NULL WHERE id=$1", [attempt.mission_id]);
    await storeObservations(client, { attemptId, learnerId: attempt.learner_id, missionId: attempt.mission_id }, lifecycleObservations("mission_abandoned", { completedStepRatio: attempt.completed_steps.length }));
    await invalidateRecommendation(client, attempt.learner_id);
    return attemptView(attempt);
  });
}

export async function retryAttempt(attemptId, learnerId) {
  return withTransaction(async (client) => {
    await lockLearnerRecommendationState(client, learnerId);
    const original = await client.query("SELECT * FROM mission_attempts WHERE id=$1 AND learner_id=$2 AND status='completed' FOR SHARE", [attemptId, learnerId]);
    if (!original.rowCount) return null;
    const active = await client.query("SELECT * FROM mission_attempts WHERE mission_id=$1 AND learner_id=$2 AND status='in_progress' LIMIT 1", [original.rows[0].mission_id, learnerId]);
    if (active.rowCount) {
      await initializeAdaptiveState(client, active.rows[0]);
      return attemptView(active.rows[0]);
    }
    const result = await client.query(`INSERT INTO mission_attempts
      (mission_id,learner_id,status,current_step,completed_steps,response_data,retry_of_attempt_id)
      VALUES ($1,$2,'in_progress',0,ARRAY[]::INTEGER[],'{}'::jsonb,$3) RETURNING *`,
      [original.rows[0].mission_id, learnerId, attemptId]);
    await initializeAdaptiveState(client, result.rows[0]);
    await client.query("UPDATE missions SET status='in_progress' WHERE id=$1", [original.rows[0].mission_id]);
    await storeObservations(client, { attemptId: Number(result.rows[0].id), learnerId, missionId: original.rows[0].mission_id }, lifecycleObservations("mission_retried"));
    await invalidateRecommendation(client, learnerId);
    return attemptView(result.rows[0]);
  });
}

function recommendationView(row) {
  if (!row) return null;
  return { learnerId: row.learner_id, missionId: row.mission_id, title: row.title, reason: row.reason,
    rulesApplied: row.rules_applied, supportedGrowthAreas: row.supported_growth_areas,
    ruleVersion: row.rule_version, generatedAt: row.generated_at };
}

async function loadRecommendationEvidence(client, learnerId) {
  const learner = await client.query("SELECT 1 FROM learners WHERE id=$1", [learnerId]);
  if (!learner.rowCount) return undefined;
  const missions = await client.query("SELECT id,title,duration_minutes,domains FROM missions WHERE learner_id=$1 ORDER BY id", [learnerId]);
  const attempts = await client.query("SELECT id,mission_id,status,retry_of_attempt_id,current_step,completed_steps,last_saved_at FROM mission_attempts WHERE learner_id=$1 ORDER BY id", [learnerId]);
  const prerequisites = await client.query(`SELECT p.mission_id,p.prerequisite_mission_id FROM mission_prerequisites p
    JOIN missions m ON m.id=p.mission_id WHERE m.learner_id=$1 ORDER BY p.mission_id,p.prerequisite_mission_id`, [learnerId]);
  const observations = await client.query("SELECT id,dimension FROM learner_observations WHERE learner_id=$1 ORDER BY id", [learnerId]);
  return { missions: missions.rows, attempts: attempts.rows, prerequisites: prerequisites.rows, observations: observations.rows };
}

async function calculateRecommendation(client, learnerId, evidence) {
  const selected = selectRecommendation(evidence);
  if (!selected) return null;
  const fingerprint = evidenceFingerprint(evidence);
  const inserted = await client.query(`INSERT INTO mission_recommendations
    (learner_id,mission_id,reason,rules_applied,supported_growth_areas,rule_version,evidence_fingerprint)
    VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7) ON CONFLICT (learner_id) DO UPDATE SET
    mission_id=EXCLUDED.mission_id,reason=EXCLUDED.reason,rules_applied=EXCLUDED.rules_applied,
    supported_growth_areas=EXCLUDED.supported_growth_areas,rule_version=EXCLUDED.rule_version,
    evidence_fingerprint=EXCLUDED.evidence_fingerprint,generated_at=NOW() RETURNING *`,
    [learnerId, selected.missionId, selected.reason, JSON.stringify(selected.rulesApplied), selected.supportedGrowthAreas, selected.ruleVersion, fingerprint]);
  await client.query(`INSERT INTO recommendation_history
    (learner_id,mission_id,reason,rules_applied,supported_growth_areas,rule_version,evidence_fingerprint,generated_at)
    SELECT learner_id,mission_id,reason,rules_applied,supported_growth_areas,rule_version,evidence_fingerprint,generated_at
    FROM mission_recommendations WHERE learner_id=$1 ON CONFLICT (learner_id,evidence_fingerprint) DO NOTHING`, [learnerId]);
  return { ...inserted.rows[0], title: selected.title };
}

export async function getRecommendation(learnerId) {
  return withTransaction(async (client) => {
    await lockLearnerRecommendationState(client, learnerId);
    const evidence = await loadRecommendationEvidence(client, learnerId);
    if (evidence === undefined) return undefined;
    const current = await client.query(`SELECT r.*,m.title FROM mission_recommendations r JOIN missions m ON m.id=r.mission_id WHERE r.learner_id=$1`, [learnerId]);
    const fingerprint = evidenceFingerprint(evidence);
    if (current.rowCount && current.rows[0].evidence_fingerprint === fingerprint && current.rows[0].rule_version === RECOMMENDATION_RULE_VERSION) return recommendationView(current.rows[0]);
    if (current.rowCount) await invalidateRecommendation(client, learnerId);
    return recommendationView(await calculateRecommendation(client, learnerId, evidence));
  });
}

export async function recalculateRecommendation(learnerId) {
  return withTransaction(async (client) => {
    await lockLearnerRecommendationState(client, learnerId);
    const evidence = await loadRecommendationEvidence(client, learnerId);
    if (evidence === undefined) return undefined;
    await invalidateRecommendation(client, learnerId);
    return recommendationView(await calculateRecommendation(client, learnerId, evidence));
  });
}

export async function getRecommendationHistory(learnerId) {
  const result = await query(`SELECT h.*,m.title FROM recommendation_history h JOIN missions m ON m.id=h.mission_id
    WHERE h.learner_id=$1 ORDER BY h.recorded_at DESC,h.id DESC`, [learnerId]);
  return result.rows.map(recommendationView);
}

export async function redactAttemptResponses(attemptId, deletionReason) {
  return withTransaction(async (client) => {
    const owner = await client.query("SELECT learner_id FROM mission_attempts WHERE id=$1", [attemptId]);
    if (!owner.rowCount) return null;
    await lockLearnerRecommendationState(client, owner.rows[0].learner_id);
    const result = await client.query(`UPDATE mission_attempts SET response_data='{}'::jsonb, explanation=NULL,
      reflection=NULL, retention_status='redacted', retained_until=NULL, deleted_at=NOW(), deletion_reason=$2
      WHERE id=$1 AND retention_status <> 'redacted' RETURNING *`, [attemptId, deletionReason]);
    if (!result.rowCount) return null;
    await client.query(`UPDATE learning_responses SET response_data='{}'::jsonb, retention_status='redacted',
      retained_until=NULL, deleted_at=NOW() WHERE attempt_id=$1 AND retention_status <> 'redacted'`, [attemptId]);
    return attemptView(result.rows[0]);
  });
}
