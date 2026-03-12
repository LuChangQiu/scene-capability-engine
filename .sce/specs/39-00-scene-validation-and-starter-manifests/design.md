# Design Document: Scene Validation and Starter Manifests

## Overview

Extend `lib/commands/scene.js` with a `validate` subcommand.
Validation reuses `SceneLoader` parsing+schema checks and outputs a normalized summary.

## Command Surface

- Command: `sce scene validate`
- Options:
  - `--spec <spec-name>` or `--manifest <path>`
  - `--spec-manifest <relative-path>` (default `custom/scene.yaml`)
  - `--json`

## Execution Flow

1. Normalize source options.
2. Validate source exclusivity (`--spec` xor `--manifest`).
3. Load and validate manifest via `SceneLoader`.
4. Build summary fields:
   - scene_ref, scene_version, domain, risk_level
   - approval_required
   - binding_count and side_effect_binding_count
5. Print text summary or JSON.
6. Set `process.exitCode=1` on option or validation failure.

## Starter Assets

Two starter manifests are added in `custom/`:
- `scene-template-erp-query-v0.1.yaml`
- `scene-template-hybrid-shadow-v0.1.yaml`

Both are concrete valid samples so users can copy and adapt immediately.
