# Requirements

## Goal

为高查询价值的 append-only evidence/audit 流设计 SQLite projection 模式，在保留原始 JSONL 文件作为 canonical evidence 的前提下提升查询效率与治理可见性。

## Requirements

1. The system SHALL preserve append-only evidence and audit streams as the canonical source of truth.
2. The project SHALL only introduce SQLite support for these streams as a derived projection or index, never as direct source replacement.
3. Any derived SQLite projection SHALL be rebuildable from raw files and safe to discard and recreate.
4. Read paths and diagnostics SHALL disclose whether results come from raw file scans or derived SQLite projections.
5. The project SHALL define pilot selection criteria and limit initial rollout to one or two high-value streams.
6. The projection design SHALL not weaken release evidence portability or manual auditability.

## Candidate Pilot Scope

- Potential pilot candidates:
  - `.sce/reports/interactive-approval-events.jsonl`
  - `.sce/reports/interactive-execution-ledger.jsonl`
  - `.sce/audit/operations.jsonl`
- Explicit non-goal:
  - replacing these files with SQLite-only write paths
