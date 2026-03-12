# 需求文档

## 简介

当前 `sce orchestrate run` 会直接执行，不支持先查看依赖图与批次计划。该 Spec 增加 `sce orchestrate plan`，用于在执行前输出可审计的编排计划，降低盲跑风险。

## 术语表

- **Orchestration_Plan**: 编排计划，包含目标 Spec、依赖图、批次分组和阻塞信息
- **Batch_Preview**: 批次预览，显示每个批次可并行执行的 Spec 列表
- **Plan_Gate**: 计划闸口，执行前对缺失 Spec、循环依赖进行拦截

## 需求

### 需求 1：新增 `orchestrate plan` 命令

**用户故事：** 作为主控 Agent，我希望在执行前预览编排计划，以便确认批次顺序和依赖正确性。

#### 验收标准

1. THE CLI SHALL 提供 `sce orchestrate plan --specs <specs>` 子命令
2. THE 命令 SHALL 支持 `--json` 输出结构化计划
3. THE 命令 SHALL 复用 `orchestrate run` 的 Spec 存在性校验逻辑

### 需求 2：计划输出内容

**用户故事：** 作为执行者，我希望计划输出包含关键调度信息，便于审批与审计。

#### 验收标准

1. THE 计划输出 SHALL 包含 `specs`、`dependencies`、`batches` 字段
2. THE 计划输出 SHALL 包含 `has_cycle` 与 `cycle_path`（存在时）
3. WHEN 存在缺失 Spec 或循环依赖 THEN 命令 SHALL 非零退出并返回明确错误信息

### 需求 3：与 run 命令协同

**用户故事：** 作为主控 Agent，我希望 plan 与 run 的逻辑一致，避免“计划可行但运行失败”的不一致。

#### 验收标准

1. THE plan 计算 SHALL 使用同一依赖构建来源（DependencyManager）
2. THE 批次算法 SHALL 与 run 使用一致规则
3. THE plan 输出 SHALL 可直接作为 run 前置审查依据
