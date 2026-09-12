import { randomUUID } from "node:crypto";
import { query } from "./client.mjs";

function sessionView(row) {
  if (!row) return null;
  return {
    id: row.id,
    parentId: row.parent_id,
    learnerId: row.learner_id,
    learnerName: row.learner_name,
    status: row.status,
    sessionLabel: row.session_label,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    observationCount: row.observation_count === undefined ? undefined : Number(row.observation_count)
  };
}

function observationView(row) {
  return {
    id: Number(row.id),
    sessionId: row.session_id,
    learnerId: row.learner_id,
    category: row.category,
    observation: row.observation,
    createdAt: row.created_at
  };
}

export async function createPilotSession(parentId, learnerId, sessionLabel) {
  const id = randomUUID();
  const result = await query(`
    INSERT INTO pilot_sessions (id,parent_id,learner_id,status,session_label)
    SELECT $1,$2,l.id,'planned',$4
    FROM learners l
    WHERE l.id=$3 AND l.parent_id=$2
    RETURNING *`, [id, parentId, learnerId, sessionLabel]);
  return sessionView(result.rows[0]);
}

export async function listPilotSessions(parentId) {
  const result = await query(`
    SELECT s.*,l.display_name AS learner_name,
      (SELECT count(*) FROM pilot_observations o WHERE o.session_id=s.id) AS observation_count
    FROM pilot_sessions s
    JOIN learners l ON l.id=s.learner_id
    WHERE s.parent_id=$1
    ORDER BY s.created_at DESC,s.id DESC`, [parentId]);
  return result.rows.map(sessionView);
}

export async function getPilotSession(parentId, sessionId) {
  const sessionResult = await query(`
    SELECT s.*,l.display_name AS learner_name,
      (SELECT count(*) FROM pilot_observations o WHERE o.session_id=s.id) AS observation_count
    FROM pilot_sessions s
    JOIN learners l ON l.id=s.learner_id
    WHERE s.id=$1 AND s.parent_id=$2
    LIMIT 1`, [sessionId, parentId]);
  const session = sessionView(sessionResult.rows[0]);
  if (!session) return null;
  const observations = await query(`
    SELECT id,session_id,learner_id,category,observation,created_at
    FROM pilot_observations
    WHERE session_id=$1 AND parent_id=$2
    ORDER BY created_at ASC,id ASC`, [sessionId, parentId]);
  return { ...session, observations: observations.rows.map(observationView) };
}

export async function startPilotSession(parentId, sessionId) {
  const result = await query(`
    UPDATE pilot_sessions
    SET status='active',started_at=COALESCE(started_at,NOW()),updated_at=NOW()
    WHERE id=$1 AND parent_id=$2 AND status='planned'
    RETURNING *`, [sessionId, parentId]);
  return sessionView(result.rows[0]);
}

export async function completePilotSession(parentId, sessionId) {
  const result = await query(`
    UPDATE pilot_sessions
    SET status='completed',completed_at=NOW(),updated_at=NOW()
    WHERE id=$1 AND parent_id=$2 AND status='active'
    RETURNING *`, [sessionId, parentId]);
  return sessionView(result.rows[0]);
}

export async function addPilotObservation(parentId, sessionId, category, observation) {
  const result = await query(`
    INSERT INTO pilot_observations (session_id,parent_id,learner_id,category,observation)
    SELECT s.id,s.parent_id,s.learner_id,$3,$4
    FROM pilot_sessions s
    WHERE s.id=$1 AND s.parent_id=$2 AND s.status='active'
    RETURNING id,session_id,learner_id,category,observation,created_at`,
    [sessionId, parentId, category, observation]);
  return result.rows[0] ? observationView(result.rows[0]) : null;
}
