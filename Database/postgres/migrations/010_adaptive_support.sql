-- FP-010A: factual adaptive support, paper practice, idempotency, and restart-safe challenge state.

CREATE TABLE IF NOT EXISTS learning_concepts (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  version TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS challenge_variants (
  id TEXT PRIMARY KEY,
  challenge_family_id TEXT NOT NULL,
  concept_id TEXT NOT NULL REFERENCES learning_concepts(id),
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL CHECK (step_order > 0),
  prompt TEXT NOT NULL,
  response_type TEXT NOT NULL,
  validation_kind TEXT NOT NULL,
  validation_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  content_version TEXT NOT NULL,
  UNIQUE (mission_id, step_order, id)
);

CREATE TABLE IF NOT EXISTS mission_step_learning_config (
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL CHECK (step_order > 0),
  concept_id TEXT NOT NULL REFERENCES learning_concepts(id),
  challenge_variant_id TEXT NOT NULL REFERENCES challenge_variants(id),
  paper_practice_required BOOLEAN NOT NULL DEFAULT FALSE,
  independent_attempt_required BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (mission_id, step_order)
);

CREATE TABLE IF NOT EXISTS support_ladder_items (
  challenge_variant_id TEXT NOT NULL REFERENCES challenge_variants(id) ON DELETE CASCADE,
  support_position SMALLINT NOT NULL CHECK (support_position BETWEEN 1 AND 4),
  support_kind TEXT NOT NULL CHECK (support_kind IN ('attention_prompt','hint','guided_breakdown','worked_analogy')),
  content TEXT NOT NULL,
  content_version TEXT NOT NULL,
  PRIMARY KEY (challenge_variant_id, support_position)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mission_attempts_identity_unique'
  ) THEN
    ALTER TABLE mission_attempts
      ADD CONSTRAINT mission_attempts_identity_unique UNIQUE (id, learner_id, mission_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS attempt_challenge_state (
  attempt_id BIGINT NOT NULL,
  learner_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  challenge_variant_id TEXT NOT NULL REFERENCES challenge_variants(id),
  step_order INTEGER NOT NULL CHECK (step_order > 0),
  current_support_position SMALLINT NOT NULL DEFAULT 0 CHECK (current_support_position BETWEEN 0 AND 4),
  independent_attempt_recorded BOOLEAN NOT NULL DEFAULT FALSE,
  paper_prompted BOOLEAN NOT NULL DEFAULT FALSE,
  paper_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  paper_step_completed BOOLEAN NOT NULL DEFAULT FALSE,
  state_version INTEGER NOT NULL DEFAULT 1 CHECK (state_version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attempt_id, challenge_variant_id),
  FOREIGN KEY (attempt_id, learner_id, mission_id)
    REFERENCES mission_attempts(id, learner_id, mission_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS learning_interaction_events (
  id BIGSERIAL PRIMARY KEY,
  event_uuid UUID NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  learner_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  attempt_id BIGINT NOT NULL,
  step_order INTEGER NOT NULL CHECK (step_order > 0),
  concept_id TEXT REFERENCES learning_concepts(id),
  challenge_variant_id TEXT REFERENCES challenge_variants(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'challenge_presented',
    'paper_practice_prompted',
    'learner_confirmed_written',
    'paper_step_completed',
    'independent_attempt_recorded',
    'support_requested',
    'support_presented'
  )),
  event_sequence BIGINT NOT NULL CHECK (event_sequence > 0),
  facts JSONB NOT NULL DEFAULT '{}'::JSONB,
  rule_context_version TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (attempt_id, learner_id, mission_id)
    REFERENCES mission_attempts(id, learner_id, mission_id) ON DELETE CASCADE,
  UNIQUE (attempt_id, event_sequence)
);

CREATE TABLE IF NOT EXISTS learning_responses (
  id BIGSERIAL PRIMARY KEY,
  interaction_event_id BIGINT NOT NULL UNIQUE REFERENCES learning_interaction_events(id) ON DELETE CASCADE,
  attempt_id BIGINT NOT NULL,
  learner_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  challenge_variant_id TEXT NOT NULL REFERENCES challenge_variants(id),
  step_order INTEGER NOT NULL CHECK (step_order > 0),
  response_kind TEXT NOT NULL,
  response_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  retention_status TEXT NOT NULL DEFAULT 'retained' CHECK (retention_status IN ('retained','redacted')),
  retained_until TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (attempt_id, learner_id, mission_id)
    REFERENCES mission_attempts(id, learner_id, mission_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_learning_events_attempt ON learning_interaction_events(attempt_id, event_sequence);
CREATE INDEX IF NOT EXISTS idx_learning_events_learner ON learning_interaction_events(learner_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_learning_responses_attempt ON learning_responses(attempt_id, id);
CREATE INDEX IF NOT EXISTS idx_attempt_challenge_learner ON attempt_challenge_state(learner_id, attempt_id);
