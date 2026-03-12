# Design Document

## Overview

This design extends kiro-spec-engine (sce) to support multi-user collaboration and cross-tool compatibility.


The design addresses three core challenges:

1. **Steering Exclusivity**: Kiro IDE loads all files in `.sce/steering/`, requiring exclusive use of either sce or project steering rules
2. **Multi-User Collaboration**: Multiple developers need isolated workspaces to avoid conflicts in context and task state
3. **Cross-Tool Compatibility**: Developers using Claude Code, Cursor, or other AI tools need explicit context export mechanisms

The solution introduces:
- Steering management with backup/restore capabilities
- Personal workspace directories for isolated developer state
- Task claiming mechanism for coordination
- Context export and prompt generation for cross-tool usage
- Investigation of Kiro agent hooks for potential integration

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI Commands                            │
│  sce adopt | workspace | task | context | prompt            │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Steering    │ │  Workspace   │ │   Context    │
│  Manager     │ │  Manager     │ │   Exporter   │
└──────────────┘ └──────────────┘ └──────────────┘
        │            │            │
        └────────────┼────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Backup     │ │    Task      │ │   Prompt     │
│   System     │ │   Claimer    │ │  Generator   │
└──────────────┘ └──────────────┘ └──────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │    File System         │
        │  .sce/                │
        │  ├── steering/         │
        │  ├── workspace/        │
        │  ├── specs/            │
        │  └── backups/          │
        └────────────────────────┘
```

### Directory Structure

```
.sce/
├── steering/                    # Exclusive: sce OR project steering
│   ├── CORE_PRINCIPLES.md
│   ├── ENVIRONMENT.md
│   ├── CURRENT_CONTEXT.md      # Deprecated in multi-user mode
│   └── RULES_GUIDE.md
├── workspace/                   # Personal workspaces (multi-user)
│   ├── {username}/
│   │   ├── CURRENT_CONTEXT.md  # Personal context
│   │   ├── task-state.json     # Personal task tracking
│   │   └── sync.log            # Sync history
│   └── .gitignore              # Exclude workspaces from git
├── specs/
│   └── {spec-name}/
│       ├── requirements.md
│       ├── design.md
│       ├── tasks.md            # Shared task list with claims
│       ├── context-export.md   # Exported context
│       └── prompts/            # Generated prompts
│           └── task-{id}.md
├── backups/
│   └── steering-{timestamp}/   # Steering backups
├── adoption-config.json        # Adoption configuration
└── version.json
```

## Components and Interfaces

### 1. Steering Manager

**Responsibility**: Manages exclusive steering file usage with backup/restore capabilities.

**Interface**:
```javascript
class SteeringManager {
  async detectSteering(projectPath)
  async promptStrategy(detection)
  async backupSteering(projectPath)
  async installSceSteering(projectPath)
  async restoreSteering(projectPath, backupId)
}
```

**Key Behaviors**:
- Detects conflicts during `sce adopt`
- Creates timestamped backups before changes
- Preserves user choice in `adoption-config.json`
- Provides rollback capability

### 2. Workspace Manager

**Responsibility**: Manages personal workspace directories for isolated developer state.

**Interface**:
```javascript
class WorkspaceManager {
  async initWorkspace(projectPath, username)
  async getWorkspacePath(projectPath)
  async isMultiUserMode(projectPath)
  async syncWorkspace(projectPath, username)
  async listWorkspaces(projectPath)
}
```

**Key Behaviors**:
- Creates `.sce/workspace/{username}/` on init
- Detects username from `git config user.name` or `USER` env var
- Maintains personal CURRENT_CONTEXT.md
- Excludes workspaces from git via `.gitignore`

### 3. Task Claimer

**Responsibility**: Manages task claiming and status tracking for team coordination.

**Interface**:
```javascript
class TaskClaimer {
  async claimTask(projectPath, specName, taskId, username, force)
  async unclaimTask(projectPath, specName, taskId, username)
  async getClaimedTasks(projectPath, specName)
  async updateTaskStatus(projectPath, specName, taskId, status)
}
```

**Task Format in tasks.md**:
```markdown
- [x] 2.1 Implement core functionality [@alice, claimed: 2026-01-23T10:00:00Z]
- [ ] 2.2 Write tests [@bob, claimed: 2026-01-23T11:00:00Z]
- [ ] 2.3 Update documentation
```

**Key Behaviors**:
- Parses and modifies tasks.md in-place
- Warns on claim conflicts
- Tracks claim timestamps
- Identifies stale claims (>7 days)

### 4. Context Exporter

**Responsibility**: Exports spec context as standalone Markdown for cross-tool usage.

**Interface**:
```javascript
class ContextExporter {
  async exportContext(projectPath, specName, options)
  async generateTaskContext(projectPath, specName, taskId)
  async includeSteeringRules(projectPath, steeringFiles)
}
```

**Export Format**:
```markdown
# Context Export: {spec-name}

## Spec Information
- Name: {spec-name}
- Exported: {timestamp}

## Requirements
{requirements.md content}

## Design
{design.md content}

## Tasks
{tasks.md content}

## Steering Rules
{selected steering files}
```

### 5. Prompt Generator

**Responsibility**: Generates task-specific prompts for AI coding assistants.

**Interface**:
```javascript
class PromptGenerator {
  async generatePrompt(projectPath, specName, taskId, options)
  extractRelevantRequirements(task, requirements)
  extractRelevantDesignSections(task, design)
}
```

### 6. Agent Hooks Analyzer

**Responsibility**: Investigates Kiro agent hooks and documents findings.

**Interface**:
```javascript
class AgentHooksAnalyzer {
  async analyzeAgentHooks()
  identifyUseCases(capabilities)
  generateRecommendations(useCases)
  async documentFindings(analysis)
}
```

## Data Models

### AdoptionConfig

```typescript
interface AdoptionConfig {
  version: string;
  adoptedAt: string;
  steeringStrategy: 'use-sce' | 'use-project';
  steeringBackupId?: string;
  multiUserMode: boolean;
}
```

### WorkspaceState

```typescript
interface WorkspaceState {
  username: string;
  createdAt: string;
  lastSyncAt: string;
  currentSpec?: string;
  taskState: {
    [specName: string]: {
      [taskId: string]: {
        status: 'not-started' | 'in-progress' | 'completed';
        claimedAt?: string;
        completedAt?: string;
      };
    };
  };
}
```

### ClaimedTask

```typescript
interface ClaimedTask {
  specName: string;
  taskId: string;
  taskTitle: string;
  claimedBy: string;
  claimedAt: string;
  status: 'in-progress' | 'completed';
  isStale: boolean;
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Steering Conflict Detection

*For any* project with existing steering files, when running `sce adopt`, the system should detect the conflict and prompt for a strategy choice.

**Validates: Requirements 1.1, 2.1**

### Property 2: Steering Backup on Use-SCE

*For any* project where "use-sce" strategy is selected, the system should create a timestamped backup of existing steering files before installing sce steering files.

**Validates: Requirements 1.3**

### Property 3: Steering Preservation on Use-Project

*For any* project where "use-project" strategy is selected, existing steering files should remain unchanged and no sce steering files should be installed.

**Validates: Requirements 1.4**

### Property 4: Strategy Documentation

*For any* adoption operation, the chosen steering strategy should be recorded in `.sce/adoption-config.json`.

**Validates: Requirements 2.6**

### Property 5: Workspace Initialization

*For any* developer running `sce workspace init`, the system should create `.sce/workspace/{username}/` with CURRENT_CONTEXT.md and task-state.json files.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 6: Workspace Isolation

*For any* project with multiple developers, each developer should have a separate workspace directory that does not interfere with others.

**Validates: Requirements 3.4**

### Property 7: Username Detection

*For any* system where git is configured or USER environment variable is set, the system should correctly detect the current username.

**Validates: Requirements 3.5**

### Property 8: Task Claiming

*For any* unclaimed task, when a developer runs `sce task claim {task-id}`, the task should be marked with [@username, claimed: {timestamp}] and status should be "in-progress".

**Validates: Requirements 4.1, 4.2**

### Property 9: Task Unclaiming

*For any* claimed task, when the claiming developer runs `sce task unclaim {task-id}`, the claim marker should be removed and status should be reset.

**Validates: Requirements 4.4**

### Property 10: Claimed Task Format

*For any* claimed task in tasks.md, the format should match the pattern: `- [status] {id} {title} [@{username}, claimed: {ISO-timestamp}]`.

**Validates: Requirements 4.5**

### Property 11: Status Display Completeness

*For any* project, running `sce status` should display all specs with their task completion statistics and claimed tasks grouped by developer.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 12: Stale Claim Detection

*For any* claimed task where the claim timestamp is more than 7 days old and status is still "in-progress", the system should mark it as stale.

**Validates: Requirements 5.5**

### Property 13: Context Export Completeness

*For any* spec, running `sce context export {spec-name}` should generate a Markdown file at `.sce/specs/{spec-name}/context-export.md` containing requirements, design, tasks, and steering rules.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

### Property 14: Prompt Generation Completeness

*For any* task, running `sce prompt generate {spec-name} {task-id}` should create a prompt file at `.sce/specs/{spec-name}/prompts/task-{task-id}.md` containing task description, relevant requirements, design sections, and status update instructions.

**Validates: Requirements 7.1, 7.2, 7.4, 7.5**

### Property 15: Workspace Sync Bidirectionality

*For any* developer workspace, running `sce workspace sync` should reconcile personal task state with shared tasks.md in both directions while preserving personal CURRENT_CONTEXT.md.

**Validates: Requirements 9.1, 9.2, 9.4**

### Property 16: Sync Logging

*For any* sync operation, the system should append an entry to `.sce/workspace/{username}/sync.log` with timestamp and operation details.

**Validates: Requirements 9.5**

### Property 17: Single-User Mode Detection

*For any* project without `.sce/workspace/` directory, the system should operate in single-user mode and preserve all existing functionality.

**Validates: Requirements 10.1, 10.2**

### Property 18: Gradual Migration Support

*For any* single-user project, running `sce workspace init` should enable multi-user mode without breaking existing specs or tasks.

**Validates: Requirements 10.4**

## Error Handling

### Steering Conflicts
- **Error**: Existing steering files detected during adoption
- **Handling**: Prompt user for strategy, create backup before any changes
- **Recovery**: Rollback capability via backup system

### Task Claim Conflicts
- **Error**: Task already claimed by another developer
- **Handling**: Display warning with current claim info, require `--force` flag to override
- **Recovery**: Original claimer can reclaim or admin can force unclaim

### Workspace Sync Conflicts
- **Error**: Personal task state conflicts with shared task state
- **Handling**: Display diff, prompt for resolution (keep-local/keep-remote/merge)
- **Recovery**: Sync log provides audit trail for conflict resolution

### Username Detection Failure
- **Error**: Cannot detect username from git config or environment
- **Handling**: Prompt user to provide username or configure git
- **Recovery**: Allow manual username specification via `--user` flag

### Export Failures
- **Error**: Missing spec files during context export
- **Handling**: Skip missing files, warn user, continue with available content
- **Recovery**: Partial export with clear indication of missing sections

## Testing Strategy

### Dual Testing Approach

**Unit Tests**: Verify specific examples, edge cases, and error conditions
- Steering detection with various file configurations
- Username detection from different sources
- Task parsing and formatting
- File path generation
- Error message content

**Property Tests**: Verify universal properties across all inputs
- Minimum 100 iterations per property test
- Each test tagged with: **Feature: 03-00-multi-user-and-cross-tool-support, Property {number}: {property_text}**

### Property Test Configuration

Using `fast-check` library for Node.js property-based testing:

```javascript
const fc = require('fast-check');

// Example property test
test('Property 8: Task Claiming', () => {
  fc.assert(
    fc.property(
      fc.string(), // specName
      fc.string(), // taskId
      fc.string(), // username
      async (specName, taskId, username) => {
        // Setup: Create unclaimed task
        // Action: Claim task
        // Assert: Task is marked with username and timestamp
      }
    ),
    { numRuns: 100 }
  );
});
```

### Integration Tests

- End-to-end adoption workflow with different steering strategies
- Multi-user workspace creation and synchronization
- Context export and prompt generation for real specs
- Backward compatibility with existing single-user projects

### Manual Testing

- Cross-tool compatibility verification (Claude Code, Cursor, Codex)
- UI/UX validation for prompts and error messages
- Documentation accuracy and completeness
- Agent hooks investigation and analysis

## Implementation Notes

### Backward Compatibility Strategy

1. **Detection**: Check for `.sce/workspace/` to determine mode
2. **Graceful Degradation**: Single-user commands work without workspaces
3. **Migration Path**: `sce workspace init` enables multi-user mode
4. **Documentation**: Clear migration guide for existing users

### Performance Considerations

- Context export should stream large files rather than loading entirely into memory
- Task parsing should use incremental parsing for large tasks.md files
- Workspace sync should use file timestamps to avoid unnecessary operations
- Status command should cache results for large projects

### Security Considerations

- Workspace directories excluded from git by default (`.gitignore`)
- Exported context files should not include sensitive data (API keys, credentials)
- Task claiming should respect git user configuration for authentication
- Backup files should preserve original file permissions

### Cross-Tool Compatibility

**Kiro IDE**:
- Native integration via steering auto-loading
- Full feature support including hooks (if applicable)

**Claude Code / Cursor / Codex**:
- Manual context loading via exported files
- Prompt generation for task-specific work
- Manual task status updates
- Limited real-time collaboration features

### Future Enhancements

- Real-time workspace synchronization via file watchers
- Web-based dashboard for team status visualization
- Integration with project management tools (Jira, Linear)
- Agent hooks integration (pending investigation)
- Conflict resolution UI for workspace sync
- HTML export format for context files

