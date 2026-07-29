INSERT INTO parents (id, name)
VALUES
  ('parent-siyana', 'Siyana')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name;

INSERT INTO learners (id, parent_id, username, display_name, grade, journey)
VALUES
  ('learner-leago', 'parent-siyana', 'leago', 'Leago', 'Grade 8', 'Paleontology Expedition')
ON CONFLICT (id) DO UPDATE
SET
  parent_id = EXCLUDED.parent_id,
  username = EXCLUDED.username,
  display_name = EXCLUDED.display_name,
  grade = EXCLUDED.grade,
  journey = EXCLUDED.journey;

INSERT INTO learner_credentials (learner_id, password_dev_only)
VALUES
  ('learner-leago', 'atlas123')
ON CONFLICT (learner_id) DO UPDATE
SET password_dev_only = EXCLUDED.password_dev_only;

DELETE FROM capability_scores WHERE learner_id = 'learner-leago';

INSERT INTO capability_scores (learner_id, domain, score, trend)
VALUES
  ('learner-leago', 'Communication', 68, 'improving'),
  ('learner-leago', 'Thinking', 61, 'steady'),
  ('learner-leago', 'Global', 42, 'developing'),
  ('learner-leago', 'Creative', 74, 'improving');

INSERT INTO missions (id, learner_id, title, summary, duration_minutes, domains, status)
VALUES
  (
    'mission-lost-fossil',
    'learner-leago',
    'The Lost Fossil',
    'Leago investigates a mysterious fossil and explains what it can teach us about ancient life.',
    25,
    ARRAY['Communication', 'Thinking', 'Science'],
    'not_started'
  ),
  (
    'mission-rock-hunt',
    'learner-leago',
    'Family Rock Hunt',
    'Compare three rocks at home and describe their differences.',
    15,
    ARRAY['Family', 'Observation'],
    'not_started'
  )
ON CONFLICT (id) DO UPDATE
SET
  learner_id = EXCLUDED.learner_id,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  duration_minutes = EXCLUDED.duration_minutes,
  domains = EXCLUDED.domains,
  status = EXCLUDED.status,
  completed_at = NULL;

DELETE FROM mission_objectives WHERE mission_id IN ('mission-lost-fossil', 'mission-rock-hunt');
DELETE FROM mission_steps WHERE mission_id IN ('mission-lost-fossil', 'mission-rock-hunt');
DELETE FROM companion_messages WHERE learner_id = 'learner-leago';

INSERT INTO mission_objectives (mission_id, objective_order, objective_text)
VALUES
  ('mission-lost-fossil', 1, 'Read a short fossil discovery story.'),
  ('mission-lost-fossil', 2, 'Explain what fossils are in your own words.'),
  ('mission-lost-fossil', 3, 'Practice clear speech using fossil vocabulary.'),
  ('mission-lost-fossil', 4, 'Reflect on what evidence can tell us about the past.'),
  ('mission-rock-hunt', 1, 'Observe texture, color, and shape.'),
  ('mission-rock-hunt', 2, 'Share one finding with Siyana.');

INSERT INTO mission_steps (mission_id, step_order, step_type, title, instruction)
VALUES
  ('mission-lost-fossil', 1, 'warmup', 'Remember', 'What is a fossil? Write or say one idea before reading.'),
  ('mission-lost-fossil', 2, 'reading', 'Read', 'Read the fossil story and identify the clue that helped the explorer.'),
  ('mission-lost-fossil', 3, 'speech', 'Speak', 'Practice these words clearly: research, river, rare, roar.'),
  ('mission-lost-fossil', 4, 'science', 'Connect', 'Explain how a fossil can become evidence of an animal or plant from long ago.'),
  ('mission-lost-fossil', 5, 'reflection', 'Reflect', 'What surprised you about the fossil discovery?');
