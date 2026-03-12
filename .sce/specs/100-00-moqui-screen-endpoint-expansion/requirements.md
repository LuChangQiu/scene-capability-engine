# 需求文档

## 简介

本 Spec 补齐屏幕能力接口：definition/forms/widgets/render，支持更完整的屏幕结构发现与调试。

## 术语表

- **Screen_Definition_By_Query**: `GET /api/v1/screens/definition?path=...`
- **Screen_Forms**: `GET /api/v1/screens/forms?path=...`
- **Screen_Widgets**: `GET /api/v1/screens/widgets?path=...`
- **Screen_Render**: `GET /api/v1/screens/render?path=...`

## 需求

### 需求 1：屏幕扩展接口

**用户故事：** 作为场景作者，我希望获取屏幕 forms/widgets/render，以便分析 UI 结构。

#### 验收标准

1. THE 适配器 SHALL 支持屏幕 definition by query
2. THE 适配器 SHALL 支持屏幕 forms 查询
3. THE 适配器 SHALL 支持屏幕 widgets 查询
4. THE 适配器 SHALL 支持屏幕 render 查询

### 需求 2：binding ref 语法

**用户故事：** 作为 scene 作者，我希望通过统一 ref 调用屏幕扩展接口。

#### 验收标准

1. THE 适配器 SHALL 保留 `moqui.screen.catalog` 与 `moqui.screen.{Path}`
2. THE 适配器 SHALL 增加 `moqui.screen.definition`、`moqui.screen.forms`、`moqui.screen.widgets`、`moqui.screen.render`
3. WHEN 使用 query 类接口且 `payload.path` 缺失 THEN 返回结构化错误

### 需求 3：结果语义一致性

**用户故事：** 作为维护者，我希望新增接口返回与现有执行结果一致。

#### 验收标准

1. THE 新增屏幕接口 SHALL 返回标准 `Execution_Result`
2. THE 渲染接口返回内容 SHALL 保留 `data.contentType` 与 `data.html` 等字段
3. THE 新增能力 SHALL 不影响现有 screen catalog 与 definition(path param) 行为

### 需求 4：Scene 命令验收矩阵

**用户故事：** 作为 SCE 使用者，我希望屏幕扩展接口可在 scene 命令中稳定执行。

#### 验收标准

1. WHEN `scene run` 执行包含 screen 扩展 ref 的 manifest THEN SHALL 返回标准结果
2. WHEN `scene doctor` 诊断包含 screen 扩展 ref 的场景 THEN SHALL 不出现解析或构建错误
3. WHEN `scene discover --type screens` THEN 新增能力 SHALL NOT 破坏原有 screens 发现能力
