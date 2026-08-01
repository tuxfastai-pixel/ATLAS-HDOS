ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ;
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS retry_of_attempt_id BIGINT REFERENCES mission_attempts(id);
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS retention_status TEXT NOT NULL DEFAULT 'retained';
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS retained_until TIMESTAMPTZ;
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

DO $$ BEGIN
  ALTER TABLE mission_attempts ADD CONSTRAINT mission_attempts_retention_status_check
    CHECK (retention_status IN ('retained', 'redacted'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE mission_attempts ADD CONSTRAINT mission_attempts_lifecycle_timestamps_check CHECK (
    (status <> 'completed' OR completed_at IS NOT NULL) AND
    (status <> 'abandoned' OR abandoned_at IS NOT NULL) AND
    (retention_status <> 'redacted' OR (deleted_at IS NOT NULL AND deletion_reason IS NOT NULL))
  ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_attempts_retry_lineage ON mission_attempts(retry_of_attempt_id);
CREATE INDEX IF NOT EXISTS idx_attempts_retention ON mission_attempts(retention_status, retained_until);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_one_active
  ON mission_attempts(learner_id, mission_id) WHERE status = 'in_progress';
