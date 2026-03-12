# Requirements Document: Scene Doctor Command

## Introduction

The runtime and scaffold capabilities need a lightweight diagnostic entry that can be executed before run/commit.
This spec adds `scene doctor` for policy, plan, and adapter-readiness diagnostics.

## Requirements

### Requirement 1: Scene Doctor Entry
- Provide `sce scene doctor` command.
- Support source selection via `--spec` or `--manifest`.
- Support evaluation mode via `--mode dry_run|commit`.

### Requirement 2: Context-Aware Policy Diagnosis
- Support context injection from `--context-file` and runtime flags (`--approved`, safety flags, etc.).
- Evaluate policy gates against scene domain/risk and selected mode.

### Requirement 3: Plan and Adapter Diagnostics
- Compile Plan IR as part of diagnostic flow and report plan validity.
- Optionally run adapter readiness checks for robot/hybrid scenes using `--check-adapter`.

### Requirement 4: Actionable Output and Exit Semantics
- Return structured report with health status, blockers, and key metadata.
- Support machine-readable `--json` output.
- Return non-zero exit semantics when scene is blocked.

### Requirement 5: Regression Coverage
- Extend command unit tests for healthy and blocked doctor scenarios.
- Keep existing scene runtime and command tests green.
