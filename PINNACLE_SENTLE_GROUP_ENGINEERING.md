# Pinnacle Sentle Group Engineering Ecosystem

This note records the intended future project structure without creating those projects yet.

## Future Codex Projects

Pinnacle Sentle Group Engineering may eventually contain:

- PEOS
- Atlas HDOS
- SpaceCase
- Sentinel OS
- Finality OS
- PSG AI Platform
- PSG Design System

## Operating Model

PEOS is its own shared platform project. Every product may depend on PEOS, but PEOS should evolve independently from any single product.

Atlas HDOS should therefore be treated as one repository inside a broader engineering portfolio, not as an isolated application.

## Recommended Future Structure

```text
Pinnacle Sentle Group Engineering
|
|-- PEOS
|-- Atlas HDOS
|-- SpaceCase
|-- Sentinel OS
|-- Finality OS
|-- PSG AI Platform
`-- PSG Design System
```

## Day-One Rule

Every future project should include a `PROJECT_CONSTITUTION.md` file before production implementation begins.

