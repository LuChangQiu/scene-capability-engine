# Scene Spec

## Scene Definition

- Scene: `scene.sce-ide-companion`
- Focus: canonical engineering open/import result envelope

## Ontology Coverage

- Entities: `open_result`, `step_result`
- Relations:
  - `open_result` carries ordered `step_result`
- Business rules:
  - non-applicable work reports `skipped`
- Decision policies:
  - reuse the current action paths
- Execution flow:
  - run action path and return ordered result

## Decision & Execution Path

1. Define the result envelope
2. Define the ordered steps
3. Bind the envelope to the action paths

## Closed-Loop Research Contract

- Preview readiness is reused, not redefined
- Step order stays explicit

## Acceptance & Gate

- Open and import return one canonical result envelope
- Steps stay ordered
- The envelope depends on `134-02`
