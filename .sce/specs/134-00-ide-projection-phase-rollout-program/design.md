# Design Document

## Decision

Replace the current broad child-spec draft with one master program and five bounded child specs.

## Rollout Topology

### Phase-1

1. `134-01-scene-delivery-projection-envelope-and-command`
2. `134-02-engineering-project-preview-payload`
3. `134-03-engineering-project-open-import-envelope`

### Phase-2

4. `134-04-engineering-project-scaffold-result`
5. `134-05-engineering-ownership-relation-extension`

## Dependency Rules

- `134-01` is independent and should land first for the new `Delivery` column
- `134-02` is independent and defines the readiness payload for engineering project inspection
- `134-03` depends on `134-02` because the open/import result embeds preview state
- `134-04` depends on `134-03` so scaffold work does not widen phase-1
- `134-05` depends on `134-02` and `134-03` because ownership extension should attach to stable engineering identities

## Why This Split

- Delivery projection and engineering project management are related, but they do not need one oversized contract
- Preview payload and open/import result are close, but each one can stay bounded if preview is the base read model
- Scaffold setup and ownership extension are later-phase concerns and should not block the first IDE-facing payoff

## Non-goals

- no IDE tab or pane design
- no new parallel execution plane
- no direct merge of the `132-*` collaboration runtime into this rollout

## Requirement Mapping

- Requirement 1 -> master rollout boundary
- Requirement 2 -> phase-1 and phase-2 partition
- Requirement 3 -> bounded child-spec ownership
- Requirement 4 -> engine-owned contract line
- Requirement 5 -> explicit dependency and deferral rules
