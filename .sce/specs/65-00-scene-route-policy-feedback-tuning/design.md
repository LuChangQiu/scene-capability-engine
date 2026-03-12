# Design Document: Scene Route Policy Feedback Tuning

## Overview

Introduce a policy tuning loop that consumes scene eval artifacts and recommends route policy changes. The command
focuses on stable heuristics: severe/unstable outcomes tighten commit risk handling, insufficient data expands
candidate exploration, and stable good outcomes improve precision.

## Command Surface

- `sce scene route-policy-suggest`
- Options:
  - `--eval <path...>`: explicit eval report files
  - `--eval-dir <path>`: discover eval report JSON files in a directory
  - `--route-policy <path>`: baseline policy override
  - `--profile <profile>`: baseline profile when route policy file is absent
  - `--max-adjustment <number>`: cap absolute adjustment per rule
  - `--out <path>`: write full suggestion payload
  - `--policy-out <path>`: write suggested policy only
  - `--json`

## Flow

1. Normalize and validate suggest options.
2. Resolve eval report sources from explicit paths and/or directory discovery.
3. Load eval reports and summarize signals:
   - grade distribution
   - run status distribution
   - profile distribution
   - recommendation keyword signals
4. Resolve baseline policy:
   - explicit policy file, or
   - profile template (`profile:auto:<dominant>` fallback from eval summary)
5. Apply bounded deltas to policy fields.
6. Emit payload with baseline, analysis, adjustments, and suggested policy.

## Heuristic Rules

- Stress signals (`critical|at_risk`, `failed|denied`) increase penalties for commit high/critical risk and mismatch.
- High insufficient-data rate increases query token weight and alternatives window.
- Stable good outcomes increase exact/contains weights and may tighten alternatives.
- Recommendation signals (`policy denial`, `runtime failure`) add focused penalties.

## Test Strategy

- Validation tests for suggest option constraints.
- Command tests for:
  - explicit eval + explicit route policy baseline
  - directory discovery + auto profile baseline
  - failure path when directory has no JSON reports
- Run focused scene command unit suite and project regression suite.
