# Testing Strategy

## Testing Goals

- Protect the core Atlas user journeys.
- Verify API, database, UI, and AI behavior.
- Catch regressions before release.
- Keep tests readable and useful for future engineers.

## Test Types

- Unit tests for focused business logic.
- Integration tests for API, database, and service boundaries.
- UI tests for critical workflows.
- AI evaluation tests for prompt behavior, safety boundaries, and tool use.
- Manual exploratory testing for new product flows.

## Minimum Expectations

- New behavior should include tests unless there is a documented reason.
- Bug fixes should include regression coverage where practical.
- AI features must include acceptance examples and failure cases.
- Release candidates must pass the relevant test suite and manual checks.

## Test Documentation

Each major feature should document:

- What was tested
- What was not tested
- Known risks
- Manual verification steps

## API Platform Checks

- Run `npm test` for request validation, standardized errors, health/readiness, dependency failure, request logging, and sensitive-error leakage coverage.
- Run `npm run migrate`, `npm run seed`, and `npm run smoke` for the PostgreSQL-backed persisted journey.
- Verify `/health` independently of PostgreSQL and verify `/ready` both with a reachable database and with an intentionally unavailable database URL.
