# Tasks

- [x] 1. Define the selective SQLite program scope and anti-goals
  - **Requirement**: 1, 2
  - **Design**: Program Principles
  - **Validation**: Program charter clearly rejects blanket sqlite-ization
  - Program requirements and design explicitly keep file-first truth and reject silent source cutover.

- [x] 2. Deliver the canonical storage tiering and admission policy
  - **Requirement**: 4, 5
  - **Design**: `120-01-state-storage-tiering-policy`
  - **Validation**: Current SCE resources are classified into stable tiers with explicit rationale
  - Delivered through `docs/state-storage-tiering.md`, `.sce/config/state-storage-policy.json`, and `npm run audit:state-storage`.

- [x] 3. Harden the current file-to-sqlite migration surface
  - **Requirement**: 3, 5
  - **Design**: `120-02-state-migration-reconciliation-hardening`
  - **Validation**: Existing migratable components have stronger diagnostics, repair, and operator guidance
  - Delivered with stronger doctor/reconcile severity rules, runtime read-source disclosure, and operator runbook coverage.

- [x] 4. Pilot derived SQLite projections for append-only evidence streams
  - **Requirement**: 2, 5
  - **Design**: `120-03-append-only-evidence-index-projection`
  - **Validation**: Query improvements are delivered without replacing raw evidence files
  - Delivered via the interactive approval event projection pilot and associated audit/report scripts.

- [x] 5. Close the program with evidence and next-step backlog
  - **Requirement**: 6
  - **Design**: Acceptance Model
  - **Validation**: Each sub spec publishes evidence and a prioritized follow-up list
  - Closed out in `reports/program-closeout-2026-03-12.md` with linked sub-spec evidence and explicit backlog.
