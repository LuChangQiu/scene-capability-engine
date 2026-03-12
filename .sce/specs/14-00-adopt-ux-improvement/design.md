# Design Document: Adopt Command UX Improvement

**Spec ID**: 14-00  
**Feature**: 改进 adopt 命令的用户体验  
**Status**: Draft  
**Version**: 1.0  
**Last Updated**: 2026-01-27

---

## Overview

This design transforms the `sce adopt` command from an interactive, question-heavy experience into a smart, zero-interaction system that automatically handles project adoption with safety and clarity.

### Core Philosophy

**Zero Questions, Smart Decisions**: The system should make intelligent decisions automatically, eliminating user anxiety and confusion while maintaining complete safety through mandatory backups.

**Safety First**: Every modification must be preceded by a verified backup, with clear rollback instructions provided to users.

**Clear Communication**: Users should always know what happened, why it happened, and how to undo it if needed.

### Design Goals

1. **Eliminate User Anxiety**: No technical questions, no confusing terminology
2. **Maximize Safety**: Mandatory backups, verified integrity, easy rollback
3. **Ensure Consistency**: Always keep template files up-to-date
4. **Provide Clarity**: Clear progress, detailed summaries, actionable feedback

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    sce adopt Command                     │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              Smart Adoption Orchestrator                 │
│  • Detects project state                                │
│  • Selects optimal strategy                             │
│  • Coordinates execution                                │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   Strategy   │   │    Backup    │   │   Progress   │
│   Selector   │   │   Manager    │   │   Reporter   │
└──────────────┘   └──────────────┘   └──────────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  Conflict    │   │  Integrity   │   │   Summary    │
│  Resolver    │   │  Validator   │   │  Generator   │
└──────────────┘   └──────────────┘   └──────────────┘
```

### Component Responsibilities

**Smart Adoption Orchestrator**
- Entry point for adoption process
- Coordinates all components
- Ensures execution order
- Handles errors gracefully

**Strategy Selector**
- Detects current project state
- Analyzes version compatibility
- Selects optimal adoption mode
- Returns execution plan

**Conflict Resolver**
- Identifies file conflicts automatically
- Applies smart resolution rules
- Categorizes files (template vs user content)
- Generates resolution map

**Backup Manager**
- Creates mandatory backups
- Validates backup integrity
- Manages backup lifecycle
- Provides rollback support

**Progress Reporter**
- Displays real-time progress
- Shows clear status indicators
- Reports file operations
- Maintains user confidence

**Summary Generator**
- Creates detailed operation summary
- Lists all changes made
- Provides rollback instructions
- Offers next steps

---

## Smart Adoption Strategy

### Detection and Mode Selection


**Detection Logic**:

```typescript
interface ProjectState {
  hasKiroDir: boolean;
  hasVersionFile: boolean;
  currentVersion: string | null;
  targetVersion: string;
  hasSpecs: boolean;
  hasSteering: boolean;
  conflicts: FileConflict[];
}

function detectProjectState(projectPath: string): ProjectState {
  // Analyze project structure
  // Detect version information
  // Identify potential conflicts
  // Return comprehensive state
}
```

**Mode Selection Matrix**:

| Condition | Mode | Action |
|-----------|------|--------|
| No .sce/ | **Fresh** | Create new structure, no conflicts |
| .sce/ + same version | **Skip** | Already up-to-date, no action needed |
| .sce/ + older version | **Smart Update** | Backup + update templates only |
| .sce/ + newer version | **Warning** | Warn about version mismatch |
| .sce/ + no version | **Smart Adopt** | Backup + full adoption |

**Selection Algorithm**:

```typescript
function selectMode(state: ProjectState): AdoptionMode {
  if (!state.hasKiroDir) {
    return 'fresh';
  }
  
  if (!state.hasVersionFile) {
    return 'smart-adopt';
  }
  
  const comparison = compareVersions(state.currentVersion, state.targetVersion);
  
  if (comparison === 0) {
    return 'skip';
  } else if (comparison < 0) {
    return 'smart-update';
  } else {
    return 'warning';
  }
}
```

### Automatic Conflict Resolution

**File Classification**:

```typescript
enum FileCategory {
  TEMPLATE,      // steering/, tools/, README.md
  USER_CONTENT,  // specs/, custom files
  CONFIG,        // version.json, adoption-config.json
  GENERATED      // backups/, logs/
}

function classifyFile(filePath: string): FileCategory {
  // Classify based on path patterns
}
```

**Resolution Rules**:

| File Category | Conflict Resolution |
|--------------|-------------------|
| **Template** | Backup + Update to latest |
| **User Content** | Always preserve |
| **Config** | Backup + Merge/Update |
| **Generated** | Skip (regenerate) |

**Resolution Algorithm**:

```typescript
interface ResolutionRule {
  category: FileCategory;
  action: 'preserve' | 'update' | 'merge' | 'skip';
  requiresBackup: boolean;
}

function resolveConflict(file: FileConflict): ResolutionRule {
  const category = classifyFile(file.path);
  
  switch (category) {
    case FileCategory.TEMPLATE:
      return {
        category,
        action: 'update',
        requiresBackup: true
      };
    
    case FileCategory.USER_CONTENT:
      return {
        category,
        action: 'preserve',
        requiresBackup: false
      };
    
    case FileCategory.CONFIG:
      return {
        category,
        action: 'merge',
        requiresBackup: true
      };
    
    case FileCategory.GENERATED:
      return {
        category,
        action: 'skip',
        requiresBackup: false
      };
  }
}
```

**Special Cases**:

1. **CURRENT_CONTEXT.md**: Always preserve (user-specific)
2. **Custom steering files**: Preserve if not in template
3. **Spec directories**: Always preserve
4. **Backup directories**: Never touch

---

## Backup System Integration

### Mandatory Backup Flow

```
┌─────────────────────────────────────────┐
│  1. Identify files to be modified       │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  2. Create selective backup              │
│     • Only files that will change        │
│     • Timestamp-based ID                 │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  3. Validate backup integrity            │
│     • File count matches                 │
│     • Content verification               │
│     • Structure validation               │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  4. Proceed with modifications           │
│     (only if backup validated)           │
└─────────────────────────────────────────┘
```

**Backup Interface**:

```typescript
interface BackupResult {
  id: string;
  timestamp: Date;
  filesBackedUp: string[];
  totalSize: number;
  validated: boolean;
  location: string;
}

async function createMandatoryBackup(
  projectPath: string,
  filesToModify: string[]
): Promise<BackupResult> {
  // Create selective backup
  const backup = await selectiveBackup.create(projectPath, filesToModify);
  
  // Validate immediately
  const validation = await validateBackup(backup);
  
  if (!validation.success) {
    throw new Error(`Backup validation failed: ${validation.error}`);
  }
  
  return backup;
}
```

**Validation Checks**:

1. **File Count**: Backup contains all expected files
2. **File Size**: Each file size matches original
3. **Content Hash**: SHA-256 verification for critical files
4. **Structure**: Directory structure preserved

**Failure Handling**:

```typescript
try {
  const backup = await createMandatoryBackup(projectPath, filesToModify);
} catch (error) {
  console.error('❌ Backup failed:', error.message);
  console.log('⚠️  Aborting adoption for safety');
  console.log('💡 Possible causes:');
  console.log('   - Insufficient disk space');
  console.log('   - Permission denied');
  console.log('   - File system error');
  process.exit(1);
}
```

---

## Progress Reporting

### Real-Time Feedback

**Progress Stages**:

```typescript
enum ProgressStage {
  ANALYZING = 'Analyzing project structure',
  PLANNING = 'Creating adoption plan',
  BACKING_UP = 'Creating backup',
  VALIDATING = 'Validating backup',
  UPDATING = 'Updating files',
  CLEANING = 'Cleaning old files',
  FINALIZING = 'Finalizing adoption',
  COMPLETE = 'Adoption complete'
}
```

**Progress Display**:

```typescript
interface ProgressUpdate {
  stage: ProgressStage;
  status: 'in-progress' | 'complete' | 'error';
  details?: string;
  filesProcessed?: number;
  totalFiles?: number;
}

function displayProgress(update: ProgressUpdate): void {
  const icon = getStatusIcon(update.status);
  const message = `${icon} ${update.stage}`;
  
  if (update.filesProcessed && update.totalFiles) {
    console.log(`${message} (${update.filesProcessed}/${update.totalFiles})`);
  } else if (update.details) {
    console.log(`${message} ${update.details}`);
  } else {
    console.log(message);
  }
}
```

**Status Icons**:

- 🔄 In Progress
- ✅ Complete
- ❌ Error
- ⏭️  Skipped
- 📦 Backup
- 📝 Update
- 🗑️  Delete

**Example Output**:

```
🔥 Scene Capability Engine - Project Adoption

📦 Analyzing project structure... ✅
📋 Creating adoption plan... ✅

Adoption Plan:
  Mode: Smart Update
  Files to update: 5
  Files to preserve: 8
  Backup required: Yes

🚀 Starting adoption...
📦 Creating backup... ✅ backup-20260127-143022
✓ Validating backup... ✅ 5 files verified
📝 Updating files...
  ✅ .sce/steering/CORE_PRINCIPLES.md
  ✅ .sce/steering/ENVIRONMENT.md
  ✅ .sce/steering/RULES_GUIDE.md
  ✅ .sce/tools/ultrawork_enhancer.py
  ✅ .sce/README.md
  ⏭️  .sce/specs/ (preserved)
  ⏭️  .sce/steering/CURRENT_CONTEXT.md (preserved)
✅ Adoption completed successfully!
```

---

## Summary Generation

### Comprehensive Summary

**Summary Structure**:

```typescript
interface AdoptionSummary {
  mode: AdoptionMode;
  backup: BackupInfo;
  changes: ChangesSummary;
  preserved: PreservedFiles;
  rollback: RollbackInfo;
  nextSteps: string[];
}

interface BackupInfo {
  id: string;
  location: string;
  filesCount: number;
  totalSize: string;
}

interface ChangesSummary {
  updated: string[];
  created: string[];
  deleted: string[];
  total: number;
}

interface PreservedFiles {
  specs: number;
  custom: number;
  total: number;
}

interface RollbackInfo {
  command: string;
  description: string;
}
```

**Summary Display**:

```typescript
function displaySummary(summary: AdoptionSummary): void {
  console.log();
  console.log(chalk.green('✅ Adoption completed successfully!'));
  console.log();
  
  console.log(chalk.blue('📊 Summary:'));
  console.log(`  Mode: ${summary.mode}`);
  console.log(`  Backup: ${summary.backup.id}`);
  console.log(`  Updated: ${summary.changes.updated.length} files`);
  console.log(`  Preserved: ${summary.preserved.total} files`);
  console.log();
  
  if (summary.changes.updated.length > 0) {
    console.log(chalk.blue('Updated files:'));
    summary.changes.updated.forEach(file => {
      console.log(chalk.green(`  ✅ ${file}`));
    });
    console.log();
  }
  
  if (summary.preserved.total > 0) {
    console.log(chalk.gray('Preserved files:'));
    console.log(chalk.gray(`  ⏭️  ${summary.preserved.specs} spec(s)`));
    console.log(chalk.gray(`  ⏭️  ${summary.preserved.custom} custom file(s)`));
    console.log();
  }
  
  console.log(chalk.blue('💡 Your original files are safely backed up.'));
  console.log(chalk.gray(`   To restore: ${chalk.cyan(summary.rollback.command)}`));
  console.log();
  
  if (summary.nextSteps.length > 0) {
    console.log(chalk.blue('📋 Next steps:'));
    summary.nextSteps.forEach((step, index) => {
      console.log(`  ${index + 1}. ${step}`);
    });
  }
}
```

---

## Command Line Interface

### Default Behavior (Zero Interaction)

```bash
$ sce adopt
# Automatically:
# 1. Detects project state
# 2. Selects best mode
# 3. Creates backup
# 4. Resolves conflicts
# 5. Updates files
# 6. Shows summary
```

### Advanced Options

```typescript
interface AdoptCommandOptions {
  dryRun?: boolean;        // Preview without executing
  noBackup?: boolean;      // Skip backup (dangerous)
  interactive?: boolean;   // Enable old interactive mode
  skipUpdate?: boolean;    // Don't update templates
  force?: boolean;         // Force overwrite (with backup)
  verbose?: boolean;       // Show detailed logs
}
```

**Option Descriptions**:

| Option | Description | Safety Level |
|--------|-------------|--------------|
| `--dry-run` | Preview changes without executing | ✅ Safe |
| `--no-backup` | Skip backup creation | ⚠️ Dangerous |
| `--interactive` | Enable interactive prompts | ✅ Safe |
| `--skip-update` | Don't update template files | ⚠️ May cause inconsistency |
| `--force` | Force overwrite with backup | ⚠️ Use with caution |
| `--verbose` | Show detailed execution logs | ✅ Safe |

**Usage Examples**:

```bash
# Default: Smart, automatic, safe
$ sce adopt

# Preview what would happen
$ sce adopt --dry-run

# Interactive mode for advanced users
$ sce adopt --interactive

# Force update with backup
$ sce adopt --force

# Verbose output for debugging
$ sce adopt --verbose
```

---

## Error Handling

### Error Categories

**1. Pre-Execution Errors**
- Project not found
- Invalid project structure
- Version detection failure

**Strategy**: Display clear error message, suggest fixes, exit gracefully

**2. Backup Errors**
- Insufficient disk space
- Permission denied
- Backup validation failure

**Strategy**: Abort immediately, explain cause, suggest solutions

**3. Execution Errors**
- File copy failure
- Permission issues during update
- Unexpected file conflicts

**Strategy**: Stop execution, preserve current state, provide rollback info

**4. Post-Execution Errors**
- Summary generation failure
- Cleanup errors

**Strategy**: Log error, but don't fail adoption (already complete)

### Error Messages

**Template**:

```
❌ Error: {Error Type}

Problem: {Clear description of what went wrong}

Possible causes:
  - {Cause 1}
  - {Cause 2}
  - {Cause 3}

Solutions:
  1. {Solution 1}
  2. {Solution 2}
  3. {Solution 3}

💡 Need help? Run: sce doctor
```

**Example**:

```
❌ Error: Backup Creation Failed

Problem: Unable to create backup of existing files

Possible causes:
  - Insufficient disk space
  - Permission denied for .sce/backups/
  - File system error

Solutions:
  1. Free up disk space (need ~50MB)
  2. Check file permissions: ls -la .sce/
  3. Try running with sudo (if appropriate)

💡 Need help? Run: sce doctor
```

---

## Implementation Plan

### Phase 1: Core Smart Adoption (Priority: High)

**Components**:
1. Smart Adoption Orchestrator
2. Strategy Selector
3. Automatic Conflict Resolver
4. Mandatory Backup Integration

**Deliverables**:
- Zero-interaction adoption works
- Automatic mode selection
- Smart conflict resolution
- Mandatory backups

**Estimated Effort**: 3-4 days

### Phase 2: User Experience (Priority: High)

**Components**:
1. Progress Reporter
2. Summary Generator
3. Improved Error Messages

**Deliverables**:
- Real-time progress display
- Comprehensive summaries
- Clear error messages

**Estimated Effort**: 2-3 days

### Phase 3: Advanced Features (Priority: Medium)

**Components**:
1. Command-line options
2. Interactive mode (legacy)
3. Verbose logging

**Deliverables**:
- All CLI options working
- Interactive mode for advanced users
- Detailed logs for debugging

**Estimated Effort**: 2 days

### Phase 4: Testing & Documentation (Priority: High)

**Components**:
1. Unit tests
2. Integration tests
3. User documentation

**Deliverables**:
- 100% test coverage for core logic
- Integration tests for all scenarios
- Updated user guides

**Estimated Effort**: 2-3 days

---

## Testing Strategy

### Unit Tests

**Test Coverage**:

1. **Strategy Selector**
   - All detection scenarios
   - Version comparison logic
   - Mode selection accuracy

2. **Conflict Resolver**
   - File classification
   - Resolution rule application
   - Special case handling

3. **Backup Integration**
   - Backup creation
   - Validation logic
   - Failure handling

4. **Progress Reporter**
   - Stage transitions
   - Status updates
   - Display formatting

5. **Summary Generator**
   - Data aggregation
   - Display formatting
   - Rollback command generation

### Integration Tests

**Test Scenarios**:

1. **Fresh Adoption**
   - No .sce/ directory
   - Creates complete structure
   - No conflicts

2. **Smart Update**
   - Existing .sce/ with old version
   - Updates templates only
   - Preserves user content

3. **Smart Adopt**
   - Existing .sce/ without version
   - Full adoption with backup
   - Handles all conflicts

4. **Skip Mode**
   - Already at latest version
   - No changes made
   - Informative message

5. **Error Scenarios**
   - Backup failure
   - Permission errors
   - Disk space issues

### User Acceptance Testing

**Criteria**:

1. New user can adopt without reading docs
2. No questions asked during adoption
3. All messages are clear and actionable
4. Backup and rollback work correctly
5. User feels confident and safe

---

## Migration from Current Implementation

### Current State Analysis

**Existing Components**:
- `DetectionEngine`: ✅ Keep (works well)
- `AdoptionStrategy`: ⚠️ Modify (add smart mode)
- `ConflictResolver`: ⚠️ Replace (too interactive)
- `BackupSystem`: ✅ Keep (integrate better)
- `SelectiveBackup`: ✅ Keep (use for mandatory backups)

**Changes Required**:

1. **lib/commands/adopt.js**
   - Remove interactive prompts
   - Add smart orchestration
   - Integrate mandatory backup
   - Improve progress display

2. **lib/adoption/adoption-strategy.js**
   - Add SmartAdoptionStrategy class
   - Implement automatic conflict resolution
   - Integrate backup validation

3. **lib/adoption/conflict-resolver.js**
   - Keep for `--interactive` mode
   - Add automatic resolution logic
   - Simplify for non-interactive use

4. **New: lib/adoption/smart-orchestrator.js**
   - Main orchestration logic
   - Strategy selection
   - Progress coordination

5. **New: lib/adoption/file-classifier.js**
   - File category detection
   - Resolution rule engine

### Backward Compatibility

**Preserved Behavior**:
- `--interactive` flag enables old behavior
- All existing flags still work
- Backup/rollback system unchanged

**Breaking Changes**:
- Default behavior is now non-interactive
- No more conflict prompts by default
- Always creates backup (unless `--no-backup`)

**Migration Guide**:
```markdown
# For users who prefer interactive mode:
$ sce adopt --interactive

# For automated scripts:
$ sce adopt  # Now works without interaction!

# For advanced control:
$ sce adopt --dry-run  # Preview first
$ sce adopt --force    # Then execute
```

---

## Security Considerations

### Data Safety

**Guarantees**:
1. Every modification has a backup
2. Backups are validated before proceeding
3. User content is never overwritten
4. Rollback is always available

**Validation**:
- File count verification
- Content hash checking
- Structure validation
- Integrity confirmation

### Permission Handling

**Checks**:
- Read permission for source files
- Write permission for destination
- Create permission for backups
- Delete permission for cleanup

**Failure Handling**:
- Abort on permission errors
- Clear error messages
- Suggest solutions (chmod, sudo)
- Never proceed unsafely

### Sensitive Data

**Protection**:
- Never log file contents
- Redact paths in public logs
- Secure backup storage
- Clean up temporary files

---

## Performance Considerations

### Optimization Strategies

**1. Selective Operations**
- Only backup files that will change
- Only update files that differ
- Skip unchanged files

**2. Parallel Processing**
- Concurrent file operations where safe
- Parallel backup creation
- Async validation

**3. Caching**
- Cache file classifications
- Reuse detection results
- Cache template comparisons

### Performance Targets

| Project Size | Target Time | Max Time |
|-------------|-------------|----------|
| Small (<100 files) | < 5s | 10s |
| Medium (100-1000) | < 30s | 60s |
| Large (>1000) | < 2min | 5min |

---

## Traceability Matrix

| Requirement | Design Component | Implementation |
|-------------|-----------------|----------------|
| FR-2.1.1: Auto detect mode | Strategy Selector | `selectMode()` |
| FR-2.1.2: Smart conflict resolution | Conflict Resolver | `resolveConflict()` |
| FR-2.2.1: Mandatory backup | Backup Manager | `createMandatoryBackup()` |
| FR-2.2.2: Backup validation | Integrity Validator | `validateBackup()` |
| FR-2.3.1: Progress display | Progress Reporter | `displayProgress()` |
| FR-2.3.2: Result summary | Summary Generator | `displaySummary()` |
| FR-2.4.1: Template sync | Smart Orchestrator | `syncTemplates()` |
| FR-2.4.2: Clean old files | Smart Orchestrator | `cleanupOldFiles()` |
| FR-2.5.1: Advanced options | CLI Parser | Command options |
| FR-2.5.2: Default behavior | Smart Orchestrator | Main flow |

---

## Future Enhancements

### Post-MVP Features

1. **Intelligent Diff Display**
   - Show what changed in templates
   - Highlight important updates
   - Explain why updates are needed

2. **Adoption History**
   - Track all adoptions
   - Show version progression
   - Analyze adoption patterns

3. **Smart Recommendations**
   - Suggest when to adopt
   - Recommend cleanup actions
   - Detect configuration drift

4. **Multi-Project Support**
   - Adopt multiple projects at once
   - Consistent configuration across projects
   - Centralized management

---

**Design Version**: 1.0  
**Status**: Ready for Review  
**Next Step**: Create tasks.md after design approval

