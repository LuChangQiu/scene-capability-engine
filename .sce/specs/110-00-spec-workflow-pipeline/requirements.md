# 需求文档

## 简介

当前 Spec 推进依赖多条手工命令串联，流程易断裂、阶段状态不可追踪。

本 Spec 引入“Spec 流程编排命令”，将需求→设计→任务→闸口串为可执行流水线，提升交付效率与一致性。

## 术语表

- **Spec_Pipeline**：Spec 流程编排执行器
- **Stage**：流水线阶段（requirements、design、tasks、gate）
- **Pipeline_State**：可恢复状态快照

## 需求

### 需求 1：命令接口

**用户故事：** 作为主控 Agent，我希望一条命令完成 Spec 全流程推进。

#### 验收标准

1. THE CLI SHALL 提供 `sce spec pipeline run --spec <name>`
2. THE 命令 SHALL 支持 `--from-stage`、`--to-stage`、`--dry-run`
3. THE 命令 SHALL 支持 `--json` 输出与 `--out` 落盘

### 需求 2：阶段编排与恢复

**用户故事：** 作为执行者，我希望流程可中断恢复，避免从头重跑。

#### 验收标准

1. THE SYSTEM SHALL 为每个 Stage 记录开始/结束/结果状态
2. WHEN 流程中断 THEN 系统 SHALL 支持 resume 到最近未完成阶段
3. THE 系统 SHALL 支持 fail-fast 与 continue-on-warning 两种策略

### 需求 3：复用现有能力

**用户故事：** 作为维护者，我希望新流程编排尽量复用现有命令，避免重复实现。

#### 验收标准

1. THE Pipeline SHALL 复用现有 `spec/create`、`enhance`、`docs validate`、`spec gate` 能力
2. THE Pipeline SHALL 保持与现有命令输出语义一致
3. WHEN 下游命令失败 THEN Pipeline SHALL 输出结构化失败原因

### 需求 4：多 Agent 可观测性

**用户故事：** 作为协同管理者，我希望 Pipeline 结果可被 orchestrate/collab 消费。

#### 验收标准

1. THE Pipeline 输出 SHALL 包含 `spec_id`、`run_id`、`stage_results`
2. THE 输出 SHALL 支持机器可读 JSON 模式
3. THE 输出 SHALL 明确给出下一步建议动作

