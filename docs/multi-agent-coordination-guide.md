# Multi-Agent Parallel Coordination Guide

> Enable multiple AI agents to work on the same sce project simultaneously without conflicts.

**Version**: 3.6.50  
**Last Updated**: 2026-03-14

---

## Overview

When multiple AI agent instances (e.g., multiple AI IDE windows, Claude Code sessions, or Cursor instances) work on the same project, they can accidentally overwrite each other's changes, claim the same tasks, or corrupt shared files like `tasks.md`.

The Multi-Agent Parallel Coordination system solves this with six layers of protection:

1. **Agent Registry** — Who is working?
2. **Task Lock Manager** — Who owns which task?
3. **Task Status Store** — Safe concurrent updates to tasks.md
4. **Steering File Lock** — Safe concurrent updates to steering files
5. **Merge Coordinator** — Git branch isolation per agent
6. **Central Coordinator** — Intelligent task assignment (optional)
7. **Spec-Level Steering (L4)** — Per-Spec constraints and notes (v1.44.0)
8. **Steering Loader** — Unified L1-L4 four-layer steering merge (v1.44.0)
9. **Context Sync Manager** — Multi-agent CURRENT_CONTEXT.md maintenance (v1.44.0)
10. **Spec Lifecycle Manager** — Spec state machine and auto-completion (v1.44.0)
11. **Sync Barrier** — Agent Spec-switch synchronization (v1.44.0)

SCE provisions the co-work baseline by default. If a project explicitly sets `enabled: false`, all components fall back to single-agent no-op behavior.

---

## Quick Start

### 1. Review Multi-Agent Mode Baseline

SCE provisions `.sce/config/multi-agent.json` by default:

```json
{
  "enabled": true,
  "coordinatorEnabled": false,
  "heartbeatIntervalMs": 60000,
  "heartbeatTimeoutMs": 180000
}
```

| Field | Description | Default |
|-------|-------------|---------|
| `enabled` | Enable multi-agent coordination | `true` |
| `coordinatorEnabled` | Enable central task assignment | `false` |
| `heartbeatIntervalMs` | Heartbeat interval in ms | `60000` |
| `heartbeatTimeoutMs` | Agent considered inactive after this | `180000` |

### 2. Each Agent Registers Itself

When an agent starts working, it registers with the AgentRegistry:

```javascript
const { AgentRegistry } = require('scene-capability-engine/lib/collab');

const registry = new AgentRegistry(workspaceRoot);
const { agentId } = await registry.register();
// agentId format: "{machineId}:{instanceIndex}"
// e.g., "a1b2c3d4:0", "a1b2c3d4:1"
```

### 3. Lock Tasks Before Working

```javascript
const { TaskLockManager } = require('scene-capability-engine/lib/lock');

const lockManager = new TaskLockManager(workspaceRoot);
const result = await lockManager.acquireTaskLock('my-spec', '1.1', agentId);

if (result.success) {
  // Safe to work on task 1.1
  // ... do work ...
  await lockManager.releaseTaskLock('my-spec', '1.1', agentId);
} else {
  // Task is locked by another agent
  console.log(`Locked by: ${result.lockedBy}`);
}
```

### 4. Deregister When Done

```javascript
await registry.deregister(agentId);
// Automatically releases all locks held by this agent
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Coordinator (optional)             │
│         Ready task computation + assignment          │
│    v1.44.0: auto Spec completion + sync barrier     │
├──────────┬──────────┬──────────┬────────────────────┤
│  Agent   │  Task    │  Task    │  Steering  │ Merge  │
│ Registry │  Lock    │  Status  │  File Lock │ Coord  │
│          │  Manager │  Store   │            │        │
├──────────┴──────────┴──────────┴────────────┴────────┤
│              MultiAgentConfig                        │
│         .sce/config/multi-agent.json                │
├──────────────────────────────────────────────────────┤
│  v1.44.0: Spec-Level Steering & Context Sync        │
│  SpecSteering │ SteeringLoader │ ContextSyncManager  │
│  SpecLifecycleManager │ SyncBarrier                  │
└─────────────────────────────────────────────────────┘
```

---

## Components

### Agent Registry

Manages agent lifecycle with heartbeat-based health monitoring.

**File**: `lib/collab/agent-registry.js`  
**Storage**: `.sce/config/agent-registry.json`

```javascript
const { AgentRegistry } = require('scene-capability-engine/lib/collab');
const registry = new AgentRegistry(workspaceRoot);

// Register a new agent
const { agentId } = await registry.register();

// Send heartbeat (call periodically)
await registry.heartbeat(agentId);

// List active agents
const agents = await registry.getActiveAgents();

// Clean up inactive agents (heartbeat timeout)
const cleaned = await registry.cleanupInactive();
// Also releases all locks held by inactive agents

// Deregister when done
await registry.deregister(agentId);
```

**Agent ID format**: `{machineId}:{instanceIndex}`
- `machineId` is derived from MachineIdentifier (hardware-based)
- `instanceIndex` increments for multiple instances on the same machine
- Example: `a1b2c3d4e5f6:0`, `a1b2c3d4e5f6:1`

### Task Lock Manager

File-based mutual exclusion for task ownership.

**File**: `lib/lock/task-lock-manager.js`  
**Lock files**: `.sce/specs/{specName}/locks/{taskId}.lock`

```javascript
const { TaskLockManager } = require('scene-capability-engine/lib/lock');
const lockManager = new TaskLockManager(workspaceRoot);

// Acquire a task lock
const result = await lockManager.acquireTaskLock(specName, taskId, agentId);
// result: { success: true } or { success: false, lockedBy: "other-agent-id" }

// Release a task lock
await lockManager.releaseTaskLock(specName, taskId, agentId);

// Release ALL locks for an agent (used during cleanup)
await lockManager.releaseAllLocks(agentId);

// Check lock status
const status = await lockManager.getTaskLockStatus(specName, taskId);
// status: { locked: true, agentId: "...", timestamp: "..." } or { locked: false }

// List all locked tasks in a spec
const locked = await lockManager.listLockedTasks(specName);
```

**Lock file content** (JSON):
```json
{
  "agentId": "a1b2c3d4e5f6:0",
  "timestamp": "2026-02-11T10:30:00.000Z",
  "reason": "task-execution"
}
```

### Task Status Store

Concurrent-safe updates to `tasks.md` with conflict detection and retry.

**File**: `lib/task/task-status-store.js`

```javascript
const { TaskStatusStore } = require('scene-capability-engine/lib/task');
const store = new TaskStatusStore(workspaceRoot);

// Update task status with file locking
await store.updateStatus(specName, taskId, 'in-progress');

// Claim a task (with lock + retry)
const result = await store.claimTask(specName, taskId, agentId, username);

// Unclaim a task
await store.unclaimTask(specName, taskId, agentId, username);
```

**Conflict resolution strategy**:
1. Acquire file lock on `tasks.md.lock`
2. Read current file content
3. Validate target line hasn't changed (line-content comparison)
4. Write updated content atomically
5. Release file lock
6. On conflict: exponential backoff retry (up to 5 attempts, starting at 100ms)
7. After retries exhausted: return conflict error, original file preserved

### Steering File Lock

Write serialization for steering files (`.sce/steering/*.md`).

**File**: `lib/lock/steering-file-lock.js`

```javascript
const { SteeringFileLock } = require('scene-capability-engine/lib/lock');
const steeringLock = new SteeringFileLock(workspaceRoot);

// Execute callback with lock held
await steeringLock.withLock('CURRENT_CONTEXT.md', async () => {
  // Safe to write to CURRENT_CONTEXT.md
  await fs.writeFile(contextPath, newContent);
});

// Manual lock management
const { lockId } = await steeringLock.acquireLock('CURRENT_CONTEXT.md');
// ... write file ...
await steeringLock.releaseLock('CURRENT_CONTEXT.md', lockId);

// Degraded write (when lock cannot be acquired)
await steeringLock.writePending('CURRENT_CONTEXT.md', content, agentId);
// Creates: .sce/steering/CURRENT_CONTEXT.md.pending.{agentId}
```

### Merge Coordinator

Git branch isolation per agent for conflict-free parallel development.

**File**: `lib/collab/merge-coordinator.js`

```javascript
const { MergeCoordinator } = require('scene-capability-engine/lib/collab');
const merger = new MergeCoordinator(workspaceRoot);

// Create agent-specific branch
const { branchName, created } = await merger.createAgentBranch(agentId, specName);
// branchName: "agent/a1b2c3d4e5f6:0/my-spec"

// Check for conflicts before merging
const { hasConflicts, files } = await merger.detectConflicts(branchName, 'main');

// Merge back to main
const result = await merger.merge(branchName, 'main');
// result.strategy: "fast-forward" | "merge-commit" | null (conflicts)

// Clean up merged branch
await merger.cleanupBranch(branchName);
```

**Branch naming**: `agent/{agentId}/{specName}`

### Central Coordinator (Optional)

When `coordinator: true` in config, provides intelligent task assignment based on dependency analysis.

**File**: `lib/collab/coordinator.js`  
**Log**: `.sce/config/coordination-log.json`

```javascript
const { Coordinator } = require('scene-capability-engine/lib/collab');
const coordinator = new Coordinator(workspaceRoot, depManager, registry, lockManager);

// Get tasks ready to execute (dependencies satisfied, not locked)
const readyTasks = await coordinator.getReadyTasks(specName);

// Request a task assignment
const assignment = await coordinator.assignTask(agentId);
// assignment: { specName, taskId, task } or null

// Mark task complete (releases lock, computes newly ready tasks)
// v1.44.0: also auto-checks Spec completion via SpecLifecycleManager
const { newReadyTasks } = await coordinator.completeTask(specName, taskId, agentId);

// Get progress across all specs
const { specs, agents } = await coordinator.getProgress();
```

### Spec-Level Steering (L4) — v1.44.0

Per-Spec `steering.md` providing independent constraints, notes, and decisions for each Spec. Eliminates cross-agent write conflicts on global steering files.

**File**: `lib/steering/spec-steering.js`  
**Storage**: `.sce/specs/{spec-name}/steering.md`

```javascript
const { SpecSteering } = require('scene-capability-engine/lib/steering');
const specSteering = new SpecSteering(workspaceRoot);

// Create a steering template for a new Spec
await specSteering.createTemplate(specName, { description: 'My feature' });

// Read Spec-level steering
const steering = await specSteering.read(specName);
// steering: { specName, description, constraints: [], notes: [], decisions: [] }

// Write updated steering
await specSteering.write(specName, updatedSteering);

// Parse raw Markdown to structured object
const parsed = specSteering.parse(markdownContent);

// Format structured object back to Markdown
const markdown = specSteering.format(steeringObj);
```

### Steering Loader — v1.44.0

Unified loader that merges all four steering layers (L1-L4) into a single context.

**File**: `lib/steering/steering-loader.js`

```javascript
const { SteeringLoader } = require('scene-capability-engine/lib/steering');
const loader = new SteeringLoader(workspaceRoot);

// Load a specific layer
const l1 = await loader.loadL1();  // CORE_PRINCIPLES.md
const l2 = await loader.loadL2();  // ENVIRONMENT.md
const l3 = await loader.loadL3();  // CURRENT_CONTEXT.md
const l4 = await loader.loadL4(specName);  // specs/{specName}/steering.md

// Load all layers merged (L4 only in multi-agent mode)
const merged = await loader.loadMerged(specName);
// merged: { l1, l2, l3, l4, merged: "combined content" }
```

### Context Sync Manager — v1.44.0

Multi-agent friendly maintenance of `CURRENT_CONTEXT.md` with structured Spec progress table format.

**File**: `lib/steering/context-sync-manager.js`

```javascript
const { ContextSyncManager } = require('scene-capability-engine/lib/steering');
const syncManager = new ContextSyncManager(workspaceRoot);

// Read current context
const context = await syncManager.readContext();

// Update Spec progress entry (SteeringFileLock-protected)
await syncManager.updateSpecProgress(specName, {
  status: 'in-progress',
  progress: '3/8 tasks',
  agent: 'a1b2c3d4:0'
});

// Compute progress from tasks.md
const progress = await syncManager.computeProgress(specName);
// progress: { total: 8, completed: 3, percentage: 37.5 }

// Write full context (SteeringFileLock-protected)
await syncManager.writeContext(newContext);
```

### Spec Lifecycle Manager — v1.44.0

State machine managing Spec lifecycle transitions with auto-completion detection.

**File**: `lib/collab/spec-lifecycle-manager.js`  
**Storage**: `.sce/specs/{spec-name}/lifecycle.json`

Valid transitions: `planned → assigned → in-progress → completed → released`

```javascript
const { SpecLifecycleManager } = require('scene-capability-engine/lib/collab');
const lifecycle = new SpecLifecycleManager(workspaceRoot);

// Get current Spec status
const status = await lifecycle.getStatus(specName);
// status: "planned" | "assigned" | "in-progress" | "completed" | "released"

// Transition to next state
await lifecycle.transition(specName, 'in-progress');

// Check if all tasks are completed (auto-transitions to "completed")
const isComplete = await lifecycle.checkCompletion(specName);

// Read full lifecycle data
const data = await lifecycle.readLifecycle(specName);
// data: { status, transitions: [...], completedAt, ... }
```

### Sync Barrier — v1.44.0

Ensures agents synchronize state before switching between Specs.

**File**: `lib/collab/sync-barrier.js`

```javascript
const { SyncBarrier } = require('scene-capability-engine/lib/collab');
const barrier = new SyncBarrier(workspaceRoot);

// Check before switching Specs
const ready = await barrier.prepareSwitch(agentId, fromSpec, toSpec);
// Checks: uncommitted changes, reloads steering

// Check for uncommitted changes
const hasChanges = await barrier.hasUncommittedChanges();
```

---

## Typical Workflow

```
Agent A                          Agent B
  │                                │
  ├─ register() → agentId:0       ├─ register() → agentId:1
  │                                │
  ├─ acquireTaskLock(1.1) ✅       ├─ acquireTaskLock(1.1) ❌ (locked)
  │                                ├─ acquireTaskLock(1.2) ✅
  │                                │
  ├─ work on task 1.1              ├─ work on task 1.2
  │                                │
  ├─ releaseTaskLock(1.1)          ├─ releaseTaskLock(1.2)
  │                                │
  ├─ acquireTaskLock(2.1) ✅       ├─ acquireTaskLock(2.2) ✅
  │  ...                           │  ...
  │                                │
  ├─ deregister()                  ├─ deregister()
```

---

## Failure Recovery

### Agent Crashes

When an agent crashes without deregistering:

1. Its heartbeat stops updating
2. Another agent (or periodic cleanup) calls `registry.cleanupInactive()`
3. All locks held by the crashed agent are automatically released
4. Other agents can now claim those tasks

### File Write Conflicts

When two agents try to update `tasks.md` simultaneously:

1. TaskStatusStore uses file-level locking (`tasks.md.lock`)
2. The second writer detects the lock and retries with exponential backoff
3. Line-content validation ensures no silent overwrites
4. After 5 retries, returns a conflict error (original file preserved)

### Steering File Conflicts

When two agents try to update a steering file:

1. SteeringFileLock serializes writes
2. If lock cannot be acquired after 3 retries, the agent writes to a `.pending` file
3. The pending file can be manually merged later

### Git Merge Conflicts

When agent branches have conflicting changes:

1. `detectConflicts()` performs a dry-run merge to check
2. If conflicts exist, `merge()` returns the list of conflicting files
3. Conflicts must be resolved manually before merging

---

## Single-Agent Backward Compatibility

All components check `MultiAgentConfig.isEnabled()` before doing anything:

| Component | Single-Agent Behavior |
|-----------|----------------------|
| AgentRegistry | Not used |
| TaskLockManager | Delegates to existing LockManager |
| TaskStatusStore | Delegates to existing TaskClaimer (no lock, no retry) |
| SteeringFileLock | Not used |
| MergeCoordinator | Returns current branch, no branch creation |
| Coordinator | All methods return empty results |

**Zero overhead**: No extra file I/O, no lock files, no registry files.

---

## Configuration Reference

### `.sce/config/multi-agent.json`

```json
{
  "enabled": true,
  "coordinatorEnabled": false,
  "heartbeatIntervalMs": 60000,
  "heartbeatTimeoutMs": 180000
}
```

### File Locations

| File | Purpose |
|------|---------|
| `.sce/config/multi-agent.json` | Multi-agent configuration |
| `.sce/config/agent-registry.json` | Active agent registry |
| `.sce/config/coordination-log.json` | Coordinator assignment log |
| `.sce/specs/{spec}/locks/{taskId}.lock` | Task lock files |
| `.sce/specs/{spec}/tasks.md.lock` | tasks.md file lock |
| `.sce/specs/{spec}/steering.md` | Spec-level steering (L4) |
| `.sce/specs/{spec}/lifecycle.json` | Spec lifecycle state |
| `.sce/steering/{file}.lock` | Steering file locks |
| `.sce/steering/{file}.pending.{agentId}` | Pending steering writes |

---

## API Reference

### Module Exports

```javascript
// Collaboration modules
const { AgentRegistry, Coordinator, MergeCoordinator, MultiAgentConfig, SpecLifecycleManager, SyncBarrier } = require('scene-capability-engine/lib/collab');

// Steering modules
const { SpecSteering, SteeringLoader, ContextSyncManager } = require('scene-capability-engine/lib/steering');

// Lock modules
const { TaskLockManager, SteeringFileLock } = require('scene-capability-engine/lib/lock');

// Task modules
const { TaskStatusStore } = require('scene-capability-engine/lib/task');
```

---

## Related Documentation

- [Spec-Level Collaboration Guide](spec-collaboration-guide.md) — Coordinate multiple Specs across AI instances
- [Spec Locking Guide](spec-locking-guide.md) — Single-agent Spec locking mechanism
- [Team Collaboration Guide](team-collaboration-guide.md) — Multi-user team workflows
