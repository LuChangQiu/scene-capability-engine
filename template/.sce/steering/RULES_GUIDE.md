# Steering 规则索引

**职责边界**:
- `CORE_PRINCIPLES.md`：长期原则
- `ENVIRONMENT.md`：项目级规则
- `CURRENT_CONTEXT.md`：当前阶段上下文
- `RULES_GUIDE.md`：迁移与维护规则

**迁移原则**:
- 长期有效 -> `CORE_PRINCIPLES.md`
- 项目运行约束 -> `ENVIRONMENT.md`
- 当前阶段状态 -> `CURRENT_CONTEXT.md`
- 详细制度与示例 -> 项目文档
- 任务、证据、历史 -> 对应 Spec

**治理动作**:
- 定期运行 `npm run audit:steering`
- 审计失败时，优先合并重复、迁移错层、归档历史、删除失效内容
