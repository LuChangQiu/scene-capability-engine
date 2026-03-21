# 需求文档

## 简介

本 Spec 定义 SCE 面向本地或嵌入式 Agent 的过程检查点语义合同，目标是在不要求外部 server 的前提下，让 IDE、CLI、自动化宿主都能稳定消费统一的规划、设计、执行、验证、阻断与交接信号。

该合同补充而不替代现有 `scene > spec > task > event` 与 `studio events` 语义；宿主不应再为本地 Agent 发明一套平行事件模型。

## 需求

### 需求 1：统一本地 Agent 过程检查点语义

**用户故事：** 作为宿主 IDE、CLI 或嵌入式工具容器，我希望本地 Agent 在执行过程中输出稳定的语义检查点，而不是只剩最终成功或失败。

#### 验收标准

1. THE SCE contract SHALL 定义本地 Agent 可输出的标准检查点类型，至少包括 `intake`、`plan`、`design`、`command`、`file_change`、`evidence`、`blocker`、`next_action`、`handoff`、`done`
2. THE contract SHALL 为每类检查点定义最小必填字段与可选字段
3. THE contract SHALL 保持与 `scene > spec > task > event` 语义链对齐
4. THE contract SHALL 支持 IDE 内嵌 Agent、CLI 子进程 Agent 与其他本地宿主，而不是绑定某一个运行容器

### 需求 2：检查点字段与任务语义对齐

**用户故事：** 作为监管者，我希望过程反馈能直接映射到 spec/task 视图，而不是额外做一层宿主私有翻译。

#### 验收标准

1. THE contract SHALL 定义可选任务字段映射，如 `title_norm`、`raw_request`、`goal`、`sub_goals`、`acceptance_criteria`、`confidence`、`needs_split`
2. WHEN Agent 输出 `command`、`file_change`、`evidence`、`blocker` THEN 其字段 SHALL 可直接映射到任务执行证据
3. WHEN Agent 输出 `blocker` THEN contract SHALL 支持 `next_action` 或等价恢复建议
4. THE contract SHALL 明确哪些字段直接复用现有 `studio task envelope` / `feedback_model` 语义，避免宿主维护第二套长期任务投影

### 需求 3：宿主无关

**用户故事：** 作为 SCE 维护者，我希望该合同服务于多 IDE、多 CLI，而不是绑定 MagicBall 某一个实现。

#### 验收标准

1. THE contract SHALL 仅定义语义模型与示例，不绑定 Electron、浏览器或某个具体 UI
2. THE contract SHALL 允许不同宿主采用 stdout 行协议、jsonl、事件总线、进程内回调等不同传输方式
3. THE contract SHALL 不要求引入外部 server 才能使用
4. THE contract SHALL 不假设宿主一定支持 MCP、SSE 或 websocket

### 需求 4：阻断与交付清晰可监管

**用户故事：** 作为项目监管者，我希望调研类、实现类、交付类请求在被阻断时都能看到原因、影响与下一步。

#### 验收标准

1. WHEN Agent 被权限、环境、依赖或门禁阻断 THEN SHALL 输出结构化 `blocker`
2. THE `blocker` SHALL 至少包含阻断摘要与恢复建议
3. WHEN Agent 完成阶段性交付 THEN SHALL 支持 `done` 与 `handoff`，便于人机交接与多 Agent 协作

### 需求 5：不得再造平行事件真相

**用户故事：** 作为 SCE 维护者，我希望本地 Agent 检查点合同复用既有治理链路，而不是又引入一套独立“本地 Agent 事件系统”。

#### 验收标准

1. THE contract SHALL 明确本地 Agent 检查点是对现有 `scene/spec/task/event` 的补充映射，而不是第二真相源
2. THE contract SHALL 说明与 `sce studio events`、任务反馈、timeline 视图之间的关系
3. THE contract SHALL NOT要求宿主额外持久化一套平行长期状态才能使用该合同
