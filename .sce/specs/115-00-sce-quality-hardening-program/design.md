# Design Document

## Overview

本设计采用“主 Agent 编排 + 子 Agent 并行执行”的运行模型：

- Master Spec: `115-00-sce-quality-hardening-program`
- Sub Specs:
  - `115-01-ci-test-trust-hardening`
  - `115-02-jest-open-handle-governance`（依赖 115-01）
  - `115-03-watch-logs-follow-completion`
  - `115-04-doc-link-canonicalization`

## Architecture

### 1. Master Agent 职责

- 维护依赖图与执行节奏。
- 统一收敛每个子 Spec 的交付证据。
- 执行最终集成门禁并给出发布建议。

### 2. Sub Agent 职责

- 在各自 Spec 内独立完成需求、设计、实现、验证。
- 对外暴露稳定交付物接口（命令、脚本、报告、文档入口）。
- 在任务完成时更新状态，并向主 Spec 回传风险与阻塞信息。

### 3. 依赖关系

- `115-02` 依赖 `115-01` 完成，避免先治“句柄泄漏”但 CI 入口不稳定导致重复改造。
- `115-03` 与 `115-04` 可并行执行。

## Interface Contract

### Master Consumes

- `115-01`: 测试分层脚本与 CI 策略说明
- `115-02`: 句柄治理结果与 `forceExit` 策略变更
- `115-03`: `watch logs --follow` 行为验证结果
- `115-04`: canonical 链接规则与扫描结果

### Master Provides

- 集成验证结果（测试通过、命令行为、文档一致性）
- 风险清单与发布建议

## Verification Strategy

1. 协作状态验证：`sce collab status --graph`
2. 测试入口验证：smoke/full 可区分运行
3. 行为验证：`sce watch logs --follow` 可持续跟随
4. 文档验证：链接扫描无混用域名
5. 结果归档：主 Spec `custom/` 目录输出收敛报告
