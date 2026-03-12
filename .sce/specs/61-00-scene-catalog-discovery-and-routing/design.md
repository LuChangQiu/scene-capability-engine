# Design Document: Scene Catalog Discovery and Routing

## Overview

Add a discovery-oriented command to scene CLI so users can inspect available scene contracts before execution.
The command builds a catalog by reusing existing manifest discovery rules and scene manifest validation.

## Command Surface

- `sce scene catalog`
- Options:
  - `--spec <spec-name>`
  - `--spec-manifest <relative-path>` (default `custom/scene.yaml`)
  - `--domain <domain>`
  - `--kind <kind>`
  - `--include-invalid`
  - `--out <path>`
  - `--json`

## Core Flow

1. Normalize and validate catalog options.
2. Resolve spec targets (single spec or all spec directories).
3. For each spec, discover manifest path using existing discovery helper.
4. Parse and validate manifest with `SceneLoader`.
5. Build catalog entries and apply filters.
6. Produce summary counters and optional JSON file output.
7. Print JSON or human-readable catalog summary.

## Data Model

### Catalog Payload
- `generated_at`
- `filters`
- `summary`
- `entries[]`

### Entry Fields
- `spec`
- `manifest_path`
- `valid`
- `errors[]`
- `kind`
- `api_version`
- `scene_ref`
- `scene_version`
- `title`
- `domain`
- `risk_level`
- `binding_count`

## Validation and Safety

- Keep `--spec-manifest` relative-path only.
- Fail fast when target spec does not exist.
- Keep invalid manifests non-blocking unless explicitly requested (`--include-invalid`).

## Testing Strategy

- Extend `tests/unit/commands/scene.test.js` for:
  - catalog option validation
  - filtered catalog build + export
  - include-invalid behavior
- Run scene command unit suite and syntax check.
