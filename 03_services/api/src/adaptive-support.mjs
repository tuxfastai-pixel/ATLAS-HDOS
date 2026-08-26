export const SUPPORT_RULE_VERSION = "adaptive-support-v1";

export function supportContentLeaksAnswer(content, protectedAnswer) {
  if (protectedAnswer === undefined || protectedAnswer === null || protectedAnswer === "") return false;
  const escaped = String(protectedAnswer).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\D)${escaped}(\\D|$)`).test(String(content));
}

export function publicSupportItem(item) {
  if (!item) return null;
  return { kind: item.support_kind ?? item.kind, content: item.content };
}

export function nextSupportDecision({ attemptStatus, independentAttemptRecorded, currentSupportPosition = 0, supportItems = [] }) {
  if (attemptStatus !== "in_progress") {
    return { allowed: false, reason: "closed_attempt", nextPosition: currentSupportPosition, item: null };
  }
  if (!independentAttemptRecorded) {
    return { allowed: false, reason: "independent_attempt_required", nextPosition: currentSupportPosition, item: null };
  }
  const ordered = [...supportItems].sort((a, b) => Number(a.support_position ?? a.position) - Number(b.support_position ?? b.position));
  const next = ordered.find((item) => Number(item.support_position ?? item.position) === Number(currentSupportPosition) + 1);
  if (!next) {
    return { allowed: true, reason: "final_support_reached", nextPosition: currentSupportPosition, item: null };
  }
  return {
    allowed: true,
    reason: "support_available",
    nextPosition: Number(next.support_position ?? next.position),
    item: publicSupportItem(next)
  };
}
