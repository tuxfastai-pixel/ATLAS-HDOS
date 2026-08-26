CREATE TABLE IF NOT EXISTS parents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learners (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES parents(id),
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  grade TEXT NOT NULL,
  journey TEXT NOT NULL,
  learning_level TEXT,
  primary_language TEXT,
  secondary_language TEXT,
  international_language TEXT,
  interests TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  focus_areas TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  next_focus TEXT NOT NULL DEFAULT 'Continue the current learning journey.',
  family_mission TEXT NOT NULL DEFAULT 'Share one thing learned today.',
  companion_message TEXT NOT NULL DEFAULT 'Ready for today''s learning journey?',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learner_credentials (
  learner_id TEXT PRIMARY KEY REFERENCES learners(id),
  password_dev_only TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS capability_scores (
  id BIGSERIAL PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id),
  domain TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  trend TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  domains TEXT[] NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed')),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS mission_objectives (
  id BIGSERIAL PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  objective_order INTEGER NOT NULL,
  objective_text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mission_steps (
  id BIGSERIAL PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  title TEXT NOT NULL,
  instruction TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companion_messages (
  id BIGSERIAL PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id),
  mission_id TEXT REFERENCES missions(id),
  user_message TEXT NOT NULL,
  mock_reply TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mission_attempts (
  id BIGSERIAL PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  learner_id TEXT NOT NULL REFERENCES learners(id),
  status TEXT NOT NULL CHECK (status IN ('completed')),
  explanation TEXT NOT NULL,
  reflection TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS progress_events (
  id BIGSERIAL PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id),
  mission_id TEXT NOT NULL REFERENCES missions(id),
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep migrations additive for databases created by earlier sprints.
ALTER TABLE learners ADD COLUMN IF NOT EXISTS learning_level TEXT;
ALTER TABLE learners ADD COLUMN IF NOT EXISTS primary_language TEXT;
ALTER TABLE learners ADD COLUMN IF NOT EXISTS secondary_language TEXT;
ALTER TABLE learners ADD COLUMN IF NOT EXISTS international_language TEXT;
ALTER TABLE learners ADD COLUMN IF NOT EXISTS interests TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE learners ADD COLUMN IF NOT EXISTS focus_areas TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE learners ADD COLUMN IF NOT EXISTS next_focus TEXT NOT NULL DEFAULT 'Continue the current learning journey.';
ALTER TABLE learners ADD COLUMN IF NOT EXISTS family_mission TEXT NOT NULL DEFAULT 'Share one thing learned today.';
ALTER TABLE learners ADD COLUMN IF NOT EXISTS companion_message TEXT NOT NULL DEFAULT 'Ready for today''s learning journey?';

CREATE INDEX IF NOT EXISTS idx_learners_parent_id ON learners(parent_id);
CREATE INDEX IF NOT EXISTS idx_missions_learner_id ON missions(learner_id);
CREATE INDEX IF NOT EXISTS idx_mission_steps_mission_id ON mission_steps(mission_id);
CREATE INDEX IF NOT EXISTS idx_companion_messages_learner_id ON companion_messages(learner_id);
CREATE INDEX IF NOT EXISTS idx_mission_attempts_learner_id ON mission_attempts(learner_id);
CREATE INDEX IF NOT EXISTS idx_progress_events_learner_id ON progress_events(learner_id);

-- Sprint 006 additive schema; ordered application is managed by Database/postgres/migrations.
CREATE TABLE IF NOT EXISTS parent_credentials (
  parent_id TEXT PRIMARY KEY REFERENCES parents(id),
  username TEXT NOT NULL UNIQUE,
  password_dev_only TEXT NOT NULL
);
ALTER TABLE mission_attempts ALTER COLUMN explanation DROP NOT NULL;
ALTER TABLE mission_attempts ALTER COLUMN reflection DROP NOT NULL;
ALTER TABLE mission_attempts DROP CONSTRAINT IF EXISTS mission_attempts_status_check;
ALTER TABLE mission_attempts ADD CONSTRAINT mission_attempts_status_check CHECK (status IN ('not_started','in_progress','completed','abandoned'));
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS current_step INTEGER NOT NULL DEFAULT 0 CHECK (current_step >= 0);
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS completed_steps INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS response_data JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_attempts_resumable ON mission_attempts (learner_id, mission_id, last_saved_at DESC);

-- Sprint 007 transaction-safe attempt lifecycle.
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ;
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS retry_of_attempt_id BIGINT REFERENCES mission_attempts(id);
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS retention_status TEXT NOT NULL DEFAULT 'retained';
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS retained_until TIMESTAMPTZ;
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_attempts_retry_lineage ON mission_attempts(retry_of_attempt_id);
CREATE INDEX IF NOT EXISTS idx_attempts_retention ON mission_attempts(retention_status, retained_until);

-- Sprint 008 Atlas Growth DNA foundation. See migration 008 for constraints and indexes.
CREATE TABLE IF NOT EXISTS learner_growth_dimensions (
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, dimension TEXT NOT NULL,
  current_level INTEGER NOT NULL DEFAULT 50 CHECK (current_level BETWEEN 0 AND 100), evidence_count INTEGER NOT NULL DEFAULT 0,
  last_observed_at TIMESTAMPTZ, trend TEXT NOT NULL DEFAULT 'insufficient_evidence', confidence_in_signal TEXT NOT NULL DEFAULT 'low',
  explanation TEXT NOT NULL DEFAULT 'Atlas needs more mission evidence before describing this developmental signal.', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (learner_id, dimension)
);
CREATE TABLE IF NOT EXISTS learner_observations (
  id BIGSERIAL PRIMARY KEY, learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL REFERENCES missions(id), attempt_id BIGINT NOT NULL REFERENCES mission_attempts(id) ON DELETE CASCADE,
  observation_type TEXT NOT NULL, dimension TEXT NOT NULL, direction TEXT NOT NULL, magnitude SMALLINT NOT NULL,
  evidence_summary TEXT NOT NULL, source_event TEXT NOT NULL, observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rule_version TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::JSONB, idempotency_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_growth_dimensions_learner ON learner_growth_dimensions(learner_id, dimension);
CREATE INDEX IF NOT EXISTS idx_observations_learner_timeline ON learner_observations(learner_id, observed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_observations_learner_dimension ON learner_observations(learner_id, dimension, observed_at DESC);

-- Sprint 009 deterministic adaptive learning recommendations. See migration 009 for constraints.
CREATE TABLE IF NOT EXISTS mission_prerequisites (
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  prerequisite_mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (mission_id, prerequisite_mission_id),
  CHECK (mission_id <> prerequisite_mission_id)
);
CREATE TABLE IF NOT EXISTS mission_recommendations (
  learner_id TEXT PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE, mission_id TEXT NOT NULL REFERENCES missions(id),
  reason TEXT NOT NULL, rules_applied JSONB NOT NULL, supported_growth_areas TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  rule_version TEXT NOT NULL, evidence_fingerprint TEXT NOT NULL, generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(rules_applied) = 'array')
);
CREATE TABLE IF NOT EXISTS recommendation_history (
  id BIGSERIAL PRIMARY KEY, learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL REFERENCES missions(id), reason TEXT NOT NULL, rules_applied JSONB NOT NULL,
  supported_growth_areas TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], rule_version TEXT NOT NULL,
  evidence_fingerprint TEXT NOT NULL, generated_at TIMESTAMPTZ NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (learner_id, evidence_fingerprint), CHECK (jsonb_typeof(rules_applied) = 'array')
);
CREATE INDEX IF NOT EXISTS idx_prerequisites_required ON mission_prerequisites(prerequisite_mission_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_history_learner ON recommendation_history(learner_id, recorded_at DESC, id DESC);

-- Sprint 010A factual adaptive support and paper-practice foundation. See migration 010.
CREATE TABLE IF NOT EXISTS learning_concepts (
  id TEXT PRIMARY KEY, domain TEXT NOT NULL, title TEXT NOT NULL, version TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS challenge_variants (
  id TEXT PRIMARY KEY, challenge_family_id TEXT NOT NULL, concept_id TEXT NOT NULL REFERENCES learning_concepts(id),
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE, step_order INTEGER NOT NULL CHECK (step_order > 0),
  prompt TEXT NOT NULL, response_type TEXT NOT NULL, validation_kind TEXT NOT NULL,
  validation_config JSONB NOT NULL DEFAULT '{}'::JSONB, active BOOLEAN NOT NULL DEFAULT TRUE,
  content_version TEXT NOT NULL, UNIQUE (mission_id, step_order, id)
);
CREATE TABLE IF NOT EXISTS mission_step_learning_config (
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE, step_order INTEGER NOT NULL CHECK (step_order > 0),
  concept_id TEXT NOT NULL REFERENCES learning_concepts(id), challenge_variant_id TEXT NOT NULL REFERENCES challenge_variants(id),
  paper_practice_required BOOLEAN NOT NULL DEFAULT FALSE, independent_attempt_required BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (mission_id, step_order)
);
CREATE TABLE IF NOT EXISTS support_ladder_items (
  challenge_variant_id TEXT NOT NULL REFERENCES challenge_variants(id) ON DELETE CASCADE,
  support_position SMALLINT NOT NULL CHECK (support_position BETWEEN 1 AND 4),
  support_kind TEXT NOT NULL CHECK (support_kind IN ('attention_prompt','hint','guided_breakdown','worked_analogy')),
  content TEXT NOT NULL, content_version TEXT NOT NULL, PRIMARY KEY (challenge_variant_id, support_position)
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mission_attempts_identity_unique') THEN
    ALTER TABLE mission_attempts ADD CONSTRAINT mission_attempts_identity_unique UNIQUE (id, learner_id, mission_id);
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS attempt_challenge_state (
  attempt_id BIGINT NOT NULL, learner_id TEXT NOT NULL, mission_id TEXT NOT NULL,
  challenge_variant_id TEXT NOT NULL REFERENCES challenge_variants(id), step_order INTEGER NOT NULL CHECK (step_order > 0),
  current_support_position SMALLINT NOT NULL DEFAULT 0 CHECK (current_support_position BETWEEN 0 AND 4),
  independent_attempt_recorded BOOLEAN NOT NULL DEFAULT FALSE, paper_prompted BOOLEAN NOT NULL DEFAULT FALSE,
  paper_confirmed BOOLEAN NOT NULL DEFAULT FALSE, paper_step_completed BOOLEAN NOT NULL DEFAULT FALSE,
  state_version INTEGER NOT NULL DEFAULT 1 CHECK (state_version > 0), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attempt_id, challenge_variant_id),
  FOREIGN KEY (attempt_id, learner_id, mission_id) REFERENCES mission_attempts(id, learner_id, mission_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS learning_interaction_events (
  id BIGSERIAL PRIMARY KEY, event_uuid UUID NOT NULL UNIQUE, idempotency_key TEXT NOT NULL UNIQUE,
  learner_id TEXT NOT NULL, mission_id TEXT NOT NULL, attempt_id BIGINT NOT NULL, step_order INTEGER NOT NULL CHECK (step_order > 0),
  concept_id TEXT REFERENCES learning_concepts(id), challenge_variant_id TEXT REFERENCES challenge_variants(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('challenge_presented','paper_practice_prompted','learner_confirmed_written','paper_step_completed','independent_attempt_recorded','support_requested','support_presented')),
  event_sequence BIGINT NOT NULL CHECK (event_sequence > 0), facts JSONB NOT NULL DEFAULT '{}'::JSONB,
  rule_context_version TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (attempt_id, learner_id, mission_id) REFERENCES mission_attempts(id, learner_id, mission_id) ON DELETE CASCADE,
  UNIQUE (attempt_id, event_sequence)
);
CREATE TABLE IF NOT EXISTS learning_responses (
  id BIGSERIAL PRIMARY KEY, interaction_event_id BIGINT NOT NULL UNIQUE REFERENCES learning_interaction_events(id) ON DELETE CASCADE,
  attempt_id BIGINT NOT NULL, learner_id TEXT NOT NULL, mission_id TEXT NOT NULL,
  challenge_variant_id TEXT NOT NULL REFERENCES challenge_variants(id), step_order INTEGER NOT NULL CHECK (step_order > 0),
  response_kind TEXT NOT NULL, response_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  retention_status TEXT NOT NULL DEFAULT 'retained' CHECK (retention_status IN ('retained','redacted')),
  retained_until TIMESTAMPTZ, deleted_at TIMESTAMPTZ,
  FOREIGN KEY (attempt_id, learner_id, mission_id) REFERENCES mission_attempts(id, learner_id, mission_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_learning_events_attempt ON learning_interaction_events(attempt_id, event_sequence);
CREATE INDEX IF NOT EXISTS idx_learning_events_learner ON learning_interaction_events(learner_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_learning_responses_attempt ON learning_responses(attempt_id, id);
CREATE INDEX IF NOT EXISTS idx_attempt_challenge_learner ON attempt_challenge_state(learner_id, attempt_id);
