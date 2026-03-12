# 需求文档

## 简介

本特性为 kiro-spec-engine (sce) 引入第四层约束 — Spec 级 `steering.md`，并改造全局 `CURRENT_CONTEXT.md` 为多 Agent 友好的汇总格式。解决多 Agent 并行推进不同 Spec 时 CURRENT_CONTEXT 写冲突、缺少 Spec 级约束存放位置、以及 Spec 生命周期协调缺失的问题。

## 术语表

- **SpecSteering**：位于 `.sce/specs/{spec-name}/steering.md` 的 Spec 级约束文件，包含该 Spec 的特定上下文、决策记录和注意事项
- **ContextSyncManager**：负责维护全局 CURRENT_CONTEXT.md 的组件，将多个 Spec 的进度汇总为多 Agent 友好格式
- **SpecLifecycleManager**：管理 Spec 生命周期状态机的组件，追踪 Spec 从规划到发布的完整流程
- **SteeringLoader**：负责加载和合并多层 Steering 约束的组件，按优先级合并 L1-L4 层约束
- **Spec_Status**：Spec 的生命周期状态，包括 planned、assigned、in-progress、completed、released
- **SyncBarrier**：Agent 切换 Spec 时的同步屏障机制，确保 Agent 基于一致的代码库和 Steering 工作
- **Coordinator**：现有的任务分配与进度追踪组件（`lib/collab/coordinator.js`）
- **AgentRegistry**：现有的 Agent 注册/心跳/发现组件（`lib/collab/agent-registry.js`）
- **SteeringFileLock**：现有的 Steering 文件写锁组件（`lib/lock/steering-file-lock.js`）

## 需求

### 需求 1：Spec 级 Steering 文件管理

**用户故事：** 作为一个 Agent，我希望每个 Spec 有独立的 steering.md 文件，以便在执行 Spec 时获取该 Spec 的特定约束、注意事项和决策记录，而不与其他 Agent 产生冲突。

#### 验收标准

1. WHEN 一个新 Spec 被创建, THE SpecSteering SHALL 在 `.sce/specs/{spec-name}/` 目录下生成一个 `steering.md` 模板文件，包含约束、注意事项和决策记录三个区域
2. WHEN 一个 Agent 开始执行某个 Spec, THE SteeringLoader SHALL 按 L1（CORE_PRINCIPLES）→ L2（ENVIRONMENT）→ L3（CURRENT_CONTEXT）→ L4（steering.md）的优先级加载并合并所有层级的约束
3. WHEN 多个 Agent 分别操作不同 Spec 的 steering.md, THE SpecSteering SHALL 保证各 Agent 的写操作互不干扰，无需额外的锁机制
4. WHEN 一个 Agent 更新某个 Spec 的 steering.md, THE SpecSteering SHALL 使用原子写操作保证文件完整性
5. IF steering.md 文件损坏或格式无效, THEN THE SteeringLoader SHALL 返回一个空的 Spec 级约束对象并记录警告日志

### 需求 2：Steering 加载与合并

**用户故事：** 作为一个 Agent，我希望系统自动加载并合并所有层级的 Steering 约束，以便我在执行任务时获得完整的上下文信息。

#### 验收标准

1. THE SteeringLoader SHALL 支持加载四个层级的 Steering 文件：L1 通用约束、L2 环境约束、L3 全局上下文、L4 Spec 级约束
2. WHEN 加载 Steering 时, THE SteeringLoader SHALL 返回一个包含所有层级内容的结构化对象，每个层级的内容独立可访问
3. WHEN 高优先级层级（L4）与低优先级层级（L1-L3）存在冲突时, THE SteeringLoader SHALL 以高优先级层级的内容为准
4. WHEN 指定的 Spec 不存在 steering.md 文件时, THE SteeringLoader SHALL 正常返回 L1-L3 层级的内容，L4 层级返回空内容
5. IF 任何层级的 Steering 文件不存在, THEN THE SteeringLoader SHALL 跳过该层级并继续加载其余层级

### 需求 3：CURRENT_CONTEXT 多 Agent 改造

**用户故事：** 作为一个多 Agent 环境的管理者，我希望 CURRENT_CONTEXT.md 从单 Agent 叙事格式改为多 Spec 进度汇总格式，以便多个 Agent 并发更新各自负责的 Spec 进度而不互相覆盖。

#### 验收标准

1. THE ContextSyncManager SHALL 将 CURRENT_CONTEXT.md 维护为结构化的多 Spec 进度汇总格式，包含版本信息、全局状态和各 Spec 的进度条目
2. WHEN 一个 Agent 完成某个 Spec 的任务时, THE ContextSyncManager SHALL 仅更新该 Spec 对应的进度条目，保留其他 Spec 的条目不变
3. WHEN 多个 Agent 并发更新 CURRENT_CONTEXT.md 时, THE ContextSyncManager SHALL 使用 SteeringFileLock 进行写锁保护，防止并发写冲突
4. WHEN 更新 CURRENT_CONTEXT.md 时, THE ContextSyncManager SHALL 基于 tasks.md 的完成情况自动计算 Spec 的进度百分比
5. WHILE 系统运行在单 Agent 模式下, THE ContextSyncManager SHALL 保持与现有 CURRENT_CONTEXT.md 格式的向后兼容，零额外开销

### 需求 4：Spec 生命周期状态机

**用户故事：** 作为一个 Coordinator，我希望追踪每个 Spec 的生命周期状态，以便在 Spec 完成时自动触发后续操作（更新上下文、通知其他 Agent）。

#### 验收标准

1. THE SpecLifecycleManager SHALL 管理 Spec 的五个生命周期状态：planned → assigned → in-progress → completed → released
2. WHEN 一个 Spec 的所有 tasks.md 中的任务全部完成时, THE SpecLifecycleManager SHALL 自动将该 Spec 的状态从 in-progress 转换为 completed
3. WHEN 一个 Spec 的状态变为 completed 时, THE SpecLifecycleManager SHALL 触发 ContextSyncManager 更新 CURRENT_CONTEXT.md 中该 Spec 的进度条目
4. WHEN 一个 Spec 的状态变为 completed 时, THE SpecLifecycleManager SHALL 通过 AgentRegistry 通知其他活跃 Agent 该 Spec 已完成
5. IF 一个 Spec 的状态转换不符合状态机定义的合法路径, THEN THE SpecLifecycleManager SHALL 拒绝该转换并返回错误信息
6. THE SpecLifecycleManager SHALL 将 Spec 的状态持久化到 `.sce/specs/{spec-name}/lifecycle.json` 文件中

### 需求 5：Agent 同步屏障

**用户故事：** 作为一个 Agent，我希望在切换到新 Spec 时自动同步最新代码和 Steering，以确保我基于一致的代码库工作。

#### 验收标准

1. WHEN 一个 Agent 切换到新的 Spec 时, THE SyncBarrier SHALL 验证当前工作区的代码是否为最新版本
2. WHEN 一个 Agent 切换到新的 Spec 时, THE SyncBarrier SHALL 重新加载所有层级的 Steering 约束
3. IF 同步过程中检测到未提交的本地更改, THEN THE SyncBarrier SHALL 阻止 Spec 切换并返回错误信息，提示 Agent 先处理本地更改
4. WHILE 系统运行在单 Agent 模式下, THE SyncBarrier SHALL 跳过所有同步检查，零额外开销

### 需求 6：单 Agent 向后兼容

**用户故事：** 作为一个单 Agent 模式的用户，我希望新增的 Spec 级 Steering 和上下文同步功能在单 Agent 模式下完全透明，不产生额外文件或性能开销。

#### 验收标准

1. WHILE 系统运行在单 Agent 模式下, THE SpecSteering SHALL 不自动生成 steering.md 文件
2. WHILE 系统运行在单 Agent 模式下, THE ContextSyncManager SHALL 不修改 CURRENT_CONTEXT.md 的现有格式
3. WHILE 系统运行在单 Agent 模式下, THE SpecLifecycleManager SHALL 不创建 lifecycle.json 文件
4. WHILE 系统运行在单 Agent 模式下, THE SteeringLoader SHALL 仅加载 L1-L3 层级，跳过 L4 层级
5. THE SpecSteering SHALL 通过 MultiAgentConfig 的 enabled 标志判断当前运行模式

### 需求 7：Spec Steering 模板与序列化

**用户故事：** 作为一个 Agent，我希望 steering.md 有标准化的模板格式，并且系统能正确解析和序列化该格式，以便程序化地读写 Spec 级约束。

#### 验收标准

1. THE SpecSteering SHALL 定义标准化的 steering.md 模板，包含三个区域：约束（Constraints）、注意事项（Notes）、决策记录（Decisions）
2. WHEN 解析 steering.md 文件时, THE SpecSteering SHALL 将 Markdown 内容解析为结构化对象，每个区域独立可访问
3. THE SpecSteering SHALL 提供格式化功能，将结构化对象序列化回合法的 steering.md Markdown 格式
4. FOR ALL 合法的 steering.md 结构化对象, 解析然后格式化然后再解析 SHALL 产生等价的对象（往返一致性）
