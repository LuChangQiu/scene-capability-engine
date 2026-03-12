# 实现任务

## 任务 1：命令入口与参数

- [x] 1.1 新增 `sce spec bootstrap` 命令
  - 支持 `--name`、`--template`、`--profile`、`--dry-run`、`--non-interactive`、`--json`
  - **验证**: Requirement 1

## 任务 2：上下文采集

- [x] 2.1 实现 ContextCollector
  - 收集项目与 Spec 现状信息
  - **验证**: Requirement 2

- [x] 2.2 实现交互问题引擎
  - 问题数可控，支持默认值
  - **验证**: Requirement 2

## 任务 3：文档草稿生成

- [x] 3.1 实现 requirements/design/tasks 联动生成
  - 输出需求-设计-任务映射结构
  - **验证**: Requirement 3

## 任务 4：追溯与输出

- [x] 4.1 输出生成依据摘要
  - 含模板、profile、关键参数
  - **验证**: Requirement 4

- [x] 4.2 支持 JSON 结果输出
  - **验证**: Requirement 4

## 任务 5：测试

- [x] 5.1 命令参数与 dry-run 测试
  - **验证**: Requirement 1

- [x] 5.2 生成质量与一致性测试
  - **验证**: Requirement 3, 4
