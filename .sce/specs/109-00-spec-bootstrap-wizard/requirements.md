# 需求文档

## 简介

当前用户在 `adopt` 之后仍需手工创建并维护 `requirements/design/tasks`，起步成本高且质量不稳定。

本 Spec 引入 `spec bootstrap` 向导，基于最少输入自动生成高质量 Spec 初稿，降低首轮建模门槛。

## 术语表

- **Bootstrap_Wizard**：Spec 启动向导
- **Spec_Draft**：自动生成的 requirements/design/tasks 初稿
- **Bootstrap_Profile**：按场景预设的模板与规则集合

## 需求

### 需求 1：命令入口

**用户故事：** 作为用户，我希望 adopt 后一条命令即可启动 Spec 初稿构建。

#### 验收标准

1. THE CLI SHALL 提供 `sce spec bootstrap` 命令
2. THE 命令 SHALL 支持 `--name`、`--template`、`--profile`、`--non-interactive`
3. THE 命令 SHALL 支持 `--dry-run` 预览输出

### 需求 2：上下文采集

**用户故事：** 作为用户，我希望向导自动利用项目上下文，减少重复填写。

#### 验收标准

1. THE 向导 SHALL 读取项目元信息（工作目录、已有 specs、语言偏好）
2. THE 向导 SHALL 提供最小问题集（问题数量可控）
3. WHEN 使用 `--non-interactive` THEN 系统 SHALL 仅依赖参数与默认策略生成

### 需求 3：文档生成质量

**用户故事：** 作为实施 Agent，我希望生成内容可直接用于推进，不只是空模板。

#### 验收标准

1. THE SYSTEM SHALL 自动生成 `requirements.md`、`design.md`、`tasks.md`
2. THE 生成内容 SHALL 包含需求-设计-任务映射关系
3. THE 任务列表 SHALL 至少包含可验证项与验收引用

### 需求 4：可追溯与可治理

**用户故事：** 作为维护者，我希望知道 bootstrap 生成依据，便于审计与迭代。

#### 验收标准

1. THE SYSTEM SHALL 在输出中记录来源（模板、profile、关键参数）
2. THE SYSTEM SHALL 支持 `--json` 输出机器可读结果
3. THE 输出 SHALL 与 docs governance 规则兼容

