import { query, withTransaction } from "./client.mjs";
import { completionObservations, GROWTH_DIMENSIONS, GROWTH_DNA_MODEL_VERSION, lifecycleObservations, OBSERVATION_RULE_VERSION, storeObservations } from "../growth-dna.mjs";
import { evidenceFingerprint, selectRecommendation } from "../recommendations.mjs";

async function invalidateRecommendation(client, learnerId) {
  await client.query("DELETE FROM mission_recommendations WHERE learner_id=$1", [learnerId]);
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

  if (!learner) {
    return null;
  }

  const [missionsResult, scoresResult] = await Promise.all([
    query(
      `
        SELECT id, title, duration_minutes, domains, status
        FROM missions
        WHERE learner_id = $1
        ORDER BY duration_minutes DESC, title ASC
      `,
      [learnerId]
    ),
    query(
      `
        SELECT domain, score, trend
        FROM capability_scores
        WHERE learner_id = $1
        ORDER BY domain ASC
      `,
      [learnerId]
    )
  ]);

  return {
    learner: {
      id: learner.id,
      name: learner.display_name,
      grade: learner.grade,
      journey: learner.journey,
      learningLevel: learner.learning_level,
      languages: {
        primary: learner.primary_language,
        secondary: learner.secondary_language,
        international: learner.international_language
      },
      interests: learner.interests,
      focusAreas: learner.focus_areas
    },
    companionMessage: learner.companion_message,
    todayMissions: missionsResult.rows.map((mission) => ({
      id: mission.id,
      title: mission.title,
      durationMinutes: mission.duration_minutes,
      domains: mission.domains,
      status: mission.status
    })),
    capabilityScores: scoresResult.rows
  };
}

export async function getMissionDetail(missionId) {
  const missionResult = await query(
    `
      SELECT id, learner_id, title, summary, duration_minutes, domains, status, completed_at
      FROM missions
      WHERE id = $1
      LIMIT 1
    `,
    [missionId]
  );
  const mission = missionResult.rows[0];

  if (!mission) {
    return null;
  }

  const [objectivesResult, stepsResult] = await Promise.all([
    query(
      `
        SELECT objective_text
        FROM mission_objectives
        WHERE mission_id = $1
        ORDER BY objective_order ASC
      `,
      [missionId]
    ),
    query(
      `
        SELECT step_order, step_type, title, instruction
        FROM mission_steps
        WHERE mission_id = $1
        ORDER BY step_order ASC
      `,
      [missionId]
    )
  ]);

  return {
    id: mission.id,
    learnerId: mission.learner_id,
    title: mission.title,
    durationMinutes: mission.duration_minutes,
    domains: mission.domains,
    status: mission.status,
    completedAt: mission.completed_at,
    summary: mission.summary,
    objectives: objectivesResult.rows.map((row) => row.objective_text),
    steps: stepsResult.rows.map((step) => ({
      order: step.step_order,
      type: step.step_type,
      title: step.title,
      instruction: step.instruction
    }))
  };
}

export async function completeMission(missionId, { explanation = "Completed during the mission.", reflection = "Ready to keep learning." } = {}) {
  return withTransaction(async (client) => {
  const result = await client.query(
    `
      WITH completed AS (
        UPDATE missions SET status = 'completed', completed_at = COALESCE(completed_at, NOW())
        WHERE id = $1 RETURNING id, learner_id, title, status
      ), attempt AS (
        INSERT INTO mission_attempts (mission_id, learner_id, status, explanation, reflection)
        SELECT id, learner_id, 'completed', $2, $3 FROM completed
        RETURNING id
      ), event AS (
        INSERT INTO progress_events (learner_id, mission_id, event_type, summary)
        SELECT learner_id, id, 'mission_completed', 'Completed ' || title FROM completed
      )
      SELECT completed.id, completed.learner_id, completed.status, attempt.id AS attempt_id
      FROM completed CROSS JOIN attempt
    `,
    [missionId, explanation, reflection]
  );

  if (result.rowCount) await invalidateRecommendation(client, result.rows[0].learner_id);
  return result.rows[0] || null;
  });
}

export async function saveCompanionMessage({ learnerId, missionId, message, reply }) {
  const result = await query(
    `
      INSERT INTO companion_messages (learner_id, mission_id, user_message, mock_reply)
      VALUES ($1, $2, $3, $4)
      RETURNING learner_id, mission_id, user_message, mock_reply, created_at
    `,
    [learnerId, missionId || null, message, reply]
  );

  const row = result.rows[0];
  return {
    learnerId: row.learner_id,
    missionId: row.mission_id,
    message: row.user_message,
    reply: row.mock_reply,
    createdAt: row.created_at
  };
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
    nextFocus: child.next_focus, familyMission: child.family_mission,
    recommendation: recommendations[index],
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
  const result = await query(
    `SELECT id, mission_id, status, retry_of_attempt_id, retention_status,
            created_at, completed_at, abandoned_at
     FROM mission_attempts WHERE learner_id = $1 ORDER BY created_at DESC`, [learnerId]
  );
  return result.rows.map((row) => ({
    id: Number(row.id), missionId: row.mission_id, status: row.status,
    retryOfAttemptId: row.retry_of_attempt_id && Number(row.retry_of_attempt_id),
    retentionStatus: row.retention_status, createdAt: row.created_at,
    completedAt: row.completed_at, abandonedAt: row.abandoned_at
  }));
}

function attemptView(row) {
  if (!row) return null;
  const redacted = row.retention_status === "redacted";
  return { id: Number(row.id), missionId: row.mission_id, learnerId: row.learner_id, status: row.status,
    currentStep: row.current_step, completedSteps: row.completed_steps, responses: redacted ? {} : row.response_data,
    retryOfAttemptId: row.retry_of_attempt_id && Number(row.retry_of_attempt_id),
    retentionStatus: row.retention_status, retainedUntil: row.retained_until,
    startedAt: row.started_at, lastSavedAt: row.last_saved_at, completedAt: row.completed_at,
    abandonedAt: row.abandoned_at, deletedAt: row.deleted_at };
}

export async function startOrResumeAttempt(missionId, learnerId) {
  return withTransaction(async (client) => {
  const existing = await client.query(`SELECT * FROM mission_attempts WHERE mission_id=$1 AND learner_id=$2
    AND status='in_progress' ORDER BY last_saved_at DESC LIMIT 1`, [missionId, learnerId]);
  if (existing.rowCount) return attemptView(existing.rows[0]);
  const completed = await client.query(`SELECT 1 FROM mission_attempts WHERE mission_id=$1 AND learner_id=$2
    AND status='completed' LIMIT 1`, [missionId, learnerId]);
  if (completed.rowCount) return null;
  const result = await client.query(`INSERT INTO mission_attempts
    (mission_id, learner_id, status, current_step, completed_steps, response_data)
    VALUES ($1,$2,'in_progress',0,ARRAY[]::INTEGER[],'{}'::JSONB) RETURNING *`, [missionId, learnerId]);
  await client.query("UPDATE missions SET status='in_progress' WHERE id=$1 AND status <> 'completed'", [missionId]);
  await invalidateRecommendation(client, learnerId);
  return attemptView(result.rows[0]);
  });
}

export async function getLatestAttempt(missionId, learnerId) {
  const result = await query(`SELECT * FROM mission_attempts WHERE mission_id=$1 AND learner_id=$2
    AND status='in_progress' ORDER BY last_saved_at DESC LIMIT 1`, [missionId, learnerId]);
  return attemptView(result.rows[0]);
}

export async function getAttempt(attemptId) {
  const result = await query("SELECT * FROM mission_attempts WHERE id=$1", [attemptId]);
  return attemptView(result.rows[0]);
}

export async function saveAttempt(attemptId, { currentStep, completedSteps, responses }) {
  return withTransaction(async (client) => {
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
    const owned = await client.query("SELECT * FROM mission_attempts WHERE id=$1 AND learner_id=$2 FOR UPDATE", [attemptId, learnerId]);
    if (!owned.rowCount || owned.rows[0].status !== "in_progress") return null;
    const result = await client.query(`UPDATE mission_attempts SET status='completed', current_step=$2,
      completed_steps=$3, response_data=$4::jsonb, explanation=$5, reflection=$6,
      last_saved_at=NOW(), completed_at=NOW() WHERE id=$1 RETURNING *`,
      [attemptId, data.currentStep, data.completedSteps, JSON.stringify(data.responses), data.explanation, data.reflection]);
    const attempt = result.rows[0];
    await client.query("UPDATE missions SET status='completed', completed_at=NOW() WHERE id=$1", [attempt.mission_id]);
    if (process.env.NODE_ENV === "test" && process.env.ATLAS_TEST_COMPLETION_FAILURE === "after_attempt_update") {
      throw new Error("Injected completion failure");
    }
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
    const result = await client.query(`UPDATE mission_attempts SET status='abandoned', abandoned_at=NOW(),
      last_saved_at=NOW() WHERE id=$1 AND status='in_progress' RETURNING *`, [attemptId]);
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
    const original = await client.query("SELECT * FROM mission_attempts WHERE id=$1 AND learner_id=$2 AND status='completed' FOR SHARE", [attemptId, learnerId]);
    if (!original.rowCount) return null;
    const active = await client.query("SELECT * FROM mission_attempts WHERE mission_id=$1 AND learner_id=$2 AND status='in_progress' LIMIT 1", [original.rows[0].mission_id, learnerId]);
    if (active.rowCount) return attemptView(active.rows[0]);
    const result = await client.query(`INSERT INTO mission_attempts
      (mission_id, learner_id, status, current_step, completed_steps, response_data, retry_of_attempt_id)
      VALUES ($1,$2,'in_progress',0,ARRAY[]::INTEGER[],'{}'::jsonb,$3) RETURNING *`,
      [original.rows[0].mission_id, learnerId, attemptId]);
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

async function calculateRecommendation(client, learnerId) {
  const learner = await client.query("SELECT 1 FROM learners WHERE id=$1", [learnerId]);
  if (!learner.rowCount) return undefined;
  const [missions, attempts, prerequisites, observations] = await Promise.all([
    client.query("SELECT id,title,duration_minutes,domains FROM missions WHERE learner_id=$1 ORDER BY id", [learnerId]),
    client.query("SELECT id,mission_id,status,retry_of_attempt_id,last_saved_at FROM mission_attempts WHERE learner_id=$1 ORDER BY id", [learnerId]),
    client.query(`SELECT p.mission_id,p.prerequisite_mission_id FROM mission_prerequisites p
      JOIN missions m ON m.id=p.mission_id WHERE m.learner_id=$1 ORDER BY p.mission_id,p.prerequisite_mission_id`, [learnerId]),
    client.query("SELECT id,dimension FROM learner_observations WHERE learner_id=$1 ORDER BY id", [learnerId])
  ]);
  const evidence = { missions: missions.rows, attempts: attempts.rows, prerequisites: prerequisites.rows, observations: observations.rows };
  const selected = selectRecommendation(evidence);
  if (!selected) return null;
  const fingerprint = evidenceFingerprint(evidence);
  const inserted = await client.query(`INSERT INTO mission_recommendations
    (learner_id,mission_id,reason,rules_applied,supported_growth_areas,rule_version,evidence_fingerprint)
    VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7) ON CONFLICT (learner_id) DO UPDATE SET
    mission_id=EXCLUDED.mission_id,reason=EXCLUDED.reason,rules_applied=EXCLUDED.rules_applied,
    supported_growth_areas=EXCLUDED.supported_growth_areas,rule_version=EXCLUDED.rule_version,
    evidence_fingerprint=EXCLUDED.evidence_fingerprint,generated_at=NOW()
    RETURNING *`, [learnerId, selected.missionId, selected.reason, JSON.stringify(selected.rulesApplied), selected.supportedGrowthAreas, selected.ruleVersion, fingerprint]);
  await client.query(`INSERT INTO recommendation_history
    (learner_id,mission_id,reason,rules_applied,supported_growth_areas,rule_version,evidence_fingerprint,generated_at)
    SELECT learner_id,mission_id,reason,rules_applied,supported_growth_areas,rule_version,evidence_fingerprint,generated_at
    FROM mission_recommendations WHERE learner_id=$1 ON CONFLICT (learner_id,evidence_fingerprint) DO NOTHING`, [learnerId]);
  return { ...inserted.rows[0], title: selected.title };
}

export async function getRecommendation(learnerId) {
  return withTransaction(async (client) => {
    const current = await client.query(`SELECT r.*,m.title FROM mission_recommendations r JOIN missions m ON m.id=r.mission_id WHERE r.learner_id=$1`, [learnerId]);
    if (current.rowCount) return recommendationView(current.rows[0]);
    const calculated = await calculateRecommendation(client, learnerId);
    return calculated === undefined ? undefined : recommendationView(calculated);
  });
}

export async function recalculateRecommendation(learnerId) {
  return withTransaction(async (client) => {
    await invalidateRecommendation(client, learnerId);
    const calculated = await calculateRecommendation(client, learnerId);
    return calculated === undefined ? undefined : recommendationView(calculated);
  });
}

export async function getRecommendationHistory(learnerId) {
  const result = await query(`SELECT h.*,m.title FROM recommendation_history h JOIN missions m ON m.id=h.mission_id
    WHERE h.learner_id=$1 ORDER BY h.recorded_at DESC,h.id DESC`, [learnerId]);
  return result.rows.map(recommendationView);
}

export async function redactAttemptResponses(attemptId, deletionReason) {
  const result = await query(`UPDATE mission_attempts SET response_data='{}'::jsonb, explanation=NULL,
    reflection=NULL, retention_status='redacted', retained_until=NULL, deleted_at=NOW(), deletion_reason=$2
    WHERE id=$1 AND retention_status <> 'redacted' RETURNING *`, [attemptId, deletionReason]);
  return attemptView(result.rows[0]);
}
