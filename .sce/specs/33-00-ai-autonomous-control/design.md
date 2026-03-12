# Design Document: AI Autonomous Control

## Overview

The AI Autonomous Control system transforms sce from an interactive assistant into an autonomous development partner. Building on CORE_PRINCIPLES 4.1 "完全自主执行权限", this feature provides the infrastructure for AI to independently manage entire development workflows - from understanding user goals to delivering production-ready features.

The system consists of three core layers:

1. **Autonomous Execution Engine**: Task orchestration, error recovery, and decision-making
2. **CLI Interface**: User commands for controlling autonomous operations  
3. **Safety and Monitoring**: Progress tracking, checkpoints, and rollback capabilities

**Key Design Principles**:
- **Continuous Execution**: AI works through multiple tasks without interruption
- **Intelligent Recovery**: Automatic error diagnosis and resolution
- **Strategic Checkpoints**: Pause only at meaningful milestones
- **User Control**: Users can interrupt, monitor, and configure behavior
- **Safety First**: Respect boundaries, maintain transparency, enable rollback


## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   CLI Layer (auto.js)                        │
│  Commands: create, run, resume, stop, status, config        │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│           Autonomous Engine (autonomous-engine.js)           │
│  - Orchestrates autonomous execution                         │
│  - Manages task queue and dependencies                       │
│  - Coordinates error recovery and checkpoints                │
└────┬──────────┬──────────┬──────────┬────────────┬─────────┘
     │          │           │          │            │
┌────▼────┐ ┌──▼─────┐ ┌──▼────┐ ┌──▼──────┐ ┌───▼────────┐
│Task     │ │Error   │ │Decision│ │Progress │ │Checkpoint  │
│Queue    │ │Recovery│ │Engine  │ │Tracker  │ │Manager     │
│Manager  │ │Manager │ │        │ │         │ │            │
└─────────┘ └────────┘ └────────┘ └─────────┘ └────────────┘
     │          │           │          │            │
     └──────────┴───────────┴──────────┴────────────┘
                     │
            ┌────────▼────────┐
            │  State Storage  │
            │ .sce/auto/     │
            │ state.json      │
            └─────────────────┘
```

### Component Responsibilities

1. **CLI Layer**: User-facing commands for autonomous control
2. **Autonomous Engine**: Central orchestrator managing execution lifecycle
3. **Task Queue Manager**: Dependency-aware task scheduling and execution
4. **Error Recovery Manager**: Automatic error diagnosis and resolution
5. **Decision Engine**: Autonomous technical decision-making
6. **Progress Tracker**: Real-time monitoring and reporting
7. **Checkpoint Manager**: Strategic pause points and rollback capability

### Execution Flow

```
User Command (sce auto create "feature")
    ↓
Autonomous Engine Initialization
    ↓
Spec Creation Phase
    ├─ Generate requirements.md
    ├─ Generate design.md
    └─ Generate tasks.md
    ↓
Checkpoint: User Review (optional)
    ↓
Task Execution Phase
    ├─ Load tasks into queue
    ├─ Execute tasks sequentially
    ├─ Handle errors automatically
    ├─ Run tests after changes
    └─ Update progress continuously
    ↓
Checkpoint: Phase Completion
    ↓
Quality Assurance Phase
    ├─ Run full test suite
    ├─ Validate documentation
    └─ Check acceptance criteria
    ↓
Checkpoint: Final Review
    ↓
Completion & Delivery
```


## Components and Interfaces

### 1. Autonomous Engine (`lib/auto/autonomous-engine.js`)

**Purpose**: Central orchestrator for autonomous execution

**Key Methods**:
```javascript
class AutonomousEngine {
  constructor(config)
  
  // Lifecycle management
  async initialize(specName, options)
  async start()
  async pause()
  async resume()
  async stop()
  
  // Spec creation
  async createSpecAutonomously(featureDescription)
  async generateRequirements(featureDescription)
  async generateDesign(requirements)
  async generateTasks(design)
  
  // Task execution
  async executeTaskQueue()
  async executeTask(task)
  async handleTaskError(task, error)
  
  // Checkpoints
  async createCheckpoint(type, data)
  async waitForUserApproval(checkpoint)
  async skipCheckpoint(checkpoint)
  
  // State management
  async saveState()
  async loadState()
  async getStatus()
}
```

**Configuration Schema**:
```javascript
{
  mode: 'conservative' | 'balanced' | 'aggressive',
  checkpoints: {
    requirementsReview: boolean,
    designReview: boolean,
    phaseCompletion: boolean,
    finalReview: boolean
  },
  errorRecovery: {
    maxAttempts: number,
    strategies: string[]
  },
  safety: {
    requireProductionConfirmation: boolean,
    requireExternalResourceConfirmation: boolean
  }
}
```

### 2. Task Queue Manager (`lib/auto/task-queue-manager.js`)

**Purpose**: Manage task execution order and dependencies

**Key Methods**:
```javascript
class TaskQueueManager {
  constructor()
  
  // Queue operations
  async loadTasks(tasksFilePath)
  async addTask(task)
  async getNextTask()
  async markTaskComplete(taskId)
  async markTaskFailed(taskId, error)
  
  // Dependency management
  async analyzeDependencies(tasks)
  async isTaskReady(taskId)
  async getBlockedTasks()
  
  // Priority management
  async setPriority(taskId, priority)
  async reorderQueue()
  
  // State queries
  getQueueStatus()
  getCompletedTasks()
  getFailedTasks()
  getRemainingTasks()
}
```

**Task Structure**:
```javascript
{
  id: string,              // e.g., "2.1"
  title: string,           // Task description
  status: 'queued' | 'in-progress' | 'completed' | 'failed' | 'blocked',
  priority: number,        // 1-10, higher = more important
  dependencies: string[],  // Task IDs that must complete first
  optional: boolean,       // Can be skipped
  attempts: number,        // Execution attempt count
  error: string | null,    // Last error message
  startedAt: string | null,
  completedAt: string | null
}
```

### 3. Error Recovery Manager (`lib/auto/error-recovery-manager.js`)

**Purpose**: Automatic error diagnosis and resolution

**Key Methods**:
```javascript
class ErrorRecoveryManager {
  constructor(config)
  
  // Error handling
  async analyzeError(error, context)
  async selectRecoveryStrategy(errorAnalysis)
  async applyRecoveryStrategy(strategy, context)
  async validateRecovery(context)
  
  // Strategy management
  registerStrategy(name, strategyFn)
  getAvailableStrategies()
  
  // Learning
  async recordSuccess(error, strategy)
  async recordFailure(error, strategy)
  async getSuggestedStrategy(error)
  
  // Reporting
  getRecoveryLog()
  getSuccessRate(strategy)
}
```

**Error Analysis Structure**:
```javascript
{
  type: 'compilation' | 'test-failure' | 'runtime' | 'dependency' | 'unknown',
  severity: 'low' | 'medium' | 'high' | 'critical',
  message: string,
  stackTrace: string,
  context: {
    file: string,
    line: number,
    task: string
  },
  suggestedStrategies: string[]
}
```

**Recovery Strategies**:
1. **Compilation Errors**:
   - Syntax fix: Parse error message, identify issue, apply fix
   - Import resolution: Add missing imports, fix paths
   - Type correction: Fix type mismatches, add type annotations

2. **Test Failures**:
   - Logic fix: Analyze test expectations, fix implementation
   - Test data fix: Adjust test data to match requirements
   - Mock update: Update mocks to match new interfaces

3. **Runtime Errors**:
   - Null check: Add null/undefined checks
   - Error handling: Wrap in try-catch, add error handling
   - Resource cleanup: Add proper cleanup code

4. **Dependency Errors**:
   - Install missing: Run npm install for missing packages
   - Version resolution: Update package versions
   - Circular dependency: Refactor to break cycles


### 4. Decision Engine (`lib/auto/decision-engine.js`)

**Purpose**: Autonomous technical decision-making

**Key Methods**:
```javascript
class DecisionEngine {
  constructor(projectContext)
  
  // Technology decisions
  async chooseTechnologyStack(requirements)
  async selectArchitecturePattern(requirements)
  async chooseTestingFramework(language)
  
  // Implementation decisions
  async selectDataStructure(requirements)
  async chooseNamingConvention(context)
  async determineFileStructure(components)
  
  // Quality decisions
  async shouldRefactor(code, metrics)
  async shouldAddTests(coverage, requirements)
  async shouldOptimize(performance, requirements)
  
  // Documentation
  documentDecision(decision, rationale)
  getDecisionHistory()
}
```

**Decision Record**:
```javascript
{
  id: string,
  timestamp: string,
  category: 'technology' | 'architecture' | 'implementation' | 'quality',
  decision: string,
  rationale: string,
  alternatives: string[],
  impact: 'low' | 'medium' | 'high',
  reversible: boolean
}
```

### 5. Progress Tracker (`lib/auto/progress-tracker.js`)

**Purpose**: Real-time monitoring and reporting

**Key Methods**:
```javascript
class ProgressTracker {
  constructor()
  
  // Progress tracking
  async updateProgress(phase, percentage)
  async logAction(action, details)
  async logDecision(decision)
  async logError(error, recovery)
  
  // Reporting
  getCurrentStatus()
  getProgressSummary()
  getDetailedReport()
  getExecutionTimeline()
  
  // Metrics
  getTaskCompletionRate()
  getErrorRecoveryRate()
  getEstimatedTimeRemaining()
  
  // Export
  async exportReport(format, outputPath)
}
```

**Progress Status**:
```javascript
{
  phase: 'requirements' | 'design' | 'tasks' | 'implementation' | 'qa' | 'complete',
  overallProgress: number,  // 0-100
  currentTask: string,
  tasksCompleted: number,
  tasksTotal: number,
  errorsEncountered: number,
  errorsResolved: number,
  startedAt: string,
  estimatedCompletion: string,
  recentActions: Action[]
}
```

### 6. Checkpoint Manager (`lib/auto/checkpoint-manager.js`)

**Purpose**: Strategic pause points and rollback capability

**Key Methods**:
```javascript
class CheckpointManager {
  constructor(config)
  
  // Checkpoint operations
  async createCheckpoint(type, data)
  async listCheckpoints()
  async getCheckpoint(id)
  async deleteCheckpoint(id)
  
  // User interaction
  async requestUserApproval(checkpoint)
  async waitForUserInput(checkpoint, timeout)
  
  // Rollback
  async rollbackToCheckpoint(id)
  async createRollbackPoint()
  async validateRollback(id)
  
  // Configuration
  shouldCreateCheckpoint(type)
  getCheckpointConfig()
}
```

**Checkpoint Types**:
```javascript
{
  REQUIREMENTS_COMPLETE: 'requirements-complete',
  DESIGN_COMPLETE: 'design-complete',
  TASKS_COMPLETE: 'tasks-complete',
  PHASE_COMPLETE: 'phase-complete',
  FATAL_ERROR: 'fatal-error',
  EXTERNAL_RESOURCE_NEEDED: 'external-resource',
  FINAL_REVIEW: 'final-review'
}
```

**Checkpoint Structure**:
```javascript
{
  id: string,
  type: string,
  timestamp: string,
  phase: string,
  data: {
    filesModified: string[],
    tasksCompleted: string[],
    decisions: Decision[],
    errors: Error[]
  },
  state: {
    taskQueue: TaskQueue,
    progress: Progress,
    context: ExecutionContext
  },
  requiresUserApproval: boolean,
  approved: boolean | null
}
```


## Data Models

### Autonomous Execution State

**Location**: `.sce/auto/state.json`

**Schema**:
```typescript
interface AutonomousState {
  version: string;
  specName: string;
  mode: 'conservative' | 'balanced' | 'aggressive';
  
  status: {
    phase: Phase;
    isRunning: boolean;
    isPaused: boolean;
    startedAt: string;
    lastUpdated: string;
  };
  
  taskQueue: {
    tasks: Task[];
    currentTask: string | null;
    completedCount: number;
    failedCount: number;
  };
  
  progress: {
    overallProgress: number;
    phaseProgress: Record<Phase, number>;
    estimatedCompletion: string;
  };
  
  errors: {
    total: number;
    resolved: number;
    unresolved: ErrorRecord[];
  };
  
  checkpoints: {
    latest: string;
    history: string[];
  };
  
  decisions: Decision[];
  executionLog: LogEntry[];
}
```

### Configuration

**Location**: `.sce/auto/config.json` (global) or `.sce/specs/{spec-name}/auto-config.json` (per-spec)

**Schema**:
```typescript
interface AutonomousConfig {
  version: string;
  
  mode: 'conservative' | 'balanced' | 'aggressive';
  
  checkpoints: {
    requirementsReview: boolean;
    designReview: boolean;
    tasksReview: boolean;
    phaseCompletion: boolean;
    finalReview: boolean;
    errorThreshold: number;  // Create checkpoint after N errors
  };
  
  errorRecovery: {
    enabled: boolean;
    maxAttempts: number;
    strategies: string[];
    learningEnabled: boolean;
  };
  
  safety: {
    requireProductionConfirmation: boolean;
    requireExternalResourceConfirmation: boolean;
    requireDestructiveOperationConfirmation: boolean;
    allowedOperations: string[];
    blockedOperations: string[];
  };
  
  performance: {
    maxConcurrentTasks: number;
    taskTimeout: number;
    checkpointInterval: number;
  };
  
  notifications: {
    enabled: boolean;
    onCheckpoint: boolean;
    onError: boolean;
    onCompletion: boolean;
  };
}
```

### Execution Log Entry

**Schema**:
```typescript
interface LogEntry {
  id: string;
  timestamp: string;
  type: 'action' | 'decision' | 'error' | 'recovery' | 'checkpoint';
  phase: Phase;
  task: string | null;
  
  data: {
    message: string;
    details: Record<string, any>;
    duration: number | null;
  };
  
  metadata: {
    attemptNumber: number;
    success: boolean;
    impact: 'low' | 'medium' | 'high';
  };
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Autonomous Spec Creation Completeness

*For any* feature description, when the Autonomous_Engine creates a Spec autonomously, it should generate all three documents (requirements.md, design.md, tasks.md) without requesting step-by-step confirmation between document creation phases.

**Validates: Requirements 1.1, 1.6**

### Property 2: EARS Compliance in Generated Requirements

*For any* generated requirements document, all acceptance criteria should follow one of the six EARS patterns (Ubiquitous, Event-driven, State-driven, Unwanted event, Optional feature, Complex).

**Validates: Requirements 1.2**

### Property 3: Design Decision Documentation Completeness

*For any* autonomous execution, all significant architectural and technical decisions should appear in design.md with documented rationale, alternatives considered, and impact assessment.

**Validates: Requirements 3.4, 3.6**

### Property 4: Task Dependency Validity

*For any* generated task list, the dependency graph should be acyclic and all task dependencies should reference existing tasks in the list.

**Validates: Requirements 1.4, 5.2**

### Property 5: Continuous Execution Without Interruption

*For any* sequence of related tasks in autonomous mode, the engine should execute all tasks continuously without requesting user confirmation between individual task executions, only pausing at configured checkpoints.

**Validates: Requirements 1.5, 1.6, 4.1**

### Property 6: Error Recovery with Validation

*For any* error encountered during execution, the Autonomous_Engine should analyze the error, apply a recovery strategy, and validate the fix by re-running affected tests before proceeding to the next task.

**Validates: Requirements 2.1, 2.2, 2.4**

### Property 7: Error Prioritization by Severity

*For any* set of multiple concurrent errors, the Autonomous_Engine should resolve errors in order of severity (critical → high → medium → low), ensuring higher-severity errors are addressed first.

**Validates: Requirements 2.5**

### Property 8: Retry Limit Enforcement

*For any* error that cannot be resolved, after exactly 3 failed recovery attempts, the Autonomous_Engine should pause execution and create an emergency checkpoint requesting user assistance.

**Validates: Requirements 2.3, 4.4**

### Property 9: Comprehensive Audit Logging

*For any* autonomous execution, all actions (task executions, decisions, errors, recoveries, checkpoints) should be recorded in the execution log with timestamps, context, and outcomes.

**Validates: Requirements 2.6, 7.2, 7.4, 8.6**

### Property 10: Codebase Pattern Consistency

*For any* new code generated during autonomous execution, the code structure, naming conventions, and architectural patterns should align with existing codebase patterns detected from the project.

**Validates: Requirements 3.3, 3.5**

### Property 11: Checkpoint Creation at Phase Boundaries

*For any* autonomous execution, checkpoints should be created at the completion of each major phase (requirements, design, tasks, implementation, QA) and before any phase transition.

**Validates: Requirements 4.2, 9.1**

### Property 12: External Resource Pause

*For any* operation requiring external resources (API keys, credentials, external services), the Autonomous_Engine should pause execution and request user input before attempting the operation.

**Validates: Requirements 4.5**

### Property 13: Task Execution Order Correctness

*For any* task in the queue, it should not begin execution until all of its dependency tasks have completed successfully, ensuring proper execution order.

**Validates: Requirements 5.3**

### Property 14: Task Failure Propagation

*For any* failed task with dependent tasks, all dependent tasks should be marked as blocked and not execute until the failed task is resolved.

**Validates: Requirements 5.4**

### Property 15: Priority-Based Execution

*For any* set of ready tasks (dependencies satisfied), tasks with higher priority values should execute before tasks with lower priority values, respecting dependency constraints.

**Validates: Requirements 5.5**

### Property 16: Progress Tracking Completeness

*For any* point during autonomous execution, the Progress_Tracker should maintain accurate real-time status for all tasks (queued, in-progress, completed, failed, blocked) and provide current progress percentage.

**Validates: Requirements 7.1, 7.3, 7.6**

### Property 17: Safety Boundary Enforcement

*For any* operation that modifies production environments, deletes files outside the workspace, or accesses external systems, the Autonomous_Engine should request explicit user confirmation before proceeding.

**Validates: Requirements 8.1, 8.2, 8.5**

### Property 18: Graceful Interrupt Handling

*For any* interrupt signal (Ctrl+C) received during execution, the Autonomous_Engine should gracefully pause, save current state including task queue and progress, and allow resumption from the same point.

**Validates: Requirements 8.3, 6.3**

### Property 19: Configuration Boundary Respect

*For any* configured safety boundary or blocked operation in the autonomous configuration, the Autonomous_Engine should enforce the boundary and never perform blocked operations without user override.

**Validates: Requirements 8.4**

### Property 20: Rollback State Restoration

*For any* rollback operation to a previous checkpoint, the project state (files, task queue, progress) should be restored to exactly match the state at that checkpoint, with all changes after the checkpoint reverted.

**Validates: Requirements 9.2, 9.4**

### Property 21: Rollback Point Retention

*For any* autonomous execution with more than 5 checkpoints, only the most recent 5 checkpoint rollback points should be retained, with older rollback points automatically cleaned up.

**Validates: Requirements 9.3**

### Property 22: Rollback Documentation

*For any* rollback operation, the execution log should document which checkpoint was restored, what files were modified, and the reason for the rollback.

**Validates: Requirements 9.6**

### Property 23: Existing Feature Integration

*For any* autonomous execution, the engine should successfully integrate with and use existing sce features (collaboration system, workspace management, environment management, test infrastructure) without conflicts.

**Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

### Property 24: Safety Priority in Conflicts

*For any* conflict between autonomous actions and existing features or safety boundaries, the Autonomous_Engine should prioritize safety and user control over autonomous efficiency.

**Validates: Requirements 10.6**

### Property 25: Mode-Specific Behavior

*For any* autonomous execution, conservative mode should create more checkpoints and request more approvals than balanced mode, and balanced mode should create more checkpoints than aggressive mode.

**Validates: Requirements 11.1, 11.2, 11.3**

### Property 26: Configuration Hierarchy

*For any* project with both global and project-specific autonomous configuration, project-specific settings should override global defaults for all configuration options.

**Validates: Requirements 11.5**

### Property 27: Strategy Learning and Prioritization

*For any* error type encountered multiple times, when the same error type occurs again, the Autonomous_Engine should prioritize recovery strategies that have previously succeeded for that error type.

**Validates: Requirements 12.1, 12.2**

### Property 28: Decision Outcome Tracking

*For any* autonomous decision made, the system should track the outcome (success/failure) and adjust future decision-making patterns to favor approaches with higher historical success rates.

**Validates: Requirements 12.3**

### Property 29: User Intervention Pattern Recognition

*For any* series of user interventions that override autonomous decisions, the system should identify patterns in the overrides and adjust future autonomous behavior to align with user preferences.

**Validates: Requirements 12.4, 12.6**

### Property 30: Estimation Improvement Over Time

*For any* task type executed multiple times across different Specs, time estimates and progress predictions should become more accurate with each execution as historical data accumulates.

**Validates: Requirements 12.5**


## Error Handling

### Autonomous Execution Errors

**State Corruption**:
- Error: `AutonomousError: Execution state file corrupted or invalid`
- Action: Attempt to restore from last valid checkpoint, if unavailable request user to restart
- Recovery: Load backup state or create fresh state

**Task Execution Failure**:
- Error: `TaskExecutionError: Task '2.3' failed after 3 attempts: [error details]`
- Action: Pause execution, create emergency checkpoint, request user assistance
- Recovery: User fixes issue manually or provides guidance, then resumes

**Checkpoint Creation Failure**:
- Error: `CheckpointError: Failed to create checkpoint: disk full`
- Action: Clean up old checkpoints, retry checkpoint creation
- Recovery: If still fails, continue without checkpoint but warn user

**Configuration Errors**:
- Error: `ConfigError: Invalid autonomous configuration: mode must be 'conservative', 'balanced', or 'aggressive'`
- Action: Reject invalid configuration, use default configuration
- Recovery: User fixes configuration file

### Error Recovery Errors

**Recovery Strategy Failure**:
- Error: `RecoveryError: All recovery strategies failed for compilation error in file.js`
- Action: After 3 failed attempts, pause and request user assistance
- Recovery: User provides fix or guidance

**Infinite Recovery Loop**:
- Error: `RecoveryError: Detected infinite recovery loop - same error recurring after fix`
- Action: Immediately pause execution, create emergency checkpoint
- Recovery: User investigates root cause

**Test Validation Failure**:
- Error: `ValidationError: Fix applied but tests still failing`
- Action: Try alternative recovery strategy, if all strategies exhausted, pause
- Recovery: User reviews fix and tests

### Safety Boundary Violations

**Production Environment Access**:
- Error: `SafetyError: Attempted to modify production environment without confirmation`
- Action: Block operation, request user confirmation
- Recovery: User confirms or denies operation

**Workspace Boundary Violation**:
- Error: `SafetyError: Attempted to modify file outside workspace: /etc/config`
- Action: Block operation, log violation, request user approval
- Recovery: User approves or operation is skipped

**External System Access**:
- Error: `SafetyError: Attempted to access external API without confirmation`
- Action: Pause execution, request user to provide credentials or approval
- Recovery: User provides credentials or skips operation

### Rollback Errors

**Rollback Point Not Found**:
- Error: `RollbackError: Checkpoint 'abc123' not found`
- Action: List available checkpoints, request user to select valid checkpoint
- Recovery: User selects different checkpoint

**Rollback Conflict**:
- Error: `RollbackError: Cannot rollback - files modified outside autonomous execution`
- Action: Show conflicting files, offer to force rollback or cancel
- Recovery: User resolves conflicts manually or forces rollback

**Partial Rollback Failure**:
- Error: `RollbackError: Some files could not be restored: [file list]`
- Action: Restore what's possible, document failures, request user intervention
- Recovery: User manually restores failed files

### Integration Errors

**Collaboration Conflict**:
- Error: `IntegrationError: Spec is assigned to another Kiro instance`
- Action: Pause autonomous execution, notify user of conflict
- Recovery: User resolves assignment conflict

**Workspace Not Found**:
- Error: `IntegrationError: Active workspace not found`
- Action: Pause execution, request user to activate workspace
- Recovery: User activates workspace, resumes execution

**Environment Mismatch**:
- Error: `IntegrationError: Required environment 'production' not configured`
- Action: Pause execution, request user to configure environment
- Recovery: User configures environment or switches to different environment


## Testing Strategy

### Dual Testing Approach

This feature requires both **unit tests** and **property-based tests** for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, CLI command behavior, error conditions, and checkpoint scenarios
- **Property tests**: Verify universal properties across all inputs (task queues, error recovery, decision-making, state management)

Both testing approaches are complementary and necessary for ensuring the autonomous control system works reliably across all scenarios.

### Property-Based Testing

**Library**: Use `fast-check` for JavaScript property-based testing

**Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with: `Feature: ai-autonomous-control, Property {N}: {property text}`
- Each correctness property implemented by a SINGLE property-based test

**Property Test Examples**:

```javascript
// Property 1: Autonomous Spec Creation Completeness
test('Feature: ai-autonomous-control, Property 1: Autonomous Spec Creation Completeness', async () => {
  fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 10, maxLength: 200 }), // Feature description
      async (featureDescription) => {
        const engine = new AutonomousEngine({ mode: 'balanced' });
        const result = await engine.createSpecAutonomously(featureDescription);
        
        // Verify all three documents were created
        expect(result.requirementsCreated).toBe(true);
        expect(result.designCreated).toBe(true);
        expect(result.tasksCreated).toBe(true);
        
        // Verify no user confirmation was requested between phases
        expect(result.userConfirmationsRequested).toBe(0);
      }
    ),
    { numRuns: 100 }
  );
});

// Property 5: Continuous Execution Without Interruption
test('Feature: ai-autonomous-control, Property 5: Continuous Execution Without Interruption', async () => {
  fc.assert(
    fc.asyncProperty(
      fc.array(generateValidTask(), { minLength: 3, maxLength: 10 }),
      async (tasks) => {
        const engine = new AutonomousEngine({ mode: 'aggressive' });
        const queueManager = new TaskQueueManager();
        
        await queueManager.loadTasks(tasks);
        const executionLog = await engine.executeTaskQueue();
        
        // Count user confirmation requests between tasks
        const confirmationsBetweenTasks = executionLog.filter(
          entry => entry.type === 'user-confirmation' && 
                   entry.phase === 'task-execution'
        ).length;
        
        // Should be 0 in autonomous mode
        expect(confirmationsBetweenTasks).toBe(0);
      }
    ),
    { numRuns: 100 }
  );
});

// Property 7: Error Prioritization by Severity
test('Feature: ai-autonomous-control, Property 7: Error Prioritization by Severity', async () => {
  fc.assert(
    fc.asyncProperty(
      fc.array(generateError(), { minLength: 2, maxLength: 5 }),
      async (errors) => {
        const recoveryManager = new ErrorRecoveryManager();
        
        // Inject multiple errors
        for (const error of errors) {
          await recoveryManager.recordError(error);
        }
        
        // Get resolution order
        const resolutionOrder = await recoveryManager.getResolutionOrder();
        
        // Verify errors are ordered by severity
        const severityOrder = ['critical', 'high', 'medium', 'low'];
        for (let i = 0; i < resolutionOrder.length - 1; i++) {
          const currentSeverity = severityOrder.indexOf(resolutionOrder[i].severity);
          const nextSeverity = severityOrder.indexOf(resolutionOrder[i + 1].severity);
          expect(currentSeverity).toBeLessThanOrEqual(nextSeverity);
        }
      }
    ),
    { numRuns: 100 }
  );
});

// Property 13: Task Execution Order Correctness
test('Feature: ai-autonomous-control, Property 13: Task Execution Order Correctness', async () => {
  fc.assert(
    fc.asyncProperty(
      generateTaskGraphWithDependencies(),
      async (taskGraph) => {
        const queueManager = new TaskQueueManager();
        await queueManager.loadTasks(taskGraph.tasks);
        
        const executionOrder = [];
        while (queueManager.hasRemainingTasks()) {
          const task = await queueManager.getNextTask();
          executionOrder.push(task.id);
          await queueManager.markTaskComplete(task.id);
        }
        
        // Verify all dependencies were satisfied before execution
        for (const taskId of executionOrder) {
          const task = taskGraph.tasks.find(t => t.id === taskId);
          const taskIndex = executionOrder.indexOf(taskId);
          
          for (const depId of task.dependencies) {
            const depIndex = executionOrder.indexOf(depId);
            expect(depIndex).toBeLessThan(taskIndex);
          }
        }
      }
    ),
    { numRuns: 100 }
  );
});

// Property 20: Rollback State Restoration
test('Feature: ai-autonomous-control, Property 20: Rollback State Restoration', async () => {
  fc.assert(
    fc.asyncProperty(
      fc.array(generateFileModification(), { minLength: 1, maxLength: 10 }),
      async (modifications) => {
        const checkpointManager = new CheckpointManager();
        const engine = new AutonomousEngine();
        
        // Create checkpoint
        const checkpoint = await checkpointManager.createCheckpoint('test', {});
        const initialState = await engine.captureState();
        
        // Apply modifications
        for (const mod of modifications) {
          await applyModification(mod);
        }
        
        // Rollback
        await checkpointManager.rollbackToCheckpoint(checkpoint.id);
        const restoredState = await engine.captureState();
        
        // Verify state matches initial state
        expect(restoredState).toEqual(initialState);
      }
    ),
    { numRuns: 100 }
  );
});
```

### Unit Testing

**Focus Areas**:
- CLI command parsing and output formatting
- Specific error conditions (fatal errors, retry limits, external resources)
- Edge cases (empty task queues, single-task specs, circular dependencies)
- Checkpoint creation at specific events
- Configuration validation and hierarchy
- Integration with existing sce commands

**Test Structure**:
```
tests/unit/auto/
├── autonomous-engine.test.js
├── task-queue-manager.test.js
├── error-recovery-manager.test.js
├── decision-engine.test.js
├── progress-tracker.test.js
├── checkpoint-manager.test.js
└── cli-commands.test.js

tests/integration/auto/
├── end-to-end-autonomous-execution.test.js
├── error-recovery-scenarios.test.js
├── checkpoint-and-rollback.test.js
├── multi-phase-execution.test.js
└── existing-feature-integration.test.js
```

**Unit Test Examples**:

```javascript
// Example: Retry limit enforcement (Property 8)
describe('Error Recovery Manager - Retry Limit', () => {
  test('should pause after exactly 3 failed attempts', async () => {
    const recoveryManager = new ErrorRecoveryManager({ maxAttempts: 3 });
    const unfixableError = new Error('Unfixable compilation error');
    
    let pauseCalled = false;
    const engine = {
      pause: () => { pauseCalled = true; }
    };
    
    // Attempt recovery 3 times
    for (let i = 0; i < 3; i++) {
      const result = await recoveryManager.attemptRecovery(unfixableError, {});
      expect(result.success).toBe(false);
      expect(pauseCalled).toBe(false); // Should not pause yet
    }
    
    // 4th attempt should trigger pause
    await recoveryManager.attemptRecovery(unfixableError, {});
    expect(pauseCalled).toBe(true);
  });
});

// Example: Checkpoint creation at phase boundaries (Property 11)
describe('Checkpoint Manager - Phase Boundaries', () => {
  test('should create checkpoint at each major phase completion', async () => {
    const checkpointManager = new CheckpointManager();
    const phases = ['requirements', 'design', 'tasks', 'implementation', 'qa'];
    
    for (const phase of phases) {
      await checkpointManager.onPhaseComplete(phase);
    }
    
    const checkpoints = await checkpointManager.listCheckpoints();
    expect(checkpoints.length).toBe(5);
    
    for (let i = 0; i < phases.length; i++) {
      expect(checkpoints[i].phase).toBe(phases[i]);
      expect(checkpoints[i].type).toBe('phase-complete');
    }
  });
});

// Example: Configuration hierarchy (Property 26)
describe('Configuration - Hierarchy', () => {
  test('project config should override global config', async () => {
    const globalConfig = {
      mode: 'conservative',
      checkpoints: { requirementsReview: true }
    };
    
    const projectConfig = {
      mode: 'aggressive',
      checkpoints: { requirementsReview: false }
    };
    
    const engine = new AutonomousEngine();
    await engine.loadConfig(globalConfig, projectConfig);
    
    const effectiveConfig = engine.getConfig();
    expect(effectiveConfig.mode).toBe('aggressive');
    expect(effectiveConfig.checkpoints.requirementsReview).toBe(false);
  });
});
```

### Integration Testing

**Scenarios**:
1. **Complete Autonomous Workflow**: User runs `sce auto create "user authentication"`, system creates Spec and implements feature end-to-end
2. **Error Recovery Flow**: Inject compilation errors, test failures, verify autonomous recovery
3. **Checkpoint and Resume**: Interrupt execution, verify state saved, resume and verify continuation
4. **Rollback Scenario**: Create checkpoint, make changes, rollback, verify restoration
5. **Mode Differences**: Run same Spec in conservative, balanced, aggressive modes, verify behavior differences
6. **Integration with Collaboration**: Run autonomous execution on Spec with dependencies, verify collaboration features work
7. **Safety Boundaries**: Attempt production operations, external access, verify confirmation requests

### Test Data Generators

**For Property Tests**:
```javascript
// Generate valid task with dependencies
const generateValidTask = () => fc.record({
  id: fc.string({ minLength: 1, maxLength: 5 }),
  title: fc.string({ minLength: 10, maxLength: 100 }),
  status: fc.constant('queued'),
  priority: fc.integer({ min: 1, max: 10 }),
  dependencies: fc.array(fc.string(), { maxLength: 3 }),
  optional: fc.boolean()
});

// Generate task graph with dependencies (acyclic)
const generateTaskGraphWithDependencies = () => {
  return fc.record({
    tasks: fc.array(generateValidTask(), { minLength: 3, maxLength: 10 })
  }).map(graph => {
    // Ensure acyclic dependencies
    const taskIds = graph.tasks.map(t => t.id);
    graph.tasks.forEach((task, index) => {
      // Only depend on earlier tasks (ensures acyclic)
      task.dependencies = task.dependencies
        .filter(depId => taskIds.indexOf(depId) < index);
    });
    return graph;
  });
};

// Generate error with severity
const generateError = () => fc.record({
  type: fc.constantFrom('compilation', 'test-failure', 'runtime', 'dependency'),
  severity: fc.constantFrom('low', 'medium', 'high', 'critical'),
  message: fc.string({ minLength: 10, maxLength: 100 }),
  context: fc.record({
    file: fc.string(),
    line: fc.integer({ min: 1, max: 1000 })
  })
});

// Generate file modification
const generateFileModification = () => fc.record({
  path: fc.string({ minLength: 5, maxLength: 50 }),
  operation: fc.constantFrom('create', 'modify', 'delete'),
  content: fc.option(fc.string({ maxLength: 500 }))
});
```

### Coverage Goals

- **Line Coverage**: > 90%
- **Branch Coverage**: > 85%
- **Property Test Coverage**: All 30 correctness properties
- **Integration Test Coverage**: All major workflows and error scenarios
- **CLI Command Coverage**: 100% of autonomous commands

### Testing Best Practices

1. **Isolation**: Each test should be independent and not rely on external state
2. **Cleanup**: Always clean up test artifacts (files, state, checkpoints)
3. **Timeouts**: Set appropriate timeouts for async operations
4. **Mocking**: Mock external dependencies (file system, network) for unit tests
5. **Real Integration**: Use real components for integration tests
6. **Error Injection**: Systematically test error paths and recovery
7. **Concurrency**: Test concurrent operations (multiple errors, parallel tasks)
8. **State Validation**: Always verify state consistency after operations

