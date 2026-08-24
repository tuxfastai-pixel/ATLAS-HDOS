import { createHash } from "node:crypto";

export const RECOMMENDATION_RULE_VERSION = "adaptive-learning-v1";

function growthAreaForDomain(domain) {
  const normalized = domain.toLowerCase().replaceAll(" ", "_");
  if (["foundation_mathematics", "mathematics", "maths"].includes(normalized)) return "numeracy";
  if (["reading", "story", "english"].includes(normalized)) return "literacy";
  if (["thinking", "observation"].includes(normalized)) return "problem_solving";
  if (["social_development", "kindness", "family"].includes(normalized)) return "communication";
  return normalized;
}

export function selectRecommendation({ missions, attempts, prerequisites, observations }) {
  const completed = new Set(attempts.filter((a) => a.status === "completed").map((a) => a.mission_id));
  const active = new Map(attempts.filter((a) => a.status === "in_progress").map((a) => [a.mission_id, a]));
  const required = new Map();
  for (const row of prerequisites) required.set(row.mission_id, [...(required.get(row.mission_id) || []), row.prerequisite_mission_id]);
  const evidenceAreas = new Set(observations.map((o) => o.dimension));
  const candidates = missions.filter((mission) => {
    if (completed.has(mission.id) && !active.has(mission.id)) return false;
    return (required.get(mission.id) || []).every((id) => completed.has(id));
  }).map((mission) => ({ mission, active: active.has(mission.id), areas: [...new Set(mission.domains.map(growthAreaForDomain).filter((d) => evidenceAreas.has(d)))].sort() }));
  candidates.sort((a, b) => Number(b.active) - Number(a.active) || b.areas.length - a.areas.length || a.mission.duration_minutes - b.mission.duration_minutes || a.mission.id.localeCompare(b.mission.id));
  const selected = candidates[0];
  if (!selected) return null;
  const rulesApplied = ["completed-exclusion", "prerequisites-satisfied", ...(selected.active ? ["active-attempt-priority"] : []), ...(selected.areas.length ? ["recorded-growth-evidence-secondary-alignment"] : []), "stable-mission-order"];
  const reason = selected.active
    ? `Continue your active attempt in ${selected.mission.title}.`
    : selected.areas.length
      ? `${selected.mission.title} is available and includes ${selected.areas.join(" and ")} practice recorded in your Growth DNA evidence.`
      : `${selected.mission.title} is available, its prerequisites are complete, and it is next in the stable mission order.`;
  return { missionId: selected.mission.id, title: selected.mission.title, reason, rulesApplied, supportedGrowthAreas: selected.areas, ruleVersion: RECOMMENDATION_RULE_VERSION };
}

export function evidenceFingerprint({ missions, attempts, prerequisites, observations }) {
  const normalized = {
    missions: missions.map((m) => [m.id, m.duration_minutes, m.domains]).sort(),
    attempts: attempts.map((a) => [String(a.id), a.mission_id, a.status, a.retry_of_attempt_id || null, String(a.last_saved_at || "")]).sort(),
    prerequisites: prerequisites.map((p) => [p.mission_id, p.prerequisite_mission_id]).sort(),
    observations: observations.map((o) => [String(o.id), o.dimension]).sort()
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
