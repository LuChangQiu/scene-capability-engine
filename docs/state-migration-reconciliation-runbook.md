# State Migration Reconciliation Runbook

Use this runbook when working with the current file-to-SQLite migration surface.

## Normal Flow

1. Inspect scope
   - `sce state plan --json`
2. Diagnose drift
   - `sce state doctor --json`
3. Apply repair
   - `sce state reconcile --all --apply --json`
4. Re-check gate posture
   - `node scripts/state-migration-reconciliation-gate.js --fail-on-blocking --fail-on-pending --json`

## Severity Model

### Blocking

Treat these as release-blocking anomalies:

- `sqlite-unavailable`
- `source-parse-error`
- `sqlite-ahead`
- `sqlite-only`
- runtime `sqlite-ahead`
- runtime `sqlite-only`

Typical meaning:

- `sqlite-ahead`: SQLite contains index rows that are no longer represented by canonical files
- `sqlite-only`: canonical file source disappeared but SQLite rows still exist

### Alert

Treat these as repairable but non-steady-state conditions:

- `pending-migration`
- `missing-source`
- runtime `pending-sync`

Typical meaning:

- `pending-migration`: file source has more records than SQLite index
- `missing-source`: the project does not currently have that source artifact

## Operator Decisions

### When `pending-migration`

- Run `sce state reconcile --all --apply --json`
- Re-run `sce state doctor --json`
- If it persists, inspect source parser assumptions and source file health

### When `sqlite-ahead`

- Treat as anomaly first, not optimization
- Inspect whether source artifacts were deleted, rotated, or never written
- Rebuild or re-sync from canonical file source before release

### When `sqlite-only`

- Confirm whether the file source was removed accidentally
- Restore canonical files when possible
- Do not normalize this into a permanent state for current migration-scope components

### When `missing-source`

- If the component is intentionally unused in the current project, keep it advisory
- If the component should exist for this workflow, generate or restore the source artifact and reconcile

## Related Commands

- `npm run gate:state-migration-reconciliation`
- `npm run audit:state-storage`
- `npm run report:interactive-approval-projection`
