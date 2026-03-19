# Scene Spec

## Scene Definition

- Scene: `scene.sce-ide-companion`
- Focus: canonical scaffold result for engineering project setup

## Ontology Coverage

- Entities: `scaffold_result`, `overwrite_policy`
- Relations:
  - `scaffold_result` reports `overwrite_policy`
- Business rules:
  - repeated runs report skipped work
- Decision policies:
  - scaffold stays phase-2
- Execution flow:
  - run scaffold and return counts

## Decision & Execution Path

1. Define the result
2. Define repeated-run reporting
3. Keep scaffold in phase-2

## Closed-Loop Research Contract

- Scaffold does not redefine preview or open/import
- Repeated-run output remains explicit

## Acceptance & Gate

- Scaffold returns one canonical result
- Repeated runs stay explicit
- Phase ordering remains intact
