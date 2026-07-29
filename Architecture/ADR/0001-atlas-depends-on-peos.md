# ADR 0001: Atlas Depends on PEOS as an Independent Shared Platform

## Status

Accepted

## Context

Atlas HDOS is part of the Pinnacle Sentle Group Engineering ecosystem. The broader portfolio is expected to include multiple products that share common platform capabilities.

PEOS must evolve as its own project rather than being embedded inside Atlas.

## Decision

Atlas HDOS will treat PEOS as an external shared platform dependency. Atlas may depend on PEOS capabilities, APIs, identity services, shared data contracts, AI infrastructure, or design foundations, but those responsibilities belong to PEOS unless explicitly approved otherwise.

## Consequences

- Atlas product logic stays focused on the Atlas mission.
- Shared platform capabilities can mature independently.
- Cross-product consistency becomes easier to maintain.
- Integration contracts between Atlas and PEOS must be documented and versioned.

