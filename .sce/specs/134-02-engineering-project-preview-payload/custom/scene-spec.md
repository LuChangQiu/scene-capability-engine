# Scene Spec

## Scene Definition

- Scene: `scene.sce-ide-companion`
- Focus: canonical engineering project preview payload

## Ontology Coverage

- Entities: `engineering_preview`, `readiness_reason`
- Relations:
  - `engineering_preview` carries `readiness_reason`
- Business rules:
  - no local readiness synthesis
- Decision policies:
  - reuse the current preview path
- Execution flow:
  - request preview payload by app id

## Decision & Execution Path

1. Define the preview payload
2. Define the reason codes
3. Bind the payload to the preview path

## Closed-Loop Research Contract

- Preview state is read-only
- Step-by-step action state stays out of this spec

## Acceptance & Gate

- One preview path returns one canonical payload
- Reason codes are stable
- Preview remains read-only
