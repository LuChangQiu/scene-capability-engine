# 需求文档

## 简介

本 Spec 将 `331-poc` 的 API 目录发现与监控接口引入 Moqui 适配器与 discover 流程，补齐 `/api/v1`、`/catalog`、`/routes`、`/tags`、`/methods`、`/ready`、`/metrics` 等能力。

## 术语表

- **API_Index**: `GET /api/v1`
- **API_Catalog**: `GET /api/v1/catalog`
- **API_Routes**: `GET /api/v1/routes`
- **Monitoring_Ready**: `GET /api/v1/ready`
- **Monitoring_Metrics_JSON**: `GET /api/v1/metrics`
- **Monitoring_Metrics_Text**: `GET /metrics`

## 需求

### 需求 1：API 目录能力接入

**用户故事：** 作为集成开发者，我希望通过 binding 直接访问 API 目录，以便快速发现接口。

#### 验收标准

1. THE 适配器 SHALL 支持 `moqui.api.index`、`moqui.api.catalog`、`moqui.api.routes`
2. THE 适配器 SHALL 支持 `moqui.api.tags`、`moqui.api.methods`、`moqui.api.search`
3. WHEN 目录接口返回成功 THEN 结果 SHALL 映射到标准 `Execution_Result`

### 需求 2：监控能力接入

**用户故事：** 作为运维人员，我希望在 scene 流程内读取 ready/metrics。

#### 验收标准

1. THE 适配器 SHALL 支持 `moqui.monitor.ready`
2. THE 适配器 SHALL 支持 `moqui.monitor.metrics-json`
3. THE 适配器 SHALL 支持 `moqui.monitor.metrics`

### 需求 3：discover 命令扩展

**用户故事：** 作为使用者，我希望 `scene discover` 能输出 API 与 monitoring 摘要。

#### 验收标准

1. `scene discover --type` SHALL 支持 `api` 与 `monitoring`
2. WHEN 未指定 `--type` THEN summary SHALL 包含 entities/services/screens/api/monitoring
3. IF 某类发现失败 THEN discover SHALL 输出 partial result + warning，不中断全部汇总

### 需求 4：Scene 命令验收矩阵

**用户故事：** 作为 SCE 使用者，我希望 API/Monitoring 能力在 scene 命令层具备一致行为。

#### 验收标准

1. WHEN `scene run` 执行包含 `moqui.api.*` 或 `moqui.monitor.*` ref 的 manifest THEN SHALL 返回标准结果
2. WHEN `scene doctor` 诊断包含上述 ref 的场景 THEN SHALL 不出现 ref 解析错误
3. WHEN `scene discover` 执行全量 summary THEN SHALL 包含 api 与 monitoring 的状态与统计信息
