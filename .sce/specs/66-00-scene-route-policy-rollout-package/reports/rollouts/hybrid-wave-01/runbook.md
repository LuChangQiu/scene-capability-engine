# Scene Route Policy Rollout Runbook

- Rollout: hybrid-wave-01
- Generated: 2026-02-09T08:11:56.939Z
- Suggestion Source: .sce/specs/66-00-scene-route-policy-rollout-package/reports/route-policy-suggest-input.json
- Target Policy: .sce/config/scene-route-policy.json
- Changed Fields: 5

## Verification Commands

1. sce scene route --query routing --mode dry_run --route-policy .sce/config/scene-route-policy.json
2. sce scene route --query routing --mode dry_run --route-policy .sce/specs/66-00-scene-route-policy-rollout-package/reports/rollouts/hybrid-wave-01/route-policy.next.json

## Apply and Rollback

- Apply: Replace .sce/config/scene-route-policy.json with .sce/specs/66-00-scene-route-policy-rollout-package/reports/rollouts/hybrid-wave-01/route-policy.next.json after verification.
- Rollback: Replace .sce/config/scene-route-policy.json with .sce/specs/66-00-scene-route-policy-rollout-package/reports/rollouts/hybrid-wave-01/route-policy.rollback.json if regression appears.

## Changed Fields

- weights.invalid_manifest: -9 -> -12 (delta=-3)
- weights.scene_ref_mismatch: -14 -> -19 (delta=-5)
- mode_bias.commit.medium: 0 -> -5 (delta=-5)
- mode_bias.commit.high: -4 -> -10 (delta=-6)
- mode_bias.commit.critical: -6 -> -12 (delta=-6)
