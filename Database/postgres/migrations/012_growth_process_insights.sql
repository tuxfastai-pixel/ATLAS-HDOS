BEGIN;

CREATE TABLE IF NOT EXISTS parent_process_insights (
  id BIGSERIAL PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  attempt_id BIGINT NOT NULL REFERENCES mission_attempts(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL CHECK (step_order > 0),
  insight_order SMALLINT NOT NULL CHECK (insight_order > 0),
  statement TEXT NOT NULL,
  evidence_event_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  rule_version TEXT NOT NULL,
  evidence_fingerprint TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, step_order, rule_version, insight_order),
  CHECK (cardinality(evidence_event_types) > 0),
  CHECK (statement !~* '(weak learner|strong learner|mastery score|difficulty level|progression stage|better than|worse than|sibling rank)')
);

CREATE INDEX IF NOT EXISTS idx_parent_process_insights_learner
  ON parent_process_insights(learner_id, generated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_parent_process_insights_attempt
  ON parent_process_insights(attempt_id, step_order, insight_order);

CREATE OR REPLACE FUNCTION atlas_store_process_observation(
  p_learner_id TEXT,
  p_mission_id TEXT,
  p_attempt_id BIGINT,
  p_step_order INTEGER,
  p_observation_type TEXT,
  p_dimension TEXT,
  p_summary TEXT,
  p_source_event TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_observed_at TIMESTAMPTZ;
  v_key TEXT;
BEGIN
  v_key := p_attempt_id::TEXT || ':growth-insight-rules-v1:step:' || p_step_order::TEXT || ':' || p_observation_type;

  INSERT INTO learner_observations
    (learner_id, mission_id, attempt_id, observation_type, dimension, direction, magnitude,
     evidence_summary, source_event, rule_version, metadata, idempotency_key)
  VALUES
    (p_learner_id, p_mission_id, p_attempt_id, p_observation_type, p_dimension, 'positive', 1,
     p_summary, p_source_event, 'growth-insight-rules-v1',
     p_metadata || jsonb_build_object('insightRuleVersion','growth-insight-rules-v1','stepOrder',p_step_order), v_key)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING observed_at INTO v_observed_at;

  IF v_observed_at IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO learner_growth_dimensions
    (learner_id, dimension, current_level, evidence_count, last_observed_at, trend,
     confidence_in_signal, explanation, updated_at)
  VALUES
    (p_learner_id, p_dimension, 51, 1, v_observed_at, 'insufficient_evidence', 'low', p_summary, NOW())
  ON CONFLICT (learner_id, dimension) DO UPDATE SET
    current_level = LEAST(100, learner_growth_dimensions.current_level + 1),
    evidence_count = learner_growth_dimensions.evidence_count + 1,
    last_observed_at = v_observed_at,
    trend = CASE WHEN learner_growth_dimensions.evidence_count + 1 < 2 THEN 'insufficient_evidence' ELSE 'increasing' END,
    confidence_in_signal = CASE
      WHEN learner_growth_dimensions.evidence_count + 1 >= 5 THEN 'established'
      WHEN learner_growth_dimensions.evidence_count + 1 >= 2 THEN 'emerging'
      ELSE 'low'
    END,
    explanation = p_summary,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION atlas_project_growth_process_insights()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_independent BOOLEAN;
  v_support_count INTEGER;
  v_fingerprint TEXT;
  v_order SMALLINT := 0;
BEGIN
  IF NEW.event_type <> 'paper_step_completed' THEN
    RETURN NEW;
  END IF;

  SELECT
    EXISTS (
      SELECT 1
      FROM learning_interaction_events e
      WHERE e.attempt_id = NEW.attempt_id
        AND e.step_order = NEW.step_order
        AND e.challenge_variant_id = NEW.challenge_variant_id
        AND e.event_type = 'independent_attempt_recorded'
    ),
    COUNT(*) FILTER (WHERE e.event_type = 'support_requested')::INTEGER
  INTO v_has_independent, v_support_count
  FROM learning_interaction_events e
  WHERE e.attempt_id = NEW.attempt_id
    AND e.step_order = NEW.step_order
    AND e.challenge_variant_id = NEW.challenge_variant_id;

  SELECT md5(string_agg(e.id::TEXT || ':' || e.event_type, '|' ORDER BY e.event_sequence))
  INTO v_fingerprint
  FROM learning_interaction_events e
  WHERE e.attempt_id = NEW.attempt_id
    AND e.step_order = NEW.step_order
    AND e.challenge_variant_id = NEW.challenge_variant_id;

  IF v_has_independent THEN
    PERFORM atlas_store_process_observation(
      NEW.learner_id, NEW.mission_id, NEW.attempt_id, NEW.step_order,
      'independent_attempt_process', 'independence',
      'Recorded an independent attempt during the learning activity.',
      'independent_attempt_recorded',
      jsonb_build_object('independentAttemptRecorded', TRUE)
    );
    v_order := v_order + 1;
    INSERT INTO parent_process_insights
      (learner_id, mission_id, attempt_id, step_order, insight_order, statement,
       evidence_event_types, rule_version, evidence_fingerprint)
    VALUES
      (NEW.learner_id, NEW.mission_id, NEW.attempt_id, NEW.step_order, v_order,
       'Recorded an independent attempt during the activity.',
       ARRAY['independent_attempt_recorded'], 'growth-insight-rules-v1', v_fingerprint)
    ON CONFLICT (attempt_id, step_order, rule_version, insight_order) DO NOTHING;
  END IF;

  IF v_support_count > 0 THEN
    IF v_support_count = 1 THEN
      v_order := v_order + 1;
      INSERT INTO parent_process_insights
        (learner_id, mission_id, attempt_id, step_order, insight_order, statement,
         evidence_event_types, rule_version, evidence_fingerprint)
      VALUES
        (NEW.learner_id, NEW.mission_id, NEW.attempt_id, NEW.step_order, v_order,
         'Requested one piece of support before continuing.',
         ARRAY['support_requested'], 'growth-insight-rules-v1', v_fingerprint)
      ON CONFLICT (attempt_id, step_order, rule_version, insight_order) DO NOTHING;
    ELSE
      v_order := v_order + 1;
      INSERT INTO parent_process_insights
        (learner_id, mission_id, attempt_id, step_order, insight_order, statement,
         evidence_event_types, rule_version, evidence_fingerprint)
      VALUES
        (NEW.learner_id, NEW.mission_id, NEW.attempt_id, NEW.step_order, v_order,
         'Requested ' || v_support_count || ' pieces of support while working through the activity.',
         ARRAY['support_requested'], 'growth-insight-rules-v1', v_fingerprint)
      ON CONFLICT (attempt_id, step_order, rule_version, insight_order) DO NOTHING;
    END IF;

    PERFORM atlas_store_process_observation(
      NEW.learner_id, NEW.mission_id, NEW.attempt_id, NEW.step_order,
      'continued_after_support', 'persistence',
      'Used support and continued to complete the paper-practice step.',
      'paper_step_completed',
      jsonb_build_object('supportUsed', TRUE, 'supportRequestCount', v_support_count)
    );
  END IF;

  PERFORM atlas_store_process_observation(
    NEW.learner_id, NEW.mission_id, NEW.attempt_id, NEW.step_order,
    'paper_practice_follow_through', 'persistence',
    'Completed the paper-practice step during the learning activity.',
    'paper_step_completed',
    jsonb_build_object('paperStepCompleted', TRUE)
  );

  v_order := v_order + 1;
  INSERT INTO parent_process_insights
    (learner_id, mission_id, attempt_id, step_order, insight_order, statement,
     evidence_event_types, rule_version, evidence_fingerprint)
  VALUES
    (NEW.learner_id, NEW.mission_id, NEW.attempt_id, NEW.step_order, v_order,
     'Completed the paper-practice step.',
     ARRAY['paper_step_completed'], 'growth-insight-rules-v1', v_fingerprint)
  ON CONFLICT (attempt_id, step_order, rule_version, insight_order) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_growth_process_insights ON learning_interaction_events;
CREATE TRIGGER trg_project_growth_process_insights
AFTER INSERT ON learning_interaction_events
FOR EACH ROW
WHEN (NEW.event_type = 'paper_step_completed')
EXECUTE FUNCTION atlas_project_growth_process_insights();

COMMIT;
