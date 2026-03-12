# kiro-spec-engine v1.24.1 发布说明

## 📦 离线安装包

由于 GitHub 账号限制，本次发布提供离线安装包。

### 文件清单

1. **kiro-spec-engine-1.24.1.tgz** (709 KB)
   - npm 标准安装包
   - 包含所有源代码和依赖清单

2. **sce-v1.24.1-offline.zip** (725 KB)
   - 完整离线安装包
   - 包含 .tgz 文件和所有安装文档

### 安装方法

#### 方法 1: 使用 .tgz 文件（推荐）

```bash
npm install -g kiro-spec-engine-1.24.1.tgz
```

#### 方法 2: 使用压缩包

```bash
# 1. 解压 sce-v1.24.1-offline.zip
# 2. 进入解压目录
# 3. 运行安装命令
npm install -g kiro-spec-engine-1.24.1.tgz
```

### Windows 用户注意事项

如果遇到 "npm 命令不可用" 错误：

```powershell
# 临时添加 Node.js 到 PATH
$env:Path = "C:\Program Files\nodejs;$env:Path"

# 然后执行安装
npm install -g kiro-spec-engine-1.24.1.tgz
```

## 🎯 新功能

### 1. 嵌套 Git 仓库支持 (Spec 25-00)

- ✅ 自动发现嵌套的 Git 子仓库
- ✅ 支持多级嵌套结构
- ✅ 父子关系追踪
- ✅ CLI 标志: `--nested` / `--no-nested`

**使用示例**:
```bash
# 扫描所有嵌套仓库（默认）
sce repo init

# 只扫描顶层仓库
sce repo init --no-nested
```

### 2. 用户知识管理系统 (Spec 34-00)

- ✅ 知识条目管理（CRUD）
- ✅ 全文搜索功能
- ✅ 多种内容类型支持
- ✅ 统计和分析

**使用示例**:
```bash
# 初始化知识库
sce knowledge init

# 添加知识条目
sce knowledge add

# 搜索知识
sce knowledge search "关键词"

# 查看统计
sce knowledge stats
```

### 3. 跨平台路径处理改进

- ✅ 修复 Unix 系统上的路径识别问题
- ✅ 改进 Windows/Unix 路径兼容性
- ✅ 所有测试通过（1689 tests）

## 📊 测试状态

- **总测试数**: 1689
- **通过率**: 100%
- **覆盖率**: >90% 行覆盖，>85% 分支覆盖

## 📖 文档

- `OFFLINE_INSTALL.md` - 离线安装详细指南
- `INSTALL_OFFLINE.txt` - 快速安装说明
- `docs/multi-repo-management-guide.md` - 多仓库管理指南
- `docs/knowledge-management-guide.md` - 知识管理指南

## 🔧 技术细节

### 依赖项

```json
{
  "chalk": "^4.1.2",
  "chokidar": "^3.5.3",
  "cli-table3": "^0.6.5",
  "commander": "^9.0.0",
  "fs-extra": "^10.0.0",
  "inquirer": "^8.2.0",
  "js-yaml": "^4.1.1",
  "minimatch": "^10.1.1",
  "path": "^0.12.7",
  "semver": "^7.5.4",
  "simple-git": "^3.30.0"
}
```

### 系统要求

- Node.js >= 16.0.0
- Python >= 3.8.0 (可选，用于 Ultrawork 工具)

## 🐛 已知问题

无重大已知问题。

## 📝 升级说明

从旧版本升级：

```bash
# 卸载旧版本
npm uninstall -g kiro-spec-engine

# 安装新版本
npm install -g kiro-spec-engine-1.24.1.tgz

# 验证版本
sce --version
```

## 🙏 致谢

感谢所有用户的反馈和支持！

## 📧 支持

- GitHub: https://github.com/heguangyong/scene-capability-engine
- 文档: docs/README.md
- 问题反馈: GitHub Issues

---

**发布日期**: 2026-02-03  
**版本**: v1.24.1  
**构建**: 成功  
**测试**: 全部通过
