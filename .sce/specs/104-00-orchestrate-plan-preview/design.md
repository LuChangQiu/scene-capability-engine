# 设计文档：Orchestrate Plan Preview

## 概述

新增 `orchestrate plan` 子命令，作为 `run` 的只读预演模式。

## 命令接口

```bash
sce orchestrate plan --specs "97-00,98-00,99-00"
sce orchestrate plan --specs "97-00,98-00,99-00" --json
```

## 设计要点

1. 复用 `run` 的 options 解析和 Spec 校验。
2. 复用 DependencyManager 构图与环检测。
3. 复用 OrchestrationEngine 的批次计算逻辑（提炼为共享函数）。

## 输出结构（JSON）

```json
{
  "success": true,
  "specs": ["97-00", "98-00", "99-00"],
  "dependencies": {
    "99-00": ["98-00"]
  },
  "batches": [
    ["98-00"],
    ["99-00"]
  ],
  "has_cycle": false,
  "cycle_path": null
}
```

## 变更点

- `lib/commands/orchestrate.js`
- `lib/orchestrator/orchestration-engine.js`（若需提炼批次计算）
- `tests/orchestrator/orchestrate-command.test.js`
