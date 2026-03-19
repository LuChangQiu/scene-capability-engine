# Design Document

## Design Summary

Create one small program-level spec group:

1. `133-01` scene delivery projection read model and command surface
2. `133-02` engineering project preview and open/import result envelope
3. `133-03` engineering scaffold and ownership relation extension

This keeps the immediate IDE feature path narrow:

- first give IDE one engine-owned `Delivery` column payload
- then give IDE/CLI one canonical engineering project preview/open result
- then extend scaffold and ownership semantics without mixing them into the first two steps

## Why this split

The earlier drafts were directionally useful but too broad in two places:

- delivery projection lacked a concrete phase-1 transport decision
- engineering onboarding mixed preview, action envelopes, scaffold, and ownership in one spec

This program removes that coupling and turns the work into a phaseable sequence.

## Program Boundary

### In scope

- delivery projection read model
- delivery projection JSON command surface
- engineering project preview contract
- open/import result envelope
- scaffold result contract
- ownership relation extension point

### Out of scope for phase-1

- project-level multi-agent collaboration runtime
- collaboration scheduler and worktree supervision
- IDE layout and interaction design
- frontend-local permanent truth stores

## Rollout Plan

### Phase 1

- define `Delivery` projection contract and read command surface
- define engineering preview/open envelope
- document adapter boundary

### Phase 2

- add scaffold command/result contract
- add ownership relation extension fields
- align CLI human-readable output to the same semantics

### Phase 3

- connect later collaboration projection work only when direct dependencies appear

## Dependency Notes

- `133-01` is the first implementation track and the first IDE-visible payoff
- `133-02` depends on existing `app engineering show|attach|hydrate|activate` semantics, but wraps them in a canonical envelope
- `133-03` extends `133-02` and should not block `133-01`

## Requirement Mapping

- Requirement 1 -> master program boundary and child-spec group
- Requirement 2 -> prioritize `133-01`
- Requirement 3 -> split onboarding into `133-02` and `133-03`
- Requirement 4 -> semantic, cross-tool contract discipline
- Requirement 5 -> explicit phasing and defer list
