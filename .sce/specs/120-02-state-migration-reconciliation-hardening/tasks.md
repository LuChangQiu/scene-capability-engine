# Tasks

- [x] 1. Audit the current migratable component set and define target baseline states
  - **Requirement**: 1, 3, 6
  - **Design**: Hardening Strategy, Baseline Policy
  - **Validation**: Every existing component has explicit expected consistency behavior
  - Published baseline evidence in `reports/hardening-baseline-2026-03-12.md`, including steady-state expectations for `synced`, `missing-source`, `sqlite-only`, and `sqlite-ahead`.

- [x] 2. Tighten doctor and reconcile diagnostics for runtime and registry indexes
  - **Requirement**: 1, 2, 4
  - **Design**: Hardening Strategy
  - **Validation**: Operators can distinguish recoverable drift from release-blocking anomalies
  - Hardened `state doctor` severity model, added runtime `read_source` diagnostics, and covered drift edge cases in unit tests.

- [x] 3. Update release/state gates with hardened blocking and alert rules
  - **Requirement**: 2, 3, 6
  - **Design**: Baseline Policy
  - **Validation**: Release flow prevents silent drift accumulation and rejects `sqlite-ahead`
  - Updated gate/docs posture and validated repo-specific repair flow with `sce state reconcile --all --apply` and `npm run gate:state-migration-reconciliation`.

- [x] 4. Publish operator runbooks and examples for reconcile workflows
  - **Requirement**: 5
  - **Design**: Proposed Deliverables
  - **Validation**: Normal project maintenance includes an understandable state repair path
  - Published `docs/state-migration-reconciliation-runbook.md` and refreshed command reference guidance.
