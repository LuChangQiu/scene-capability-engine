# Implementation Plan: Scene Package Gate Task Draft and Sync

## Tasks

- [x] 1 Extend package-gate options for task workflow
  - Added `--task-out`, `--spec`, and `--sync-spec-tasks` options.
  - Added normalize/validate logic including sync-spec dependency checks.

- [x] 2 Implement gate task draft pipeline
  - Added failed-check to markdown task draft builder.
  - Added file output writer and payload linkage.

- [x] 3 Implement gate failed-check sync into spec tasks
  - Added failed-check to task line conversion with priority + metadata.
  - Added dedupe and task append pipeline for target spec `tasks.md`.

- [x] 4 Extend tests for gate task draft/sync behavior
  - Added validation coverage for sync-spec constraints.
  - Added runtime test verifying task draft and task sync payload.

- [x] 5 Run regression and capture reports
  - Executed `npx jest tests/unit/commands/scene.test.js --runInBand`.
  - Executed command smoke checks with draft and sync outputs.
  - Executed `npm test -- --runInBand`, `sce doctor --docs`, and `sce status`.

## Scene Package Gate Suggested Tasks (2026-02-09T10:05:08.142Z)

- [ ] 1 [medium] Resolve gate check 'min-valid-templates' (actual=1, expected=>= 3) [gate_source=scene-package-gate check_id=min-valid-templates policy_profile=three-layer]
- [ ] 2 [medium] Resolve gate check 'required-layer:l1-capability' (actual=0, expected=>= 1) [gate_source=scene-package-gate check_id=required-layer:l1-capability policy_profile=three-layer]
- [ ] 3 [medium] Resolve gate check 'required-layer:l3-instance' (actual=0, expected=>= 1) [gate_source=scene-package-gate check_id=required-layer:l3-instance policy_profile=three-layer]
