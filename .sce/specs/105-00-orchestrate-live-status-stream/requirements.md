# 需求文档

## 简介

当前 `orchestrate status` 依赖落盘状态文件，且状态主要在 run 结束后写入，无法实时观察执行进度。该 Spec 增加实时状态写入与 `--watch` 模式。

## 术语表

- **Live_Status**: 实时状态，包含当前批次、运行中 Spec、完成/失败统计
- **Status_Snapshot**: 状态快照，定时写入的 JSON 状态文件
- **Watch_Mode**: 观察模式，持续刷新状态输出直到任务结束

## 需求

### 需求 1：运行期状态持久化

**用户故事：** 作为主控 Agent，我希望执行过程中就能看到状态变化，而不是结束后一次性看到结果。

#### 验收标准

1. WHEN `orchestrate run` 执行中 THEN 系统 SHALL 周期性写入 Status_Snapshot
2. THE Status_Snapshot SHALL 包含 `status`、`currentBatch`、`totalBatches`、`specs` 状态映射
3. THE 写入失败 SHALL 不中断编排执行，但应记录 warning

### 需求 2：`status --watch` 观察模式

**用户故事：** 作为操作员，我希望持续观察实时状态，直到完成或失败。

#### 验收标准

1. `sce orchestrate status --watch` SHALL 按固定间隔刷新状态
2. THE 命令 SHALL 支持 `--interval <ms>` 参数
3. WHEN 状态进入 completed/failed/stopped THEN watch 模式 SHALL 自动退出

### 需求 3：JSON 可消费性

**用户故事：** 作为自动化工具调用方，我希望状态输出可被机器消费。

#### 验收标准

1. `status --json` SHALL 输出最新 Status_Snapshot
2. `status --watch --json` SHALL 输出逐帧 JSON 行（JSON Lines）
3. 输出字段命名 SHALL 与现有 OrchestrationStatus 保持一致
