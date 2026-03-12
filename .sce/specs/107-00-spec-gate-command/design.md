# 设计文档：Spec Gate Command

## 概述

`spec gate` 作为轻量化质量闸口，服务多 agent 批次执行后的收敛决策。

## 命令设计

```bash
sce spec gate --spec 102-00-moqui-test-coverage-hardening
sce spec gate --spec 103-00-moqui-parity-acceptance-gate --json --out .sce/reports/spec-gate.json
sce spec gate --spec 103-00-moqui-parity-acceptance-gate --strict
```

## 检查模块

1. Mandatory_Check
- 解析 tasks.md
- 判定 mandatory 是否全部完成

2. Test_Check
- 读取 spec 内定义的推荐命令（或 `--test-cmd` 参数）
- 汇总执行结果

3. Doc_Check
- 规则化检查关键字段口径
- 首批内置规则：Moqui 配置字段 `credentials.username/password`

## 输出模型

```json
{
  "spec": "103-00-moqui-parity-acceptance-gate",
  "result": "conditional-go",
  "checks": {
    "mandatory": { "passed": true },
    "tests": { "passed": false, "failed": ["..."] },
    "docs": { "passed": true }
  },
  "next_actions": ["..."]
}
```

## 变更点

- `lib/commands/spec-gate.js`（新）
- `bin/scene-capability-engine.js`（注册命令）
- `tests/spec-gate/spec-gate-command.test.js`（新）
