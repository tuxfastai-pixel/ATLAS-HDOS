CREATE TABLE IF NOT EXISTS parent_credentials (
  parent_id TEXT PRIMARY KEY REFERENCES parents(id),
  username TEXT NOT NULL UNIQUE,
  password_dev_only TEXT NOT NULL
);

ALTER TABLE mission_attempts ALTER COLUMN explanation DROP NOT NULL;
ALTER TABLE mission_attempts ALTER COLUMN reflection DROP NOT NULL;
ALTER TABLE mission_attempts DROP CONSTRAINT IF EXISTS mission_attempts_status_check;
ALTER TABLE mission_attempts ADD CONSTRAINT mission_attempts_status_check
  CHECK (status IN ('not_started', 'in_progress', 'completed', 'abandoned'));
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS current_step INTEGER NOT NULL DEFAULT 0 CHECK (current_step >= 0);
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS completed_steps INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS response_data JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_attempts_resumable ON mission_attempts (learner_id, mission_id, last_saved_at DESC);
