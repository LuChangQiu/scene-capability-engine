# State Storage Tiering

SCE uses a selective SQLite strategy.

The operating rule is:

- keep canonical evidence, audit, recovery payloads, and low-cardinality personal state in files
- use SQLite for registry/index workloads with real query pressure
- allow SQLite projections for append-only streams only when they are rebuildable from files

## Tiers

### `file-source`

Use this tier when:

- the file is the canonical evidence or audit artifact
- the resource is a small personal or local configuration object
- manual inspection, Git diff, and recovery are more important than indexed querying

Examples:

- `~/.sce/workspace-state.json`
- `.sce/reports/**/*.jsonl`
- `.sce/audit/**/*.jsonl`
- `.sce/timeline/snapshots/**`
- `.sce/session-governance/sessions/**`

### `sqlite-index`

Use this tier when:

- the canonical content still lives in files
- the resource behaves like a registry or index
- repeated filtering, sorting, and cross-run queries justify an index

Current active scope:

- `collab.agent-registry` -> `.sce/config/agent-registry.json`
- `runtime.timeline-index` -> `.sce/timeline/index.json`
- `runtime.scene-session-index` -> `.sce/session-governance/scene-index.json`
- `errorbook.entry-index` -> `.sce/errorbook/index.json`
- `errorbook.incident-index` -> `.sce/errorbook/staging/index.json`
- `governance.spec-scene-overrides` -> `.sce/spec-governance/spec-scene-overrides.json`
- `governance.scene-index` -> `.sce/spec-governance/scene-index.json`
- `release.evidence-runs-index` -> `.sce/reports/release-evidence/handoff-runs.json`
- `release.gate-history-index` -> `.sce/reports/release-evidence/release-gate-history.json`

### `derived-sqlite-projection`

Use this tier only when:

- the source remains append-only files
- the projection can be deleted and rebuilt
- reads clearly disclose when SQLite projection is used

This tier is for query acceleration, not source-of-truth replacement.

## Admission Rubric

A resource should only enter SQLite scope when all of the following are true:

1. Cross-run or cross-session query pressure is real.
2. File scans are materially weaker than indexed filtering/sorting.
3. SQLite rows are rebuildable from a canonical file or stream.
4. Diagnostics, reconcile behavior, and operator guidance are defined up front.

Reject SQLite source migration when any of the following are true:

1. The resource is raw audit or evidence.
2. The resource is low-cardinality workspace or preference state.
3. Human-readable recovery and Git diff matter more than query speed.
4. The change would silently cut over the source of truth.

## Current Classification

| Resource | Tier | Why |
| --- | --- | --- |
| `~/.sce/workspace-state.json` | `file-source` | Atomic personal state; no meaningful query pressure |
| `.sce/reports/**/*.jsonl` | `file-source` | Canonical append-only governance/evidence streams |
| `.sce/audit/**/*.jsonl` | `file-source` | Canonical audit evidence |
| `.sce/timeline/index.json` | `sqlite-index` | Index-like query workload |
| `.sce/session-governance/scene-index.json` | `sqlite-index` | Registry-like query workload |
| `.sce/errorbook/index.json` | `sqlite-index` | Filtered status/quality lookup |
| `.sce/errorbook/staging/index.json` | `sqlite-index` | Incident triage lookup |
| `.sce/spec-governance/*.json` indexes | `sqlite-index` | Governance registry lookup |
| `.sce/reports/release-evidence/handoff-runs.json` | `sqlite-index` | Historical release summary lookup |
| `.sce/reports/release-evidence/release-gate-history.json` | `sqlite-index` | Gate history lookup |
| `.sce/timeline/snapshots/**` | `file-source` | Recovery payloads |
| `.sce/session-governance/sessions/**` | `file-source` | Session payload archives |

## Operator Rules

- Do not propose blanket sqlite-ization.
- Before adding a new SQLite candidate, update `.sce/config/state-storage-policy.json`.
- Run `npm run audit:state-storage` after changing state storage behavior.
- If the resource is append-only evidence, prefer a projection pilot over source migration.

## Related Assets

- Policy file: `.sce/config/state-storage-policy.json`
- Audit command: `npm run audit:state-storage`
- Machine-readable report: `npm run report:state-storage`
- State migration commands: `sce state plan|doctor|migrate|reconcile`
