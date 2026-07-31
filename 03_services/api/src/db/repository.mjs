import { query } from "./client.mjs";

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
  const result = await query(
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

  return result.rows[0] || null;
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
  const parentResult = await query(
    `
      SELECT id, name
      FROM parents
      WHERE id = $1
      LIMIT 1
    `,
    [parentId]
  );
  const parent = parentResult.rows[0];

  if (!parent) {
    return null;
  }

  const childrenResult = await query(
    `
      SELECT
        learners.id,
        learners.display_name,
        COUNT(missions.id)::int AS total_mission_count,
        COUNT(missions.id) FILTER (WHERE missions.status = 'completed')::int AS completed_mission_count,
        learners.next_focus,
        learners.family_mission,
        COALESCE(
          ARRAY_AGG(missions.title ORDER BY missions.completed_at ASC)
            FILTER (WHERE missions.status = 'completed'),
          ARRAY[]::text[]
        ) AS completed_titles
      FROM learners
      LEFT JOIN missions
        ON missions.learner_id = learners.id
      WHERE learners.parent_id = $1
      GROUP BY learners.id, learners.display_name, learners.next_focus, learners.family_mission
      ORDER BY learners.display_name ASC
    `,
    [parentId]
  );

  const historyResult = await query(
    `SELECT learner_id, event_type, summary, created_at FROM progress_events
     WHERE learner_id IN (SELECT id FROM learners WHERE parent_id = $1)
     ORDER BY created_at DESC`, [parentId]
  );

  return {
    parent: { id: parent.id, name: parent.name },
    children: childrenResult.rows.map((child) => ({
      id: child.id,
      name: child.display_name,
      completedMissionCount: child.completed_mission_count,
      activeMissionCount: child.total_mission_count - child.completed_mission_count,
      highlights: child.completed_titles.length
        ? child.completed_titles.map((title) => `Completed ${title}`)
        : ["No missions completed yet today"],
      nextFocus: child.next_focus,
      familyMission: child.family_mission,
      progressHistory: historyResult.rows.filter((event) => event.learner_id === child.id).map((event) => ({
        type: event.event_type, summary: event.summary, createdAt: event.created_at
      }))
    }))
  };
}

export async function getMissionAttempts(learnerId) {
  const result = await query(
    `SELECT mission_id, status, explanation, reflection, created_at
     FROM mission_attempts WHERE learner_id = $1 ORDER BY created_at DESC`, [learnerId]
  );
  return result.rows.map((row) => ({
    missionId: row.mission_id, status: row.status, explanation: row.explanation,
    reflection: row.reflection, createdAt: row.created_at
  }));
}
