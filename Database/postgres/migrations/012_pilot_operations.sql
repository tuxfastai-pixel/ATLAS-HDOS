-- FP-012: pilot operations and observation readiness.

CREATE TABLE IF NOT EXISTS pilot_sessions (
  id UUID PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('planned','active','completed','cancelled')),
  session_label TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pilot_observations (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES pilot_sessions(id) ON DELETE CASCADE,
  parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('engagement','usability','support','paper_practice','recovery','other')),
  observation TEXT NOT NULL CHECK (char_length(observation) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pilot_sessions_parent_created
  ON pilot_sessions(parent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pilot_sessions_learner_created
  ON pilot_sessions(learner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pilot_observations_session_created
  ON pilot_observations(session_id, created_at DESC, id DESC);

COMMENT ON TABLE pilot_observations IS
  'Parent-entered factual pilot observations. Do not store raw learner answers, diagnostic labels, sibling comparisons, or hidden progression state.';
