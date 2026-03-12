# 工作区管理

此目录用于多人协作时的个人上下文管理。

## 目录结构

```
contexts/
├── .active                    # 当前活跃工作区（不提交）
├── README.md                  # 本文件
├── developer1/                # 开发者工作区
│   └── CURRENT_CONTEXT.md    # 个人上下文（不提交）
└── developer2/                # 开发者工作区
    └── CURRENT_CONTEXT.md    # 个人上下文（不提交）
```

## 使用方法

### 创建工作区

```bash
# Linux/macOS
bash .sce/create-workspace.sh <your-name>

# Windows
.sce\create-workspace.bat <your-name>
```

### 切换工作区

```bash
# Linux/macOS
bash .sce/switch-workspace.sh <workspace-name>

# Windows
.sce\switch-workspace.bat <workspace-name>
```

### 查看可用工作区

```bash
# Linux/macOS
ls -1 .sce/contexts | grep -v "^\." | grep -v "README.md"

# Windows
dir /b .sce\contexts | findstr /v "^\." | findstr /v "README.md"
```

## 工作原理

1. **个人上下文存储**：每个人的 CURRENT_CONTEXT.md 存储在自己的工作区目录
2. **自动保存**：切换工作区时，自动保存当前上下文到旧工作区
3. **自动加载**：切换工作区时，自动加载新工作区的上下文到 `steering/CURRENT_CONTEXT.md`
4. **Git 友好**：个人上下文不提交，只提交目录结构

## 注意事项

- ⚠️ 切换工作区前，当前的 `steering/CURRENT_CONTEXT.md` 会被自动保存
- ⚠️ 不要手动编辑 `.sce/contexts/.active` 文件
- ⚠️ 不要直接编辑 `contexts/*/CURRENT_CONTEXT.md`，应该编辑 `steering/CURRENT_CONTEXT.md`

## 为什么不放在 steering/ 下？

AI IDE 会读取 `steering/` 目录下的所有 `.md` 文件作为上下文。如果把工作区放在 `steering/workspaces/` 下，会导致：

- ❌ 所有人的 CURRENT_CONTEXT.md 都被读取
- ❌ 造成上下文污染和混乱
- ❌ AI 无法区分哪个是当前活跃的上下文

因此，工作区必须放在 `contexts/` 目录下，只有当前活跃的上下文才会被复制到 `steering/CURRENT_CONTEXT.md`。

## 版本要求

此功能需要手动管理工作区。如果你想使用 sce 的多工作区管理功能（管理多个项目），请使用：

```bash
sce workspace create <name> [path]  # 需要 sce v1.11.0+
```

注意：这是两个不同的概念：
- **项目内工作区**（本目录）：同一项目，多人协作，每人有自己的上下文
- **sce 多工作区**（`sce workspace`）：管理多个不同的 sce 项目
