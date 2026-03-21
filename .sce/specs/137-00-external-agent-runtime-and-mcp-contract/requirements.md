# 需求文档

## 简介

本 spec 定义 SCE 如何为外部或嵌入式 agent runtime 提供统一接入契约。首批目标执行端应覆盖 IDE 内嵌的 `Codex CLI`、`Claude Code` 等 agent runtime，以及未来支持 MCP 的其他 runtime；合同本身必须保持供应商中立。

SCE 继续作为场景能力引擎，负责 `scene/spec/task/event`、project routing、lease、安全边界与治理投影；外部 agent 通过 canonical session envelope 与统一工具合同使用这些能力。MCP 是可选绑定方式之一，但不是主协议前提。

该 spec 保留为总纲性合同定义；实际落地应拆分为更小的 rollout 子 spec，避免把 tool surface、session envelope、lease-aware write、occupancy 作为一个盲改式大规格直接实现。

## 术语表

- **External_Agent_Runtime**: 外部或嵌入式 agent 执行时，例如 Codex CLI、Claude Code、未来其他 agent server / local runtime
- **Agent_Tool_Surface**: SCE 暴露给外部 agent 的标准工具集合
- **MCP_Binding**: 当 runtime 支持 MCP 时，对 Agent_Tool_Surface 的一种承载绑定
- **Session_Envelope**: 外部 agent 的启动、进度、完成、失败等 canonical 事件包
- **Lease_Aware_Write**: 受 auth lease / scope lease / project route 约束的写入型工具
- **Occupancy**: 外部 agent 对 scene/spec/task 或项目 lane 的占位与监管信息

## 需求

### 需求 1：供应商中立的外部 agent 接入合同

**用户故事：** 作为 SCE，我希望外部 agent 都通过统一合同接入，而不是为单一供应商写死协议，以便同时支持 IDE、CLI 与多个 runtime。

#### 验收标准

1. WHEN 外部 agent 接入 SCE THEN engine SHALL 提供 vendor-neutral contract，而不是把 OpenHands 私有字段直接上升为 engine 主协议
2. WHEN 新的外部 agent runtime 接入 THEN contract SHALL 允许复用同一组 session / project / lease / event 语义
3. THE contract SHALL 明确区分 read-only tool 与 lease-aware write tool

### 需求 2：统一工具合同与可选 MCP 绑定

**用户故事：** 作为外部 agent，我希望通过统一工具合同使用 SCE 的场景能力，以便在执行时获得规范的 scene/spec/task/project 能力接口；当 runtime 支持 MCP 时，可复用同一语义绑定。

#### 验收标准

1. WHEN 外部 agent 连接 SCE THEN engine SHALL 暴露 canonical tool surface
2. THE tool surface SHALL 至少覆盖：
   - scene/spec/task/event 查询
   - triad 文档读取
   - project routing / caller context
   - lease 查询与写入能力判断
   - task/event/handoff 追加或更新
3. WHEN runtime 支持 MCP THEN engine SHALL 允许通过 MCP 绑定暴露该 tool surface
4. WHEN runtime 不支持 MCP THEN adapter/runtime SHALL 仍可通过进程内调用、CLI 桥接或其他 vendor-neutral 方式复用同一语义合同
5. WHEN tool 属于写入类 THEN engine SHALL 强制校验 auth lease、scope lease 与 project route

### 需求 3：外部 agent session envelope

**用户故事：** 作为 IDE/CLI 适配端，我希望 SCE 为外部 agent 提供统一的事件包格式，以便把任意 backend 的执行过程稳定挂回 scene/spec/task/event 看板。

#### 验收标准

1. WHEN 外部 agent 启动一个执行会话 THEN engine SHALL 生成 canonical session identity
2. WHEN 外部 agent 上报进度 THEN engine SHALL 接受并输出统一的 progress envelope
3. THE envelope SHALL 至少包含：
   - sessionId / requestId / agentId
   - sceneId / specId / taskRef / projectId
   - stage / status / summary / reasonCode
   - optional raw payload reference
4. WHEN 外部 agent 完成或失败 THEN engine SHALL 输出 canonical done / failed envelope，而不是仅返回供应商原始日志

### 需求 4：项目路由与 caller context

**用户故事：** 作为外部 agent，我希望在多项目模式下获得明确的 caller context 与 project target resolution，以便不污染错误项目。

#### 验收标准

1. WHEN 外部 agent 发起执行 THEN engine SHALL 支持显式 caller context
2. WHEN engine 完成项目目标解析 THEN response SHALL echo resolved project identity、workspace identity 与 resolution status
3. WHEN 目标项目 unresolved 或 ambiguous THEN engine SHALL 返回 machine-readable reason code 与 candidate 信息

### 需求 5：Occupancy 与监管投影

**用户故事：** 作为 IDE，我希望知道外部 agent 当前占用了哪些项目/场景/规格/任务，以便在多 agent 模式中正确展示协作和监管信息。

#### 验收标准

1. WHEN 外部 agent 承接执行 THEN engine SHALL 记录 occupancy 信息
2. WHEN occupancy 变化 THEN engine SHALL 将其纳入监督投影
3. THE occupancy projection SHALL 至少包含 agent backend、scope、project、session status 与更新时间

### 需求 6：禁止把供应商私有协议抬升为主协议

**用户故事：** 作为 SCE 维护者，我希望外部 runtime 合同以稳定语义为中心，而不是重新走回某个供应商优先的路径。

#### 验收标准

1. THE canonical contract SHALL NOT 使用 `openhands_*`、`codex_*`、`claude_*` 之类供应商私有字段命名作为 engine 主 schema
2. THE contract SHALL 优先定义 runtime-neutral 的 session、tool、lease、project、occupancy 语义
3. Vendor-specific adapter sample MAY 存在，但 SHALL 位于示例或适配层，而不是 engine 主协议定义

## 非目标

1. 本 spec 不定义任何供应商 GUI、ACP 或 IDE 专属交互层。
2. 本 spec 不把 IDE 专属布局和样式固化到 engine。
3. 本 spec 不要求 engine 直接托管第三方前端界面。
