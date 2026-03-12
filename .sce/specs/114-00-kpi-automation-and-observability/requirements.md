# 需求文档

## 简介

当前 sce 已完成价值导向与稳定性收敛基础（112/113），但 KPI 数据仍以人工汇总为主，存在口径不一致、跨周期对比困难和预警滞后问题。

本 Spec 目标是建立 **可执行、可机读、可回放** 的 KPI 自动化链路，降低人工维护成本，并为 Day30/Day60 门禁提供可靠输入。

## 范围边界

### In Scope

- 指标定义加载与校验（对齐 112 资产）
- 周度 KPI 快照自动采集与落盘
- 风险升级规则自动评估（连续恶化升高风险）
- CLI 可观测输出（table/json）

### Out of Scope

- 业务系统真实埋点接入（先用现有执行结果与样本数据）
- 新增 Web 可视化仪表盘
- 对历史全部 Spec 做全量回填

## 需求

### 需求 1：统一指标输入契约

**用户故事：** 作为平台维护者，我希望 KPI 的输入与口径统一，避免不同 Agent 输出不可比。

#### 验收标准

1. THE SYSTEM SHALL 支持从 `metric-definition.yaml` 加载指标定义
2. THE SYSTEM SHALL 在执行前校验必填字段与数值范围
3. WHEN 指标定义缺失或不合法 THEN CLI SHALL fail-fast 并返回可读错误

### 需求 2：周度快照自动产出

**用户故事：** 作为交付负责人，我希望每周自动得到可机读快照，减少人工整理。

#### 验收标准

1. THE SYSTEM SHALL 提供命令生成周度 KPI 快照 JSON
2. THE 快照 SHALL 包含 `period`、4 项北极星指标、`risk_level`、`notes`
3. WHEN 输出路径未指定 THEN SYSTEM SHALL 写入 `custom/weekly-metrics/<period>.json`

### 需求 3：风险升级自动评估

**用户故事：** 作为项目经理，我希望系统自动识别趋势恶化，提前触发风险提示。

#### 验收标准

1. THE SYSTEM SHALL 支持读取最近 N 周快照进行趋势比较
2. WHEN 任一核心指标连续两周恶化 THEN SYSTEM SHALL 标记 `risk_level=high`
3. THE SYSTEM SHALL 输出触发原因列表用于审计

### 需求 4：门禁可直接复用

**用户故事：** 作为 Gate 执行者，我希望 KPI 结果可以直接被 Day30/Day60 决策复用。

#### 验收标准

1. THE SYSTEM SHALL 生成门禁可消费的汇总摘要 JSON
2. THE 摘要 SHALL 包含阈值对照、达标项数量、建议决策字段
3. THE 输出 SHALL 可被 Spec 文档直接引用为证据路径

### 需求 5：命令可观测与可回放

**用户故事：** 作为 Agent 使用者，我希望命令结果既可人读也可机器处理。

#### 验收标准

1. THE CLI SHALL 支持 `--json` 输出完整执行结果
2. THE CLI SHALL 默认输出简洁摘要（指标值、趋势、风险）
3. THE CLI SHALL 在输出中包含输入源、执行时间与结果路径
