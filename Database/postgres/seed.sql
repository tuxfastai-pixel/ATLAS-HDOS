INSERT INTO parents (id, name) VALUES ('parent-siyana', 'Founding Parent')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO learners (
  id, parent_id, username, display_name, grade, journey, learning_level,
  primary_language, secondary_language, international_language, interests,
  focus_areas, next_focus, family_mission, companion_message
) VALUES
  ('learner-leago', 'parent-siyana', 'leago', 'Leago', 'Grade 8', 'Paleontology Expedition',
   'Grade 8', 'English', NULL, NULL, ARRAY['paleontology', 'science'],
   ARRAY['communication', 'thinking', 'science'], 'Explain evidence with clear detail.',
   'Compare three rocks at home and describe what makes each one different.', 'Ready for today''s fossil expedition?'),
  ('learner-siyana', 'parent-siyana', 'siyana', 'Siyana', 'Foundation Phase', 'Junior Discovery Journey',
   'Foundation Phase', 'English', 'Japanese', 'Mandarin',
   ARRAY['law', 'animals', 'art', 'stories', 'helping people'],
   ARRAY['foundation mathematics', 'reading', 'confidence', 'social development', 'creativity', 'Japanese', 'Mandarin'],
   'Build confidence while explaining Foundation Phase number thinking.',
   'Play Family Budget Game together and explain one kind spending choice.', 'Ready to solve a kind detective mystery?')
ON CONFLICT (id) DO UPDATE SET
  parent_id = EXCLUDED.parent_id, username = EXCLUDED.username,
  display_name = EXCLUDED.display_name, grade = EXCLUDED.grade, journey = EXCLUDED.journey,
  learning_level = EXCLUDED.learning_level, primary_language = EXCLUDED.primary_language,
  secondary_language = EXCLUDED.secondary_language, international_language = EXCLUDED.international_language,
  interests = EXCLUDED.interests, focus_areas = EXCLUDED.focus_areas,
  next_focus = EXCLUDED.next_focus, family_mission = EXCLUDED.family_mission,
  companion_message = EXCLUDED.companion_message;

INSERT INTO learner_credentials (learner_id, password_dev_only) VALUES
  ('learner-leago', 'atlas123'), ('learner-siyana', 'atlas123')
ON CONFLICT (learner_id) DO UPDATE SET password_dev_only = EXCLUDED.password_dev_only;

DELETE FROM capability_scores WHERE learner_id IN ('learner-leago', 'learner-siyana');
INSERT INTO capability_scores (learner_id, domain, score, trend) VALUES
  ('learner-leago', 'Communication', 68, 'improving'), ('learner-leago', 'Thinking', 61, 'steady'),
  ('learner-leago', 'Global', 42, 'developing'), ('learner-leago', 'Creative', 74, 'improving'),
  ('learner-siyana', 'Confidence', 52, 'developing'), ('learner-siyana', 'Creativity', 70, 'improving'),
  ('learner-siyana', 'Mathematics', 58, 'steady'), ('learner-siyana', 'Reading', 60, 'improving');

INSERT INTO missions (id, learner_id, title, summary, duration_minutes, domains, status) VALUES
  ('mission-lost-fossil', 'learner-leago', 'The Lost Fossil', 'Leago investigates a mysterious fossil and explains what it can teach us about ancient life.', 25, ARRAY['Communication', 'Thinking', 'Science'], 'not_started'),
  ('mission-rock-hunt', 'learner-leago', 'Family Rock Hunt', 'Compare three rocks at home and describe their differences.', 15, ARRAY['Family', 'Observation'], 'not_started'),
  ('mission-junior-detective-maths', 'learner-siyana', 'Junior Detective Maths', 'Solve a friendly animal mystery with Foundation Phase addition and explain the clue.', 20, ARRAY['Foundation Mathematics', 'Confidence'], 'not_started'),
  ('mission-story-adventure', 'learner-siyana', 'Story Adventure', 'Read a short animal story and choose a kind ending.', 15, ARRAY['Reading', 'Kindness'], 'not_started'),
  ('mission-japanese-greetings', 'learner-siyana', 'Japanese Greetings', 'Practise simple greetings, names, family, animals, school, and kindness in context.', 10, ARRAY['Japanese', 'Communication'], 'not_started'),
  ('mission-mandarin-greetings', 'learner-siyana', 'Mandarin Greetings', 'Practise simple greetings, names, family, animals, school, and kindness in context.', 10, ARRAY['Mandarin', 'Communication'], 'not_started'),
  ('mission-creative-courtroom', 'learner-siyana', 'Creative Courtroom Project', 'Use art and a simple story to help animal friends solve a fair problem.', 20, ARRAY['Creativity', 'Social Development'], 'not_started'),
  ('mission-family-budget', 'learner-siyana', 'Family Budget Game', 'Count coins and make a kind family spending choice.', 15, ARRAY['Foundation Mathematics', 'Family'], 'not_started')
ON CONFLICT (id) DO UPDATE SET learner_id=EXCLUDED.learner_id, title=EXCLUDED.title,
 summary=EXCLUDED.summary, duration_minutes=EXCLUDED.duration_minutes, domains=EXCLUDED.domains,
 status='not_started', completed_at=NULL;

DELETE FROM mission_attempts;
DELETE FROM progress_events;
DELETE FROM mission_objectives;
DELETE FROM mission_steps;
DELETE FROM companion_messages;

INSERT INTO mission_objectives (mission_id, objective_order, objective_text) VALUES
 ('mission-lost-fossil',1,'Read a short fossil discovery story.'), ('mission-lost-fossil',2,'Explain what fossils are in your own words.'),
 ('mission-rock-hunt',1,'Observe texture, color, and shape.'),
 ('mission-junior-detective-maths',1,'Solve a Foundation Phase addition mystery.'),
 ('mission-junior-detective-maths',2,'Explain the answer in your own words.'),
 ('mission-junior-detective-maths',3,'Reflect on confidence after solving the mystery.'),
 ('mission-japanese-greetings',1,'Use a simple greeting and share your name.'),
 ('mission-japanese-greetings',2,'Connect kind words with family, animals, and school.'),
 ('mission-mandarin-greetings',1,'Use a simple greeting and share your name.'),
 ('mission-mandarin-greetings',2,'Connect kind words with family, animals, and school.');

INSERT INTO mission_steps (mission_id, step_order, step_type, title, instruction) VALUES
 ('mission-lost-fossil',1,'warmup','Remember','What is a fossil? Write or say one idea before reading.'),
 ('mission-lost-fossil',2,'reading','Read','Read the fossil story and identify the clue that helped the explorer.'),
 ('mission-lost-fossil',3,'reflection','Reflect','What surprised you about the fossil discovery?'),
 ('mission-junior-detective-maths',1,'warmup','Warm-up','Count five paw prints, then count two more.'),
 ('mission-junior-detective-maths',2,'reading','Read the mystery','A puppy left 5 paw prints by the gate and 2 by the tree. How many paw prints are there altogether?'),
 ('mission-junior-detective-maths',3,'mathematics','Solve the clue','Use counters, fingers, or a drawing to solve 5 + 2.'),
 ('mission-junior-detective-maths',4,'explanation','Explain your answer','Tell how you know the answer is 7.'),
 ('mission-junior-detective-maths',5,'reflection','Confidence reflection','Choose how you feel: still learning, getting confident, or detective confident.'),
 ('mission-junior-detective-maths',6,'celebration','Celebrate','Case solved! Celebrate your careful thinking and kind detective work.'),
 ('mission-japanese-greetings',1,'greeting','Hello','Say “Konnichiwa”. It is a friendly hello.'),
 ('mission-japanese-greetings',2,'name','My name','Say “Watashi wa Siyana desu” to share your name. Speaking is enough; no writing system practice is needed.'),
 ('mission-japanese-greetings',3,'context','Kind connections','Greet a family member, an animal friend, or someone at school, then add a kind smile.'),
 ('mission-mandarin-greetings',1,'greeting','Hello','Say “Nǐ hǎo”. It is a friendly hello.'),
 ('mission-mandarin-greetings',2,'name','My name','Say “Wǒ jiào Siyana” to share your name. Speaking is enough; characters are not required.'),
 ('mission-mandarin-greetings',3,'context','Kind connections','Greet a family member, an animal friend, or someone at school, then practise “xièxie” for thank you.');
