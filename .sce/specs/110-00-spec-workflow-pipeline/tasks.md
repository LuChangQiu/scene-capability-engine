# 实现任务

## 任务 1：命令入口

- [x] 1.1 新增 `sce spec pipeline run` 命令
  - 支持 stage 范围与 dry-run
  - **验证**: Requirement 1

## 任务 2：Stage 执行框架

- [x] 2.1 实现 StageRunner 与统一生命周期
  - **验证**: Requirement 2

- [x] 2.2 实现 Pipeline_State 存储与 resume
  - **验证**: Requirement 2

## 任务 3：能力复用适配

- [x] 3.1 实现 requirements/design/tasks 的 StageAdapter
  - **验证**: Requirement 3

- [x] 3.2 实现 gate StageAdapter
  - **验证**: Requirement 3

## 任务 4：输出与可观测性

- [x] 4.1 统一 JSON 输出结构
  - 包含 `spec_id`、`run_id`、`stage_results`
  - **验证**: Requirement 4

- [x] 4.2 支持结果落盘与下一步建议
  - **验证**: Requirement 4

## 任务 5：测试

- [x] 5.1 正常流程测试（全阶段成功）
  - **验证**: Requirement 1, 2

- [x] 5.2 中断恢复测试（resume）
  - **验证**: Requirement 2

- [x] 5.3 下游失败传播测试
  - **验证**: Requirement 3, 4
