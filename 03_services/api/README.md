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

`src/auth.mjs` is the explicit future PEOS identity-verification seam. Sprint 004 only resolves the existing development bearer token and does not enforce new route policy, so local/demo flows remain compatible. PEOS authentication and authorization are out of scope.

## Commands

From the repository root, run `npm test` for automated API hardening tests and `npm run smoke` for the PostgreSQL-backed end-to-end flow. Database setup uses `npm run migrate` followed by `npm run seed`.
