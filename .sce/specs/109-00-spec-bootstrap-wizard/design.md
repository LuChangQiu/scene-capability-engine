# 设计文档：Spec Bootstrap Wizard

## 概述

`spec bootstrap` 是 `sce spec` 之上的增强入口，目标是把“创建目录”升级为“生成可执行初稿”。

## 命令设计

```bash
sce spec bootstrap --name 112-00-example --profile backend-api
sce spec bootstrap --name 112-00-example --template rest-api --dry-run
sce spec bootstrap --name 112-00-example --non-interactive --json
```

## 核心模块

1. **ContextCollector**
- 读取仓库上下文与已有 Spec 元信息

2. **QuestionnaireEngine**
- 交互模式下执行最小问题集采集

3. **DraftGenerator**
- 组合模板 + profile +上下文，生成三文档草稿

4. **TraceEmitter**
- 输出生成依据与参数摘要（终端 + JSON）

## 文件与变更点

- `lib/commands/spec-bootstrap.js`（新）
- `lib/spec/bootstrap/*`（新，收纳采集与生成逻辑）
- `bin/scene-capability-engine.js`（注册命令）
- `tests/spec-bootstrap/*`（新增测试）

## 非目标

1. 本 Spec 不替代 `enhance` 命令能力
2. 本 Spec 不引入复杂领域建模推理，仅提供高质量初稿

