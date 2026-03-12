# 需求文档

## 简介

当多个 AI Agent 并行使用 kiro-spec-engine (sce) 驱动同一项目时，会产生资源竞争和数据冲突问题。本功能为 sce 引入多 Agent 并行协调能力，包括 Agent 注册与心跳、任务级细粒度锁、无冲突状态更新、Git 分支策略、Steering 文件冲突避免以及可选的中央协调器。所有新增能力必须向后兼容单 Agent 模式，并以渐进式可选增强的方式提供。

## 术语表

- **Agent**: 一个独立运行的 AI 实例，通过 sce CLI 或 API 驱动项目开发
- **Agent_Registry**: Agent 注册表，记录所有活跃 Agent 的元数据（`agent-registry.json`）
- **Heartbeat**: Agent 定期发送的心跳信号，用于检测 Agent 是否存活
- **Task_Lock**: 任务级锁，保护单个任务的并发访问
- **Task_Status_Store**: 任务状态存储，管理 tasks.md 中各任务的状态信息
- **Coordinator**: 可选的中央协调器，负责任务分配和进度汇总
- **MachineIdentifier**: 现有的机器唯一标识系统，基于 hostname + UUID
- **Agent_ID**: Agent 唯一标识，格式为 `{machineId}:{instanceIndex}`，支持同一机器多实例
- **Steering_File**: `.sce/steering/` 目录下的配置文件，如 CURRENT_CONTEXT.md
- **Agent_Branch**: Agent 专属 Git 分支，格式为 `agent/{agentId}/{specName}`
- **Merge_Coordinator**: 合并协调器，负责检测和协调 Git 分支合并

## 需求

### 需求 1：Agent 注册与生命周期管理

**用户故事：** 作为项目管理者，我希望系统能够跟踪所有活跃的 Agent 实例，以便了解当前有哪些 Agent 在并行工作以及各自的状态。

#### 验收标准

1. WHEN 一个 Agent 启动并行模式时，THE Agent_Registry SHALL 创建一条包含 Agent_ID、机器信息、启动时间和心跳时间戳的注册记录
2. WHILE Agent 处于活跃状态，THE Agent_Registry SHALL 每 60 秒接收一次心跳更新
3. WHEN 一个 Agent 的心跳超过 180 秒未更新，THE Agent_Registry SHALL 将该 Agent 标记为不活跃状态
4. WHEN 一个 Agent 被标记为不活跃，THE Agent_Registry SHALL 释放该 Agent 持有的所有 Task_Lock
5. WHEN 同一台机器上启动多个 Agent 实例，THE Agent_Registry SHALL 为每个实例分配唯一的 Agent_ID（基于 MachineIdentifier 扩展 instanceIndex）
6. WHEN 一个 Agent 正常关闭时，THE Agent_Registry SHALL 移除该 Agent 的注册记录并释放所有关联资源
7. IF Agent_Registry 文件不存在，THEN THE Agent_Registry SHALL 自动创建空的注册表文件

### 需求 2：任务级细粒度锁

**用户故事：** 作为并行工作的 Agent，我希望能够锁定单个任务而非整个 Spec，以便多个 Agent 可以同时处理同一 Spec 下的不同任务。

#### 验收标准

1. WHEN 一个 Agent 请求锁定某个任务，THE Task_Lock SHALL 创建该任务的独立锁文件（`.sce/specs/{spec}/locks/{taskId}.lock`）
2. WHEN 一个任务已被其他 Agent 锁定，THE Task_Lock SHALL 拒绝新的锁定请求并返回当前持有者信息
3. WHEN 一个 Agent 完成任务后释放锁，THE Task_Lock SHALL 删除对应的锁文件
4. WHEN 一个持有锁的 Agent 被检测为不活跃，THE Task_Lock SHALL 自动释放该 Agent 持有的所有任务锁
5. THE Task_Lock SHALL 与现有 TaskClaimer 的 claim/unclaim 机制集成，锁定操作同时完成任务认领
6. WHEN 单 Agent 模式运行时，THE Task_Lock SHALL 保持与现有 Spec 级锁完全兼容的行为
7. THE Task_Lock SHALL 使用原子写入（temp + rename）确保锁文件操作的原子性

### 需求 3：无冲突任务状态更新

**用户故事：** 作为并行工作的 Agent，我希望更新任务状态时不会与其他 Agent 的状态更新产生冲突，以便所有 Agent 的进度都能正确记录。

#### 验收标准

1. WHEN 多个 Agent 同时更新不同任务的状态，THE Task_Status_Store SHALL 确保所有更新都被正确应用且不丢失
2. THE Task_Status_Store SHALL 使用文件级锁加重试机制保护 tasks.md 的写入操作
3. WHEN 写入 tasks.md 发生冲突，THE Task_Status_Store SHALL 自动重试（最多 5 次，指数退避），重新读取文件后合并变更
4. THE Task_Status_Store SHALL 在写入前验证目标任务行未被其他 Agent 修改（基于行内容比对）
5. WHEN 重试次数耗尽仍无法写入，THE Task_Status_Store SHALL 返回冲突错误并保留原始文件不变
6. THE Task_Status_Store SHALL 保持与现有 tasks.md 格式的完全向后兼容

### 需求 4：Git 分支策略与合并协调

**用户故事：** 作为并行工作的 Agent，我希望在独立的 Git 分支上工作，以便代码修改不会与其他 Agent 产生直接冲突。

#### 验收标准

1. WHEN 一个 Agent 开始执行任务，THE Merge_Coordinator SHALL 为该 Agent 创建专属分支（格式：`agent/{agentId}/{specName}`）
2. WHEN 一个 Agent 完成任务，THE Merge_Coordinator SHALL 检测该分支与目标分支之间是否存在合并冲突
3. WHEN 合并无冲突时，THE Merge_Coordinator SHALL 自动执行快进合并或创建合并提交
4. WHEN 合并存在冲突时，THE Merge_Coordinator SHALL 记录冲突详情并通知相关 Agent 手动解决
5. THE Merge_Coordinator SHALL 在合并完成后自动清理已合并的 Agent 分支
6. WHEN 单 Agent 模式运行时，THE Merge_Coordinator SHALL 跳过分支创建，直接在当前分支上工作

### 需求 5：Steering 文件冲突避免

**用户故事：** 作为并行工作的 Agent，我希望更新 CURRENT_CONTEXT.md 等 Steering 文件时不会与其他 Agent 冲突，以便所有 Agent 的状态更新都能被保留。

#### 验收标准

1. WHEN 多个 Agent 需要更新同一个 Steering 文件，THE Task_Status_Store SHALL 使用文件级锁串行化写入操作
2. WHEN 获取 Steering 文件锁失败，THE Task_Status_Store SHALL 自动重试（最多 3 次，指数退避）
3. THE Task_Status_Store SHALL 使用原子写入确保 Steering 文件更新的完整性
4. WHEN 重试次数耗尽仍无法获取锁，THE Task_Status_Store SHALL 将更新内容写入临时文件（`.sce/steering/{filename}.pending.{agentId}`）供后续合并

### 需求 6：可选协调器模式

**用户故事：** 作为项目管理者，我希望有一个可选的中央协调器来智能分配任务给各 Agent，以便最大化并行效率并避免依赖冲突。

#### 验收标准

1. WHEN 协调器模式启用时，THE Coordinator SHALL 基于 DependencyManager 的依赖图计算可并行执行的任务集合
2. WHEN 一个 Agent 请求任务分配，THE Coordinator SHALL 从就绪任务集合中选择一个未被锁定的任务分配给该 Agent
3. WHEN 所有前置依赖任务完成后，THE Coordinator SHALL 自动将后续任务标记为就绪状态
4. THE Coordinator SHALL 提供进度汇总接口，返回各 Spec 的完成百分比和各 Agent 的工作状态
5. WHEN 协调器模式未启用时，THE Coordinator SHALL 不影响现有的手动任务选择流程
6. THE Coordinator SHALL 将任务分配记录持久化到 `coordination-log.json` 文件中

### 需求 7：向后兼容与渐进式采用

**用户故事：** 作为现有的单 Agent 用户，我希望多 Agent 功能不会影响我现有的工作流程，以便我可以按需选择是否启用并行协调能力。

#### 验收标准

1. WHEN 项目未启用多 Agent 模式，THE Agent_Registry SHALL 不创建任何额外文件或目录
2. THE Task_Lock SHALL 在单 Agent 模式下退化为现有的 Spec 级锁行为
3. THE Task_Status_Store SHALL 在单 Agent 模式下使用现有的直接写入方式（无锁、无重试）
4. WHEN 用户首次启用多 Agent 模式，THE Agent_Registry SHALL 自动初始化所需的目录结构和配置文件
5. THE Coordinator SHALL 作为完全可选的组件，不启用时零开销
