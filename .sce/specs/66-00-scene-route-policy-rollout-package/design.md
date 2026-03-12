# Design Document: Scene Route Policy Rollout Package

## Overview

Create a release-oriented layer on top of route policy suggestion. The rollout command transforms a suggestion payload
into an auditable package with explicit artifacts for forward apply and rollback.

## Command Surface

- `sce scene route-policy-rollout`
- Options:
  - `--suggestion <path>` (required)
  - `--target-policy <path>` (default `.sce/config/scene-route-policy.json`)
  - `--name <rollout-name>`
  - `--out-dir <path>` (default `.sce/releases/scene-route-policy`)
  - `--force`
  - `--json`

## Artifact Layout

For each rollout package:

- `route-policy.next.json`: candidate policy
- `route-policy.rollback.json`: baseline policy
- `rollout-plan.json`: summary payload with diff, commands, and references
- `runbook.md`: operator-oriented verification/apply/rollback guide

## Flow

1. Validate rollout options.
2. Load and validate suggestion payload (`baseline.policy` + `suggested_policy`).
3. Normalize policies and compute structured field-level diff.
4. Resolve rollout name and output directory.
5. Write rollout artifact set.
6. Print summary and optionally JSON payload.

## Diff Model

Tracked paths:
- `weights.*`
- `mode_bias.commit.*`
- `max_alternatives`

Each change record contains: `path`, `from`, `to`, `delta`.

## Test Strategy

- Validation test for rollout option guards.
- Command tests for successful package generation and invalid payload failure.
- Keep focused and full regression suites passing.
