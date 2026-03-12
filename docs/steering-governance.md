# Steering 治理与净化

## 目标

让 `.sce/steering/` 长期保持三种品质：

- 健壮：长期规则稳定，不被短期任务污染
- 活力：随着项目演进持续校正，不靠历史惯性堆积
- 节制：只保留最小必要上下文，其他内容迁回更合适的位置

## 分层标准

| 位置 | 应放什么 | 不应放什么 |
|------|---------|-----------|
| `.sce/steering/CORE_PRINCIPLES.md` | 长期原则、跨 Spec 仍成立的默认行为 | 任务项、历史版本、阶段流水、短期战术 |
| `.sce/steering/ENVIRONMENT.md` | 项目环境、目录约定、发布触发方式、长期运行约束 | Spec 进度、问题清单、临时 workaround |
| `.sce/steering/CURRENT_CONTEXT.md` | 当前阶段最小必要上下文、近期优先级 | 长历史、完整日志、旧阶段总结 |
| `.sce/steering/RULES_GUIDE.md` | 职责边界、迁移规则、审计入口 | 详细制度、示例、长篇解释 |
| `.sce/specs/<spec>/` | 任务、证据、诊断、阶段记录、报告 | 不应再回写到 steering 的长历史 |
| `docs/` | 详细制度、示例、方法论、治理说明 | 当前 session 的即时状态 |

## 审查周期

- 每周一次
- 每次发布前一次
- 每次重大 Spec 收尾后一次
- 接管老项目或大规模文档迁移后，再补一次

## 审查动作

每次审查只做四类决定：

1. 保留
   条件：内容长期有效，且放在当前层是正确的
2. 合并
   条件：多条规则表达同一个约束，只是换了说法
3. 迁移
   条件：内容有效，但层级错了
4. 删除
   条件：短期价值已结束、已有现成机制承接、或已经被文档/系统能力覆盖

## 防腐重点

### 1. 不允许平行机制

steering 不能因为“想提醒 AI”就再造一套并行机制。

典型案例：

- 缺陷经验、临时兜底、发布阻断：统一复用 `errorbook`
- Scene / session 生命周期：复用现有 close-loop / scene 运行时
- release gate：复用现有 release workflow 与 gate 脚本

如果某条 steering 规则本质上是在说“再搞一套模式”，应先问两件事：

1. 现有 SCE 是否已经有能力承接？
2. 这条内容应该写成机制引用，而不是重新定义机制吗？

### 2. 不允许长历史驻留

历史记录、阶段流水、版本脚注、完成纪要不应长期留在 steering。

迁移目标：

- 当前阶段以外的推进历史 -> 对应 Spec `custom/` 或 `reports/`
- 发布历史 -> `CHANGELOG.md` / `docs/releases/`
- 详细治理说明 -> `docs/steering-governance.md`

### 3. 不允许任务态混入

steering 不是待办清单。

以下内容应迁出：

- checklist
- “下一个动作”
- 具体执行命令流水
- 某个 Spec 的进行中任务状态

### 4. 不允许错层

判断标准很简单：

- 跨项目、跨阶段仍成立？放 `CORE_PRINCIPLES.md`
- 仅对当前项目成立？放 `ENVIRONMENT.md`
- 仅对当前阶段成立？放 `CURRENT_CONTEXT.md`
- 需要示例和长解释？放 `docs/`

## 审计入口

本项目提供自动审计：

```bash
npm run audit:steering
```

当前会检查：

- 文件预算是否超线
- 长期层是否混入历史版本脚注
- 长期层是否混入 Spec 引用
- steering 中是否混入 checklist / 任务态
- `CURRENT_CONTEXT.md` 是否与当前包版本脱节
- 是否出现“错题 / 错题本”这类非规范机制别名

## 通过标准

- `CORE_PRINCIPLES.md` 能在短时间读完并说明默认行为
- `CURRENT_CONTEXT.md` 不依赖长历史也能让 Agent 开工
- steering 中不再出现任务态和阶段流水
- 已有机制统一复用，不再出现平行命名
- 周期性审计可稳定通过
