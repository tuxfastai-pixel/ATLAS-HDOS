export const PROGRESSION_RULE_VERSION = "discreet-progression-v1";
export const PROGRESSION_STAGES = ["understanding", "consolidation", "transfer", "fluency", "mastery_evidence"];

const boundedStage = (value) => Math.max(0, Math.min(PROGRESSION_STAGES.length - 1, Number(value) || 0));

function normalizeEvidence(item = {}) {
  return {
    correct: item.correct === true,
    independentAttemptRecorded: item.independentAttemptRecorded !== false,
    paperCompleted: item.paperCompleted !== false,
    supportPosition: Math.max(0, Number(item.supportPosition) || 0),
    contextType: item.contextType || "same_context",
    scaffoldProfile: item.scaffoldProfile || "standard"
  };
}

export function classifyProgressionEvidence(item) {
  const evidence = normalizeEvidence(item);
  if (!evidence.correct) return "needs_more_evidence";
  if (!evidence.independentAttemptRecorded || !evidence.paperCompleted) return "incomplete";
  if (evidence.supportPosition > 1) return "supported_success";
  return "strong_success";
}

export function evaluateProgression({ currentStage = 0, evidence = [] } = {}) {
  const stage = boundedStage(currentStage);
  const recent = evidence.slice(-5).map(normalizeEvidence);
  const classifications = recent.map(classifyProgressionEvidence);

  const lastThree = classifications.slice(-3);
  if (stage > 0 && lastThree.length === 3 && lastThree.every((value) => value === "needs_more_evidence")) {
    return { currentStage: stage, nextStage: stage - 1, movement: "down", reason: "three_recent_unsuccessful_attempts", ruleVersion: PROGRESSION_RULE_VERSION };
  }

  const strong = classifications.filter((value) => value === "strong_success").length;
  const transferStrong = recent.filter((item, index) => classifications[index] === "strong_success" && item.contextType === "transfer").length;
  const reducedStrong = recent.filter((item, index) => classifications[index] === "strong_success" && item.scaffoldProfile === "reduced").length;

  let qualifies = false;
  if (stage === 0) qualifies = recent.length >= 2 && strong >= 2;
  if (stage === 1) qualifies = recent.length >= 3 && strong >= 3;
  if (stage === 2) qualifies = recent.length >= 3 && strong >= 3 && transferStrong >= 1;
  if (stage === 3) qualifies = recent.length >= 4 && strong >= 4 && reducedStrong >= 2;

  if (qualifies && stage < PROGRESSION_STAGES.length - 1) {
    return { currentStage: stage, nextStage: stage + 1, movement: "up", reason: "evidence_window_satisfied", ruleVersion: PROGRESSION_RULE_VERSION };
  }
  return { currentStage: stage, nextStage: stage, movement: "hold", reason: "evidence_window_not_yet_satisfied", ruleVersion: PROGRESSION_RULE_VERSION };
}

export function stageName(index) {
  return PROGRESSION_STAGES[boundedStage(index)];
}
