# Design Document: Scene Package Gate Remediation Runbook Output

## Overview

Introduce a runbook writer for `scene package-gate` so operators can execute remediation actions without
manual payload interpretation.

Flow:
1. Evaluate gate and build remediation actions.
2. Build runbook markdown from remediation payload.
3. Persist runbook through `--runbook-out`.
4. Return runbook metadata in JSON payload and summary output.

## Command Surface

`sce scene package-gate`
- `--runbook-out <path>`
  - Optional markdown output for remediation execution plan.

## Runbook Model

Top-level sections:
- Header and metadata
  - `generated_at`
  - `policy_profile`
  - `gate_status`
  - `remediation_actions`
- `Execution Plan`
  - Ordered remediation steps with:
    - action id + priority
    - title
    - recommendation
    - command hint
    - source check IDs

## Ordering Strategy

- Sort by existing priority weight mapping (critical/high first).
- Tie-break with action id lexical ordering for deterministic output.

## Payload Integration

When `--runbook-out` is provided:

```json
{
  "runbook": {
    "path": "<abs>",
    "output_path": "<relative>",
    "action_count": 3
  }
}
```

## Test Strategy

- Validate empty `runbookOut` fails option checks.
- Validate gate runtime includes runbook payload metadata.
- Validate runbook markdown includes title and command hint lines.
