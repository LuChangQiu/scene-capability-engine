# Requirements Document

## Introduction

本 Spec 定义 sce 的质量硬化计划，采用主从 Agent 协同推进。目标是并行完成 4 个高优先级改进，并在主 Spec 中完成最终集成验收：

- CI 测试可信度升级
- Jest 句柄泄漏治理
- `watch logs --follow` 功能补完
- 文档仓库链接统一与防回归

## Requirements

### Requirement 1: 主从 Spec 协同治理

**User Story:** 作为主 Agent，我希望将质量改进拆分为可并行的子 Spec，并跟踪依赖与状态，以便稳定推进并降低串行阻塞。

#### Acceptance Criteria

1. WHEN 主 Spec 初始化完成 THEN THE SYSTEM SHALL 存在 1 个 Master Spec 和 4 个 Sub Spec 的协作元数据。
2. WHEN 查询协作状态 THEN THE SYSTEM SHALL 显示依赖关系与 ready spec 列表。
3. WHEN 子 Spec 产出交付物 THEN THE SYSTEM SHALL 在 `collaboration.json` 的 `interfaces` 中声明 provides/consumes。

### Requirement 2: 质量改进结果可验证

**User Story:** 作为维护者，我希望每个子 Spec 的产出可执行、可校验、可回归，避免“文档完成但行为未完成”。

#### Acceptance Criteria

1. WHEN CI 测试治理子 Spec 完成 THEN THE SYSTEM SHALL 提供分层测试入口（smoke/full）与明确执行策略。
2. WHEN 句柄泄漏治理子 Spec 完成 THEN THE SYSTEM SHALL 消除对 `forceExit` 的硬依赖或提供受控过渡机制。
3. WHEN watch follow 子 Spec 完成 THEN `sce watch logs --follow` SHALL 持续输出新增日志并可安全退出。
4. WHEN 文档链接治理子 Spec 完成 THEN 仓库链接 SHALL 统一为单一 canonical 地址，并有自动扫描防回归。

### Requirement 3: 主 Spec 集成门禁

**User Story:** 作为发布负责人，我希望主 Spec 统一执行集成验证并形成证据，以便直接用于发布判断。

#### Acceptance Criteria

1. WHEN 所有子 Spec 状态为 completed THEN 主 Spec SHALL 运行统一验证清单（命令、测试、文档扫描）。
2. WHEN 集成验证结束 THEN 主 Spec SHALL 产出一份总结报告，记录风险、回滚点、发布建议。
3. IF 任一关键验证失败 THEN 主 Spec SHALL 将状态标记为 blocked 并记录阻塞原因。
