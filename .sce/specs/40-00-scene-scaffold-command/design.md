# Design Document: Scene Scaffold Command

## Overview

Extend `lib/commands/scene.js` with a `scaffold` subcommand that:
1) validates scaffold options,
2) loads template from built-in assets or custom file,
3) applies metadata overrides,
4) validates generated manifest,
5) writes or previews output.

## Command Surface

- Command: `sce scene scaffold`
- Required input: `--spec <spec-name>`
- Template source:
  - built-in via `--type erp|hybrid`
  - custom via `--template <path>`
- Output control:
  - `--output` (default `custom/scene.yaml`)
  - `--force`
  - `--dry-run`
- Metadata override:
  - `--obj-id`
  - `--title`
- Response shape:
  - text summary or `--json` payload

## Data Flow

- Built-in templates are resolved from `lib/scene-runtime/templates/`.
- Scaffold output is resolved to `.sce/specs/<spec>/<output>`.
- `SceneLoader.validateManifest` is reused to enforce schema compatibility.

## Guardrails

- Non-existent spec returns error.
- Existing output without `--force` returns error.
- Invalid generated manifest returns error and does not write.
