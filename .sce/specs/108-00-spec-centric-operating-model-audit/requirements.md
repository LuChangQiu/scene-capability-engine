# 需求文档

## 简介

随着 SCE 功能持续扩展（`scene`、`orchestrate`、`auto`、`collab`、`lock`、`docs` 等），用户在“以 Spec 为中心推进工作”时出现路径分散、命令琐碎、状态分裂的问题。

本 Spec 用于完成一次系统级调研与评估，产出可执行的收敛方案，确保后续新增能力继续锚定 Spec 主线，而非形成平行流程。

## 术语表

- **Spec_Centric_Model**：以 Spec 为唯一主线的工作模型
- **Golden_Path**：推荐主流程（adopt → bootstrap → requirements/design/tasks → execute → gate → archive）
- **Capability_Map**：命令能力盘点矩阵（输入/输出/状态/配置）
- **Consistency_Contract**：跨模块配置与数据一致性约束
- **Convergence_Roadmap**：能力收敛路线图（分阶段）

## 需求

### 需求 1：能力盘点基线

**用户故事：** 作为产品维护者，我希望先看到全量能力盘点，以便识别重复功能和边界模糊点。

#### 验收标准

1. THE SYSTEM SHALL 产出覆盖 `spec/create`、`scene`、`orchestrate`、`auto`、`collab`、`lock`、`docs` 的 Capability_Map
2. THE Capability_Map SHALL 包含每个命令的输入、输出、状态文件、配置来源、失败模式
3. THE Capability_Map SHALL 标注“主线能力 / 辅助能力 / 治理能力”三类定位

### 需求 2：主流程诊断

**用户故事：** 作为一线使用者，我希望明确“从项目接管到交付”的最短有效路径，减少命令切换成本。

#### 验收标准

1. THE SYSTEM SHALL 提供 Golden_Path 当前实现路径图
2. THE 诊断结果 SHALL 识别每一阶段的断点、重复步骤和手工补位环节
3. THE 输出 SHALL 给出每个断点的优先级（P0/P1/P2）与影响范围

### 需求 3：Scene/Orchestrate 与 Spec 对齐评估

**用户故事：** 作为架构负责人，我希望确认 scene、orchestrate 等后增特性确实服务于 Spec，而不是偏离主线。

#### 验收标准

1. THE SYSTEM SHALL 评估 `scene` 与 Spec 文档（requirements/design/tasks）之间的映射关系
2. THE SYSTEM SHALL 评估 `orchestrate` 的执行状态与 Spec 任务状态的一致性
3. WHEN 出现“可执行但不可追溯到 Spec”的路径 THEN 报告 SHALL 标注为高风险一致性问题

### 需求 4：配置与数据一致性契约评估

**用户故事：** 作为平台工程师，我希望统一配置入口和状态语义，避免多模块协同时数据不一致。

#### 验收标准

1. THE SYSTEM SHALL 产出 Consistency_Contract 草案（配置分层、优先级、冲突策略）
2. THE 草案 SHALL 覆盖运行态状态字段（如 run_id、spec_id、stage、result）的统一命名
3. THE 草案 SHALL 定义最小可机读输出模型（JSON）用于跨模块联动

### 需求 5：度量与收敛路线图

**用户故事：** 作为项目负责人，我希望有可量化指标来判断改进是否有效。

#### 验收标准

1. THE SYSTEM SHALL 定义 Spec 主线效率指标（如从 adopt 到可执行 tasks 的耗时）
2. THE SYSTEM SHALL 定义一致性指标（如任务状态与执行状态不一致率）
3. THE SYSTEM SHALL 输出三阶段 Convergence_Roadmap（短期/中期/长期）及里程碑

### 需求 6：可执行交付物

**用户故事：** 作为后续实现 Agent，我希望调研结果可直接转化为实现 Spec，避免重复分析。

#### 验收标准

1. THE SYSTEM SHALL 产出《评估总报告》与《实施建议清单》
2. THE 建议清单 SHALL 明确映射到后续 Spec（109/110/111）
3. THE 报告 SHALL 提供 go/no-go 建议，明确是否进入实施阶段

