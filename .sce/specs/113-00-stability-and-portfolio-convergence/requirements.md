# 需求文档

## 简介

在 `112-00-spec-value-realization-program` 完成价值导向治理后，当前进入“稳定性与组合收敛”阶段。

本 Spec 聚焦两个现实问题：

1. 多 Spec 并行推进时，执行模式与优先级缺少统一约束
2. `sce docs archive` 与项目 `specSubdirs` 配置存在偏差，可能“修复后再次触发合规告警”

目标是在不扩张功能面的前提下，先完成治理稳定、组合收敛和回归闭环。

## 范围边界

### In Scope

- 多 Spec 组合的分层策略（active/deferred/archived）
- `docs archive` 子目录决策与治理配置对齐
- 既有告警的批量收敛修复与状态回归验证
- 形成可复用稳定性检查清单

### Out of Scope

- 新增与稳定性无关的命令能力
- 大规模流程重构或 UI 改造
- 与文档治理无关的跨模块改写

## 需求

### 需求 1：Spec 组合收敛策略

**用户故事：** 作为平台维护者，我希望多 Spec 并行时有统一推进规则，避免资源分散和优先级冲突。

#### 验收标准

1. THE SYSTEM SHALL 定义 `active/deferred/archived` 三层组合状态与准入准出规则
2. THE SYSTEM SHALL 规定多 Spec 默认采用 orchestrate 驱动执行，并保持 gate 收敛
3. WHEN 同时存在多个 active Spec THEN THE SYSTEM SHALL 明确排序依据（业务价值、风险等级、依赖关系）

### 需求 2：Archive 子目录治理一致性

**用户故事：** 作为使用者，我希望 `sce docs archive` 输出始终符合项目治理配置，不再产生无效子目录。

#### 验收标准

1. THE SYSTEM SHALL 仅将归档目标解析到 `config.specSubdirs` 允许的目录集合
2. WHEN 首选目录不在允许集合且存在 `custom` THEN THE SYSTEM SHALL 回落到 `custom`
3. WHEN 首选目录和 `custom` 均不可用 THEN THE SYSTEM SHALL 使用语义映射或首个允许目录兜底

### 需求 3：历史告警收敛与修复

**用户故事：** 作为治理负责人，我希望已有文档告警一次性收敛，避免持续污染状态面板。

#### 验收标准

1. THE SYSTEM SHALL 修复既有 `misplaced_artifact` / `invalid_subdirectory` 告警样本
2. THE 修复 SHALL 保持文件内容和命名不变，仅调整合规位置
3. AFTER 修复 `sce docs diagnose` SHALL 返回 compliant 状态

### 需求 4：稳定性回归基线

**用户故事：** 作为交付负责人，我希望每次治理修复后都有最小回归闭环，降低回归风险。

#### 验收标准

1. THE SYSTEM SHALL 提供 `archive-tool` 关键分流策略的单元测试覆盖
2. THE SYSTEM SHALL 输出至少一份稳定性检查清单用于复跑
3. THE SYSTEM SHALL 通过 `docs diagnose` 与 `status --verbose` 双重状态确认
