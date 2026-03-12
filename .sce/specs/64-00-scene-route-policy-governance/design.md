# Design Document: Scene Route Policy Governance

## Overview

Introduce a configurable route policy layer so scene routing can be tuned per environment or domain without changing
source code. The route command keeps deterministic behavior while using policy weights and profile templates.

## Command Surface

### Route command extension
- `sce scene route --route-policy <path>`

### New template command
- `sce scene route-policy-template`
- Options:
  - `--out <path>`
  - `--profile <profile>` (`default|erp|hybrid|robot`)
  - `--force`
  - `--json`

## Policy Model

```json
{
  "weights": {
    "valid_manifest": 5,
    "invalid_manifest": -10,
    "scene_ref_exact": 100,
    "scene_ref_contains": 45,
    "scene_ref_mismatch": -20,
    "query_token_match": 8
  },
  "mode_bias": {
    "commit": {
      "low": 2,
      "medium": 0,
      "high": -5,
      "critical": -5
    }
  },
  "max_alternatives": 4
}
```

## Flow

1. Normalize/validate route options.
2. Load default route policy and merge external overrides when provided.
3. Build route candidates from scene catalog.
4. Score/rank candidates using effective policy.
5. Emit selected target, alternatives, and executable command suggestions.
6. Export policy metadata with route payload.

## Test Strategy

- Validation tests:
  - route option policy path guard
  - route policy template option validation
- Command tests:
  - route policy template generation
  - route command with custom policy override
- Keep existing route selection and tie behavior coverage.
