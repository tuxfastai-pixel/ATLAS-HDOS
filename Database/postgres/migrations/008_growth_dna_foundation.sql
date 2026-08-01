CREATE TABLE IF NOT EXISTS learner_growth_dimensions (
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL CHECK (dimension IN ('confidence','persistence','curiosity','numeracy','literacy','communication','problem_solving','creativity','independence','attention')),
  current_level INTEGER NOT NULL DEFAULT 50 CHECK (current_level BETWEEN 0 AND 100),
  evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  last_observed_at TIMESTAMPTZ,
  trend TEXT NOT NULL DEFAULT 'insufficient_evidence' CHECK (trend IN ('insufficient_evidence','steady','increasing')),
  confidence_in_signal TEXT NOT NULL DEFAULT 'low' CHECK (confidence_in_signal IN ('low','emerging','established')),
  explanation TEXT NOT NULL DEFAULT 'Atlas needs more mission evidence before describing this developmental signal.',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (learner_id, dimension)
);

DO $$ BEGIN
  ALTER TABLE mission_attempts ADD CONSTRAINT mission_attempts_identity_unique UNIQUE (id, learner_id, mission_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS learner_observations (
  id BIGSERIAL PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  attempt_id BIGINT NOT NULL,
  observation_type TEXT NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('confidence','persistence','curiosity','numeracy','literacy','communication','problem_solving','creativity','independence','attention')),
  direction TEXT NOT NULL CHECK (direction IN ('positive','neutral')),
  magnitude SMALLINT NOT NULL CHECK (magnitude BETWEEN 0 AND 5),
  evidence_summary TEXT NOT NULL,
  source_event TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rule_version TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  idempotency_key TEXT NOT NULL UNIQUE,
  FOREIGN KEY (attempt_id, learner_id, mission_id)
    REFERENCES mission_attempts(id, learner_id, mission_id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_growth_dimensions_learner ON learner_growth_dimensions(learner_id, dimension);
CREATE INDEX IF NOT EXISTS idx_observations_learner_timeline ON learner_observations(learner_id, observed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_observations_learner_dimension ON learner_observations(learner_id, dimension, observed_at DESC);
