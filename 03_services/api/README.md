# Atlas API

## Environment

Copy `.env.example` values into your local environment. The API validates `NODE_ENV`, `ATLAS_API_PORT`, and `ATLAS_DB_POOL_SIZE` at startup. `DATABASE_URL` is required when `NODE_ENV=production`; development retains the Sprint 003 local PostgreSQL default. Never commit deployed credentials.

## Operations

- `GET /health` is a process liveness probe and does not contact PostgreSQL.
- `GET /ready` checks PostgreSQL and returns HTTP 503 when it cannot be reached.
- Every response has an `x-request-id`; structured request logs include only request ID, method, route, status, and duration.

Errors consistently use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": []
  }
}
```

Supported error statuses are 400 validation, 401 unauthenticated, 403 unauthorized, 404 not found, 409 conflict, 500 internal, and 503 dependency unavailable. Internal exceptions and database details are never returned.

## Authentication boundary

`src/auth.mjs` is the explicit future PEOS identity-verification seam. Sprint 005
supports the development-only `leago` and `siyana` learner logins and the
`atlas-dev-token-parent` parent bearer token. These fixed credentials are not
production authentication and must be replaced by PEOS identity verification.

Learner routes enforce subject ownership. The development parent can read both
children linked to `parent-siyana`; learners cannot read the parent summary or
one another's home, mission detail, or mission history.

## Commands

From the repository root, run `npm test` for automated API hardening tests and `npm run smoke` for the PostgreSQL-backed end-to-end flow. Database setup uses `npm run migrate` followed by `npm run seed`.

## Guided mission attempts (Sprint 006)

Development login accepts `leago` / `atlas123`, `siyana` / `atlas123`, and the explicit parent credentials `parent` / `atlas-parent-123`. These credentials and returned bearer tokens are development-only; PEOS continues to own production identity.

Learners start or resume with `POST /missions/:missionId/attempts/start`, retrieve the latest resumable attempt with `GET /missions/:missionId/attempts/latest`, save with `PATCH /attempts/:attemptId`, and finish with `POST /attempts/:attemptId/complete`. Ownership and learner-role checks apply to every mutation, and completed attempts are immutable.

`npm run migrate` uses the ordered `schema_migrations` ledger and safely skips applied SQL files. `npm run test:browser` runs the Playwright browser journeys described below.

## Transaction-safe attempt lifecycle (Sprint 007)

Completion locks and validates the learner-owned in-progress attempt, persists its final responses and timestamps, updates the mission, and writes the progress event in one PostgreSQL transaction. A failure at any point rolls the entire completion back. The `ATLAS_TEST_COMPLETION_FAILURE=after_attempt_update` seam is honored only when `NODE_ENV=test` and exists solely for rollback verification.

Learners can explicitly `POST /attempts/:attemptId/abandon` for an in-progress attempt and `POST /attempts/:attemptId/retry` for a completed attempt. Retry creates a linked attempt and never resets the completed record. Closed-attempt response content can be removed with `POST /attempts/:attemptId/redact` and a `deletionReason`; identity, lifecycle timestamps, retry lineage, progress events, and deletion audit metadata remain intact, while response JSON, explanation, and reflection are erased.

`npm run test:browser` now runs real Playwright journeys against the web and API servers. Install Chromium with `npx playwright install chromium` before running it locally.
