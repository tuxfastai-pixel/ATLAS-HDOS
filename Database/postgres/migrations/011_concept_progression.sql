-- FP-010B: discreet concept progression with bounded, evidence-windowed movement.

ALTER TABLE challenge_variants
  ADD COLUMN IF NOT EXISTS demand_stage SMALLINT NOT NULL DEFAULT 0 CHECK (demand_stage BETWEEN 0 AND 4),
  ADD COLUMN IF NOT EXISTS context_type TEXT NOT NULL DEFAULT 'same_context' CHECK (context_type IN ('same_context','varied_representation','transfer')),
  ADD COLUMN IF NOT EXISTS scaffold_profile TEXT NOT NULL DEFAULT 'standard' CHECK (scaffold_profile IN ('standard','reduced'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_attempt_challenge_step
  ON attempt_challenge_state(attempt_id, step_order);

CREATE TABLE IF NOT EXISTS learner_concept_progression (
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  current_stage SMALLINT NOT NULL DEFAULT 0 CHECK (current_stage BETWEEN 0 AND 4),
  evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  rule_version TEXT NOT NULL,
  last_evidence_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (learner_id, concept_id, rule_version)
);

CREATE TABLE IF NOT EXISTS concept_evidence_windows (
  id BIGSERIAL PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  attempt_id BIGINT NOT NULL REFERENCES mission_attempts(id) ON DELETE CASCADE,
  challenge_variant_id TEXT NOT NULL REFERENCES challenge_variants(id),
  correct BOOLEAN NOT NULL,
  independent_attempt_recorded BOOLEAN NOT NULL,
  paper_completed BOOLEAN NOT NULL,
  support_position SMALLINT NOT NULL DEFAULT 0 CHECK (support_position BETWEEN 0 AND 4),
  context_type TEXT NOT NULL CHECK (context_type IN ('same_context','varied_representation','transfer')),
  scaffold_profile TEXT NOT NULL CHECK (scaffold_profile IN ('standard','reduced')),
  demand_stage SMALLINT NOT NULL CHECK (demand_stage BETWEEN 0 AND 4),
  rule_version TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, challenge_variant_id, rule_version)
);

CREATE TABLE IF NOT EXISTS concept_progression_history (
  id BIGSERIAL PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  from_stage SMALLINT NOT NULL CHECK (from_stage BETWEEN 0 AND 4),
  to_stage SMALLINT NOT NULL CHECK (to_stage BETWEEN 0 AND 4),
  movement TEXT NOT NULL CHECK (movement IN ('up','down')),
  reason TEXT NOT NULL,
  trigger_evidence_id BIGINT NOT NULL REFERENCES concept_evidence_windows(id) ON DELETE RESTRICT,
  rule_version TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concept_evidence_learner_concept
  ON concept_evidence_windows(learner_id, concept_id, recorded_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_progression_history_learner_concept
  ON concept_progression_history(learner_id, concept_id, recorded_at DESC, id DESC);
