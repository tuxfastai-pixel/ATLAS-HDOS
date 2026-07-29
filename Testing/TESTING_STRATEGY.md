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

