# Requirements Document

## Introduction

本 Spec 聚焦补完 `sce watch logs --follow`，消除“命令可见但功能未实现”的断层，提升 watch 模式可运维性。

## Requirements

### Requirement 1: Follow 行为可用

**User Story:** 作为操作者，我希望 `sce watch logs --follow` 能持续输出新增日志，以便实时观测自动化执行。

#### Acceptance Criteria

1. WHEN 执行 `sce watch logs --follow` THEN 命令 SHALL 持续输出新增日志行。
2. WHEN 日志文件尚不存在 THEN 命令 SHALL 等待并在日志出现后继续跟随。
3. WHEN 用户按 Ctrl+C THEN 命令 SHALL 优雅退出且返回码为 0。

### Requirement 2: Tail + Follow 组合

**User Story:** 作为操作者，我希望先看到最近 N 条，再继续跟随新增日志，以便快速接续上下文。

#### Acceptance Criteria

1. WHEN 指定 `--tail N --follow` THEN 命令 SHALL 先输出最后 N 条，再进入跟随模式。
2. WHEN 日志轮转发生 THEN 命令 SHALL 尽量保持跟随不中断。

### Requirement 3: 可测试性

**User Story:** 作为维护者，我希望 follow 行为有自动化测试覆盖，以便防止后续回归。

#### Acceptance Criteria

1. THE SYSTEM SHALL 增加 `logsWatch` follow 模式的单元/集成测试。
2. 测试 SHALL 覆盖：首次输出、增量输出、退出行为。
