# 实现任务

## 任务 1：指标契约加载与校验

- [x] 1.1 实现指标定义加载器
  - 新增 `lib/value/metric-contract-loader.js`
  - 支持 YAML/JSON 定义读取
  - **验证**: Requirement 1.1

- [x] 1.2 实现指标定义校验
  - 校验必填字段、阈值范围、类型
  - **验证**: Requirement 1.2, 1.3

## 任务 2：周度快照构建

- [x] 2.1 实现快照构建器
  - 新增 `lib/value/weekly-snapshot-builder.js`
  - 生成统一快照结构
  - **验证**: Requirement 2.1, 2.2

- [x] 2.2 实现默认输出路径与落盘
  - 默认写入 `custom/weekly-metrics/<period>.json`
  - **验证**: Requirement 2.3

## 任务 3：风险评估引擎

- [x] 3.1 实现连续恶化规则评估
  - 新增 `lib/value/risk-evaluator.js`
  - **验证**: Requirement 3.1, 3.2

- [x] 3.2 输出可审计触发原因
  - 在结果中包含 `reasons[]`
  - **验证**: Requirement 3.3

## 任务 4：门禁摘要输出

- [x] 4.1 实现门禁摘要生成器
  - 新增 `lib/value/gate-summary-emitter.js`
  - **验证**: Requirement 4.1, 4.2

- [x] 4.2 关联证据路径输出
  - 输出可直接引用的 `evidence[]`
  - **验证**: Requirement 4.3

## 任务 5：CLI 命令接入

- [x] 5.1 增加 `sce value metrics snapshot` 命令入口
  - 支持 `--period --input --out --json`
  - **验证**: Requirement 5.1, 5.2

- [x] 5.2 补充单元测试与命令测试
  - `tests/unit/value/*.test.js`
  - `tests/unit/commands/value-metrics.test.js`
  - **验证**: Requirement 5.3

## 任务 6：可观测增强（baseline/trend）

- [x] 6.1 增加 `sce value metrics baseline` 命令
  - 支持 `--input` 与 `--from-history` 两种基线生成路径
  - **验证**: Requirement 2.1, 2.3, 5.1

- [x] 6.2 增加 `sce value metrics trend` 命令
  - 支持窗口化趋势分析与风险汇总输出
  - **验证**: Requirement 3.1, 3.2, 5.1, 5.2
