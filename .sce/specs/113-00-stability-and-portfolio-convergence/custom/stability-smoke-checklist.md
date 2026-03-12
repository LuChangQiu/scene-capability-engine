# Stability Smoke Checklist

## 1. 单元测试

- [ ] 执行 `npx jest tests/unit/governance/archive-tool.test.js`
- [ ] 确认新增回落策略测试通过

## 2. 文档治理状态

- [ ] 执行 `node bin/scene-capability-engine.js docs diagnose`
- [ ] 结果应为 `Project is compliant`

## 3. 全局状态回归

- [ ] 执行 `node bin/scene-capability-engine.js status --verbose`
- [ ] 确认 `Document Compliance: ✅ Compliant`

## 4. 人工抽查

- [ ] 任意选择一个迁移过的 Spec（例如 90 或 95）
- [ ] 确认存在 `custom/.config.sce`
- [ ] 确认不存在根目录 `.config.sce`

