# Implementation Plan: 115-02 Jest Open Handle Governance

## Tasks

- [x] 1. 建立诊断基线
  - [x] 1.1 新增句柄检测执行脚本
  - [x] 1.2 记录当前泄漏信号

- [x] 2. 修复异步资源泄漏
  - [x] 2.1 修复 watch/integration 测试清理逻辑
  - [x] 2.2 修复遗留 timer/process 清理逻辑
    - 已补充 `custom/watch-cleanup-closeout-2026-03-12.md`，记录 watcher 初始化/恢复 timer、测试 helper polling timer、CLI timeout 的清理与 `unref()` 收口。

- [x] 3. 收敛配置
  - [x] 3.1 移除默认 `forceExit`
  - [x] 3.2 如需过渡，添加短期 fallback 说明
    - 已补充 `custom/fallback-strategy-2026-03-12.md`，明确保留 `test:smoke` / `test:ci` 作为可信门禁路径，`test:handles` 作为诊断入口，且禁止把 `forceExit` 重新引回默认配置。

- [x] 4. 验证
  - [x] 4.1 执行 full 测试
  - [x] 4.2 输出治理报告并同步主 Spec
