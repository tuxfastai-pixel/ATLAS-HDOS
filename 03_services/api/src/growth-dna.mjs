export const GROWTH_DNA_MODEL_VERSION = "atlas-growth-dna-v1";
export const OBSERVATION_RULE_VERSION = "growth-dna-rules-v1";
export const GROWTH_DIMENSIONS = ["confidence", "persistence", "curiosity", "numeracy", "literacy", "communication", "problem_solving", "creativity", "independence", "attention"];

const signal = (type, dimension, direction, magnitude, summary, sourceEvent, metadata = {}) => ({
  type, dimension, direction, magnitude, summary, sourceEvent, metadata
});

function domainSignals(domains) {
  const normalized = domains.map((value) => value.toLowerCase());
  const signals = [];
  if (normalized.some((value) => value.includes("math"))) signals.push(signal("mission_domain_numeracy", "numeracy", "positive", 2, "Completed a mission with numeracy practice.", "mission_completed", { missionDomain: "numeracy" }));
  if (normalized.some((value) => value.includes("read") || value.includes("story"))) signals.push(signal("mission_domain_literacy", "literacy", "positive", 2, "Completed a mission with reading or story practice.", "mission_completed", { missionDomain: "literacy" }));
  if (normalized.some((value) => value.includes("thinking") || value.includes("science") || value.includes("observation"))) signals.push(signal("mission_domain_problem_solving", "problem_solving", "positive", 2, "Completed an investigation mission using problem-solving practice.", "mission_completed", { missionDomain: "investigation" }));
  return signals;
}

export function completionObservations({ retryOfAttemptId, confidence, hasExplanation, completedStepRatio, domains = [] }) {
  const observations = [signal(retryOfAttemptId ? "completion_after_retry" : "mission_completed", "persistence", "positive", retryOfAttemptId ? 3 : 2, retryOfAttemptId ? "Continued after a retry and completed the mission." : "Completed the mission and followed through on its steps.", "mission_completed", { completedStepRatio })];
  if (["I understand", "I can explain it"].includes(confidence)) observations.push(signal("confidence_with_completion", "confidence", "positive", 1, "Completed the mission after reporting growing confidence.", "confidence_reflection", { confidenceBand: "high" }));
  if (["I need help", "I am getting it"].includes(confidence)) {
    observations.push(signal("low_confidence_persistence", "persistence", "positive", 2, "Kept going and completed while confidence was still developing.", "confidence_reflection", { confidenceBand: "support_welcome" }));
    observations.push(signal("confidence_support_recommended", "confidence", "neutral", 0, "Completed the mission and indicated that confidence support may be welcome.", "confidence_reflection", { supportRecommended: true }));
  }
  if (hasExplanation) observations.push(signal("learner_explanation", "communication", "positive", 1, "Provided an explanation while completing the mission.", "response_completion", { explanationProvided: true }));
  return [...observations, ...domainSignals(domains)];
}

export function lifecycleObservations(event, details = {}) {
  if (event === "mission_abandoned") return [signal("support_needed_after_abandonment", "persistence", "neutral", 0, "Paused this attempt; Atlas records this as a possible support moment, not a failure.", event, { completedStepRatio: details.completedStepRatio || 0 })];
  if (event === "mission_retried") return [signal("mission_retried", "persistence", "positive", 1, "Chose to try the mission again.", event, { retryStarted: true })];
  if (event === "progress_saved") return [signal("saved_progress", "independence", "positive", 1, "Saved mission progress to continue later.", event, { completedStepRatio: details.completedStepRatio || 0 })];
  return [];
}

export async function storeObservations(client, context, observations) {
  for (const observation of observations) {
    const key = `${context.attemptId}:${OBSERVATION_RULE_VERSION}:${observation.type}`;
    const inserted = await client.query(`INSERT INTO learner_observations
      (learner_id,mission_id,attempt_id,observation_type,dimension,direction,magnitude,evidence_summary,source_event,rule_version,metadata,idempotency_key)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12) ON CONFLICT (idempotency_key) DO NOTHING RETURNING observed_at`,
      [context.learnerId, context.missionId, context.attemptId, observation.type, observation.dimension, observation.direction, observation.magnitude, observation.summary, observation.sourceEvent, OBSERVATION_RULE_VERSION, JSON.stringify(observation.metadata), key]);
    if (!inserted.rowCount) continue;
    await client.query(`INSERT INTO learner_growth_dimensions
      (learner_id,dimension,current_level,evidence_count,last_observed_at,trend,confidence_in_signal,explanation,updated_at)
      VALUES ($1,$2,LEAST(100,50+$3),1,$4,'insufficient_evidence','low',$5,NOW())
      ON CONFLICT (learner_id,dimension) DO UPDATE SET
        current_level=LEAST(100,learner_growth_dimensions.current_level+$3),
        evidence_count=learner_growth_dimensions.evidence_count+1,last_observed_at=$4,
        trend=CASE WHEN learner_growth_dimensions.evidence_count+1 < 2 THEN 'insufficient_evidence' WHEN $3 > 0 THEN 'increasing' ELSE 'steady' END,
        confidence_in_signal=CASE WHEN learner_growth_dimensions.evidence_count+1 >= 5 THEN 'established' WHEN learner_growth_dimensions.evidence_count+1 >= 2 THEN 'emerging' ELSE 'low' END,
        explanation=$5,updated_at=NOW()`, [context.learnerId, observation.dimension, observation.magnitude, inserted.rows[0].observed_at, observation.summary]);
  }
}
