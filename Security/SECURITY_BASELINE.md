# Security Baseline

## Core Requirements

- Do not commit secrets, credentials, tokens, private keys, or production configuration.
- Use least privilege for users, services, automation, databases, and AI tools.
- Validate and sanitize input at trust boundaries.
- Authenticate users before exposing private data.
- Authorize actions based on role, ownership, or policy.
- Log important security events without exposing sensitive data.

## Data Protection

- Classify data before storing or processing it.
- Encrypt sensitive data in transit.
- Encrypt sensitive data at rest when required by risk or regulation.
- Keep personal data collection intentional and minimal.
- Define retention and deletion rules before production use.

## AI Security

- Do not send sensitive data to AI systems unless the flow is approved.
- Document prompts, tool access, retrieval sources, and model boundaries.
- Prevent AI tools from taking destructive actions without explicit approval.
- Treat model output as untrusted until validated.

## Operational Security

- Maintain dependency updates.
- Monitor for vulnerabilities.
- Keep deployment credentials separate from developer credentials.
- Review security assumptions before each release.

## Atlas API Boundary

- Validate path, query, and JSON body input centrally before database access.
- Return the standard public error contract without stack traces, SQL, configuration, credentials, or dependency details.
- Keep request logs metadata-only; never record authorization headers, cookies, tokens, request bodies, or learner data.
- Treat `03_services/api/src/auth.mjs` as the future PEOS verification boundary. Its Sprint 004 development identity resolver is not production authentication or authorization.
- Use `/health` only for liveness and `/ready` for PostgreSQL dependency readiness.
