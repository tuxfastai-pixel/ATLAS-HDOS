# Atlas HDOS Project Constitution

## Purpose

This constitution is the governing document for Atlas HDOS. Every Codex session, engineer, and contributor must read this file before making changes.

Atlas HDOS is part of the Pinnacle Sentle Group Engineering ecosystem. It is a product built on top of PEOS, the shared platform that evolves independently and provides common capabilities for the broader portfolio.

## Mission

Build a human development operating system that helps people learn, grow, execute meaningful missions, and interact with intelligent systems in a structured, ethical, and useful way.

## Vision

Atlas HDOS should become a durable product platform for learning, capability development, mission execution, and AI-assisted personal growth. It must be engineered as a serious long-term system, not a disposable prototype.

## Portfolio Context

Future Pinnacle Sentle Group projects may include:

- PEOS, the shared platform
- Atlas HDOS
- SpaceCase
- Sentinel OS
- Finality OS
- PSG AI Platform
- PSG Design System

PEOS is intentionally separate from Atlas. Atlas may consume PEOS capabilities, but it must not quietly absorb PEOS responsibilities.

## Architecture Principles

- Keep product concerns separate from shared platform concerns.
- Prefer modular, testable components over tightly coupled implementations.
- Document major decisions in Architecture Decision Records.
- Treat AI features as product capabilities with explicit rules, boundaries, and acceptance criteria.
- Design data models before building flows that depend on them.
- Make integration boundaries visible and versioned.

## Coding Standards

- Follow the repository coding standards before adding or changing code.
- Keep code readable, typed where practical, and organized around product domains.
- Avoid hidden side effects and ambiguous naming.
- Add tests for meaningful behavior, not only implementation details.
- Do not introduce new frameworks, runtimes, or dependencies without an ADR.

## AI Rules

- AI behavior must be explainable at the product level.
- AI systems must not invent user facts, credentials, legal claims, medical claims, or financial claims.
- Prompts, tools, retrieval sources, and model boundaries must be documented.
- Human agency and user safety take priority over automation.
- Sensitive user data must not be sent to AI systems unless the data flow is approved and documented.

## Security Standards

- Never hard-code secrets, tokens, credentials, or private keys.
- Use least-privilege access for services, users, and automation.
- Validate input at trust boundaries.
- Record security assumptions in the security baseline.
- Treat authentication, authorization, audit logging, and data privacy as first-class requirements.

## Design Philosophy

- Atlas should feel calm, structured, and empowering.
- Interfaces should prioritize clarity, focus, and progression.
- Design should support repeated use, not only first impressions.
- Accessibility, responsive behavior, and readable information hierarchy are required.
- Shared visual foundations should come from the PSG Design System when it exists.

## CHEP Protocol

CHEP stands for Clarity, Human Alignment, Engineering Discipline, and Product Integrity.

- Clarity: define the problem, scope, and expected outcome before implementation.
- Human Alignment: preserve user dignity, agency, and safety.
- Engineering Discipline: keep architecture, tests, security, and documentation in sync.
- Product Integrity: build features that serve the mission rather than decorative complexity.

## Sprint Workflow

- Every sprint must have a goal, backlog, Definition of Done, acceptance criteria, and test expectations.
- Work should be broken into small, reviewable increments.
- Large changes require an ADR or implementation plan.
- Completed work should update relevant docs before release.

## Acceptance Standards

A change is acceptable only when:

- It supports the Atlas mission and product direction.
- It respects PEOS as an independent shared platform.
- It follows the coding, testing, security, and design standards.
- It has clear acceptance criteria.
- It is verified through appropriate tests, review, or manual validation.

