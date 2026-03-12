# Steering 规则索引

**文件职责**:
- `CORE_PRINCIPLES.md`：长期有效的跨项目/跨 Spec 原则
- `ENVIRONMENT.md`：当前项目的运行环境与发布约束
- `CURRENT_CONTEXT.md`：当前阶段最小必要上下文
- `RULES_GUIDE.md`：职责边界与迁移规则

**迁移规则**:
- 长期原则放 `CORE_PRINCIPLES.md`
- 项目级运行/发布规则放 `ENVIRONMENT.md`
- 短期推进信息放 `CURRENT_CONTEXT.md`
- 详细说明、示例、评审标准放 `docs/steering-governance.md`
- 任务清单、阶段证据、历史流水放对应 Spec 目录

**审计命令**:
- `npm run audit:steering`
- 审计失败时优先做四件事：合并重复、迁移错层、归档历史、删除失效条目

**硬约束**:
- `.sce/steering/` 不存放报告、子目录历史、一次性分析、任务 checklist
- steering 不得平行发明已有机制；例如缺陷经验统一复用 `errorbook`
