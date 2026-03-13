# 115-00 Integration Closeout (2026-03-13)

## Scope

主 Spec `115-00-sce-quality-hardening-program` 完成对四个子 Spec 的统一收敛：

- `115-01-ci-test-trust-hardening`
- `115-02-jest-open-handle-governance`
- `115-03-watch-logs-follow-completion`
- `115-04-doc-link-canonicalization`

## Child Deliverables

### 115-01 CI Test Trust Hardening

- 提供分层测试入口：`test:smoke`、`test:full`、`test:skip-audit`
- 更新发布/文档入口，保证 smoke 与 full 的职责边界明确
- 为主 Spec 提供 `ci-test-trust-contract-v1`

### 115-02 Jest Open Handle Governance

- 清理 watch/helper/CLI timeout 相关资源释放逻辑
- 保持 `test:handles` 作为 open-handle 诊断入口
- 明确禁止重新把 `forceExit` 引回默认 Jest 配置
- 为主 Spec 提供 `jest-open-handle-report-v1`

### 115-03 Watch Logs Follow Completion

- 完成 `sce watch logs --follow` 的持续跟随、文件缺失/轮转处理和退出路径
- 由 watch 集成测试覆盖主行为
- 为主 Spec 提供 `watch-logs-follow-contract-v1`

### 115-04 Doc Link Canonicalization

- 完成 canonical 仓库链接治理
- 保留自动扫描入口，防止历史链接回流
- 为主 Spec 提供 `doc-canonical-link-policy-v1`

## Integration Gate Results

### Collaboration Graph

- `node bin/sce.js collab status 115-00-sce-quality-hardening-program --graph`
- 结论：主从依赖图健康，`115-01`、`115-02`、`115-03`、`115-04` 均已满足完成条件

### Test And Command Gates

- `npm run test:smoke`
  - 结果：7 suites / 87 tests passed
- `npm run test:skip-audit`
  - 结果：8 skipped tests 全部在 allowlist 中
- `npm run test:brand-consistency`
  - 结果：通过，未发现 legacy branding references
- `npm run test:full`
  - 结果：304 suites passed / 3943 tests passed / 8 skipped
- `npm run test:handles`
  - 结果：304 suites passed / 3943 tests passed / 8 skipped
  - 说明：以 `--detectOpenHandles` 运行，未留下未治理句柄

## Additional Fixes During Gate

- 在 `lib/commands/scene.js` 增加 JSON CLI serializer，保留 `-0`
- 修复后重新验证：
  - `npx jest tests/unit/commands/scene-contribute.property.test.js --runInBand`
  - `npx jest tests/unit/commands/scene-contribute.test.js --runInBand`

## Risks And Release Recommendation

- 当前无发布阻塞项
- `test:full` 与 `test:handles` 不应并行执行；并行时可能因资源竞争导致个别长测误超时
- 建议将质量门禁按串行顺序执行：`test:smoke` -> `test:skip-audit` -> `test:brand-consistency` -> `test:full` -> `test:handles`

## Final Recommendation

- 发布建议：`go`
- 回滚点：本轮唯一额外修复集中在 `lib/commands/scene.js` 的 JSON 输出层，若后续发现兼容性问题，可优先回滚该 serializer 变更并保留其余质量硬化交付
