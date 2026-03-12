# 需求文档

## 简介

当前 `orchestrate stop` 主要通过修改状态文件发出“停止信号”，缺乏对运行中编排实例的可靠控制通道。该 Spec 引入运行期控制机制，确保 stop 能真实终止子进程。

## 术语表

- **Run_ID**: 单次编排运行唯一标识
- **Control_Channel**: 控制通道，用于 stop/status 与活跃编排实例通信
- **Runtime_Stop**: 运行期真实停止动作（调用 engine.stop + spawner.killAll）

## 需求

### 需求 1：可靠停止

**用户故事：** 作为操作员，我希望 stop 命令真正停止正在运行的编排，而不是仅修改状态文件。

#### 验收标准

1. WHEN 执行 `sce orchestrate stop` 且存在活跃 Run_ID THEN 系统 SHALL 触发 Runtime_Stop
2. Runtime_Stop SHALL 调用 `OrchestrationEngine.stop()` 并终止所有 running agent
3. 停止完成后状态 SHALL 转为 `stopped`

### 需求 2：运行实例识别

**用户故事：** 作为主控 Agent，我希望在多次 run 场景中精确停止目标实例。

#### 验收标准

1. `orchestrate run` SHALL 生成并持久化 Run_ID
2. `orchestrate status` SHALL 展示当前 Run_ID
3. `orchestrate stop` SHALL 支持 `--run-id <id>` 精确停止

### 需求 3：异常与幂等

**用户故事：** 作为维护者，我希望 stop 操作在异常场景下可预测且幂等。

#### 验收标准

1. WHEN 无活跃实例 THEN stop SHALL 返回可读提示且不报错
2. WHEN 重复 stop THEN 第二次操作 SHALL 幂等成功
3. WHEN stop 失败 THEN SHALL 返回结构化错误并保留诊断信息
