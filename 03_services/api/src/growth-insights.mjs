export const GROWTH_INSIGHT_RULE_VERSION = "growth-insight-rules-v1";

const allowedEventTypes = new Set([
  "challenge_presented",
  "paper_practice_prompted",
  "learner_confirmed_written",
  "paper_step_completed",
  "independent_attempt_recorded",
  "support_requested",
  "support_presented"
]);

const observation = (type, dimension, magnitude, summary, sourceEvent, metadata = {}) => ({
  type,
  dimension,
  direction: magnitude > 0 ? "positive" : "neutral",
  magnitude,
  summary,
  sourceEvent,
  metadata: { ...metadata, insightRuleVersion: GROWTH_INSIGHT_RULE_VERSION }
});

export function deriveProcessInsights(events = []) {
  const factual = events.filter((event) => allowedEventTypes.has(event.event_type));
  const hasIndependentAttempt = factual.some((event) => event.event_type === "independent_attempt_recorded");
  const hasPaperCompletion = factual.some((event) => event.event_type === "paper_step_completed");
  const supportRequests = factual.filter((event) => event.event_type === "support_requested").length;

  const observations = [];
  if (hasIndependentAttempt) {
    observations.push(observation(
      "independent_attempt_process",
      "independence",
      1,
      "Recorded an independent attempt during the learning activity.",
      "independent_attempt_recorded",
      { independentAttemptRecorded: true }
    ));
  }
  if (hasPaperCompletion) {
    observations.push(observation(
      "paper_practice_follow_through",
      "persistence",
      1,
      "Completed the paper-practice step during the learning activity.",
      "paper_step_completed",
      { paperStepCompleted: true }
    ));
  }
  if (supportRequests > 0 && hasPaperCompletion) {
    observations.push(observation(
      "continued_after_support",
      "persistence",
      1,
      "Used support and continued to complete the paper-practice step.",
      "paper_step_completed",
      { supportUsed: true, supportRequestCount: supportRequests }
    ));
  }

  const parentStatements = [];
  if (hasIndependentAttempt) parentStatements.push("Recorded an independent attempt during the activity.");
  if (supportRequests === 1) parentStatements.push("Requested one piece of support before continuing.");
  if (supportRequests > 1) parentStatements.push(`Requested ${supportRequests} pieces of support while working through the activity.`);
  if (hasPaperCompletion) parentStatements.push("Completed the paper-practice step.");

  return {
    observations,
    parentStatements,
    ruleVersion: GROWTH_INSIGHT_RULE_VERSION
  };
}

export function assertSafeProcessInsight(value) {
  const text = JSON.stringify(value).toLowerCase();
  const forbidden = [
    "protectedanswer",
    "response_data",
    "raw response",
    "current_stage",
    "mastery_evidence",
    "demand_stage",
    "capability_scores",
    "weak learner",
    "strong learner",
    "better than",
    "worse than",
    "sibling rank"
  ];
  return !forbidden.some((term) => text.includes(term));
}
