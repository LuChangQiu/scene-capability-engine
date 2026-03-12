# 需求文档

## 简介

当前 sce 已具备完整能力骨架，但“价值兑现”仍受三类问题影响：

1. 主定位不够收敛（功能线多、主路径不够尖锐）
2. 成功标准缺乏硬指标（难以判断是否真提升交付效率）
3. 扩张节奏缺少止损机制（易陷入长期优化却无法证明收益）

本 Spec 聚焦建立 **60 天价值兑现计划**，以“Spec 驱动多 Agent 工程执行控制台”为唯一主定位，围绕少量硬指标推进并执行 go/no-go 决策。

## 范围边界

### In Scope

- 定位收敛与主路径冻结（以 Spec 为主线）
- 北极星指标定义、采集、周度复盘
- 试点场景打穿（以 Moqui 主线为主）
- 30 天/60 天阶段门禁与止损策略

### Out of Scope

- 大规模新增非主线功能
- 与主路径无关的 UI/命令扩展
- 无指标验证支撑的架构重写

## 北极星指标（North Star KPIs）

- **TTFV**（Time To First Value）≤ 30 分钟
- **批次执行成功率** ≥ 80%
- **Spec 交付周期缩短率** ≥ 30%
- **人工接管率** ≤ 20%

## 需求

### 需求 1：定位收敛与主路径治理

**用户故事：** 作为产品负责人，我希望 sce 的对外定位和内部路线收敛到单一主线，避免功能扩散稀释价值。

#### 验收标准

1. THE SYSTEM SHALL 固化唯一主定位为“Spec 驱动多 Agent 工程执行控制台”
2. THE SYSTEM SHALL 明确主路径为 `adopt → bootstrap → pipeline → gate → orchestrate`
3. WHEN 新需求不服务主路径指标 THEN THE SYSTEM SHALL 默认进入 deferred/backlog，不进入当期开发

### 需求 2：指标定义与基线建立

**用户故事：** 作为交付负责人，我希望看到统一口径的指标基线，以便评估改进是否有效。

#### 验收标准

1. THE SYSTEM SHALL 为 4 个北极星指标提供统一定义、公式和采样窗口
2. THE SYSTEM SHALL 在 D+7 内产出基线报告（Baseline）
3. THE 基线报告 SHALL 记录数据来源、统计口径、异常样本处理规则

### 需求 3：周度执行闭环与可观测性

**用户故事：** 作为项目经理，我希望每周都能看到可执行偏差和纠偏动作，而不是阶段末才发现问题。

#### 验收标准

1. THE SYSTEM SHALL 提供标准化周报模板，至少包含 KPI 变化、偏差原因、下周动作
2. THE SYSTEM SHALL 输出 machine-readable 周度摘要（JSON）用于自动汇总
3. WHEN 任一 KPI 连续两周恶化 THEN THE SYSTEM SHALL 自动标记风险等级为 High

### 需求 4：试点场景打穿（Moqui 主线）

**用户故事：** 作为一线使用者，我希望通过真实业务场景验证主路径有效，而非仅文档层“看起来正确”。

#### 验收标准

1. THE SYSTEM SHALL 选定 Moqui 主线作为 60 天试点场景
2. THE SYSTEM SHALL 至少完成 1 条端到端可复放流程（bootstrap→pipeline→gate→orchestrate）
3. THE 试点输出 SHALL 包含复现命令、输入条件、结果证据和失败回滚说明

### 需求 5：止损门禁与 go/no-go 决策

**用户故事：** 作为投资决策者，我希望在固定时间点做继续/降级决策，避免长期投入无回报。

#### 验收标准

1. THE SYSTEM SHALL 在 Day 30 和 Day 60 各执行一次阶段门禁评审
2. WHEN Day 60 未达到至少 3/4 指标阈值 THEN 建议 SHALL 为“降级为内部维护工具”
3. WHEN Day 60 达到至少 3/4 指标阈值 THEN 建议 SHALL 为“继续投入并扩展场景”

### 需求 6：可复用实施资产

**用户故事：** 作为后续 Agent，我希望该计划可直接复用到其它项目，不依赖个人经验。

#### 验收标准

1. THE SYSTEM SHALL 产出定位声明、指标定义、周报模板、门禁模板四类资产
2. THE 资产 SHALL 可直接在新 Spec 复制并执行
3. THE 资产 SHALL 明确 owner、输入、输出、更新频率
