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

DELETE FROM learner_observations;
DELETE FROM learner_growth_dimensions;
DELETE FROM concept_progression_history;
DELETE FROM concept_evidence_windows;
DELETE FROM learner_concept_progression;
DELETE FROM learning_responses;
DELETE FROM learning_interaction_events;
DELETE FROM attempt_challenge_state;
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
 ('mission-lost-fossil',1,'short_text','Warm-up recall','What do you already know about fossils?'),
 ('mission-lost-fossil',2,'reading','Read the fossil story','A young explorer finds a shell shape pressed into ancient rock. Read the clue carefully.'),
 ('mission-lost-fossil',3,'short_text','Speech practice','Write the key sentence you would practise saying aloud.'),
 ('mission-lost-fossil',4,'choice','Japanese vocabulary','Choose the Japanese word for fossil: kaseki.'),
 ('mission-lost-fossil',5,'choice','Mandarin vocabulary','Choose the Mandarin word for fossil: huàshí.'),
 ('mission-lost-fossil',6,'reflection','Science reflection','Explain what the fossil evidence tells us and reflect on your learning.'),
 ('mission-lost-fossil',7,'celebration','Completion celebration','Expedition complete! Review your work and finish the mission.'),
 ('mission-junior-detective-maths',1,'choice','Welcome and warm-up','Welcome, Detective! Count five paw prints, then two more.'),
 ('mission-junior-detective-maths',2,'reading','Read the mystery','A puppy left 5 paw prints by the gate and 2 by the tree. How many are there altogether?'),
 ('mission-junior-detective-maths',3,'number','Solve the maths problem','Use counters, fingers, or a drawing to solve the practice challenge shown below.'),
 ('mission-junior-detective-maths',4,'number','Select or enter the answer','Enter the number you worked out.'),
 ('mission-junior-detective-maths',5,'short_text','Explain your answer','Write one short sentence about how you found the answer.'),
 ('mission-junior-detective-maths',6,'confidence','Confidence reflection','Choose how confident you feel about your maths thinking.'),
 ('mission-junior-detective-maths',7,'celebration','Celebration and completion','Case solved! Review your clues and complete the mission.'),
 ('mission-japanese-greetings',1,'greeting','Hello','Say “Konnichiwa”. It is a friendly hello.'),
 ('mission-japanese-greetings',2,'name','My name','Say “Watashi wa Siyana desu” to share your name.'),
 ('mission-japanese-greetings',3,'context','Kind connections','Greet someone, then add a kind smile.'),
 ('mission-mandarin-greetings',1,'greeting','Hello','Say “Nǐ hǎo”. It is a friendly hello.'),
 ('mission-mandarin-greetings',2,'name','My name','Say “Wǒ jiào Siyana” to share your name.'),
 ('mission-mandarin-greetings',3,'context','Kind connections','Practise “xièxie” for thank you.');

INSERT INTO learning_concepts (id, domain, title, version, active) VALUES
  ('foundation-addition-within-10','Foundation Mathematics','Addition within 10','curriculum-v1',TRUE)
ON CONFLICT (id) DO UPDATE SET domain=EXCLUDED.domain,title=EXCLUDED.title,version=EXCLUDED.version,active=EXCLUDED.active;

INSERT INTO challenge_variants (
  id, challenge_family_id, concept_id, mission_id, step_order, prompt, response_type,
  validation_kind, validation_config, active, content_version, demand_stage, context_type, scaffold_profile
) VALUES
  ('siyana-pawprints-addition','foundation-addition-within-10','foundation-addition-within-10',
   'mission-junior-detective-maths',3,'Draw 5 paw prints, then 2 more. How many paw prints are there altogether?',
   'number','integer_equals','{"protectedAnswer":7}'::jsonb,TRUE,'challenge-v2',0,'same_context','standard'),
  ('siyana-shells-addition','foundation-addition-within-10','foundation-addition-within-10',
   'mission-junior-detective-maths',3,'Draw 4 shells, then add 3 more shells. How many shells are there altogether?',
   'number','integer_equals','{"protectedAnswer":7}'::jsonb,TRUE,'challenge-v2',1,'varied_representation','standard'),
  ('siyana-apples-addition','foundation-addition-within-10','foundation-addition-within-10',
   'mission-junior-detective-maths',3,'There are 6 apples in a basket and 1 more is added. Work it out on paper. How many apples are there?',
   'number','integer_equals','{"protectedAnswer":7}'::jsonb,TRUE,'challenge-v2',2,'transfer','standard'),
  ('siyana-train-addition','foundation-addition-within-10','foundation-addition-within-10',
   'mission-junior-detective-maths',3,'A toy train has 3 blue carriages and 4 red carriages. Work out the total on paper.',
   'number','integer_equals','{"protectedAnswer":7}'::jsonb,TRUE,'challenge-v2',3,'transfer','reduced'),
  ('siyana-birds-addition','foundation-addition-within-10','foundation-addition-within-10',
   'mission-junior-detective-maths',3,'Two birds are on a fence and five more arrive. Show your thinking on paper and work out how many birds there are.',
   'number','integer_equals','{"protectedAnswer":7}'::jsonb,TRUE,'challenge-v2',4,'transfer','reduced')
ON CONFLICT (id) DO UPDATE SET challenge_family_id=EXCLUDED.challenge_family_id,concept_id=EXCLUDED.concept_id,
 mission_id=EXCLUDED.mission_id,step_order=EXCLUDED.step_order,prompt=EXCLUDED.prompt,response_type=EXCLUDED.response_type,
 validation_kind=EXCLUDED.validation_kind,validation_config=EXCLUDED.validation_config,active=EXCLUDED.active,
 content_version=EXCLUDED.content_version,demand_stage=EXCLUDED.demand_stage,context_type=EXCLUDED.context_type,
 scaffold_profile=EXCLUDED.scaffold_profile;

INSERT INTO mission_step_learning_config (
  mission_id, step_order, concept_id, challenge_variant_id, paper_practice_required, independent_attempt_required
) VALUES (
  'mission-junior-detective-maths',3,'foundation-addition-within-10','siyana-pawprints-addition',TRUE,TRUE
)
ON CONFLICT (mission_id,step_order) DO UPDATE SET concept_id=EXCLUDED.concept_id,challenge_variant_id=EXCLUDED.challenge_variant_id,
 paper_practice_required=EXCLUDED.paper_practice_required,independent_attempt_required=EXCLUDED.independent_attempt_required;

DELETE FROM support_ladder_items WHERE challenge_variant_id IN (
 'siyana-pawprints-addition','siyana-shells-addition','siyana-apples-addition','siyana-train-addition','siyana-birds-addition'
);
INSERT INTO support_ladder_items (challenge_variant_id,support_position,support_kind,content,content_version) VALUES
 ('siyana-pawprints-addition',1,'attention_prompt','Circle the two groups of paw prints in your drawing. What do you notice?','support-v2'),
 ('siyana-pawprints-addition',2,'hint','Start with the group of five, then count on the two extra paw prints one at a time.','support-v2'),
 ('siyana-pawprints-addition',3,'guided_breakdown','On paper, write the first group. Add one paw print, then one more, saying each new total quietly as you go.','support-v2'),
 ('siyana-pawprints-addition',4,'worked_analogy','Try a different example first: 3 shells plus 1 shell makes 4 shells. Then return to the paw-print challenge.','support-v2'),
 ('siyana-shells-addition',1,'attention_prompt','Point to the first group of shells and then the shells that were added.','support-v2'),
 ('siyana-shells-addition',2,'hint','Begin with four and count on three more, one at a time.','support-v2'),
 ('siyana-shells-addition',3,'guided_breakdown','Draw four small circles, then add three more circles and count the full group.','support-v2'),
 ('siyana-shells-addition',4,'worked_analogy','Try 2 stars plus 2 stars first. That makes 4 stars. Then return to the shells.','support-v2'),
 ('siyana-apples-addition',1,'attention_prompt','Notice what you start with and what changes when one more apple is added.','support-v2'),
 ('siyana-apples-addition',2,'hint','Start at six and count on one more.','support-v2'),
 ('siyana-apples-addition',3,'guided_breakdown','Draw six marks for the apples, add one mark, then count the marks together.','support-v2'),
 ('siyana-apples-addition',4,'worked_analogy','Imagine 3 cups and 1 more cup. That makes 4 cups. Then return to the apple story.','support-v2'),
 ('siyana-train-addition',1,'attention_prompt','Look for the two carriage groups before you combine them.','support-v2'),
 ('siyana-train-addition',2,'hint','Keep the first group in mind and count on the second group.','support-v2'),
 ('siyana-train-addition',3,'guided_breakdown','Use a quick line for each carriage, separate the two groups, then count them together.','support-v2'),
 ('siyana-train-addition',4,'worked_analogy','Think about 2 red blocks and 2 blue blocks making 4 blocks, then return to the train.','support-v2'),
 ('siyana-birds-addition',1,'attention_prompt','Show the birds that were already there separately from the birds that arrived.','support-v2'),
 ('siyana-birds-addition',2,'hint','Start with the smaller group and count on the arriving birds.','support-v2'),
 ('siyana-birds-addition',3,'guided_breakdown','Make one mark for each bird in both groups, then count all the marks once.','support-v2'),
 ('siyana-birds-addition',4,'worked_analogy','Try 1 cat plus 3 cats first. That makes 4 cats. Then return to the bird story.','support-v2');

INSERT INTO parent_credentials (parent_id, username, password_dev_only)
VALUES ('parent-siyana', 'parent', 'atlas-parent-123')
ON CONFLICT (parent_id) DO UPDATE SET username=EXCLUDED.username, password_dev_only=EXCLUDED.password_dev_only;
