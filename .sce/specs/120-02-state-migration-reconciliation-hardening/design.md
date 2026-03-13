# Design

## Requirement Mapping

- R1-R3 -> consistency model, reconcile gate, release enforcement
- R4 -> runtime diagnostics exposure
- R5 -> operator runbook updates
- R6 -> migration admission freeze until baseline is green

## Hardening Strategy

1. Diagnose
   - 收紧 `sce state doctor` 输出
   - 对每个组件明确 `file_count`, `sqlite_count`, `sync_status`, `blocking`, `alert`
2. Repair
   - 强化 `sce state reconcile --all --apply`
   - 确保重复执行不会制造重复记录或扩大漂移
3. Enforce
   - 发布前 gate 默认不允许 `sqlite-ahead`
   - 对 `pending-sync` 与 `sqlite-only` 给出明确定级
4. Explain
   - 命令文档与发布文档补齐 operator 决策指南

## Baseline Policy

- `sqlite-ahead`
  - 默认视为异常，优先阻断发布
- `pending-sync`
  - 允许修复，不允许长期积累
- `sqlite-only`
  - 仅在 source 已明确迁除时可接受；当前 program 默认视为异常
- `sqlite-unavailable`
  - 应区分配置缺失与环境不可用，并给出可操作提示

## Proposed Deliverables

- stronger `sce state doctor` / `reconcile` output contract
- reconciliation gate policy update
- release/operator docs for state repair
- evidence report showing current component baseline after hardening
