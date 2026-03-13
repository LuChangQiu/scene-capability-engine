# Tasks

- [x] 1. Inventory current SCE state resources and group them by storage behavior
  - **Requirement**: 1, 2, 3
  - **Design**: Tier Model, Decision Rubric
  - **Validation**: The inventory covers current registries, JSON indexes, JSONL streams, and personal workspace state

- [x] 2. Publish the canonical storage tiering policy and initial classification
  - **Requirement**: 1, 3, 4, 5
  - **Design**: Proposed Deliverables
  - **Validation**: The project documents which resources stay file-first and which remain in SQLite scope

- [x] 3. Add a machine-readable admission checklist for future SQLite candidates
  - **Requirement**: 2, 6
  - **Design**: Proposed Deliverables
  - **Validation**: New candidate resources can be evaluated against explicit criteria before implementation

- [x] 4. Document explicit anti-cases and escalation rules
  - **Requirement**: 4, 6
  - **Design**: Decision Rubric
  - **Validation**: Raw audit/evidence streams and workspace state are protected from accidental source migration
