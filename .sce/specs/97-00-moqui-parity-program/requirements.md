# 需求文档

## 简介

本 Spec 定义 Moqui 能力补齐项目（Program），目标是让 sce 的 Moqui Scene Runtime 能力与 `331-poc` 的核心 REST 能力达到可用对齐，并为主从 Agent 批次执行提供明确的依赖拆分。

本 Program 不直接落地单一代码特性，而是将缺口拆分为可并行子 Spec，并定义统一验收口径、批次顺序和收敛标准。

## 术语表

- **Parity_Baseline**: 对齐基线，指 `E:/workspace/331-poc` 当前可用 API 能力集合
- **Capability_Cluster**: 能力簇，指可独立开发与验收的一组 Moqui 能力
- **Batch**: 批次，依赖满足后可并行执行的一组 Spec
- **Program_Gate**: 项目闸口，进入下一批次前必须满足的检查条件
- **DoD**: Definition of Done，项目完成定义

## 需求

### 需求 1：子 Spec 分解与依赖定义

**用户故事：** 作为主控 Agent，我希望将 Moqui 补齐任务拆成独立子 Spec 并标明依赖，以便批次并行执行。

#### 验收标准

1. THE Program SHALL 定义以下子 Spec：`98-00`、`99-00`、`100-00`、`101-00`、`102-00`、`103-00`
2. THE Program SHALL 定义批次依赖：Batch A=`98-00`；Batch B=`99-00`+`100-00`+`101-00`；Batch C=`102-00`；Batch D=`103-00`
3. IF 前一批次未通过 Program_Gate THEN 后续批次 SHALL NOT 启动

### 需求 2：统一基线与范围控制

**用户故事：** 作为维护者，我希望所有子 Spec 共享同一对齐基线，避免重复实现与范围漂移。

#### 验收标准

1. THE Parity_Baseline SHALL 引用 `E:/workspace/331-poc/docs/api/REST_API_USAGE_GUIDE.md`
2. THE Program SHALL 要求子 Spec 在 design 文档中明确 In-Scope 和 Out-of-Scope
3. WHEN 子 Spec 引入新 binding ref 语法 THEN 该语法 SHALL 记录在对应 design 文档中

### 需求 3：批次执行治理

**用户故事：** 作为主控 Agent，我希望每批执行后都有可验证产物，以便稳态推进。

#### 验收标准

1. WHEN Batch A 完成 THEN 产物 SHALL 包含运行时默认 Moqui 接线与配置口径收敛
2. WHEN Batch B 完成 THEN 产物 SHALL 包含服务/实体/屏幕/API 目录与监控能力补齐
3. WHEN Batch C 完成 THEN 产物 SHALL 包含单测与回归覆盖提升
4. WHEN Batch D 完成 THEN 产物 SHALL 包含 parity 报告与发布建议

### 需求 4：Program 完成定义

**用户故事：** 作为项目负责人，我希望有明确完成标准，以便决定是否收官。

#### 验收标准

1. THE Program DoD SHALL 要求 `98-00` 到 `103-00` 的 mandatory 任务全部完成
2. THE Program DoD SHALL 要求新增能力具备单元测试或等价自动化验证
3. THE Program DoD SHALL 要求文档中的 Moqui 配置示例与代码验证逻辑一致
4. THE Program DoD SHALL 要求产出一份 parity 差异与风险清单
