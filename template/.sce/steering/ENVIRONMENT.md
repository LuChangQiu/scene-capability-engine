# 项目环境配置（模板）

- **项目**: [TODO: 项目名称]
- **类型**: [TODO: 项目类型]
- **技术栈**: [TODO: 核心技术栈]
- **环境**: [TODO: 本地系统 / Shell / Node / Python / IDE]
- **仓库**: [TODO: Git 仓库地址]

**核心目录**:
- `.sce/specs/`
- `.sce/steering/`
- `.sce/tools/`

**发布规则**:
- [TODO: 是否使用 GitHub Actions / 其他 CI]
- [TODO: 发版是否由 tag 触发]
- [TODO: 发布前必须通过哪些门禁]

**steering 治理**:
- 详细规范放项目文档，不要堆在 steering 本身
- 周期性运行 `npm run audit:steering`
