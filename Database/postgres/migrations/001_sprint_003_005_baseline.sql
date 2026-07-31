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
