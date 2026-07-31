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
