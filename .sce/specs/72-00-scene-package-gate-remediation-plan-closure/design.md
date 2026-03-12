# Design Document: Scene Package Gate Remediation Plan Closure

## Overview

Add a remediation synthesis layer on top of gate evaluation so every failed policy check can be translated
into concrete next actions. The result is a tighter control loop:

1. Evaluate registry against policy.
2. Emit failed checks.
3. Emit remediation actions with operational command hints.
4. Feed remediation into task sync, operator review, or automation pipelines.

## Remediation Model

```json
{
  "remediation": {
    "action_count": 3,
    "actions": [
      {
        "id": "increase-valid-templates",
        "priority": "high",
        "title": "Increase valid template count by at least 2",
        "recommendation": "Promote additional template packages via package-publish until gate threshold is met.",
        "command_hint": "sce scene package-registry --template-dir .sce/templates/scene-packages --json"
      }
    ]
  }
}
```

## Mapping Strategy

- `required-layer:<layer>`
  - Action: `cover-<layer>`
  - Recommendation: publish package aligned to layer kind.
- `min-valid-templates`
  - Action: `increase-valid-templates`
  - Recommendation: add valid templates until threshold is satisfied.
- `max-invalid-templates`
  - Action: `reduce-invalid-templates`
  - Recommendation: repair/deprecate invalid templates and rerun strict registry.
- `unknown-layer-forbidden`
  - Action: `remove-unknown-layer-templates`
  - Recommendation: normalize package kinds and republish.
- Fallback checks
  - Action: `resolve-<sanitized-check-id>` for forward compatibility.

## UX and Output Integration

- JSON mode includes remediation in payload for machine consumption.
- Human-readable summary prints remediation action count and top 3 actions.
- Existing failed check rendering remains unchanged for diagnostics continuity.

## Test Strategy

- Assert pass path emits `remediation.action_count = 0` with empty actions.
- Assert fail path emits deterministic remediation IDs for known failures.
- Assert task draft/sync flow still works and includes remediation payload.
