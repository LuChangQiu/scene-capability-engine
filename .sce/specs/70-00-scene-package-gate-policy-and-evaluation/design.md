# Design Document: Scene Package Gate Policy and Evaluation

## Overview

Add two commands to govern template quality lifecycle:

1. `scene package-gate-template`
   - Emits policy profile JSON (`baseline` or `three-layer`).
2. `scene package-gate`
   - Evaluates registry payload against policy rules and emits diagnostics.

## Command Surface

- `sce scene package-gate-template`
  - `--out <path>`
  - `--profile <baseline|three-layer>`
  - `--force`
  - `--json`

- `sce scene package-gate`
  - `--registry <path>` (required)
  - `--policy <path>`
  - `--out <path>`
  - `--strict`
  - `--json`

## Policy Model

```json
{
  "apiVersion": "sce.scene.package-gate/v0.1",
  "profile": "three-layer",
  "rules": {
    "max_invalid_templates": 0,
    "min_valid_templates": 3,
    "required_layers": ["l1-capability", "l2-domain", "l3-instance"],
    "forbid_unknown_layer": true
  }
}
```

### Baseline Profile
- Allows progressive adoption.
- Requires at least one valid template.
- No mandatory layer coverage.

### Three-Layer Profile
- Enforces platform/domain/instance full coverage.
- Requires all three layers and unknown-layer prohibition.

## Evaluation Model

Gate checks include:
- `max-invalid-templates`
- `min-valid-templates`
- `required-layer:<layer>` for each configured layer
- `unknown-layer-forbidden` when enabled

Output payload includes:
- `summary`: pass/fail + check counters
- `metrics`: template and layer counts
- `checks`: per-rule diagnostics with expected/actual values

## Test Strategy
- Validate option guards for gate template and gate evaluation.
- Verify three-layer template generation.
- Verify pass/fail gate paths and strict-mode non-zero behavior.
