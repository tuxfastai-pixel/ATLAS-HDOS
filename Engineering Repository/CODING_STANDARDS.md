# Coding Standards

## General Standards

- Read `PROJECT_CONSTITUTION.md` before making changes.
- Keep changes small, understandable, and aligned to a defined task.
- Prefer existing project patterns over new abstractions.
- Use clear names for modules, files, functions, variables, and data models.
- Document non-obvious decisions in code comments or ADRs.

## Architecture

- Keep product logic, platform integration, API contracts, data access, and UI concerns separate.
- Do not add dependencies without a clear reason.
- Use ADRs for major architectural or dependency decisions.
- Avoid duplicating shared platform responsibilities that belong in PEOS.

## Code Quality

- Favor explicit types and predictable interfaces.
- Keep functions focused.
- Handle errors deliberately.
- Validate input at trust boundaries.
- Do not leave dead code, temporary hacks, or unexplained TODOs in production paths.

## Review Expectations

- The code should be readable by a future engineer without private context.
- Tests should cover the behavior most likely to break.
- Security, privacy, and AI safety implications should be considered before merge.

