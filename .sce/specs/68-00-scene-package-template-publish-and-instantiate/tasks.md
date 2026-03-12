# Implementation Plan: Scene Package Template Publish and Instantiate

## Tasks

- [x] 1 Add publish/instantiate command surface
  - Added `scene package-publish` and `scene package-instantiate` command registrations.
  - Added normalize/validate option pipelines for both command flows.

- [x] 2 Implement publish pipeline and template manifest emission
  - Added package contract + scene manifest loading, validation guard, template id resolution, and library output writes.
  - Added `template.manifest.json` generation with `sce.scene.template/v0.1` metadata.

- [x] 3 Implement instantiate pipeline with parameter resolution and render
  - Added template manifest loader, contract validation, required/default parameter resolution.
  - Added scene manifest placeholder rendering and target spec output writes.

- [x] 4 Extend tests for publish/instantiate lifecycle
  - Added option validation tests for publish/instantiate constraints.
  - Added publish/instantiate success tests and required-parameter failure test.

- [x] 5 Run regression and command smoke verification
  - Executed `npx jest tests/unit/commands/scene.test.js --runInBand`.
  - Executed command help + publish/instantiate smoke runs with JSON report capture.
  - Executed `npm test -- --runInBand`, `sce doctor --docs`, and `sce status`.
