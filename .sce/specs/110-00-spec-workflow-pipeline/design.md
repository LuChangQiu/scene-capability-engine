# 设计文档：Spec Workflow Pipeline

## 概述

`spec pipeline run` 提供标准 Stage 执行框架，将多个离散命令编排为同一运行单元。

## Stage 模型

- `requirements`
- `design`
- `tasks`
- `gate`

每个 Stage 具有统一接口：

- `prepare(context)`
- `execute(context)`
- `finalize(context, result)`

## 状态模型

建议状态文件：

- `.sce/state/spec-pipeline/<spec-id>/<run-id>.json`

核心字段：

```json
{
  "spec_id": "110-00-spec-workflow-pipeline",
  "run_id": "...",
  "status": "running|completed|failed",
  "stages": [
    { "name": "requirements", "status": "completed", "started_at": "...", "ended_at": "..." }
  ]
}
```

## 复用策略

通过 StageAdapter 复用既有命令实现，避免平行逻辑：

- requirements/design/tasks：调用现有生成/增强链路
- gate：调用 `spec gate`

## 文件与变更点

- `lib/commands/spec-pipeline.js`（新）
- `lib/spec/pipeline/*`（新，StageRunner/StateStore/Adapters）
- `bin/scene-capability-engine.js`（注册命令）
- `tests/spec-pipeline/*`（新增测试）

