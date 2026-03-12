# Agent Sync Plan

## Agent Topology

- `agent-master`: 负责 `115-00` 编排、依赖门禁、集成验收
- `agent-ci`: 负责 `115-01`（CI 测试可信度）
- `agent-runtime`: 负责 `115-02`（Jest 句柄治理）
- `agent-watch`: 负责 `115-03`（watch follow 功能）
- `agent-docs`: 负责 `115-04`（文档链接统一）

## Sync Cadence

1. 每个子 Agent 在完成一个任务块后更新 `tasks.md` 与 `collaboration.json` 状态。
2. 主 Agent 每轮执行 `sce collab status --graph`，同步 ready/block 状态。
3. 若发现阻塞，主 Agent 记录 block reason 并重排并行顺序。

## Integration Gate

- Gate A: 子 Spec 全部 `completed`
- Gate B: 关键命令与测试通过
- Gate C: 文档链接扫描通过
- Gate D: 变更记录进入 `CHANGELOG.md`
