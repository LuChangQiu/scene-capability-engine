# 设计文档

## 设计目标

- 将 SCE 对本地或嵌入式 Agent 的约束收敛为“语义合同”，不侵入具体宿主实现。
- 让宿主只做传输与展示适配，不再各自发明一套过程事件语义。
- 与现有 `scene / spec / task / event` 结构保持一致，便于上层治理与多 Agent 协作。
- 明确该合同与现有 `studio events`、任务反馈和 timeline 的映射边界，避免平行真相。

## 设计概览

### 1. 语义层与传输层分离

SCE 负责定义检查点类型、字段和示例：

- `intake`
- `plan`
- `design`
- `command`
- `file_change`
- `evidence`
- `blocker`
- `next_action`
- `handoff`
- `done`

宿主负责决定如何承载：

- stdout 单行前缀协议
- jsonl
- SSE / websocket
- 进程内回调

该合同只定义检查点语义，不定义宿主的传输协议必须长什么样。

### 2. 标准字段

最小公共字段建议：

- `type`
- `requestId`
- `sceneId`
- `specId`
- `taskRef`
- `summary`
- `status`
- `next_action`
- `handoff`

任务语义字段建议：

- `title_norm`
- `raw_request`
- `goal`
- `sub_goals`
- `acceptance_criteria`
- `confidence`
- `needs_split`

执行证据字段建议：

- `command`
- `file_path`
- `evidence`
- `error_bundle`
- `feedback_model`

这些字段应优先映射到现有 task envelope / feedback model，而不是单独持久化为另一套本地 Agent 状态。

### 3. 与任务链路对齐

- `intake / plan / design` 主要服务任务受理与方案收敛
- `command / file_change` 主要服务执行投影
- `evidence / done` 主要服务验证与结果归档
- `blocker / next_action / handoff` 主要服务恢复、监管与协作

### 4. 与现有 SCE 链路的关系

- `scene/spec/task/event` 仍然是 canonical 治理链
- 本地 Agent 检查点是宿主可观察的过程语义层
- `studio events` 可承载或投影这类检查点，但不要求必须新建第二类持久化设施
- timeline、task feedback、handoff 视图应复用这套语义映射，而不是各自重新解释

### 5. 宿主落地边界

SCE 不负责：

- Electron 面板布局
- CLI 进程托管
- 日志滚动与事件折叠策略

SCE 负责：

- 语义字段与枚举稳定
- 示例输出
- 与 spec/task/event 链的一致性

## 示例

```json
{
  "type": "blocker",
  "summary": "缺少写入授权租约",
  "next_action": "申请 auth lease 后重试",
  "error_bundle": "write auth missing"
}
```
