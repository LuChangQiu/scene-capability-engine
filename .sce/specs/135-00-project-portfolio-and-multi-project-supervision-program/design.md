# Design Document

## Design Summary

This program adds the missing engine-owned layer above single-project collaboration:

- `135-01` defines the portfolio registry projection across visible projects
- `135-02` defines project-level supervision summaries and traceable drillback
- `135-03` defines target-project resolution and command-side project echo

The program does not replace workspace registration, repo configuration, or project-internal collaboration. It composes them into adapter-ready multi-project payloads.

## Boundaries

SCE owns:

- visible project discovery and canonical portfolio projection
- stable project identity fields
- project-level readiness and activity summary
- project-level supervision summary and drillback references
- target-project resolution and caller-context echo
- phase-1 composition from existing workspace registry plus project-local session governance sources

Adapters own:

- pane layout, tabs, tree expansion, sorting, filtering, and local cache
- per-project workbench state and opened document tabs
- adapter-specific visual grouping and compact/detailed presentation

Phase-1 does not introduce:

- a second persistent project registry separate from `16-00`
- a new global cross-project event store
- adapter-owned project identity derivation

## Ordered Child Specs

1. `135-01-project-portfolio-projection-and-registry-envelope`
2. `135-03-project-target-resolution-and-cross-project-command-envelope`
3. `135-02-project-supervision-by-project-envelope`

`135-01` comes first because adapters need stable project identity before they can switch or route across projects. `135-03` comes next so cross-project assistant and orchestration requests can bind to a target project without guessing. `135-02` follows once project identity and routing are stable enough to supervise background projects consistently.

## Dependency Mapping

- `16-00` provides workspace registration and visibility primitives
- `24-00` provides project repository topology context when one project spans multiple repos
- `132-01` provides project-internal session and occupancy semantics
- `132-02` provides handoff and scheduler semantics
- `132-04` provides collaboration event stream and supervision semantics
- `134-*` and adapter specs consume the resulting envelopes without redefining them
- phase-1 portfolio and supervision reads should prefer existing workspace state plus project-local `.sce/session-governance` and session records

## Non-Goals

- defining IDE or CLI layout
- introducing adapter-specific card or lane structures
- changing `manifest.yaml` or steering governance files
- creating placeholder cross-project truth that is not backed by current engine state
