# State Migration Hardening Baseline

Date: 2026-03-12

## Scope Baseline

Current migratable component scope remains limited to:

- `collab.agent-registry`
- `runtime.timeline-index`
- `runtime.scene-session-index`
- `errorbook.entry-index`
- `errorbook.incident-index`
- `governance.spec-scene-overrides`
- `governance.scene-index`
- `release.evidence-runs-index`
- `release.gate-history-index`

Expected steady-state policy after hardening:

| Component | Expected source posture | Expected drift posture |
| --- | --- | --- |
| `governance.spec-scene-overrides` | file source present when scene bindings exist | `synced` after `sce state reconcile --all --apply` |
| other current-scope components | source may be legitimately absent in repos not using that feature | `missing-source` is advisory, not a release blocker by itself |

Release-blocking anomalies are now explicitly:

- `sqlite-unavailable`
- `source-parse-error`
- `sqlite-ahead`
- `sqlite-only`
- runtime `sqlite-ahead`
- runtime `sqlite-only`

Repairable alerts are now explicitly:

- `pending-migration`
- `missing-source`
- runtime `pending-sync`

## Evidence

Validation commands run on 2026-03-12:

- `node bin/sce.js state doctor --json`
- `node bin/sce.js state reconcile --all --apply --json`
- `node bin/sce.js state doctor --json`
- `npm run gate:state-migration-reconciliation`
- `npx jest tests/unit/state/state-migration-manager.test.js tests/unit/runtime/session-store.test.js tests/unit/workspace/takeover-baseline.test.js tests/integration/takeover-baseline-cli.integration.test.js --runInBand`

Observed repo-specific baseline:

- Before reconcile:
  - `pending_components=1`
  - `total_record_drift=36`
  - only pending component: `governance.spec-scene-overrides`
- After reconcile:
  - `pending_components=0`
  - `total_record_drift=0`
  - `governance.spec-scene-overrides` reached `synced`
- Remaining alerts are all `missing-source` for components whose canonical file artifacts do not currently exist in this repo snapshot.

Runtime diagnostics now disclose effective read source:

- scene/session index exposes `read_preference` and `read_source`
- doctor output includes runtime `read_source` for `timeline` and `scene_session`

Targeted regression coverage confirms blocking behavior for:

- `sqlite-only`
- `sqlite-ahead`
- runtime timeline `sqlite-ahead`
- sqlite-backed scene index fallback with `read_source=sqlite`

## Operator Guidance Delivered

Published operator guidance:

- `docs/state-migration-reconciliation-runbook.md`
- `docs/command-reference.md`

Operational entry points:

- `sce state plan`
- `sce state doctor`
- `sce state migrate`
- `sce state reconcile`
- `npm run gate:state-migration-reconciliation`

## Follow-up Backlog

- Add repo fixtures that exercise more of the current migration surface than `governance.spec-scene-overrides`.
- Consider a stricter profile for CI that fails on selected `missing-source` components only when the feature is expected for that workspace.
- Add one end-to-end integration test that runs `doctor -> reconcile -> gate` against a seeded multi-component workspace.
