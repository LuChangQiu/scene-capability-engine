# Scene Spec

## Scene Definition

- Scene: `scene.sce-ide-companion`
- Objective: give IDE and CLI one engine-owned phase-1 projection path for delivery and engineering onboarding
- Primary consumer: frontend IDE companion
- Secondary consumer: CLI / future adapters

## Ontology Coverage

- Entities: `scene`, `spec`, `task`, `delivery_projection`, `delivery_object`, `engineering_project_preview`, `onboarding_result`, `scaffold_result`
- Relations:
  - `delivery_object` binds to `scene/spec/task`
  - `engineering_project_preview` binds to `app/workspace`
  - `master_program` coordinates child specs
- Business rules:
  - engine owns semantics
  - adapters own presentation
  - phase-1 must stay read-heavy and incremental
- Decision policies:
  - `133-01` first
  - `133-02` second
  - `133-03` after preview/open envelope is stable
- Execution flow:
  - define spec group
  - deliver phase-1 projection
  - add onboarding envelope
  - add scaffold/ownership extension

## Decision & Execution Path

1. Confirm this is a projection/onboarding program, not a multi-agent runtime program
2. Lock the child-spec split
3. Implement `133-01` first for IDE-visible value
4. Implement `133-02`
5. Implement `133-03` only after preview/open semantics stabilize

## Closed-Loop Research Contract

- Do not add IDE layout semantics into engine payloads
- Do not mix delivery projection with project scaffold semantics in one implementation spec
- Do not let frontend infer long-lived backend truth from partial commands when an engine contract can be defined

## Acceptance & Gate

- Child specs remain phaseable and UI-neutral
- Phase ordering is explicit
- Delivery projection path can be consumed by IDE without frontend-owned parallel truth
