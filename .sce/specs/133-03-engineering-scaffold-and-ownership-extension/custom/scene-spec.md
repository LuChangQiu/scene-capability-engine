# Scene Spec

## Scene Definition

- Scene: `scene.sce-ide-companion`
- Focus: later-phase scaffold result and ownership extension semantics

## Ontology Coverage

- Entities: `workspace`, `scaffold_result`, `ownership_relation`, `app`, `user`, `device`
- Relations:
  - `scaffold_result` targets `workspace`
  - `ownership_relation` links `app/workspace/user/device`
- Business rules:
  - scaffold must be idempotent
  - ownership stays engine-owned
  - this spec does not block phase-1 preview/delivery rollout
- Decision policies:
  - implement after preview/open is stable
  - keep UI-neutral semantics only
- Execution flow:
  - define scaffold result
  - define ownership relation extension point

## Decision & Execution Path

1. Lock scaffold result contract
2. Lock ownership relation extension
3. Preserve non-blocking rollout order

## Closed-Loop Research Contract

- Do not push ownership truth into frontend-local registries
- Do not widen this spec into preview/open behavior

## Acceptance & Gate

- Scaffold semantics are explicit and idempotent
- Ownership extension point is canonical and adapter-neutral
- The spec remains a later child spec, not a phase-1 blocker
