# Design

## Overview

本 program 将 selective SQLite advancement 拆为三条并行可治理的能力线：

- `120-01-state-storage-tiering-policy`
  - 定义资源分层、准入规则、禁止迁移边界
- `120-02-state-migration-reconciliation-hardening`
  - 先把当前已经进入 SQLite 迁移面的组件做稳、做齐、做可运营
- `120-03-append-only-evidence-index-projection`
  - 只为高查询价值的 append-only 证据流建立派生索引，不改变原始文件主存储

## Program Principles

1. File-first truth
   - 原始证据、审计流、恢复载荷继续保留文件主存储
2. SQLite for query pressure
   - 只有跨运行聚合、过滤排序、关联查询有明显收益的资源才进入 SQLite
3. Rebuildable derived state
   - 任何由文件投影出来的 SQLite 内容都必须可重建、可导出、可对账
4. No silent cutover
   - 不允许在没有诊断、reconcile、operator 文档的前提下直接把读写切到 SQLite

## Dependency Order

1. `120-01` 先输出正式分层规则和现状分类
2. `120-02` 依据分类规则收紧当前迁移面的稳态治理
3. `120-03` 在前两项稳定后，选择少量 append-only 流做 projection pilot

## Acceptance Model

- Program 完成的最低标准：
  - 有正式的资源分层与准入规则
  - 当前 `sce state` 迁移面具备可运营的对账与修复路径
  - append-only 流的查询优化采用 projection 模式而不是 source replacement
  - 文档和发布流程能说明哪些资源应该进 SQLite，哪些不应该
