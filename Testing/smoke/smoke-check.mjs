import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { completionObservations, storeObservations } from "../../03_services/api/src/growth-dna.mjs";

const apiPort = 3101;
const webPort = 3100;
const root = fileURLToPath(new URL("../../", import.meta.url));
const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/atlas_hdos_dev";

function start(command, args, env) {
  return spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: "ignore" });
}

async function run(command, args, env = {}) {
  const child = start(command, args, env);
  return new Promise((resolve, reject) => {
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`)));
  });
}

async function stop(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
    setTimeout(resolve, 1000);
  });
}

async function waitFor(url, attempts = 30) {
  for (let index = 0; index < attempts; index += 1) {
    try { const response = await fetch(url); if (response.ok) return; }
    catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForQuery(pool, text, values, predicate, attempts = 50) {
  for (let index = 0; index < attempts; index += 1) {
    const result = await pool.query(text, values);
    if (predicate(result)) return result;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for database condition: ${text}`);
}

async function api(path, options = {}) {
  const response = await fetch(`http://localhost:${apiPort}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} failed: ${JSON.stringify(body)}`);
  return body;
}

function assert(condition, message) { if (!condition) throw new Error(message); }

let apiProcess;
let webProcess;
const verificationPool = new pg.Pool({ connectionString: databaseUrl });

try {
  await run("node", ["03_services/api/src/db/migrate.mjs"], { DATABASE_URL: databaseUrl });
  const firstLedger = await verificationPool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE migration_id='008_growth_dna_foundation'");
  assert(firstLedger.rows[0].count === 1, "Migration 008 was not recorded exactly once after its first run");
  const adaptiveLedger = await verificationPool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE migration_id='009_adaptive_learning'");
  assert(adaptiveLedger.rows[0].count === 1, "Migration 009 was not recorded exactly once after its first run");
  const supportLedger = await verificationPool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE migration_id='010_adaptive_support'");
  assert(supportLedger.rows[0].count === 1, "Migration 010 was not recorded exactly once after its first run");
  const migrationCountBeforeRerun = await verificationPool.query("SELECT count(*)::int AS count FROM schema_migrations");
  await run("node", ["03_services/api/src/db/migrate.mjs"], { DATABASE_URL: databaseUrl });
  const migrationCountAfterRerun = await verificationPool.query("SELECT count(*)::int AS count FROM schema_migrations");
  assert(migrationCountAfterRerun.rows[0].count === migrationCountBeforeRerun.rows[0].count, "Second migration run applied a migration again");
  const adaptiveLedgerAfterRerun = await verificationPool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE migration_id='009_adaptive_learning'");
  assert(adaptiveLedgerAfterRerun.rows[0].count === 1, "Second migration run duplicated migration 009");
  const supportLedgerAfterRerun = await verificationPool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE migration_id='010_adaptive_support'");
  assert(supportLedgerAfterRerun.rows[0].count === 1, "Second migration run duplicated migration 010");
  await run("node", ["03_services/api/src/db/seed.mjs"], { DATABASE_URL: databaseUrl });
  const ledger = await verificationPool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE migration_id='007_transaction_safety'");
  assert(ledger.rows[0].count === 1, "Migration 007 was not recorded exactly once");
  const growthLedger = await verificationPool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE migration_id='008_growth_dna_foundation'");
  assert(growthLedger.rows[0].count === 1, "Migration 008 was not recorded exactly once");
  const recommendationLedger = await verificationPool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE migration_id='009_adaptive_learning'");
  assert(recommendationLedger.rows[0].count === 1, "Migration 009 was not recorded exactly once");
  const finalSupportLedger = await verificationPool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE migration_id='010_adaptive_support'");
  assert(finalSupportLedger.rows[0].count === 1, "Migration 010 was not recorded exactly once");

  apiProcess = start("node", ["03_services/api/src/server.mjs"], { ATLAS_API_PORT: String(apiPort), DATABASE_URL: databaseUrl });
  webProcess = start("node", ["02_apps/web/server.mjs"], { ATLAS_WEB_PORT: String(webPort) });
  await waitFor(`http://localhost:${apiPort}/health`);
  await waitFor(`http://localhost:${apiPort}/ready`);
  await waitFor(`http://localhost:${webPort}/`);

  const leagoLogin = await api("/auth/login", { method: "POST", body: JSON.stringify({ username: "leago", password: "atlas123" }) });
  assert(leagoLogin.user.name === "Leago", "Leago login failed");
  const siyanaLogin = await api("/auth/login", { method: "POST", body: JSON.stringify({ username: "siyana", password: "atlas123" }) });
  assert(siyanaLogin.user.name === "Siyana", "Siyana login failed");
  const leagoHeaders = { authorization: `Bearer ${leagoLogin.token}` };
  const siyanaHeaders = { authorization: `Bearer ${siyanaLogin.token}` };
  const parentLogin = await api("/auth/login", { method: "POST", body: JSON.stringify({ username: "parent", password: "atlas-parent-123" }) });
  assert(parentLogin.user.role === "parent", "Parent login failed");
  const parentHeaders = { authorization: `Bearer ${parentLogin.token}` };

  const leagoHome = await api(`/learners/${leagoLogin.user.id}/home`, { headers: leagoHeaders });
  assert(leagoHome.todayMissions.some((mission) => mission.title === "The Lost Fossil"), "Leago flow regressed");
  const home = await api(`/learners/${siyanaLogin.user.id}/home`, { headers: siyanaHeaders });
  assert(home.learner.learningLevel === "Foundation Phase", "Siyana profile did not load");
  assert(home.todayMissions.some((mission) => mission.title === "Japanese Greetings"), "Japanese mission missing");
  assert(home.todayMissions.some((mission) => mission.title === "Mandarin Greetings"), "Mandarin mission missing");

  const mission = await api("/missions/mission-junior-detective-maths", { headers: siyanaHeaders });
  assert(mission.title === "Junior Detective Maths" && mission.steps.length === 7, "Junior Detective Maths did not open with its complete flow");
  const siyanaAttempt = await api("/missions/mission-junior-detective-maths/attempts/start", { method: "POST", headers: siyanaHeaders, body: "{}" });

  await api(`/attempts/${siyanaAttempt.id}`, { method: "PATCH", headers: siyanaHeaders, body: JSON.stringify({ currentStep: 2, completedSteps: [0,1], responses: {} }) });
  let adaptivePlayer = await api(`/attempts/${siyanaAttempt.id}/player`, { headers: siyanaHeaders });
  assert(adaptivePlayer.challenge?.id === "siyana-pawprints-addition", "FP-010A challenge did not load at the configured step");
  assert(adaptivePlayer.challenge.paperPractice.required && adaptivePlayer.stateVersion === 1, "Paper-first adaptive state was not initialized safely");
  assert(!JSON.stringify(adaptivePlayer).includes("protectedAnswer") && !JSON.stringify(adaptivePlayer).includes("currentSupportPosition"), "Adaptive player leaked protected/internal state");

  adaptivePlayer = await api(`/attempts/${siyanaAttempt.id}/challenges/siyana-pawprints-addition/confirm-written`, {
    method: "POST", headers: { ...siyanaHeaders, "Idempotency-Key": "11111111-1111-4111-8111-111111111111" },
    body: JSON.stringify({ stateVersion: adaptivePlayer.stateVersion })
  });
  assert(adaptivePlayer.challenge.paperPractice.confirmedWritten && adaptivePlayer.stateVersion === 2, "Paper confirmation did not persist factually");
  adaptivePlayer = await api(`/attempts/${siyanaAttempt.id}/challenges/siyana-pawprints-addition/attempt`, {
    method: "POST", headers: { ...siyanaHeaders, "Idempotency-Key": "22222222-2222-4222-8222-222222222222" },
    body: JSON.stringify({ stateVersion: adaptivePlayer.stateVersion, response: { answer: 7 } })
  });
  assert(adaptivePlayer.stateVersion === 3 && adaptivePlayer.permittedActions.requestSupport, "Independent attempt did not unlock neutral support");
  const supportPath = `/attempts/${siyanaAttempt.id}/challenges/siyana-pawprints-addition/support`;
  const supportOptions = {
    method: "POST", headers: { ...siyanaHeaders, "Idempotency-Key": "33333333-3333-4333-8333-333333333333" },
    body: JSON.stringify({ stateVersion: adaptivePlayer.stateVersion })
  };
  const [supportOne, supportDuplicate] = await Promise.all([api(supportPath, supportOptions), api(supportPath, supportOptions)]);
  assert(supportOne.stateVersion === 4 && supportDuplicate.stateVersion === 4, "Duplicate support request advanced state more than once");
  assert(supportOne.challenge.support?.kind === "attention_prompt", "First support request did not return the first authored scaffold");
  const supportEventCounts = await verificationPool.query(`SELECT event_type,count(*)::int AS count FROM learning_interaction_events
    WHERE attempt_id=$1 AND event_type IN ('support_requested','support_presented') GROUP BY event_type ORDER BY event_type`, [siyanaAttempt.id]);
  assert(supportEventCounts.rows.every((row) => row.count === 1) && supportEventCounts.rowCount === 2, "Duplicate support request created duplicate factual events");
  const minimizedEvents = await verificationPool.query("SELECT facts FROM learning_interaction_events WHERE attempt_id=$1 ORDER BY event_sequence", [siyanaAttempt.id]);
  assert(!JSON.stringify(minimizedEvents.rows).includes('"answer":7'), "Raw learner answer leaked into interaction facts");
  const rawResponse = await verificationPool.query("SELECT response_data FROM learning_responses WHERE attempt_id=$1", [siyanaAttempt.id]);
  assert(rawResponse.rowCount === 1 && rawResponse.rows[0].response_data.answer === 7, "Raw response was not kept inside the dedicated response boundary");
  adaptivePlayer = await api(`/attempts/${siyanaAttempt.id}/challenges/siyana-pawprints-addition/paper-complete`, {
    method: "POST", headers: { ...siyanaHeaders, "Idempotency-Key": "44444444-4444-4444-8444-444444444444" },
    body: JSON.stringify({ stateVersion: supportOne.stateVersion })
  });
  assert(adaptivePlayer.challenge.paperPractice.stepCompleted && adaptivePlayer.stateVersion === 5, "Paper step completion did not persist");

  await api(`/attempts/${siyanaAttempt.id}`, { method: "PATCH", headers: siyanaHeaders, body: JSON.stringify({ currentStep: 3, completedSteps: [0,1,2], responses: { answer: 7 } }) });
  const siyanaResume = await api("/missions/mission-junior-detective-maths/attempts/latest", { headers: siyanaHeaders });
  assert(siyanaResume.currentStep === 3, "Siyana did not resume at the saved step");
  const leagoAttempt = await api("/missions/mission-lost-fossil/attempts/start", { method: "POST", headers: leagoHeaders, body: "{}" });
  await api(`/attempts/${leagoAttempt.id}`, { method: "PATCH", headers: leagoHeaders, body: JSON.stringify({ currentStep: 2, completedSteps: [0,1], responses: { short_text: "Fossils preserve evidence." } }) });
  assert((await api("/missions/mission-lost-fossil/attempts/latest", { headers: leagoHeaders })).currentStep === 2, "Leago did not resume");

  const leagoRecommendation = await api(`/learners/${leagoLogin.user.id}/recommendation`, { headers: leagoHeaders });
  const siyanaRecommendation = await api(`/learners/${siyanaLogin.user.id}/recommendation`, { headers: siyanaHeaders });
  assert(leagoRecommendation.recommendation?.missionId === "mission-lost-fossil", "Recommendation GET did not prioritize Leago's active attempt");
  assert(siyanaRecommendation.recommendation?.missionId === "mission-junior-detective-maths", "Recommendation GET did not prioritize Siyana's active attempt");
  const persistedRecommendations = await verificationPool.query("SELECT learner_id,mission_id FROM mission_recommendations WHERE learner_id=ANY($1::text[]) ORDER BY learner_id", [[leagoLogin.user.id, siyanaLogin.user.id]]);
  assert(persistedRecommendations.rowCount === 2, "Recommendation GET did not persist one current recommendation per learner");
  const historyAfterFirstGet = await verificationPool.query("SELECT learner_id,count(*)::int AS count FROM recommendation_history WHERE learner_id=ANY($1::text[]) GROUP BY learner_id", [[leagoLogin.user.id, siyanaLogin.user.id]]);
  const firstHistoryCounts = new Map(historyAfterFirstGet.rows.map((row) => [row.learner_id, row.count]));
  await api(`/learners/${siyanaLogin.user.id}/recommendation`, { headers: siyanaHeaders });
  const unchangedHistory = await verificationPool.query("SELECT count(*)::int AS count FROM recommendation_history WHERE learner_id=$1", [siyanaLogin.user.id]);
  assert(unchangedHistory.rows[0].count === firstHistoryCounts.get(siyanaLogin.user.id), "Repeated unchanged recommendation GET added a history row");
  const recalculated = await api(`/learners/${siyanaLogin.user.id}/recommendations/recalculate`, { method: "POST", headers: siyanaHeaders, body: "{}" });
  assert(recalculated.recommendation.missionId === siyanaRecommendation.recommendation.missionId && recalculated.recommendation.reason === siyanaRecommendation.recommendation.reason && JSON.stringify(recalculated.recommendation.rulesApplied) === JSON.stringify(siyanaRecommendation.recommendation.rulesApplied), "Explicit recalculation changed a recommendation without evidence changes");
  const historyAfterRecalculation = await verificationPool.query("SELECT count(*)::int AS count FROM recommendation_history WHERE learner_id=$1", [siyanaLogin.user.id]);
  assert(historyAfterRecalculation.rows[0].count === firstHistoryCounts.get(siyanaLogin.user.id), "Deterministic recalculation added duplicate recommendation history");

  const cacheBeforeCurriculumChange = await verificationPool.query("SELECT evidence_fingerprint,generated_at FROM mission_recommendations WHERE learner_id=$1", [siyanaLogin.user.id]);
  await verificationPool.query("INSERT INTO mission_prerequisites (mission_id,prerequisite_mission_id) VALUES ('mission-story-adventure','mission-junior-detective-maths') ON CONFLICT DO NOTHING");
  const afterPrerequisiteChange = await api(`/learners/${siyanaLogin.user.id}/recommendation`, { headers: siyanaHeaders });
  const cacheAfterCurriculumChange = await verificationPool.query("SELECT evidence_fingerprint,generated_at FROM mission_recommendations WHERE learner_id=$1", [siyanaLogin.user.id]);
  assert(cacheAfterCurriculumChange.rows[0].evidence_fingerprint !== cacheBeforeCurriculumChange.rows[0].evidence_fingerprint, "Prerequisite change returned an obsolete cached recommendation");
  assert(afterPrerequisiteChange.recommendation?.missionId === "mission-junior-detective-maths", "Prerequisite revalidation did not retain the eligible active mission");
  const unchangedPrerequisiteRead = await api(`/learners/${siyanaLogin.user.id}/recommendation`, { headers: siyanaHeaders });
  assert(unchangedPrerequisiteRead.recommendation.generatedAt === afterPrerequisiteChange.recommendation.generatedAt, "Unchanged evidence did not preserve cached recommendation generatedAt");
  await verificationPool.query("UPDATE mission_recommendations SET rule_version='obsolete-rule-version' WHERE learner_id=$1", [siyanaLogin.user.id]);
  const afterRuleMismatch = await api(`/learners/${siyanaLogin.user.id}/recommendation`, { headers: siyanaHeaders });
  assert(afterRuleMismatch.recommendation.ruleVersion === "adaptive-learning-v1", "Rule-version mismatch returned an obsolete cached recommendation");
  await verificationPool.query("DELETE FROM mission_prerequisites WHERE mission_id='mission-story-adventure' AND prerequisite_mission_id='mission-junior-detective-maths'");
  await api(`/learners/${siyanaLogin.user.id}/recommendation`, { headers: siyanaHeaders });

  const historyBeforeLifecycle = await verificationPool.query("SELECT learner_id,count(*)::int AS count FROM recommendation_history WHERE learner_id=ANY($1::text[]) GROUP BY learner_id", [[leagoLogin.user.id, siyanaLogin.user.id]]);
  const historyCountsBeforeLifecycle = new Map(historyBeforeLifecycle.rows.map((row) => [row.learner_id, row.count]));
  for (const learnerId of [leagoLogin.user.id, siyanaLogin.user.id]) {
    const parentRecommendation = await api(`/learners/${learnerId}/recommendation`, { headers: parentHeaders });
    assert(parentRecommendation.recommendation?.learnerId === learnerId, `Linked parent recommendation access was not child-specific for ${learnerId}`);
  }
  const siblingRecommendation = await fetch(`http://localhost:${apiPort}/learners/${siyanaLogin.user.id}/recommendation`, { headers: leagoHeaders });
  assert(siblingRecommendation.status === 403, "Learner accessed a sibling recommendation");

  await api(`/attempts/${siyanaAttempt.id}`, { method: "PATCH", headers: siyanaHeaders, body: JSON.stringify({ currentStep: 3, completedSteps: [0,1,2], responses: { answer: 7 } }) });
  const currentAfterSiyanaSave = await verificationPool.query("SELECT learner_id FROM mission_recommendations WHERE learner_id=ANY($1::text[]) ORDER BY learner_id", [[leagoLogin.user.id, siyanaLogin.user.id]]);
  assert(currentAfterSiyanaSave.rows.length === 1 && currentAfterSiyanaSave.rows[0].learner_id === leagoLogin.user.id, "Lifecycle invalidation removed another learner's current recommendation");
  const historyAfterSiyanaSave = await verificationPool.query("SELECT learner_id,count(*)::int AS count FROM recommendation_history WHERE learner_id=ANY($1::text[]) GROUP BY learner_id", [[leagoLogin.user.id, siyanaLogin.user.id]]);
  assert(historyAfterSiyanaSave.rows.every((row) => row.count === historyCountsBeforeLifecycle.get(row.learner_id)), "Lifecycle invalidation modified immutable recommendation history");
  const siyanaAfterSave = await api(`/learners/${siyanaLogin.user.id}/recommendation`, { headers: siyanaHeaders });
  assert(siyanaAfterSave.recommendation?.missionId === "mission-junior-detective-maths", "Progress invalidation did not produce a fresh recommendation on read");

  const summary = await api(`/parents/${siyanaLogin.user.parentId}/summary`, { headers: parentHeaders });
  assert(summary.children.some((child) => child.name === "Leago"), "Parent summary omitted Leago");
  const siyanaSummary = summary.children.find((child) => child.name === "Siyana");
  assert(siyanaSummary?.currentMission?.title === "Junior Detective Maths" && siyanaSummary.currentMission.percentage > 0, "Siyana in-progress parent impact missing");

  for (const learnerId of [leagoLogin.user.id, siyanaLogin.user.id]) await api(`/learners/${learnerId}/home`, { headers: parentHeaders });
  const isolated = await fetch(`http://localhost:${apiPort}/learners/${siyanaLogin.user.id}/home`, { headers: leagoHeaders });
  assert(isolated.status === 403, "Leago was not isolated from Siyana");
  const learnerParentSummary = await fetch(`http://localhost:${apiPort}/parents/${siyanaLogin.user.parentId}/summary`, { headers: siyanaHeaders });
  assert(learnerParentSummary.status === 403, "Learner accessed parent-only summary");
  const unknown = await fetch(`http://localhost:${apiPort}/learners/${siyanaLogin.user.id}/home`);
  assert(unknown.status === 401, "Unknown user was not denied");

  await stop(apiProcess);
  apiProcess = start("node", ["03_services/api/src/server.mjs"], { ATLAS_API_PORT: String(apiPort), DATABASE_URL: databaseUrl });
  await waitFor(`http://localhost:${apiPort}/ready`);
  const resumedAfterRestart = await api("/missions/mission-junior-detective-maths/attempts/latest", { headers: siyanaHeaders });
  assert(resumedAfterRestart.currentStep === 3 && resumedAfterRestart.responses.answer === 7, "Saved progress did not survive restart");
  const adaptiveStateAfterRestart = await verificationPool.query("SELECT current_support_position,paper_confirmed,paper_step_completed,state_version FROM attempt_challenge_state WHERE attempt_id=$1", [resumedAfterRestart.id]);
  assert(adaptiveStateAfterRestart.rows[0].current_support_position === 1 && adaptiveStateAfterRestart.rows[0].paper_confirmed && adaptiveStateAfterRestart.rows[0].paper_step_completed && adaptiveStateAfterRestart.rows[0].state_version === 5, "Adaptive support projection did not survive restart");
  const recommendationAfterRestart = await api(`/learners/${siyanaLogin.user.id}/recommendation`, { headers: siyanaHeaders });
  assert(recommendationAfterRestart.recommendation?.missionId === siyanaAfterSave.recommendation.missionId && recommendationAfterRestart.recommendation.generatedAt === siyanaAfterSave.recommendation.generatedAt, "Persisted recommendation state did not survive API restart");

  await stop(apiProcess);
  apiProcess = start("node", ["03_services/api/src/server.mjs"], { ATLAS_API_PORT: String(apiPort), DATABASE_URL: databaseUrl, NODE_ENV: "test", ATLAS_TEST_COMPLETION_FAILURE: "after_attempt_update" });
  await waitFor(`http://localhost:${apiPort}/ready`);
  const failedCompletion = await fetch(`http://localhost:${apiPort}/attempts/${resumedAfterRestart.id}/complete`, { method: "POST", headers: { ...siyanaHeaders, "content-type": "application/json" }, body: JSON.stringify({ currentStep: 6, completedSteps: [0,1,2,3,4,5,6], responses: { answer: 99 }, explanation: "must roll back", reflection: "must roll back" }) });
  assert(failedCompletion.status === 500, "Injected completion failure did not occur");
  const rolledBack = await verificationPool.query(`SELECT ma.status, ma.response_data, m.status AS mission_status,
    (SELECT count(*)::int FROM progress_events pe WHERE pe.mission_id=ma.mission_id AND pe.created_at >= ma.started_at) AS events
    FROM mission_attempts ma JOIN missions m ON m.id=ma.mission_id WHERE ma.id=$1`, [resumedAfterRestart.id]);
  assert(rolledBack.rows[0].status === "in_progress" && rolledBack.rows[0].mission_status !== "completed", "Injected failure left partial completion state");
  assert(rolledBack.rows[0].response_data.answer === 7 && rolledBack.rows[0].events === 0, "Rollback changed saved response data or added an event");

  await stop(apiProcess);
  apiProcess = start("node", ["03_services/api/src/server.mjs"], { ATLAS_API_PORT: String(apiPort), DATABASE_URL: databaseUrl });
  await waitFor(`http://localhost:${apiPort}/ready`);
  const serializationClient = await verificationPool.connect();
  let completionDuringLock;
  let recommendationDuringLock;
  try {
    await serializationClient.query("BEGIN");
    await serializationClient.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 9))", [siyanaLogin.user.id]);
    completionDuringLock = api(`/attempts/${resumedAfterRestart.id}/complete`, { method: "POST", headers: siyanaHeaders, body: JSON.stringify({ currentStep: 6, completedSteps: [0,1,2,3,4,5,6], responses: { answer: 7, explanation: "I added five and two.", confidence: "I understand" }, explanation: "Five plus two equals seven.", reflection: "I understand" }) });
    await waitForQuery(verificationPool, "SELECT count(*)::int AS count FROM pg_locks WHERE locktype='advisory' AND NOT granted", [], (result) => result.rows[0].count >= 1);
    recommendationDuringLock = api(`/learners/${siyanaLogin.user.id}/recommendation`, { headers: siyanaHeaders });
    await waitForQuery(verificationPool, "SELECT count(*)::int AS count FROM pg_locks WHERE locktype='advisory' AND NOT granted", [], (result) => result.rows[0].count >= 2);
    await serializationClient.query("COMMIT");
  } catch (error) {
    await serializationClient.query("ROLLBACK");
    throw error;
  } finally { serializationClient.release(); }
  await completionDuringLock;
  const serializedRecommendation = await recommendationDuringLock;
  assert(serializedRecommendation.recommendation?.missionId !== "mission-junior-detective-maths", "Concurrent lazy calculation persisted an obsolete active-attempt recommendation after completion");
  const currentAfterCompletion = await verificationPool.query("SELECT mission_id FROM mission_recommendations WHERE learner_id=$1", [siyanaLogin.user.id]);
  assert(currentAfterCompletion.rowCount === 1 && currentAfterCompletion.rows[0].mission_id === serializedRecommendation.recommendation.missionId, "Concurrent post-completion read did not persist only the fresh recommendation");
  const recommendationAfterCompletion = await api(`/learners/${siyanaLogin.user.id}/recommendation`, { headers: siyanaHeaders });
  assert(recommendationAfterCompletion.recommendation && recommendationAfterCompletion.recommendation.missionId !== "mission-junior-detective-maths", "Completion did not produce a fresh eligible recommendation on next read");
  const completedObservationState = await verificationPool.query(`SELECT count(*)::int AS observation_count,
    count(*) FILTER (WHERE dimension='numeracy')::int AS numeracy_observations,
    bool_and(NOT (metadata::text ILIKE '%Five plus two%' OR evidence_summary ILIKE '%Five plus two%')) AS minimized
    FROM learner_observations WHERE attempt_id=$1`, [resumedAfterRestart.id]);
  assert(completedObservationState.rows[0].observation_count > 0 && completedObservationState.rows[0].numeracy_observations > 0, "Completion did not create relevant Growth DNA observations");
  assert(completedObservationState.rows[0].minimized, "Observation retained learner answer content");
  const numeracyProfile = await verificationPool.query("SELECT current_level,evidence_count FROM learner_growth_dimensions WHERE learner_id=$1 AND dimension='numeracy'", [siyanaLogin.user.id]);
  assert(numeracyProfile.rowCount === 1 && numeracyProfile.rows[0].current_level > 50 && numeracyProfile.rows[0].evidence_count > 0, "Numeracy Growth DNA dimension was not updated");

  const profileBeforeReads = await api(`/learners/${siyanaLogin.user.id}/growth-dna`, { headers: siyanaHeaders });
  const observationsBeforeReads = await api(`/learners/${siyanaLogin.user.id}/observations`, { headers: siyanaHeaders });
  await api(`/learners/${siyanaLogin.user.id}/growth-dna`, { headers: siyanaHeaders });
  await api(`/learners/${siyanaLogin.user.id}/observations`, { headers: siyanaHeaders });
  const countAfterReads = await verificationPool.query("SELECT count(*)::int AS count FROM learner_observations WHERE attempt_id=$1", [resumedAfterRestart.id]);
  assert(countAfterReads.rows[0].count === completedObservationState.rows[0].observation_count, "Repeated profile reads duplicated observations");
  assert(profileBeforeReads.dimensions.some((dimension) => dimension.dimension === "numeracy" && dimension.evidenceCount > 0), "Learner profile omitted numeracy evidence");
  assert(observationsBeforeReads.observations.every((observation) => !JSON.stringify(observation).includes("Five plus two")), "Public observations exposed learner answers");

  const repeatedRules = completionObservations({ retryOfAttemptId: null, confidence: "I understand", hasExplanation: true, completedStepRatio: 7, domains: ["Foundation Mathematics", "Confidence"] });
  const client = await verificationPool.connect();
  try {
    await client.query("BEGIN");
    await storeObservations(client, { attemptId: resumedAfterRestart.id, learnerId: siyanaLogin.user.id, missionId: "mission-junior-detective-maths" }, repeatedRules);
    await storeObservations(client, { attemptId: resumedAfterRestart.id, learnerId: siyanaLogin.user.id, missionId: "mission-junior-detective-maths" }, repeatedRules);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
  const afterRepeatedProcessing = await verificationPool.query(`SELECT
    (SELECT count(*)::int FROM learner_observations WHERE attempt_id=$1) AS observation_count,
    (SELECT evidence_count FROM learner_growth_dimensions WHERE learner_id=$2 AND dimension='numeracy') AS numeracy_evidence_count`, [resumedAfterRestart.id, siyanaLogin.user.id]);
  assert(afterRepeatedProcessing.rows[0].observation_count === completedObservationState.rows[0].observation_count, "Repeated rule processing duplicated observations");
  assert(afterRepeatedProcessing.rows[0].numeracy_evidence_count === numeracyProfile.rows[0].evidence_count, "Repeated rule processing incremented profile evidence twice");

  for (const learnerId of [leagoLogin.user.id, siyanaLogin.user.id]) {
    await api(`/learners/${learnerId}/growth-dna`, { headers: parentHeaders });
    await api(`/learners/${learnerId}/observations`, { headers: parentHeaders });
  }
  assert((await fetch(`http://localhost:${apiPort}/learners/${leagoLogin.user.id}/growth-dna`, { headers: siyanaHeaders })).status === 403, "Learner accessed a sibling Growth DNA profile");
  assert((await fetch(`http://localhost:${apiPort}/learners/${leagoLogin.user.id}/observations`, { headers: siyanaHeaders })).status === 403, "Learner accessed sibling observations");
  assert((await fetch(`http://localhost:${apiPort}/learners/${siyanaLogin.user.id}/growth-dna`)).status === 401, "Unauthenticated profile access was not denied");
  assert((await fetch(`http://localhost:${apiPort}/learners/${siyanaLogin.user.id}/observations`)).status === 401, "Unauthenticated observation access was not denied");

  const parentGrowthSummary = await api(`/parents/${parentLogin.user.id}/summary`, { headers: parentHeaders });
  const parentChildIds = parentGrowthSummary.children.map((child) => child.id);
  assert(new Set(parentChildIds).size === parentChildIds.length && parentChildIds.includes(leagoLogin.user.id) && parentChildIds.includes(siyanaLogin.user.id), "Parent insights were not child-separated");
  assert(parentGrowthSummary.children.every((child) => child.growthInsights.every((insight) => insight.whyAtlasIsShowingThis)), "Parent insight lacked its evidence explanation");

  await api(`/attempts/${resumedAfterRestart.id}/redact`, { method: "POST", headers: siyanaHeaders, body: JSON.stringify({ deletionReason: "FP-010A raw response retention verification" }) });
  const redactedLearningResponse = await verificationPool.query("SELECT response_data,retention_status,deleted_at FROM learning_responses WHERE attempt_id=$1", [resumedAfterRestart.id]);
  assert(redactedLearningResponse.rowCount === 1 && redactedLearningResponse.rows[0].retention_status === "redacted" && Object.keys(redactedLearningResponse.rows[0].response_data).length === 0 && redactedLearningResponse.rows[0].deleted_at, "FP-010A raw response redaction failed");

  const growthFailureAttempt = await api(`/attempts/${resumedAfterRestart.id}/retry`, { method: "POST", headers: siyanaHeaders, body: "{}" });
  const retryAdaptiveState = await verificationPool.query("SELECT current_support_position,independent_attempt_recorded,paper_confirmed,state_version FROM attempt_challenge_state WHERE attempt_id=$1", [growthFailureAttempt.id]);
  assert(retryAdaptiveState.rowCount === 1 && retryAdaptiveState.rows[0].current_support_position === 0 && !retryAdaptiveState.rows[0].independent_attempt_recorded && !retryAdaptiveState.rows[0].paper_confirmed && retryAdaptiveState.rows[0].state_version === 1, "Retry inherited prior attempt support state");
  const historyBeforeRetryRead = await verificationPool.query("SELECT count(*)::int AS count FROM recommendation_history WHERE learner_id=$1", [siyanaLogin.user.id]);
  const currentAfterRetry = await verificationPool.query("SELECT count(*)::int AS count FROM mission_recommendations WHERE learner_id=$1", [siyanaLogin.user.id]);
  assert(currentAfterRetry.rows[0].count === 0, "Retry did not invalidate the current recommendation");
  const recommendationAfterRetry = await api(`/learners/${siyanaLogin.user.id}/recommendation`, { headers: siyanaHeaders });
  assert(recommendationAfterRetry.recommendation?.missionId === "mission-junior-detective-maths", "Retry did not produce a fresh active-attempt recommendation on next read");
  const historyAfterRetryRead = await verificationPool.query("SELECT count(*)::int AS count FROM recommendation_history WHERE learner_id=$1", [siyanaLogin.user.id]);
  assert(historyAfterRetryRead.rows[0].count > historyBeforeRetryRead.rows[0].count, "Retry recommendation was not appended to immutable history");

  await api(`/attempts/${growthFailureAttempt.id}`, { method: "PATCH", headers: siyanaHeaders, body: JSON.stringify({ currentStep: 2, completedSteps: [0,1], responses: {} }) });
  let retryPlayer = await api(`/attempts/${growthFailureAttempt.id}/player`, { headers: siyanaHeaders });
  await stop(apiProcess);
  apiProcess = start("node", ["03_services/api/src/server.mjs"], { ATLAS_API_PORT: String(apiPort), DATABASE_URL: databaseUrl, NODE_ENV: "test", ATLAS_TEST_ADAPTIVE_FAILURE: "after_event_insert" });
  await waitFor(`http://localhost:${apiPort}/ready`);
  const adaptiveFailure = await fetch(`http://localhost:${apiPort}/attempts/${growthFailureAttempt.id}/challenges/siyana-pawprints-addition/confirm-written`, {
    method: "POST", headers: { ...siyanaHeaders, "content-type": "application/json", "Idempotency-Key": "55555555-5555-4555-8555-555555555555" },
    body: JSON.stringify({ stateVersion: retryPlayer.stateVersion })
  });
  assert(adaptiveFailure.status === 500, "Injected adaptive event failure did not occur");
  const adaptiveRollback = await verificationPool.query(`SELECT s.paper_confirmed,s.paper_prompted,s.state_version,
    (SELECT count(*)::int FROM learning_interaction_events e WHERE e.attempt_id=s.attempt_id) AS event_count
    FROM attempt_challenge_state s WHERE s.attempt_id=$1`, [growthFailureAttempt.id]);
  assert(!adaptiveRollback.rows[0].paper_confirmed && !adaptiveRollback.rows[0].paper_prompted && adaptiveRollback.rows[0].state_version === 1 && adaptiveRollback.rows[0].event_count === 0, "Adaptive event failure left partial event/state changes");

  await stop(apiProcess);
  apiProcess = start("node", ["03_services/api/src/server.mjs"], { ATLAS_API_PORT: String(apiPort), DATABASE_URL: databaseUrl });
  await waitFor(`http://localhost:${apiPort}/ready`);
  retryPlayer = await api(`/attempts/${growthFailureAttempt.id}/challenges/siyana-pawprints-addition/confirm-written`, {
    method: "POST", headers: { ...siyanaHeaders, "Idempotency-Key": "66666666-6666-4666-8666-666666666666" },
    body: JSON.stringify({ stateVersion: 1 })
  });
  retryPlayer = await api(`/attempts/${growthFailureAttempt.id}/challenges/siyana-pawprints-addition/attempt`, {
    method: "POST", headers: { ...siyanaHeaders, "Idempotency-Key": "77777777-7777-4777-8777-777777777777" },
    body: JSON.stringify({ stateVersion: retryPlayer.stateVersion, response: { answer: 7 } })
  });
  retryPlayer = await api(`/attempts/${growthFailureAttempt.id}/challenges/siyana-pawprints-addition/paper-complete`, {
    method: "POST", headers: { ...siyanaHeaders, "Idempotency-Key": "88888888-8888-4888-8888-888888888888" },
    body: JSON.stringify({ stateVersion: retryPlayer.stateVersion })
  });
  assert(retryPlayer.challenge.paperPractice.stepCompleted, "Retry adaptive gates were not completed before completion testing");

  const beforeGrowthFailure = await verificationPool.query(`SELECT
    ma.status,m.status AS mission_status,
    (SELECT count(*)::int FROM progress_events WHERE mission_id=ma.mission_id) AS event_count,
    (SELECT count(*)::int FROM learner_observations WHERE attempt_id=ma.id) AS observation_count,
    (SELECT COALESCE(jsonb_object_agg(dimension, jsonb_build_array(current_level,evidence_count)), '{}'::jsonb) FROM learner_growth_dimensions WHERE learner_id=ma.learner_id) AS profile
    FROM mission_attempts ma JOIN missions m ON m.id=ma.mission_id WHERE ma.id=$1`, [growthFailureAttempt.id]);
  await stop(apiProcess);
  apiProcess = start("node", ["03_services/api/src/server.mjs"], { ATLAS_API_PORT: String(apiPort), DATABASE_URL: databaseUrl, NODE_ENV: "test", ATLAS_TEST_GROWTH_DNA_FAILURE: "after_profile_update" });
  await waitFor(`http://localhost:${apiPort}/ready`);
  const growthFailure = await fetch(`http://localhost:${apiPort}/attempts/${growthFailureAttempt.id}/complete`, { method: "POST", headers: { ...siyanaHeaders, "content-type": "application/json" }, body: JSON.stringify({ currentStep: 6, completedSteps: [0,1,2,3,4,5,6], responses: { answer: 7, confidence: "I need help" }, explanation: "private failed answer", reflection: "I need help" }) });
  assert(growthFailure.status === 500, "Injected Growth DNA failure did not occur");
  const afterGrowthFailure = await verificationPool.query(`SELECT
    ma.status,m.status AS mission_status,
    (SELECT count(*)::int FROM progress_events WHERE mission_id=ma.mission_id) AS event_count,
    (SELECT count(*)::int FROM learner_observations WHERE attempt_id=ma.id) AS observation_count,
    (SELECT COALESCE(jsonb_object_agg(dimension, jsonb_build_array(current_level,evidence_count)), '{}'::jsonb) FROM learner_growth_dimensions WHERE learner_id=ma.learner_id) AS profile
    FROM mission_attempts ma JOIN missions m ON m.id=ma.mission_id WHERE ma.id=$1`, [growthFailureAttempt.id]);
  assert(afterGrowthFailure.rows[0].status === "in_progress", "Growth DNA failure did not roll back attempt completion");
  assert(afterGrowthFailure.rows[0].mission_status === "in_progress", "Growth DNA failure did not roll back mission status");
  assert(afterGrowthFailure.rows[0].event_count === beforeGrowthFailure.rows[0].event_count, "Growth DNA failure left a progress event");
  assert(afterGrowthFailure.rows[0].observation_count === beforeGrowthFailure.rows[0].observation_count, "Growth DNA failure left completion observations");
  assert(JSON.stringify(afterGrowthFailure.rows[0].profile) === JSON.stringify(beforeGrowthFailure.rows[0].profile), "Growth DNA failure left profile updates");

  await stop(apiProcess);
  apiProcess = start("node", ["03_services/api/src/server.mjs"], { ATLAS_API_PORT: String(apiPort), DATABASE_URL: databaseUrl });
  await waitFor(`http://localhost:${apiPort}/ready`);
  await api(`/attempts/${leagoAttempt.id}/abandon`, { method: "POST", headers: leagoHeaders, body: "{}" });
  const leagoHistoryBeforeAbandonRead = await verificationPool.query("SELECT count(*)::int AS count FROM recommendation_history WHERE learner_id=$1", [leagoLogin.user.id]);
  const leagoCurrentAfterAbandon = await verificationPool.query("SELECT count(*)::int AS count FROM mission_recommendations WHERE learner_id=$1", [leagoLogin.user.id]);
  assert(leagoCurrentAfterAbandon.rows[0].count === 0, "Abandonment did not invalidate the current recommendation");
  const recommendationAfterAbandonment = await api(`/learners/${leagoLogin.user.id}/recommendation`, { headers: leagoHeaders });
  assert(recommendationAfterAbandonment.recommendation, "Abandonment did not produce a fresh recommendation on next read");
  const leagoHistoryAfterAbandonRead = await verificationPool.query("SELECT count(*)::int AS count FROM recommendation_history WHERE learner_id=$1", [leagoLogin.user.id]);
  assert(leagoHistoryAfterAbandonRead.rows[0].count > leagoHistoryBeforeAbandonRead.rows[0].count, "Abandonment recommendation was not appended to immutable history");

  await stop(apiProcess);
  apiProcess = start("node", ["03_services/api/src/server.mjs"], { ATLAS_API_PORT: String(apiPort), DATABASE_URL: databaseUrl });
  await waitFor(`http://localhost:${apiPort}/ready`);
  const afterRestart = await api("/missions/mission-junior-detective-maths", { headers: siyanaHeaders });
  assert(afterRestart.status === "in_progress", "Active retry state did not survive restart");
  const siyanaHistoryAfterRestart = await api(`/learners/${siyanaLogin.user.id}/mission-history`, { headers: siyanaHeaders });
  assert(siyanaHistoryAfterRestart.attempts.some((attempt) => attempt.id === resumedAfterRestart.id && attempt.status === "completed"), "Original completed attempt did not survive restart");
  assert(siyanaHistoryAfterRestart.attempts.some((attempt) => attempt.id === growthFailureAttempt.id && attempt.status === "in_progress"), "Rolled-back retry attempt did not survive restart");
  const growthAfterRestart = await api(`/learners/${siyanaLogin.user.id}/growth-dna`, { headers: siyanaHeaders });
  const observationsAfterRestart = await api(`/learners/${siyanaLogin.user.id}/observations`, { headers: siyanaHeaders });
  assert(growthAfterRestart.dimensions.some((dimension) => dimension.dimension === "numeracy" && dimension.evidenceCount === numeracyProfile.rows[0].evidence_count), "Growth DNA profile did not survive API restart");
  assert(observationsAfterRestart.observations.length === observationsBeforeReads.observations.length + 1, "Growth DNA observations did not survive restart");
  const abandonedHistory = await api(`/learners/${leagoLogin.user.id}/mission-history`, { headers: leagoHeaders });
  assert(abandonedHistory.attempts.some((attempt) => attempt.id === leagoAttempt.id && attempt.status === "abandoned"), "Abandonment did not survive restart");
  const replacement = await api("/missions/mission-lost-fossil/attempts/start", { method: "POST", headers: leagoHeaders, body: "{}" });
  assert(replacement.id !== leagoAttempt.id, "Starting after abandonment did not create a new attempt");
  const completedLeago = await api(`/attempts/${replacement.id}/complete`, { method: "POST", headers: leagoHeaders, body: JSON.stringify({ currentStep: 6, completedSteps: [0,1,2,3,4,5,6], responses: { short_text: "private fossil response" }, explanation: "Fossils preserve evidence.", reflection: "I can explain it" }) });
  const retry = await api(`/attempts/${completedLeago.id}/retry`, { method: "POST", headers: leagoHeaders, body: "{}" });
  assert(retry.id !== completedLeago.id && retry.retryOfAttemptId === completedLeago.id, "Retry did not create linked separate attempt");
  const immutable = await fetch(`http://localhost:${apiPort}/attempts/${completedLeago.id}`, { method: "PATCH", headers: { ...leagoHeaders, "content-type": "application/json" }, body: JSON.stringify({ currentStep: 0, completedSteps: [], responses: {} }) });
  assert(immutable.status === 409, "Prior completed attempt was mutable");
  await api(`/attempts/${completedLeago.id}/redact`, { method: "POST", headers: leagoHeaders, body: JSON.stringify({ deletionReason: "smoke retention verification" }) });
  await stop(apiProcess);
  apiProcess = start("node", ["03_services/api/src/server.mjs"], { ATLAS_API_PORT: String(apiPort), DATABASE_URL: databaseUrl });
  await waitFor(`http://localhost:${apiPort}/ready`);
  const redacted = await verificationPool.query("SELECT response_data, explanation, reflection, retention_status, deleted_at, deletion_reason FROM mission_attempts WHERE id=$1", [completedLeago.id]);
  assert(redacted.rows[0].retention_status === "redacted" && Object.keys(redacted.rows[0].response_data).length === 0 && !redacted.rows[0].explanation && redacted.rows[0].deleted_at, "Response redaction did not survive restart");
  const redactedObservations = await api(`/learners/${leagoLogin.user.id}/observations`, { headers: leagoHeaders });
  assert(!JSON.stringify(redactedObservations).includes("private fossil response") && !JSON.stringify(redactedObservations).includes("Fossils preserve evidence"), "Redaction exposed learner content through observations");
  const finalSummary = await api(`/parents/${parentLogin.user.id}/summary`, { headers: parentHeaders });
  const leagoFinalSummary = finalSummary.children.find((child) => child.name === "Leago");
  assert(leagoFinalSummary?.currentMission?.title === "The Lost Fossil" && leagoFinalSummary.currentMission.percentage === 0, "Parent summary omitted in-progress retry state");
  assert(finalSummary.children.find((child) => child.name === "Siyana")?.mostRecentCompletedMission === "Junior Detective Maths", "Parent summary omitted completion");

  console.log("Smoke checks passed:");
  console.log("- migration ledger rerun and PostgreSQL seed completed");
  console.log("- migrations 007, 008, 009, and 010 are recorded once; second migration run applies nothing");
  console.log("- completion creates minimized observations and bounded Growth DNA updates");
  console.log("- repeated reads and rule processing do not duplicate observations or profile evidence");
  console.log("- Sprint 007 and Growth DNA injected failures roll back every transaction component");
  console.log("- Leago, Siyana, and parent development logins work");
  console.log("- Learner-specific home and language missions load");
  console.log("- both guided missions resume; progress and completion persist after restarts");
  console.log("- Parent summary contains separate Leago and Siyana progress");
  console.log("- Parent authorization, learner isolation, and unknown-user denial pass");
  console.log("- Growth DNA authorization and child-separated parent insights pass");
  console.log("- abandonment, retry lineage, immutability, and redaction survive restart");
  console.log("- Sprint 009 recommendations are deterministic, isolated, serialized with lifecycle changes, cache-revalidated, historically immutable, and restart-persistent");
  console.log("- FP-010A paper-first support is idempotent, learner-owned, restart-persistent, rollback-safe, raw-response-minimized, redaction-safe, and fresh on retry");
} finally {
  await Promise.all([apiProcess && stop(apiProcess), webProcess && stop(webProcess)].filter(Boolean));
  await verificationPool.end();
}
