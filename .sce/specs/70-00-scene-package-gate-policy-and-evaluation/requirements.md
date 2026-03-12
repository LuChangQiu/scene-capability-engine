# Requirements Document: Scene Package Gate Policy and Evaluation

## Introduction

Template registry visibility is available in Spec 69. To close governance automation, SCE now needs a quality gate layer
that can express policy constraints and evaluate registry payloads in CI-friendly mode.

## Requirements

### Requirement 1: Gate Policy Template Command
- Add `scene package-gate-template` command to generate quality gate policy JSON.
- Command should support baseline and three-layer policy profiles.
- Command should support overwrite guard and JSON output mode.

### Requirement 2: Gate Evaluation Command
- Add `scene package-gate` command to evaluate registry payload against gate policy.
- Command should support registry input from file and policy input from file.
- Command should output evaluation payload including checks, metrics, and pass/fail summary.

### Requirement 3: Policy Rules and Layer Constraints
- Policy model should support max invalid template count threshold.
- Policy model should support minimum valid template count threshold.
- Policy model should support required layer coverage and unknown-layer prohibition.

### Requirement 4: Strict CI Gate Behavior
- Add `--strict` mode to return non-zero exit code when gate fails.
- Gate should still emit diagnostics payload even when strict mode fails.
- Gate output should be machine-consumable for pipeline automation.

### Requirement 5: Regression and Traceability
- Extend scene command unit tests for gate template and gate evaluation flows.
- Keep scene command tests and full test suite passing.
- Store gate smoke outputs under spec report artifacts for replay and audit.
