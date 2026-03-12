# 需求文档

## 简介

本 Spec 补齐 Moqui 适配器在服务与实体维度相对 `331-poc` 的关键缺口，重点修复 job-status 路径兼容与实体高级接口能力。

## 术语表

- **Job_Status_Path**: 异步任务状态查询路径
- **Entity_Definition**: 实体定义查询能力
- **Entity_Relationships**: 实体关系查询能力
- **Entity_Batch**: 实体批量操作能力
- **Entity_Related_Query**: 实体关联数据查询能力

## 需求

### 需求 1：服务异步状态路径兼容

**用户故事：** 作为场景开发者，我希望异步服务状态查询路径与基线一致，避免 404。

#### 验收标准

1. WHEN 执行 `job-status` THEN 主路径 SHALL 为 `/api/v1/services/jobs/{jobId}`
2. WHEN 主路径返回不可用（如 404）THEN 适配器 MAY 回退 legacy 路径 `/api/v1/services/{service}/jobs/{jobId}`
3. THE 执行结果 SHALL 保持统一 `Execution_Result` 格式

### 需求 2：实体高级接口支持

**用户故事：** 作为模板抽取与诊断用户，我希望直接访问实体定义、关系、批量和关联查询接口。

#### 验收标准

1. THE 适配器 SHALL 支持实体 definition 查询
2. THE 适配器 SHALL 支持实体 relationships 查询
3. THE 适配器 SHALL 支持实体 batch 操作
4. THE 适配器 SHALL 支持实体 related 查询

### 需求 3：binding ref 语法扩展

**用户故事：** 作为 scene 作者，我希望通过稳定 ref 语法调用新能力。

#### 验收标准

1. THE 适配器 SHALL 兼容现有 `moqui.{Entity}.{op}` 语法
2. THE 适配器 SHALL 扩展支持显式语法（例如 `moqui.entity.{Entity}.definition`）
3. WHEN 必填参数缺失（如 related 查询缺少 id）THEN 返回结构化错误而非拼接非法 URL

### 需求 4：错误与重试一致性

**用户故事：** 作为维护者，我希望新增能力遵守现有重试/错误语义。

#### 验收标准

1. THE 新增接口 SHALL 复用 MoquiClient 的网络重试策略
2. THE 新增接口失败时 SHALL 保留原始错误 code/message/details
3. THE 新增接口 SHALL 不破坏已有 CRUD/invoke 行为

### 需求 5：Scene 命令验收矩阵

**用户故事：** 作为 SCE 使用者，我希望新增 service/entity 能力在 scene 命令中可稳定使用。

#### 验收标准

1. WHEN `scene run` 执行包含新增 entity/service ref 的 manifest THEN SHALL 返回可解析的标准结果
2. WHEN `scene doctor` 对包含新增 ref 的场景执行诊断 THEN SHALL 不出现 ref 解析错误
3. WHEN `scene discover` 执行既有类型发现 THEN 新增能力 SHALL NOT 破坏既有汇总行为
