CREATE TABLE IF NOT EXISTS mission_prerequisites (
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  prerequisite_mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mission_id, prerequisite_mission_id),
  CHECK (mission_id <> prerequisite_mission_id)
);

CREATE TABLE IF NOT EXISTS mission_recommendations (
  learner_id TEXT PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  reason TEXT NOT NULL,
  rules_applied JSONB NOT NULL,
  supported_growth_areas TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  rule_version TEXT NOT NULL,
  evidence_fingerprint TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(rules_applied) = 'array')
);

CREATE TABLE IF NOT EXISTS recommendation_history (
  id BIGSERIAL PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  reason TEXT NOT NULL,
  rules_applied JSONB NOT NULL,
  supported_growth_areas TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  rule_version TEXT NOT NULL,
  evidence_fingerprint TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (learner_id, evidence_fingerprint),
  CHECK (jsonb_typeof(rules_applied) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_prerequisites_required ON mission_prerequisites(prerequisite_mission_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_history_learner ON recommendation_history(learner_id, recorded_at DESC, id DESC);
