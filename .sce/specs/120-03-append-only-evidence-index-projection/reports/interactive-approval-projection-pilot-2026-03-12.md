# Interactive Approval Projection Pilot

Date: 2026-03-12

## Pilot Selection

Candidate streams were scored against the spec rules:

| Stream | Query value | Field stability | Audit portability risk | Decision |
| --- | --- | --- | --- | --- |
| `.sce/reports/interactive-approval-events.jsonl` | high: workflow, actor, action, blocked-state queries | high | low | selected for first pilot |
| `.sce/reports/interactive-execution-ledger.jsonl` | medium-high | medium | low | backlog |
| `.sce/audit/operations.jsonl` | medium | medium | medium | backlog |

Why `interactive-approval-events.jsonl` was selected first:

- approval workflows already need filters on `workflow_id`, `actor`, `action`, and `blocked`
- the event schema is narrow and stable
- the raw JSONL file must remain portable release evidence

## Projection Contract

Canonical source remains the JSONL file:

- `.sce/reports/interactive-approval-events.jsonl`

SQLite projection is rebuildable and disposable:

- table: `interactive_approval_event_projection`
- rebuild command clears projection rows for the audit file and re-indexes from raw JSONL
- query path discloses `read_source=file|projection`

Indexed projection fields:

- `event_id`
- `workflow_id`
- `event_timestamp`
- `event_type`
- `action`
- `actor`
- `actor_role`
- `from_status`
- `to_status`
- `blocked`
- `reason`
- `audit_file`
- `line_no`
- `raw_json`
- `source`
- `indexed_at`

## Evidence

Validation commands run on 2026-03-12:

- `node scripts/interactive-approval-event-projection.js --action rebuild --json`
- `node scripts/interactive-approval-event-projection.js --action doctor --fail-on-drift --fail-on-parse-error --json`
- `npm run audit:interactive-approval-projection`
- `npx jest tests/unit/scripts/interactive-approval-event-projection.test.js --runInBand`

Observed workspace result:

- current repo has no populated `interactive-approval-events.jsonl`
- pilot doctor therefore reports `status=empty`
- projection rebuild is safe and idempotent even with zero events

Behavior covered by unit tests:

- rebuild aligns source and projection counts
- query falls back to `file` when projection is missing
- query uses `projection` when projection rows exist
- doctor blocks `projection-ahead`

## Audit and Release Guidance

Published operator guidance:

- `docs/command-reference.md`
- `docs/state-storage-tiering.md`

Audit posture:

- raw JSONL remains the canonical audit artifact
- SQLite is only a derived read model
- operators can delete projection rows and rebuild from source files without data loss

## Follow-up Backlog

- Add a second pilot only after real query pressure is demonstrated for `interactive-execution-ledger.jsonl` or `operations.jsonl`.
- Consider a shared projection helper once at least two append-only streams need the same rebuild/doctor/query contract.
- Add a fixture-backed integration test with a non-empty repo-level approval event stream.
