# Atlas HDOS Family Pilot Recovery Plan

## Status

Active recovery and implementation plan.

Baseline: `recovery/atlas-reconciliation-2026-08-24`, derived from verified `develop` commit `2dbf057` (Sprint 008 Growth DNA foundation).

Implementation branch: `feature/family-pilot-sprint-009-adaptive-learning`.

## Certified Baseline

The Sprint 008 baseline was re-verified locally with PostgreSQL and Docker available:

- two consecutive migrations completed without duplicate application;
- database seed completed;
- 30 API/unit tests passed;
- 6 browser-contract tests passed;
- 3 Playwright journeys passed;
- PostgreSQL smoke suite passed;
- Growth DNA idempotency and rollback checks passed;
- learner isolation and parent authorization passed;
- restart persistence passed;
- `git diff --check` passed.

This baseline is treated as the trusted recovery point for the Family Pilot.

## Family Pilot Objective

Deliver a usable Atlas experience for the two founding learner profiles already represented in the repository while the broader HDOS platform continues to mature.

The Family Pilot must let each learner independently:

1. sign in through the current development identity seam;
2. see learner-specific missions and learning context;
3. start, save, resume, complete, abandon, and retry guided missions;
4. retain progress after API/database restart;
5. generate minimized Growth DNA observations from real mission activity;
6. receive a deterministic and explainable next-mission recommendation;
7. receive scaffolded companion support that guides without simply supplying answers.

The parent workspace must keep each child's evidence, current work, progress, recommendations, and Growth DNA signals separate.

## Recovery Workstreams

### FP-009 — Deterministic Adaptive Learning

Build a recommendation layer on the certified Sprint 008 evidence model.

Required properties:

- observable evidence only;
- deterministic, versioned rules;
- prerequisite enforcement;
- active-work priority;
- explainable recommendation reasons;
- transaction-safe recommendation invalidation on relevant lifecycle changes;
- immutable recommendation history;
- learner/parent authorization;
- no IQ, aptitude, fixed-trait, diagnosis, or future-performance inference.

### FP-010 — Learner Experience Hardening

- recommendation card on learner home;
- clear continue/resume/start actions;
- age-appropriate mission controls;
- learner-specific presentation without duplicated services;
- accessibility and responsive pass;
- resilient loading/error states.

### FP-011 — Companion Teaching V1

Replace the three-response mock with a governed teaching/scaffolding layer while preserving a clear future PEOS/Atlas Brain boundary.

Pilot behavior should:

- ask guiding questions;
- explain concepts at the learner's level;
- use repetition and alternative explanations;
- avoid directly completing the learner's assessed work;
- use only approved learner/mission context;
- remain auditable and bounded.

### FP-012 — Parent Pilot Workspace

Show, separately for each child:

- current mission and progress;
- latest completed work;
- confidence/reflection;
- Growth DNA evidence;
- deterministic next recommendation and reason;
- suggested family support activity.

### FP-013 — Pilot Operations and Deployment

- non-developer startup/deployment path;
- environment configuration;
- database backup/recovery procedure;
- health/readiness visibility;
- pilot privacy/retention rules;
- release checklist and rollback plan.

## Definition of Family Pilot Ready

The Family Pilot is ready only when:

- all migrations are repeatable and recorded once;
- API/unit, browser-contract, Playwright, and smoke suites pass;
- learner data remains isolated;
- parent access is scoped to persisted relationships;
- progress survives restart;
- recommendations refresh correctly after lifecycle changes;
- no stale recommendation is presented as current;
- companion behavior is bounded and does not expose or fabricate learner data;
- both learner journeys can be completed without developer intervention;
- a parent can review both learners independently;
- a documented startup and recovery procedure exists.

## Deferred Beyond Family Pilot

The following remain part of the full Atlas HDOS roadmap but are not blockers for initial family use:

- production PEOS identity;
- teacher/classroom administration;
- mobile operations;
- cross-product PSG services;
- full Atlas Brain architecture;
- production-scale observability;
- institutional deployment and compliance workflows.

## Branch Discipline

- `main` remains untouched during recovery.
- `develop` remains the last integrated verified baseline until Family Pilot work is approved.
- recovery work is implemented and verified on dedicated branches before integration.
- no unverified Codex Cloud-only implementation is treated as repository truth.
