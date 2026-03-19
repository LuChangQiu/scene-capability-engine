# Scene Spec

## Scene Definition

- Scene: `scene.sce-ide-companion`
- Focus: engineering project preview plus open/import action envelope

## Ontology Coverage

- Entities: `app`, `engineering_project`, `workspace`, `preview`, `open_result`, `step_result`
- Relations:
  - `app` resolves to `engineering_project`
  - `engineering_project` resolves to `workspace`
  - `open_result` aggregates step results and final preview
- Business rules:
  - preview/open contract is engine-owned
  - scaffold and ownership remain outside this spec
- Decision policies:
  - reuse existing engineering commands
  - expose canonical reason codes
- Execution flow:
  - preview
  - open/import envelope
  - later scaffold/ownership extension

## Decision & Execution Path

1. Lock preview contract
2. Lock reason-code set
3. Lock open/import result envelope
4. Map to current `app engineering` flows

## Closed-Loop Research Contract

- The preview must stay canonical and not depend on frontend field synthesis
- The open/import result must describe steps explicitly rather than relying on caller-side command reconstruction

## Acceptance & Gate

- IDE and CLI can render the same preview and result envelopes
- Scaffold semantics are still deferred cleanly
