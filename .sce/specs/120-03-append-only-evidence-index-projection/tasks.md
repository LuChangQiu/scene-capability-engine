# Tasks

- [x] 1. Identify candidate append-only streams and score them for projection value
  - **Requirement**: 1, 5, 6
  - **Design**: Pilot Selection Rules
  - **Validation**: The project chooses at most one or two streams for the first pilot
  - Selected `.sce/reports/interactive-approval-events.jsonl` as the first pilot and documented backlog candidates in `reports/interactive-approval-projection-pilot-2026-03-12.md`.

- [x] 2. Define the canonical projection contract and rebuild semantics
  - **Requirement**: 2, 3, 4
  - **Design**: Projection Model
  - **Validation**: Projection data can be deleted and rebuilt from source files without data loss
  - Added a rebuildable projection contract backed by `interactive_approval_event_projection` while keeping raw JSONL canonical.

- [x] 3. Implement a pilot projection with explicit read-source diagnostics
  - **Requirement**: 2, 4, 5
  - **Design**: Proposed Deliverables
  - **Validation**: Operators can compare raw file scans and projection-backed queries
  - Implemented `rebuild`, `doctor`, and `query` flows with `read_source=file|projection` disclosure plus unit coverage.

- [x] 4. Publish audit and release guidance for the pilot
  - **Requirement**: 1, 6
  - **Design**: Proposed Deliverables
  - **Validation**: Release evidence portability and manual audit workflows remain intact
  - Added npm audit/report scripts and refreshed `docs/command-reference.md` and `docs/state-storage-tiering.md`.
