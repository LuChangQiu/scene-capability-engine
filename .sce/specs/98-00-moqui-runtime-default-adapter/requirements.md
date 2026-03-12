# 需求文档

## 简介

当前运行时默认 ERP handler 仍为 `builtin.erp-sim`，导致 Moqui 适配器虽然存在，但默认执行链路不是“真连后端”。本 Spec 将运行时默认行为切换为可自动接入 Moqui，并统一配置语义与文档示例。

## 术语表

- **Default_ERP_Handler**: 运行时对 `spec.erp.*` ref 的默认处理器
- **Auto_Wiring**: 在满足条件时自动注册 `moqui.adapter`
- **Legacy_Config**: 顶层 `username/password` 的旧配置格式
- **Canonical_Config**: `credentials.username/password` 的标准配置格式

## 需求

### 需求 1：默认 Moqui 接线

**用户故事：** 作为场景执行者，我希望在配置存在时默认走 Moqui 真适配器，以便无需手工插件接线。

#### 验收标准

1. WHEN 运行时检测到有效 Moqui 配置 THEN Default_ERP_Handler SHALL 使用 `moqui.adapter`
2. WHEN Moqui 配置缺失或非法 THEN 运行时 SHALL 回退到 `builtin.erp-sim` 且输出可观测 warning
3. THE 默认接线 SHALL 同时覆盖 `scene run` 与 `scene doctor` 的执行路径

### 需求 2：配置兼容与收敛

**用户故事：** 作为已有用户，我希望旧配置仍可运行，同时逐步迁移到标准格式。

#### 验收标准

1. THE 配置加载器 SHALL 接受 Canonical_Config
2. WHEN 使用 Legacy_Config THEN 系统 SHALL 自动归一到 Canonical_Config 并给出弃用警告
3. THE 配置验证错误 SHALL 明确指出缺失字段路径（如 `credentials.username`）

### 需求 3：文档口径一致

**用户故事：** 作为使用者，我希望文档示例和真实校验一致，避免误配置。

#### 验收标准

1. THE Moqui 配置示例 SHALL 使用 `credentials.username/password`
2. THE `scene connect/discover/extract` 文档示例 SHALL 与实际支持参数一致
3. THE 文档更新范围 SHALL 包括 `docs/scene-runtime-guide.md`、`docs/command-reference.md`、`README.md`、`README.zh.md`

### 需求 4：ERP Readiness 可见性

**用户故事：** 作为运维人员，我希望 dry_run 时看到 ERP 适配器可用性结果，以便快速定位接线问题。

#### 验收标准

1. WHEN 场景包含 `spec.erp.*` 或 `moqui.*` binding THEN dry_run SHALL 输出 adapter readiness
2. WHEN Moqui 不可达 THEN readiness reason SHALL 为 `moqui-unreachable`
3. WHEN 鉴权失败 THEN readiness reason SHALL 为 `moqui-auth-failed`

### 需求 5：Scene 命令验收矩阵

**用户故事：** 作为 SCE 使用者，我希望默认接线变更后 Scene 命令行为清晰可验证。

#### 验收标准

1. WHEN 执行 `scene connect` THEN 配置归一逻辑 SHALL 生效并正确报告连接结果
2. WHEN 执行 `scene discover` THEN 配置归一逻辑 SHALL 生效且现有 entities/services/screens 行为不回归
3. WHEN 执行 `scene extract` THEN 配置归一逻辑 SHALL 生效且提取流程不因默认接线变更而失败
4. WHEN 执行 `scene run` 或 `scene doctor` 且包含 ERP binding THEN 结果 SHALL 明确展示实际使用的 handler 与 readiness 状态
