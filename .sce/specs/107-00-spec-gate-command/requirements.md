# 需求文档

## 简介

为提升 Spec 落地质量，新增 `sce spec gate` 命令，统一检查 mandatory 任务完成度、关键测试命令和文档一致性，输出 go/no-go 建议。

## 术语表

- **Spec_Gate**: Spec 质量闸口命令
- **Mandatory_Check**: mandatory 任务完成检查
- **Test_Check**: 关键测试命令执行检查
- **Doc_Check**: 文档一致性检查（示例与实际参数/字段）

## 需求

### 需求 1：命令接口

**用户故事：** 作为主控 Agent，我希望对指定 Spec 快速执行质量闸口检查。

#### 验收标准

1. THE CLI SHALL 提供 `sce spec gate --spec <name>` 命令
2. THE 命令 SHALL 支持 `--json` 输出
3. THE 命令 SHALL 支持 `--strict`（任一 warning 即 no-go）

### 需求 2：mandatory 检查

**用户故事：** 作为维护者，我希望 gate 能自动识别 tasks.md 的 mandatory 完成度。

#### 验收标准

1. gate SHALL 读取 `tasks.md` 并区分 mandatory 与 optional
2. mandatory 未完成时 gate SHALL 返回 `no-go`
3. 输出 SHALL 列出未完成 mandatory 项目

### 需求 3：测试与文档检查

**用户故事：** 作为发布者，我希望 gate 同时验证关键测试和文档口径，减少发布后回归。

#### 验收标准

1. gate SHALL 支持执行预设测试命令列表（来自 spec 或参数）
2. 任一关键测试失败时 gate SHALL 返回 `no-go`
3. gate SHALL 支持文档字段一致性检查（如 Moqui 配置字段）

### 需求 4：结论与报告

**用户故事：** 作为项目负责人，我希望 gate 输出可审计结论与建议。

#### 验收标准

1. gate SHALL 输出结论：`go` / `conditional-go` / `no-go`
2. 输出 SHALL 包含 failed checks、warnings、next actions
3. 支持 `--out <path>` 将报告落盘
