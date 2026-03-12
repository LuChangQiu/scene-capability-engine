# Design Document

## Overview

在 `lib/commands/watch.js` 中实现 follow 模式，采用轻量轮询策略读取日志文件追加内容，保证跨平台稳定性。

## Design Details

### 1. Follow Loop

- 启动时先读取 `--tail` 指定数量的历史日志。
- 维护文件 offset，周期性读取新增字节并解析为日志行。
- 输出格式复用现有日志渲染逻辑。

### 2. 异常与边界

- 日志文件不存在：进入等待，定时重试。
- 日志轮转（文件变小/替换）：重置 offset 并继续跟随。
- Ctrl+C：清理 timer 并退出。

### 3. 可测试性

- 将读取循环抽为可注入依赖（fs/time）的小函数，便于单测。
- 新增测试模拟“日志追加”和“轮转”场景。

## Verification

1. `sce watch logs --follow` 可持续输出新增日志。
2. `--tail N --follow` 组合行为正确。
3. 测试覆盖新增逻辑并通过。
