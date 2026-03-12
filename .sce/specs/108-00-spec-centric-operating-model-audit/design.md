# 设计文档：Spec-Centric Operating Model Audit

## 概述

本设计定义一套“先评估、再收敛”的方法，目标是将 SCE 的多能力体系重新约束在 Spec 主线上。

本 Spec 只做评估与设计，不做功能实现。

## 评估框架

### 1) 能力盘点层（What Exists）

输出 `Capability_Map`，覆盖：

- 命令入口与子命令
- 输入/输出模型
- 状态文件与持久化位置
- 配置读取链路
- 错误与退出码语义

### 2) 流程诊断层（How It Flows）

基于 Golden_Path 进行阶段审查：

1. adopt
2. bootstrap（新能力目标）
3. requirements/design/tasks
4. execute（scene/orchestrate/auto/collab）
5. gate
6. archive/docs governance

每阶段输出：

- 当前可用命令
- 手工步骤
- 中断点
- 可观测性缺口

### 3) 一致性层（How It Stays Correct）

输出 `Consistency_Contract` 草案：

- 状态字段统一命名（`spec_id`、`run_id`、`stage`、`result`）
- 配置优先级（CLI > Spec local > Workspace > Global default）
- 冲突决议（fail-fast / override / advisory）

## 交付结构

建议在 Spec 内产生以下文件：

- `reports/capability-map.md`
- `reports/golden-path-diagnosis.md`
- `reports/consistency-contract-draft.md`
- `reports/convergence-roadmap.md`
- `reports/final-assessment.md`

## 后续 Spec 映射

- `109-00-spec-bootstrap-wizard`：解决起步成本高
- `110-00-spec-workflow-pipeline`：解决流程碎片化
- `111-00-spec-gate-standardization`：解决多 Agent 收敛失控

## 设计决策

1. 本 Spec 不修改现有命令行为
2. 本 Spec 以“可落地建议”作为唯一成功标准
3. 所有建议必须可映射到具体后续实现 Spec

