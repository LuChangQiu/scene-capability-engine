# 环境配置

**项目**: scene-capability-engine (`sce`)  
**类型**: Node.js CLI + npm package  
**环境**: Windows / PowerShell 为主，Node.js 16+，Python 3.8+，AI IDE  
**仓库**: https://github.com/heguangyong/scene-capability-engine

**核心目录**:
- `.sce/specs/`：Spec 与交付证据
- `.sce/steering/`：长期规则、环境、当前上下文
- `.sce/tools/`：辅助工具与自动化

**发布规则**:
- 普通 `git push` 不会发版；只有推送 `v*` tag 才会触发 `.github/workflows/release.yml`
- release workflow 会执行 `npm publish --access public`，依赖仓库 Secret `NPM_TOKEN`
- 发版前必须先递增 `package.json.version`

**steering 治理规则**:
- 详细治理标准见 `docs/steering-governance.md`
- 日常审计命令：`npm run audit:steering`
- 计划内周期：每周一次；额外触发：发布前、重大 Spec 收尾后、接管老项目后
