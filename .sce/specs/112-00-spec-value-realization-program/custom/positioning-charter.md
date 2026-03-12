# SCE 定位声明（60 天执行版）

## 1. 唯一主定位

SCE 在当前阶段的唯一主定位为：

**Spec 驱动的多 Agent 工程执行控制台**。

该定位不追求“功能最全”，优先追求“路径可执行、结果可验证、协作可审计”。

## 2. 主路径（Golden Path）

`adopt → spec bootstrap → spec pipeline run → spec gate run → orchestrate`

任何新增能力必须回答：

1. 是否缩短主路径耗时？
2. 是否提升主路径成功率？
3. 是否降低人工接管率？

若三项均否，则默认延期。

## 3. 范围治理规则

- **In Scope**：直接提升 4 个 KPI 的需求
- **Deferred**：无法映射 KPI 的增强项
- **Rejected**：与主定位冲突且带来维护复杂度上升的需求

## 4. 评估周期

- 周节奏：每周一次指标复盘
- 阶段门禁：Day 30 / Day 60

## 5. 角色与责任

- Owner：产品与工程负责人（当前由主维护者承担）
- Reviewer：执行 Agent + 人工复核
- Evidence Keeper：每周沉淀指标与复盘记录
