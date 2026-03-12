# Design

## Overview

增加一层位于目录合规之上的“内容合规”：

- `manifest.yaml` 提供 steering 治理预算与层级规则
- `scripts/steering-content-audit.js` 读取 manifest 并执行内容审计
- `docs/steering-governance.md` 承接详细治理说明
- `.github/workflows/steering-hygiene.yml` 按周调度审计

## Audit Rules

1. File budget
   - 限制各 steering 文件行数与标题数
2. History budget
   - 稳定层不允许保留版本脚注或历史流水
3. Layer purity
   - 稳定层不允许混入 Spec 引用与 checklist
4. Context freshness
   - `CURRENT_CONTEXT.md` 版本应与 `package.json` 一致
5. Mechanism reuse
   - 出现 `错题/错题本` 等别名时，提醒复用 `errorbook`

## Output

脚本输出 JSON 与控制台摘要，包含：

- metrics
- violations
- severity
- relocation suggestion

## Enforcement

- `npm run audit:steering` 用于本地与 CI
- `prepublishOnly` 中纳入该审计
- `test.yml` 在常规 CI 中执行
- `steering-hygiene.yml` 每周定期执行
