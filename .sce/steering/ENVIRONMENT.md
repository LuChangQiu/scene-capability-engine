# 环境配置

**项目**: scene-capability-engine (sce) - Node.js CLI + npm 包  
**环境**: Windows (cmd) | Python 3.8+ | AI IDE  
**仓库**: https://github.com/heguangyong/scene-capability-engine

**目录**: `.sce/specs/` (Spec) | `.sce/steering/` (规则) | `.sce/tools/` (工具)

**发布**: 更新版本 → CHANGELOG → 提交 → `git tag vX.Y.Z` → `git push origin vX.Y.Z` → GitHub Actions `Release` workflow 自动发布

**发布触发规则**:
- 普通 `git push` 不会发版；仅 `push` 符合 `v*` 的 tag 才会触发 `.github/workflows/release.yml`
- workflow 内会执行 `npm publish --access public`，依赖仓库 Secret `NPM_TOKEN`
- 发版前必须先递增 `package.json.version`，否则 npm 会因版本已存在而拒绝发布
- 若只 push commit、不 push tag，本项目只会走测试流程，不会发布 npm 包或 GitHub Release

---

v8.0 | 2026-02-05 | 精简 75%
