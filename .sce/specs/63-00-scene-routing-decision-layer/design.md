# Design Document: Scene Routing Decision Layer

## Overview

`scene route` acts as a lightweight decision layer between scene discovery and execution. It reuses the catalog
pipeline, scores candidates with deterministic heuristics, and outputs a selected route plus executable commands.

## Command Surface

- `sce scene route`
- Options:
  - `--spec <spec-name>`
  - `--spec-manifest <relative-path>`
  - `--scene-ref <scene-ref>`
  - `--domain <domain>`
  - `--kind <kind>`
  - `--query <query>`
  - `--mode <mode>`
  - `--include-invalid`
  - `--require-unique`
  - `--out <path>`
  - `--json`

## Resolution Flow

1. Normalize and validate route options.
2. Build candidate catalog via existing `buildSceneCatalog` flow.
3. Score each candidate (validity + scene_ref match + query token match + mode/risk bias).
4. Select top candidate, detect tie in strict mode, and build recommended commands.
5. Print summary or JSON and optionally export route payload to file.

## Output Model

- `query` selectors and routing flags
- `catalog_summary`
- `summary` (candidates scored, selected scene_ref, tie status)
- `selected` candidate with `commands`
- `alternatives` candidate list

## Validation and Safety

- Require at least one selector (`spec/scene_ref/domain/kind/query`).
- Reuse run mode validation (`dry_run|commit`).
- Use catalog validation constraints for spec/paths/domain/kind/out.

## Testing

- Unit tests:
  - route option validation
  - exact scene_ref route selection and command generation
  - strict tie failure behavior
- Keep existing scene command suite green.
