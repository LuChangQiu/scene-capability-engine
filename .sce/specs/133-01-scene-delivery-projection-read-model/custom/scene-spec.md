# Scene Spec

## Scene Definition

- Scene: `scene.sce-ide-companion`
- Focus: engine-owned read model for IDE `Delivery` column and CLI delivery inspection

## Ontology Coverage

- Entities: `delivery_projection`, `delivery_record`, `scene`, `spec`, `task`, `handoff_summary`, `release_summary`, `acceptance_summary`
- Relations:
  - `delivery_projection` aggregates delivery records
  - `delivery_record` back-links to scene/spec/task/event
  - `handoff/release/acceptance` may link to evidence files
- Business rules:
  - phase-1 is read-heavy
  - provisional ids must be explicit
  - no frontend-owned long-lived delivery truth
- Decision policies:
  - use one scene-scoped command surface
  - reuse existing engine and evidence sources
- Execution flow:
  - define envelope
  - define source mapping
  - define command surface

## Decision & Execution Path

1. Lock the envelope shape
2. Lock back-link schema
3. Map phase-1 sources
4. Publish command contract

## Closed-Loop Research Contract

- Any field without stable engine/evidence source must be marked provisional or excluded
- The command surface must stay cross-tool and JSON-first

## Acceptance & Gate

- IDE can render the new `Delivery` column from one payload
- CLI can inspect the same payload
- Scope back-links are explicit and non-fabricated
