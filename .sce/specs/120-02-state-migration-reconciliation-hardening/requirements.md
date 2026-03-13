# Requirements

## Goal

在新增迁移范围之前，先把当前 `sce state` 已支持的文件到 SQLite 索引迁移面做成稳态能力，确保诊断、修复、发布前对账和运行时读偏好都可控。

## Requirements

1. The system SHALL provide reliable consistency diagnostics for every currently migratable component.
2. The reconcile flow SHALL provide an idempotent repair path for `pending-sync` and other recoverable drift states.
3. The project SHALL define blocking and alerting rules for `sqlite-ahead`, `sqlite-only`, and unresolved drift before release.
4. Runtime read paths SHALL disclose effective read source and consistency status when SQLite-backed indexes are preferred.
5. Operator documentation SHALL explain when to run `plan`, `doctor`, `migrate`, `reconcile`, and how to interpret results.
6. The project SHALL not expand the migration surface until the existing component set meets the hardened reconciliation baseline.

## Current Component Scope

- `collab.agent-registry`
- `runtime.timeline-index`
- `runtime.scene-session-index`
- `errorbook.entry-index`
- `errorbook.incident-index`
- `governance.spec-scene-overrides`
- `governance.scene-index`
- `release.evidence-runs-index`
- `release.gate-history-index`
