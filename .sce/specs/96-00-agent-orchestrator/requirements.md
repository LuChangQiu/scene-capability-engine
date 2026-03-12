# 需求文档

## 简介

Agent Orchestrator（Agent 编排器）是 sce 的主动调度层，使主控 Agent 能够通过 Kiro IDE 内嵌终端自动启动和管理多个 Codex CLI 子 agent 进程，实现 Spec 的自动化并行执行。当前 sce 已具备完整的多 Agent 协调基础设施（AgentRegistry、TaskLockManager、Coordinator、SpecLifecycleManager 等），但缺少能够自动评估工作量、启动子 agent 进程、分配 Spec 任务、监控执行状态的编排器。本功能填补这一空白。

## 术语表

- **Orchestrator**: 编排器，负责管理子 agent 进程生命周期、任务调度和状态监控的核心引擎
- **AgentSpawner**: Agent 生成器，负责通过 Node.js child_process 启动和管理 Codex CLI 子进程
- **OrchestrationEngine**: 编排引擎，基于依赖图执行批次调度的核心组件
- **Codex_CLI**: OpenAI Codex 命令行工具，以非交互模式（`codex exec`）运行，作为子 agent 后端
- **Spec**: sce 中的功能规格单元，包含 requirements.md、design.md、tasks.md
- **依赖图**: 有向无环图（DAG），描述 Spec 之间的执行依赖关系
- **批次**: 依赖图中同一层级可并行执行的 Spec 集合
- **Bootstrap_Prompt**: 注入给子 agent 的初始化提示词，包含 sce 规范、Spec 路径和 steering 上下文
- **JSON_Lines**: Codex CLI 的 `--json` 模式输出格式，每行一个 JSON 事件对象
- **编排计划**: Orchestrator 生成的执行计划，包含 Spec 列表、依赖关系和批次分组

## 需求

### 需求 1：Codex CLI 子进程启动与管理

**用户故事：** 作为主控 Agent，我希望能够启动和管理 Codex CLI 子进程，以便自动化执行 Spec 任务。

#### 验收标准

1. WHEN 编排器需要执行一个 Spec THEN AgentSpawner SHALL 通过 Node.js child_process.spawn 启动一个 Codex CLI 进程，使用命令格式 `codex exec --full-auto --sandbox danger-full-access "<prompt>"`
2. WHEN 启动 Codex CLI 进程 THEN AgentSpawner SHALL 通过环境变量 CODEX_API_KEY 传递认证凭据
3. WHEN 启动 Codex CLI 进程 THEN AgentSpawner SHALL 添加 `--json` 参数以获取 JSON Lines 格式的结构化输出
4. WHEN 子进程正常退出（exit code 为 0）THEN AgentSpawner SHALL 将该进程标记为 completed 状态
5. WHEN 子进程异常退出（exit code 非 0）THEN AgentSpawner SHALL 将该进程标记为 failed 状态并记录退出码和 stderr 输出
6. WHEN 子进程运行时间超过配置的超时阈值 THEN AgentSpawner SHALL 终止该进程并将其标记为 timeout 状态
7. WHEN AgentSpawner 启动子进程 THEN AgentSpawner SHALL 在 AgentRegistry 中注册该子 agent

### 需求 2：Bootstrap Prompt 构建

**用户故事：** 作为主控 Agent，我希望每个子 agent 启动时获得完整的上下文信息，以便子 agent 能够正确执行 Spec 任务。

#### 验收标准

1. WHEN 构建 Bootstrap Prompt THEN Orchestrator SHALL 包含目标 Spec 的路径信息（`.sce/specs/{specName}/`）
2. WHEN 构建 Bootstrap Prompt THEN Orchestrator SHALL 包含 sce 项目规范和 steering 上下文
3. WHEN 构建 Bootstrap Prompt THEN Orchestrator SHALL 包含明确的任务执行指令（执行 tasks.md 中的任务）
4. THE Bootstrap_Prompt SHALL 使用可配置的模板格式，支持通过 orchestrator.json 自定义

### 需求 3：依赖图构建与批次调度

**用户故事：** 作为主控 Agent，我希望编排器能够分析 Spec 间的依赖关系并按正确顺序调度执行，以便保证执行的正确性和最大并行度。

#### 验收标准

1. WHEN 接收到一组待执行的 Spec 列表 THEN OrchestrationEngine SHALL 构建 Spec 间的依赖图（DAG）
2. WHEN 依赖图中存在环形依赖 THEN OrchestrationEngine SHALL 拒绝执行并报告环形依赖的具体路径
3. WHEN 执行调度 THEN OrchestrationEngine SHALL 将无依赖的 Spec 分组为同一批次并行执行
4. WHEN 一个批次中所有 Spec 执行完成 THEN OrchestrationEngine SHALL 启动下一批次中依赖已满足的 Spec
5. WHILE 执行调度 THEN OrchestrationEngine SHALL 确保同时运行的子 agent 数量不超过配置的最大并行度（max-parallel）
6. WHEN 一个 Spec 执行失败 THEN OrchestrationEngine SHALL 停止依赖链上所有后续 Spec 的调度
7. THE OrchestrationEngine SHALL 与现有 DependencyManager 集成以复用依赖分析能力

### 需求 4：状态监控与进度追踪

**用户故事：** 作为主控 Agent，我希望能够实时了解编排执行的整体进度和每个子 agent 的状态，以便做出调度决策。

#### 验收标准

1. WHILE 编排执行中 THEN Orchestrator SHALL 维护每个子 agent 进程的状态（running、completed、failed、timeout）
2. WHEN Codex CLI 输出 JSON Lines 事件 THEN Orchestrator SHALL 解析事件流以提取进度信息
3. WHEN 子 agent 完成一个 Spec THEN Orchestrator SHALL 更新 SpecLifecycleManager 中该 Spec 的状态
4. WHEN 子 agent 完成一个 Spec THEN Orchestrator SHALL 更新 ContextSyncManager 中的进度信息
5. WHEN 用户查询编排状态 THEN Orchestrator SHALL 返回包含所有 Spec 执行状态、进度百分比和当前批次信息的汇总报告

### 需求 5：错误处理与恢复

**用户故事：** 作为主控 Agent，我希望编排器能够优雅地处理子 agent 失败并支持重试，以便提高执行的可靠性。

#### 验收标准

1. WHEN 子 agent 进程崩溃（非正常退出）THEN Orchestrator SHALL 检测崩溃事件并记录详细错误信息
2. WHEN 子 agent 执行失败且重试次数未达上限 THEN Orchestrator SHALL 自动重试该 Spec 的执行
3. WHEN 子 agent 执行失败且重试次数已达上限 THEN Orchestrator SHALL 将该 Spec 标记为最终失败并停止其依赖链
4. WHEN 子 agent 进程超时 THEN Orchestrator SHALL 强制终止进程并按失败处理
5. WHEN 编排器收到停止信号 THEN Orchestrator SHALL 优雅终止所有运行中的子 agent 进程并释放所有资源
6. WHEN 子 agent 完成后 THEN Orchestrator SHALL 从 AgentRegistry 中注销该子 agent 并释放相关任务锁

### 需求 6：CLI 命令接口

**用户故事：** 作为用户，我希望通过 CLI 命令控制编排器的执行，以便方便地启动、监控和停止编排任务。

#### 验收标准

1. WHEN 用户执行 `sce orchestrate run --specs "<spec列表>" --max-parallel <N>` THEN Orchestrator SHALL 解析 Spec 列表、构建依赖图并开始批次调度执行
2. WHEN 用户执行 `sce orchestrate status` THEN Orchestrator SHALL 显示当前编排的整体进度、各 Spec 状态和活跃子 agent 信息
3. WHEN 用户执行 `sce orchestrate stop` THEN Orchestrator SHALL 停止所有运行中的子 agent 并清理资源
4. IF 用户提供的 Spec 名称不存在 THEN Orchestrator SHALL 报告具体哪些 Spec 未找到并拒绝执行
5. IF 用户指定的 max-parallel 值小于 1 THEN Orchestrator SHALL 报告参数无效并使用默认值

### 需求 7：配置管理

**用户故事：** 作为用户，我希望能够通过配置文件自定义编排器的行为参数，以便适应不同的执行场景。

#### 验收标准

1. THE Orchestrator SHALL 从 `.sce/config/orchestrator.json` 读取配置
2. WHEN 配置文件不存在 THEN Orchestrator SHALL 使用合理的默认值（最大并行度 3、超时 600 秒、最大重试 2 次）
3. THE 配置文件 SHALL 支持以下配置项：agent 后端类型（agentBackend）、最大并行度（maxParallel）、超时时间（timeoutSeconds）、最大重试次数（maxRetries）、API key 环境变量名（apiKeyEnvVar）、bootstrap prompt 模板（bootstrapTemplate）
4. WHEN 配置文件格式无效 THEN Orchestrator SHALL 报告解析错误并回退到默认配置
5. WHEN 配置文件中存在未知字段 THEN Orchestrator SHALL 忽略未知字段并正常加载已知字段

### 需求 8：与现有协调基础设施集成

**用户故事：** 作为系统架构师，我希望编排器与现有的多 Agent 协调基础设施无缝集成，以便复用已有的锁管理、状态机和上下文同步能力。

#### 验收标准

1. WHEN 子 agent 开始执行 Spec THEN Orchestrator SHALL 通过 SpecLifecycleManager 将 Spec 状态转换为 assigned 然后 in-progress
2. WHEN 子 agent 完成 Spec THEN Orchestrator SHALL 通过 SpecLifecycleManager 将 Spec 状态转换为 completed
3. WHEN 启动子 agent THEN Orchestrator SHALL 通过 AgentRegistry 注册子 agent 并维护心跳
4. WHEN 子 agent 执行任务 THEN Orchestrator SHALL 确保通过 TaskLockManager 获取任务锁以保证互斥
5. WHEN 编排状态变更 THEN Orchestrator SHALL 通过 ContextSyncManager 同步进度到 CURRENT_CONTEXT.md
