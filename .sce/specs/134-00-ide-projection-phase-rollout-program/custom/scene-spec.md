# Scene Spec

## Scene Definition

- Scene: `scene.sce-ide-companion`
- Focus: phaseable rollout plan for engine-owned IDE projection contracts

## Ontology Coverage

- Entities: `rollout_program`, `child_spec`, `phase`
- Relations:
  - `rollout_program` orders child specs
  - `child_spec` may depend on an earlier child spec
- Business rules:
  - each child spec owns one bounded contract
  - phase-2 must not block phase-1
- Decision policies:
  - lock phase-1 first
  - keep delivery and engineering concerns split by contract
- Execution flow:
  - define program
  - define child specs
  - verify strategy fit

## Decision & Execution Path

1. Freeze the rollout boundary
2. Freeze the child spec order
3. Verify the new child specs fit implementation work

## Closed-Loop Research Contract

- Every child spec must be narrow enough to avoid broad mixed onboarding scope
- Phase-2 concerns stay deferred until phase-1 contracts stabilize

## Acceptance & Gate

- The rollout plan names all active child specs
- Each child spec has one bounded contract
- The program records explicit dependencies
