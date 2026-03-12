# Design Document: Scene Runtime CLI Integration

## Overview

Add a new command module `lib/commands/scene.js` and register it in the main CLI bootstrap.
The command acts as a thin orchestration layer over runtime pilot components from `lib/scene-runtime`.

## Command Surface

- Command: `sce scene run`
- Core options:
  - `--spec` or `--manifest`
  - `--mode dry_run|commit`
  - `--context-file`
  - `--approved`, `--dual-approved`, `--allow-hybrid-commit`
  - `--safety-preflight`, `--safety-stop-channel`
  - `--plan-out`, `--result-out`, `--json`

## Runtime Flow

1. Normalize and validate CLI options.
2. Load scene manifest from spec or direct file path.
3. Build runtime context from file + flag overrides.
4. Execute `RuntimeExecutor.execute(sceneManifest, { runMode, traceId, context })`.
5. Optionally persist plan/result artifacts.
6. Print human-readable summary or JSON payload.
7. Set non-zero exit code when run is denied/failed or input is invalid.

## Testing Strategy

- Add unit tests for option validation and context merging.
- Add command-level tests for successful run path, output persistence, and denied run guardrails.
- Keep existing runtime pilot tests as regression coverage.
