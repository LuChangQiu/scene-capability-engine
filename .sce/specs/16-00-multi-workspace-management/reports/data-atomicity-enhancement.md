# 数据原子性增强设计

## 问题陈述

当前 Spec 16-00 的设计存在**数据源多重性**问题，违反了**单一数据源原则（SSOT）**：

### 当前设计的问题

```
~/.sce/workspaces.json  - 存储工作区列表 + last_accessed
~/.sce/config.json      - 存储 active_workspace + preferences
```

**违反原子性的场景**：
1. 工作区的"活跃状态"分散在两个文件中
2. 切换工作区需要原子性地更新两个文件
3. 如果其中一个更新失败，会导致数据不一致
4. 缓存数据（last_accessed）和配置数据（active_workspace）耦合

## 核心架构原则

### 数据原子性原则（Data Atomicity Principle）

**定义**：系统中的每一类数据应该有且仅有一个权威数据源（Single Source of Truth）

**适用范围**：
1. **配置数据** - 不应该有多个配置文件存储相同的信息
2. **缓存数据** - 派生数据（视图、报表、字典）应该有唯一的缓存源
3. **状态数据** - 系统状态应该集中管理，不分散存储

**违反原则的后果**：
- 数据不一致风险
- 同步复杂度增加
- 事务性保证困难
- 维护成本上升

## 改进方案

### 方案 1：单一配置文件（推荐）

**设计思路**：将所有工作区相关数据合并到一个文件中

```json
// ~/.sce/workspace-state.json
{
  "version": "1.0",
  "activeWorkspace": "project-alpha",
  "workspaces": [
    {
      "name": "project-alpha",
      "path": "/home/user/projects/alpha",
      "createdAt": "2026-01-28T10:30:00Z",
      "lastAccessed": "2026-01-28T15:45:00Z"
    },
    {
      "name": "project-beta",
      "path": "/home/user/projects/beta",
      "createdAt": "2026-01-27T09:00:00Z",
      "lastAccessed": "2026-01-28T14:20:00Z"
    }
  ],
  "preferences": {
    "autoDetectWorkspace": true,
    "confirmDestructiveOperations": true
  }
}
```

**优点**：
- ✅ 单一数据源，保证原子性
- ✅ 更新操作是原子的（单文件写入）
- ✅ 数据一致性有保证
- ✅ 简化代码逻辑

**缺点**：
- ⚠️ 文件稍大（但对于工作区数量来说可以忽略）
- ⚠️ 需要重构现有代码

### 方案 2：主从文件 + 事务日志

**设计思路**：保持两个文件，但引入事务日志保证一致性

```
~/.sce/workspaces.json       - 主数据源（工作区列表）
~/.sce/config.json           - 从数据源（仅存储 preferences）
~/.sce/workspace-state.lock  - 事务锁文件
~/.sce/workspace-state.log   - 操作日志
```

**优点**：
- ✅ 向后兼容性好
- ✅ 可以保证最终一致性

**缺点**：
- ❌ 复杂度大幅增加
- ❌ 需要实现事务机制
- ❌ 性能开销

### 方案 3：内存缓存 + 延迟写入

**设计思路**：在内存中维护单一状态，定期持久化

```javascript
class WorkspaceStateManager {
  constructor() {
    this.state = {
      activeWorkspace: null,
      workspaces: new Map(),
      preferences: {},
      dirty: false
    };
  }
  
  // 所有操作都在内存中进行
  setActiveWorkspace(name) {
    this.state.activeWorkspace = name;
    this.state.workspaces.get(name).lastAccessed = new Date();
    this.state.dirty = true;
  }
  
  // 统一持久化
  async flush() {
    if (this.state.dirty) {
      await this.saveToSingleFile();
      this.state.dirty = false;
    }
  }
}
```

**优点**：
- ✅ 内存中保证原子性
- ✅ 性能最优
- ✅ 可以批量写入

**缺点**：
- ⚠️ 需要处理进程崩溃场景
- ⚠️ 需要实现定期刷新机制

## 推荐方案：方案 1（单一配置文件）

### 实施细节

#### 1. 新的数据模型

```javascript
class WorkspaceStateManager {
  constructor(statePath = '~/.sce/workspace-state.json') {
    this.statePath = statePath;
    this.state = {
      version: '1.0',
      activeWorkspace: null,
      workspaces: new Map(),
      preferences: {
        autoDetectWorkspace: true,
        confirmDestructiveOperations: true
      }
    };
  }
  
  // 原子性操作：切换工作区
  async switchWorkspace(name) {
    // 验证工作区存在
    if (!this.state.workspaces.has(name)) {
      throw new Error(`Workspace "${name}" does not exist`);
    }
    
    // 在内存中更新状态
    this.state.activeWorkspace = name;
    const workspace = this.state.workspaces.get(name);
    workspace.lastAccessed = new Date();
    
    // 原子性写入（单文件）
    await this.save();
  }
  
  // 原子性保存
  async save() {
    const data = {
      version: this.state.version,
      activeWorkspace: this.state.activeWorkspace,
      workspaces: Array.from(this.state.workspaces.values()).map(ws => ws.toDict()),
      preferences: this.state.preferences
    };
    
    // 使用临时文件 + 原子性重命名
    const tempPath = `${this.statePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
    await fs.rename(tempPath, this.statePath);  // 原子性操作
  }
}
```

#### 2. 迁移策略

```javascript
class WorkspaceStateMigration {
  async migrateFromLegacyFiles() {
    const legacyWorkspaces = await this.loadLegacyWorkspaces();
    const legacyConfig = await this.loadLegacyConfig();
    
    // 合并数据
    const newState = {
      version: '1.0',
      activeWorkspace: legacyConfig.active_workspace,
      workspaces: legacyWorkspaces.workspaces,
      preferences: legacyConfig.preferences
    };
    
    // 保存到新文件
    await this.saveNewState(newState);
    
    // 备份旧文件
    await this.backupLegacyFiles();
  }
}
```

#### 3. 向后兼容

```javascript
class WorkspaceStateManager {
  async load() {
    // 尝试加载新格式
    if (await fs.pathExists(this.statePath)) {
      return await this.loadNewFormat();
    }
    
    // 回退到旧格式并自动迁移
    if (await this.hasLegacyFiles()) {
      console.log('Migrating from legacy format...');
      await this.migrateFromLegacy();
      return await this.loadNewFormat();
    }
    
    // 初始化空状态
    return this.initializeEmpty();
  }
}
```

## 架构层面的改进

### 1. 数据层分离

```
┌─────────────────────────────────────┐
│     Application Layer (Commands)    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   Business Logic Layer (Resolver)   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   Data Access Layer (StateManager)  │  ← 单一数据源
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   Storage Layer (workspace-state.json)│
└─────────────────────────────────────┘
```

### 2. 缓存策略

```javascript
class WorkspaceStateManager {
  constructor() {
    this.cache = {
      loaded: false,
      state: null,
      lastModified: null
    };
  }
  
  async getState() {
    // 检查缓存
    if (this.cache.loaded && !this.isStale()) {
      return this.cache.state;
    }
    
    // 重新加载
    this.cache.state = await this.load();
    this.cache.loaded = true;
    this.cache.lastModified = Date.now();
    
    return this.cache.state;
  }
  
  invalidateCache() {
    this.cache.loaded = false;
  }
}
```

### 3. 事务性保证

```javascript
class WorkspaceStateManager {
  async transaction(fn) {
    // 加载当前状态
    const state = await this.getState();
    
    // 创建副本
    const stateCopy = this.deepClone(state);
    
    try {
      // 执行操作
      await fn(stateCopy);
      
      // 原子性保存
      await this.save(stateCopy);
      
      // 更新缓存
      this.cache.state = stateCopy;
      
    } catch (error) {
      // 回滚（不保存）
      throw error;
    }
  }
}
```

## 实施计划

### Phase 1: 重构数据层（1-2天）
- [ ] 创建 `WorkspaceStateManager` 类
- [ ] 实现单一文件读写
- [ ] 添加原子性保存机制
- [ ] 编写单元测试

### Phase 2: 迁移现有代码（1天）
- [ ] 重构 `WorkspaceRegistry` 使用新的 StateManager
- [ ] 重构 `GlobalConfig` 使用新的 StateManager
- [ ] 更新 `WorkspaceContextResolver`
- [ ] 更新所有命令

### Phase 3: 迁移工具（0.5天）
- [ ] 实现自动迁移逻辑
- [ ] 添加迁移测试
- [ ] 编写迁移文档

### Phase 4: 测试和验证（0.5天）
- [ ] 运行所有单元测试
- [ ] 运行集成测试
- [ ] 手动测试迁移场景

## 测试策略

### 原子性测试

```javascript
describe('WorkspaceStateManager Atomicity', () => {
  test('should update active workspace atomically', async () => {
    const manager = new WorkspaceStateManager();
    
    // 模拟并发操作
    const promises = [
      manager.switchWorkspace('workspace-1'),
      manager.switchWorkspace('workspace-2'),
      manager.switchWorkspace('workspace-3')
    ];
    
    await Promise.all(promises);
    
    // 验证最终状态一致
    const state = await manager.getState();
    expect(state.activeWorkspace).toBeDefined();
    expect(state.workspaces.get(state.activeWorkspace).lastAccessed).toBeDefined();
  });
  
  test('should rollback on save failure', async () => {
    const manager = new WorkspaceStateManager();
    const initialState = await manager.getState();
    
    // 模拟保存失败
    jest.spyOn(fs, 'writeFile').mockRejectedValue(new Error('Disk full'));
    
    await expect(async () => {
      await manager.switchWorkspace('workspace-1');
    }).rejects.toThrow();
    
    // 验证状态未改变
    const currentState = await manager.getState();
    expect(currentState).toEqual(initialState);
  });
});
```

## 收益分析

### 代码质量
- ✅ 减少 30% 的状态管理代码
- ✅ 消除数据不一致风险
- ✅ 简化错误处理逻辑

### 性能
- ✅ 减少文件 I/O 操作（从 2 次减少到 1 次）
- ✅ 更好的缓存策略
- ✅ 原子性操作更快

### 可维护性
- ✅ 单一数据源，易于理解
- ✅ 更容易添加新功能
- ✅ 更容易调试问题

## 结论

采用**单一配置文件方案**可以从根本上解决数据原子性问题，符合软件架构的核心原则。这个改进不仅适用于 Spec 16-00，也为未来的功能开发建立了良好的架构基础。

**核心原则**：
> 系统中的每一类数据应该有且仅有一个权威数据源，所有派生数据和缓存都应该从这个唯一源生成。

这个原则应该被纳入 sce 的核心架构指导原则中。
