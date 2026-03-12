# Design Document: Scene Doctor Command

## Overview

`scene doctor` is implemented in `lib/commands/scene.js` as a pre-execution diagnostic pipeline:
1) load and validate manifest,
2) build runtime context,
3) compile plan,
4) evaluate policy,
5) optional adapter readiness check,
6) aggregate blockers into a final report.

## Command Surface

- `sce scene doctor`
- Inputs:
  - scene source (`--spec`/`--manifest`)
  - mode (`--mode`)
  - context injection flags + `--context-file`
  - `--check-adapter`
- Output:
  - text summary or `--json`

## Diagnostic Model

- `status`: `healthy` or `blocked`
- `plan`: validity, node_count, error
- `policy`: allow/deny with reasons
- `adapter_readiness`: optional readiness report
- `blockers`: merged list of policy/plan/adapter blockers

## Guardrails

- Invalid source or mode returns command error.
- Blocked report sets non-zero exit code for CI/operator automation.
