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
