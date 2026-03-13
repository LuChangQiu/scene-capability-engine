# Requirements

## Goal

为 SCE 建立一套正式的 state storage tiering policy，明确哪些资源应保持文件主存储，哪些资源适合 SQLite 索引化，哪些资源只允许做派生投影。

## Requirements

1. The system SHALL define a canonical decision rubric for placing a resource into `file-source`, `sqlite-index`, or `derived-sqlite-projection`.
2. The rubric SHALL evaluate at least query pressure, cross-run aggregation value, file/sqlite drift risk, audit portability, and rebuildability.
3. The project SHALL classify current high-value state resources using the rubric and publish the classification with rationale.
4. The classification SHALL explicitly keep `~/.sce/workspace-state.json` and raw append-only audit/evidence streams out of broad source migration scope.
5. The policy SHALL identify the existing SQLite-backed registries and index domains that remain in active scope.
6. The project SHALL maintain an admission checklist for any future resource proposed for SQLite advancement.

## Initial Classification Targets

- Active SQLite/index scope:
  - `collab.agent-registry`
  - `runtime.timeline-index`
  - `runtime.scene-session-index`
  - `errorbook.entry-index`
  - `errorbook.incident-index`
  - `governance.spec-scene-overrides`
  - `governance.scene-index`
  - `release.evidence-runs-index`
  - `release.gate-history-index`
- Explicit non-candidates for source replacement:
  - `~/.sce/workspace-state.json`
  - `.sce/reports/**/*.jsonl`
  - `.sce/audit/**/*.jsonl`
  - timeline snapshot payload files and similar recovery-oriented artifacts
