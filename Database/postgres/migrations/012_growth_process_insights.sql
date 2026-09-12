BEGIN;

CREATE TABLE IF NOT EXISTS parent_process_insights (
  id BIGSERIAL PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  attempt_id BIGINT NOT NULL REFERENCES mission_attempts(id) ON DELETE CASCADE,
  insight_order SMALLINT NOT NULL CHECK (insight_order > 0),
  statement TEXT NOT NULL,
  evidence_event_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  rule_version TEXT NOT NULL,
  evidence_fingerprint TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, rule_version, insight_order),
  CHECK (cardinality(evidence_event_types) > 0),
  CHECK (statement !~* '(weak learner|strong learner|mastery score|difficulty level|progression stage|better than|worse than|sibling rank)')
);

CREATE INDEX IF NOT EXISTS idx_parent_process_insights_learner
  ON parent_process_insights(learner_id, generated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_parent_process_insights_attempt
  ON parent_process_insights(attempt_id, insight_order);

COMMIT;
