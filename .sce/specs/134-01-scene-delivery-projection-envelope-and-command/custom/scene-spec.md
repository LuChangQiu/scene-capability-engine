# Scene Spec

## Scene Definition

- Scene: `scene.sce-ide-companion`
- Focus: canonical delivery payload and command for the IDE `Delivery` column

## Ontology Coverage

- Entities: `delivery_projection`, `delivery_query`
- Relations:
  - `delivery_query` returns `delivery_projection`
- Business rules:
  - no adapter-owned delivery truth
- Decision policies:
  - one JSON command returns one payload
- Execution flow:
  - request delivery projection from scene scope

## Decision & Execution Path

1. Define the payload
2. Define the scope links
3. Define the command

## Closed-Loop Research Contract

- Any field without a stable source stays provisional or absent
- The command remains scene-scoped

## Acceptance & Gate

- One command returns one delivery payload
- Scope links are explicit
- The payload stays read-only
