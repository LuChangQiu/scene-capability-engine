# Design Document

## Overview

This design enhances the `sce adopt` command to provide interactive conflict resolution when template files would overwrite existing project files. The current implementation detects conflicts but only offers a binary choice: skip all conflicts or use the `--force` flag from the command line. This design introduces a three-tier resolution strategy: skip all, overwrite all (with backup), or review conflicts individually. The enhancement maintains backward compatibility with existing flags (`--force`, `--auto`, `--dry-run`) while significantly improving the user experience for interactive adoption scenarios.

The design focuses on three key areas:
1. **Interactive prompting** - Clear, user-friendly prompts for conflict resolution
2. **Selective backup creation** - Efficient backups that only include files being overwritten
3. **Per-file review** - Granular control with diff viewing capabilities

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      adopt.js (Command)                      │
│  - Orchestrates adoption flow                                │
│  - Handles user interaction                                  │
└───────────────┬─────────────────────────────────────────────┘
                │
                ├──────────────────────────────────────────────┐
                │                                              │
                ▼                                              ▼
┌───────────────────────────────┐      ┌──────────────────────────────────┐
│   ConflictResolver (NEW)      │      │   DetectionEngine (EXISTING)     │
│  - Prompts for resolution     │      │  - Detects conflicts             │
│  - Manages per-file review    │      │  - Analyzes project structure    │
│  - Displays diffs             │      └──────────────────────────────────┘
└───────────────┬───────────────┘
                │                                              
                ▼                                              
┌───────────────────────────────┐      ┌──────────────────────────────────┐
│   SelectiveBackup (NEW)       │      │   BackupSystem (EXISTING)        │
│  - Creates targeted backups   │      │  - Full .sce/ backups           │
│  - Tracks overwritten files   │      │  - Backup management             │
└───────────────────────────────┘      └──────────────────────────────────┘
                │
                ▼
┌───────────────────────────────┐      ┌──────────────────────────────────┐
│   AdoptionStrategy (EXISTING) │      │   DiffViewer (NEW)               │
│  - Executes adoption          │      │  - Displays file differences     │
│  - Copies template files      │      │  - Formats comparison output     │
└───────────────────────────────┘      └──────────────────────────────────┘
```

### Data Flow

```
User runs `sce adopt`
    │
    ├─> DetectionEngine.analyze()
    │   └─> Returns conflicts[]
    │
    ├─> If conflicts exist AND interactive mode:
    │   │
    │   ├─> ConflictResolver.promptStrategy()
    │   │   └─> Returns: 'skip-all' | 'overwrite-all' | 'review-each'
    │   │
    │   ├─> If 'review-each':
    │   │   └─> For each conflict:
    │   │       ├─> ConflictResolver.promptFileResolution()
    │   │       │   └─> Returns: 'keep' | 'overwrite' | 'view-diff'
    │   │       │
    │   │       └─> If 'view-diff':
    │   │           ├─> DiffViewer.showDiff()
    │   │           └─> Re-prompt for resolution
    │   │
    │   └─> If 'overwrite-all' OR any 'overwrite' decisions:
    │       └─> SelectiveBackup.create(filesToOverwrite)
    │
    └─> AdoptionStrategy.execute(resolutionDecisions)
        └─> Returns adoption result with summary
```

## Components and Interfaces

### 1. ConflictResolver (NEW)

**Purpose**: Manages interactive conflict resolution prompts and user decisions.

**Location**: `lib/adoption/conflict-resolver.js`

**Interface**:
```javascript
class ConflictResolver {
  /**
   * Prompts user for overall conflict resolution strategy
   * @param {FileConflict[]} conflicts - Array of detected conflicts
   * @returns {Promise<ConflictStrategy>} - 'skip-all' | 'overwrite-all' | 'review-each'
   */
  async promptStrategy(conflicts)

  /**
   * Prompts user for resolution of a single file conflict
   * @param {FileConflict} conflict - The conflict to resolve
   * @param {number} currentIndex - Current conflict number (for display)
   * @param {number} totalConflicts - Total number of conflicts
   * @returns {Promise<FileResolution>} - 'keep' | 'overwrite' | 'view-diff'
   */
  async promptFileResolution(conflict, currentIndex, totalConflicts)

  /**
   * Processes all conflicts based on strategy and returns resolution map
   * @param {FileConflict[]} conflicts - Array of conflicts
   * @param {ConflictStrategy} strategy - Overall strategy
   * @returns {Promise<ResolutionMap>} - Map of file paths to resolutions
   */
  async resolveConflicts(conflicts, strategy)

  /**
   * Displays conflict summary grouped by category
   * @param {FileConflict[]} conflicts - Array of conflicts
   * @returns {void}
   */
  displayConflictSummary(conflicts)
}
```

**Key Methods**:
- `promptStrategy()`: Shows the main conflict resolution menu with three options
- `promptFileResolution()`: Handles per-file prompts with diff viewing
- `resolveConflicts()`: Orchestrates the entire resolution process
- `displayConflictSummary()`: Groups conflicts by type (steering, docs, tools)

### 2. SelectiveBackup (NEW)

**Purpose**: Creates targeted backups of only the files that will be overwritten, rather than backing up the entire .sce/ directory.

**Location**: `lib/backup/selective-backup.js`

**Interface**:
```javascript
class SelectiveBackup {
  /**
   * Creates a backup of specific files before overwriting
   * @param {string} projectPath - Project root path
   * @param {string[]} filePaths - Relative paths of files to backup (from .sce/)
   * @param {Object} options - Backup options
   * @returns {Promise<SelectiveBackupInfo>}
   */
  async createSelectiveBackup(projectPath, filePaths, options)

  /**
   * Restores specific files from a selective backup
   * @param {string} projectPath - Project root path
   * @param {string} backupId - Backup ID to restore from
   * @param {string[]} filePaths - Optional: specific files to restore
   * @returns {Promise<RestoreResult>}
   */
  async restoreSelective(projectPath, backupId, filePaths)

  /**
   * Lists files in a selective backup
   * @param {string} projectPath - Project root path
   * @param {string} backupId - Backup ID
   * @returns {Promise<string[]>} - Array of file paths in backup
   */
  async listBackupFiles(projectPath, backupId)
}
```

**Backup Structure**:
```
.sce/backups/conflict-2026-01-24-143022/
├── metadata.json          # Backup metadata
├── files.json            # List of backed up files
└── files/                # Backed up files (preserving structure)
    ├── steering/
    │   └── CORE_PRINCIPLES.md
    └── README.md
```

**Metadata Format**:
```javascript
{
  "id": "conflict-2026-01-24-143022",
  "type": "conflict",
  "created": "2026-01-24T14:30:22.000Z",
  "files": [
    "steering/CORE_PRINCIPLES.md",
    "README.md"
  ],
  "fileCount": 2,
  "totalSize": 15420
}
```

### 3. DiffViewer (NEW)

**Purpose**: Displays file differences in a user-friendly format for conflict review.

**Location**: `lib/adoption/diff-viewer.js`

**Interface**:
```javascript
class DiffViewer {
  /**
   * Displays a summary diff between existing and template files
   * @param {string} existingPath - Path to existing file
   * @param {string} templatePath - Path to template file
   * @returns {Promise<void>}
   */
  async showDiff(existingPath, templatePath)

  /**
   * Gets file metadata for comparison
   * @param {string} filePath - Path to file
   * @returns {Promise<FileMetadata>}
   */
  async getFileMetadata(filePath)

  /**
   * Displays first N lines of differences
   * @param {string} existingPath - Path to existing file
   * @param {string} templatePath - Path to template file
   * @param {number} maxLines - Maximum lines to show (default: 10)
   * @returns {Promise<void>}
   */
  async showLineDiff(existingPath, templatePath, maxLines)
}
```

**Display Format**:
```
Comparing: steering/CORE_PRINCIPLES.md

Existing File:
  Size: 8.2 KB
  Modified: 2026-01-20 10:30:15

Template File:
  Size: 9.1 KB
  Modified: 2026-01-24 14:00:00

First 10 lines of differences:
  Line 15: - Old content here
  Line 15: + New content here
  Line 42: - Another old line
  Line 42: + Another new line
  ...

[Note: Full diff available by opening files in editor]
```

### 4. Enhanced DetectionEngine (MODIFIED)

**Purpose**: Extend existing conflict detection to categorize conflicts by type.

**Location**: `lib/adoption/detection-engine.js` (existing file)

**New Method**:
```javascript
/**
 * Categorizes conflicts by type for better display
 * @param {FileConflict[]} conflicts - Array of conflicts
 * @returns {CategorizedConflicts}
 */
categorizeConflicts(conflicts) {
  return {
    steering: conflicts.filter(c => c.path.startsWith('steering/')),
    documentation: conflicts.filter(c => c.path.endsWith('.md') && !c.path.startsWith('steering/')),
    tools: conflicts.filter(c => c.path.startsWith('tools/')),
    other: conflicts.filter(c => /* doesn't match above */)
  };
}
```

### 5. Enhanced adopt.js (MODIFIED)

**Purpose**: Integrate conflict resolution into the adoption flow.

**Location**: `lib/commands/adopt.js` (existing file)

**Modified Flow**:
```javascript
async function adoptCommand(options) {
  // ... existing detection code ...
  
  // NEW: Handle conflicts interactively
  let resolutionMap = {};
  let backupId = null;
  
  if (detection.conflicts.length > 0 && !options.auto && !options.force) {
    const resolver = new ConflictResolver();
    
    // Show conflict summary
    resolver.displayConflictSummary(detection.conflicts);
    
    // Get resolution strategy
    const strategy = await resolver.promptStrategy(detection.conflicts);
    
    // Resolve conflicts
    resolutionMap = await resolver.resolveConflicts(detection.conflicts, strategy);
    
    // Create selective backup if any files will be overwritten
    const filesToOverwrite = Object.entries(resolutionMap)
      .filter(([_, resolution]) => resolution === 'overwrite')
      .map(([path, _]) => path);
    
    if (filesToOverwrite.length > 0) {
      const selectiveBackup = new SelectiveBackup();
      const backup = await selectiveBackup.createSelectiveBackup(
        projectPath,
        filesToOverwrite,
        { type: 'conflict' }
      );
      backupId = backup.id;
      console.log(chalk.green(`✅ Backup created: ${backupId}`));
    }
  } else if (options.force && detection.conflicts.length > 0) {
    // Force mode: overwrite all with backup
    const filesToOverwrite = detection.conflicts.map(c => c.path);
    const selectiveBackup = new SelectiveBackup();
    const backup = await selectiveBackup.createSelectiveBackup(
      projectPath,
      filesToOverwrite,
      { type: 'conflict' }
    );
    backupId = backup.id;
    
    resolutionMap = detection.conflicts.reduce((map, conflict) => {
      map[conflict.path] = 'overwrite';
      return map;
    }, {});
  }
  
  // Pass resolution map to adoption strategy
  const result = await adoptionStrategy.execute(projectPath, strategy, {
    kseVersion: packageJson.version,
    dryRun: false,
    backupId,
    force: options.force,
    resolutionMap // NEW: Pass resolution decisions
  });
  
  // ... existing result reporting ...
}
```

## Data Models

### FileConflict

```javascript
{
  path: string,              // Relative path from .sce/ (e.g., "steering/CORE_PRINCIPLES.md")
  type: 'file',              // Type of conflict
  existingContent: string,   // Absolute path to existing file
  templateContent: string    // Path to template file
}
```

### ConflictStrategy

```javascript
type ConflictStrategy = 'skip-all' | 'overwrite-all' | 'review-each';
```

### FileResolution

```javascript
type FileResolution = 'keep' | 'overwrite' | 'view-diff';
```

### ResolutionMap

```javascript
{
  [filePath: string]: 'keep' | 'overwrite'
}
```

Example:
```javascript
{
  "steering/CORE_PRINCIPLES.md": "keep",
  "steering/ENVIRONMENT.md": "overwrite",
  "README.md": "overwrite"
}
```

### SelectiveBackupInfo

```javascript
{
  id: string,                // Backup ID (e.g., "conflict-2026-01-24-143022")
  type: 'conflict',          // Backup type
  created: string,           // ISO timestamp
  files: string[],           // Array of backed up file paths
  fileCount: number,         // Number of files backed up
  totalSize: number,         // Total size in bytes
  path: string              // Absolute path to backup directory
}
```

### CategorizedConflicts

```javascript
{
  steering: FileConflict[],      // Conflicts in steering/ directory
  documentation: FileConflict[], // Markdown files outside steering/
  tools: FileConflict[],         // Conflicts in tools/ directory
  other: FileConflict[]          // Other conflicts
}
```

### FileMetadata

```javascript
{
  path: string,              // Absolute path to file
  size: number,              // File size in bytes
  sizeFormatted: string,     // Human-readable size (e.g., "8.2 KB")
  modified: string,          // ISO timestamp
  modifiedFormatted: string, // Human-readable date
  isText: boolean,           // Whether file is text (for diff display)
  isBinary: boolean          // Whether file is binary
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Conflict Display Completeness
*For any* set of detected conflicts, the displayed conflict list should contain all conflict file paths with no duplicates or omissions.
**Validates: Requirements 1.1**

### Property 2: Conflict Count Accuracy
*For any* set of conflicts, the displayed count should equal the actual number of conflicts in the set.
**Validates: Requirements 1.2**

### Property 3: Conflict Categorization Correctness
*For any* conflict, it should be categorized into exactly one category (steering, documentation, tools, or other) based on its file path pattern.
**Validates: Requirements 1.3**

### Property 4: Interactive Prompt Triggering
*For any* adoption with conflicts where neither --force nor --auto flags are set, the conflict resolution prompt should be displayed.
**Validates: Requirements 2.1**

### Property 5: Skip Strategy Preservation
*For any* set of conflicts where "skip all" strategy is chosen, all existing files should remain unchanged and be marked as skipped in the resolution map.
**Validates: Requirements 2.3**

### Property 6: Overwrite Strategy Backup Creation
*For any* set of conflicts where "overwrite all" strategy is chosen, a backup should be created before any file modifications occur.
**Validates: Requirements 2.4, 4.1**

### Property 7: Review Strategy Completeness
*For any* set of N conflicts where "review each" strategy is chosen, exactly N individual file prompts should be presented to the user.
**Validates: Requirements 2.5, 3.1**

### Property 8: File Prompt Options Completeness
*For any* file conflict being reviewed, the prompt should offer exactly three options: "Keep existing", "Use template", and "View diff".
**Validates: Requirements 3.2**

### Property 9: Keep Resolution Mapping
*For any* file where "Keep existing" is selected, the resolution map should contain 'keep' for that file path.
**Validates: Requirements 3.3**

### Property 10: Individual Overwrite Backup Inclusion
*For any* file where "Use template" is selected during per-file review, that file should be included in the selective backup.
**Validates: Requirements 3.4**

### Property 11: Diff Display Triggering
*For any* file where "View diff" is selected, the diff viewer should be invoked with the correct existing and template file paths.
**Validates: Requirements 3.5**

### Property 12: Post-Diff Prompt Options
*For any* diff viewing, the subsequent prompt should offer exactly two options: "Keep existing" and "Use template" (not three).
**Validates: Requirements 3.6**

### Property 13: Backup Completeness
*For any* set of files marked for overwrite in the resolution map, the created backup should contain exactly those files and no others.
**Validates: Requirements 4.2**

### Property 14: Backup ID Display
*For any* backup creation, the backup ID should be displayed in the console output.
**Validates: Requirements 4.3**

### Property 15: Rollback Instructions Display
*For any* adoption that completes with at least one file overwritten, the output should contain instructions for rollback using the backup ID.
**Validates: Requirements 4.4**

### Property 16: Force Mode Backup Creation
*For any* adoption with --force flag and conflicts, a backup should be created before overwriting without any interactive prompts.
**Validates: Requirements 4.5, 5.1, 5.2**

### Property 17: Force Mode Warning Display
*For any* adoption with --force flag and conflicts, a warning message about file overwriting should be displayed.
**Validates: Requirements 5.3**

### Property 18: Auto Mode Default Behavior
*For any* adoption with --auto flag and conflicts (without --force), all conflicts should be resolved as 'skip' in the resolution map.
**Validates: Requirements 6.1**

### Property 19: Auto Mode Non-Interactive
*For any* adoption with --auto flag, no interactive prompts should be displayed regardless of conflicts.
**Validates: Requirements 6.3**

### Property 20: Dry Run Conflict Display
*For any* adoption with --dry-run flag and conflicts, all conflicts should be displayed in the output.
**Validates: Requirements 7.1**

### Property 21: Dry Run Action Preview
*For any* conflict in dry run mode, the output should indicate what action would be taken based on current flags.
**Validates: Requirements 7.2**

### Property 22: Dry Run Safety
*For any* adoption with --dry-run flag, no file system modifications (backups or overwrites) should occur.
**Validates: Requirements 7.3**

### Property 23: Skipped Files Summary
*For any* adoption that completes with skipped files, the summary should list all skipped file paths.
**Validates: Requirements 8.1**

### Property 24: Overwritten Files Summary
*For any* adoption that completes with overwritten files, the summary should list all overwritten file paths.
**Validates: Requirements 8.2**

### Property 25: Conflict Resolution Count Display
*For any* adoption with conflicts, the summary should display the total count of conflicts that were resolved.
**Validates: Requirements 8.4**

### Property 26: Diff File Path Display
*For any* diff viewing request, the displayed output should include the file path being compared.
**Validates: Requirements 9.1**

### Property 27: Diff Metadata Display
*For any* diff display, the output should include file size and modification date for both existing and template files.
**Validates: Requirements 9.2**

### Property 28: Text File Diff Content
*For any* text file diff display, up to 10 lines of differences should be shown in the output.
**Validates: Requirements 9.3**

### Property 29: Binary File Diff Handling
*For any* binary or very large file diff request, a message indicating detailed diff is unavailable should be displayed instead of diff content.
**Validates: Requirements 9.4**

### Property 30: Post-Diff Flow Continuation
*For any* diff display completion, the system should return to the file resolution prompt for that conflict.
**Validates: Requirements 9.5**

### Property 31: Backup Failure Abort
*For any* backup creation failure, the adoption process should abort and display an error message without modifying any files.
**Validates: Requirements 10.1**

### Property 32: Partial Failure Continuation
*For any* file overwrite failure during adoption, the error should be logged and the process should continue with remaining files.
**Validates: Requirements 10.2**

### Property 33: Error Summary Inclusion
*For any* errors that occur during conflict resolution, those error details should appear in the final adoption summary.
**Validates: Requirements 10.3**

### Property 34: Abort Confirmation Message
*For any* adoption that is aborted due to errors, the output should include a message confirming that no changes were made.
**Validates: Requirements 10.4**



## Error Handling

### Backup Creation Failures

**Scenario**: Backup creation fails due to disk space, permissions, or I/O errors.

**Handling**:
1. Catch backup creation exception
2. Display clear error message with failure reason
3. Abort adoption process immediately
4. Ensure no files have been modified
5. Return non-zero exit code

**User Guidance**: Inform user to check disk space and permissions before retrying.

### File Overwrite Failures

**Scenario**: Individual file overwrite fails during adoption execution.

**Handling**:
1. Log the specific file and error
2. Continue processing remaining files
3. Include failed files in error summary
4. Mark adoption as partially successful
5. Preserve backup for potential manual recovery

**User Guidance**: List failed files and suggest manual intervention or retry.

### Diff Generation Failures

**Scenario**: Diff viewer cannot read or compare files (permissions, encoding issues).

**Handling**:
1. Catch diff generation exception
2. Display message: "Unable to generate diff for this file"
3. Show file metadata only (size, dates)
4. Continue with resolution prompt
5. Allow user to make decision without diff

**User Guidance**: Suggest opening files in external editor for comparison.

### Interactive Prompt Failures

**Scenario**: User input stream is closed or interrupted (CI environment, pipe closed).

**Handling**:
1. Detect non-interactive environment
2. Fall back to default behavior (skip conflicts)
3. Log warning about non-interactive mode
4. Continue with adoption using defaults

**User Guidance**: Inform user to use --auto or --force flags in non-interactive environments.

### Validation Failures

**Scenario**: Resolution map contains invalid entries or conflicts are malformed.

**Handling**:
1. Validate resolution map before execution
2. Check all conflict paths exist
3. Verify resolution values are valid ('keep' or 'overwrite')
4. Abort if validation fails
5. Display validation errors

**User Guidance**: Report as bug if validation fails (should not happen in normal use).

## Testing Strategy

### Dual Testing Approach

This feature requires both **unit tests** and **property-based tests** for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs
- Both approaches are complementary and necessary

### Unit Testing Focus

Unit tests should cover:

1. **Specific Examples**:
   - Conflict resolution with 3 conflicts (1 skip, 1 overwrite, 1 keep)
   - Force mode with 2 conflicts
   - Auto mode with conflicts
   - Dry run mode with conflicts

2. **Edge Cases**:
   - Zero conflicts (no prompt should appear)
   - Single conflict (simplified flow)
   - Empty file paths
   - Binary files in diff viewer

3. **Error Conditions**:
   - Backup creation failure
   - File overwrite failure
   - Non-interactive environment
   - Invalid resolution map

4. **Integration Points**:
   - ConflictResolver integration with inquirer
   - SelectiveBackup integration with BackupSystem
   - DiffViewer integration with fs operations
   - adopt.js orchestration of all components

### Property-Based Testing Configuration

**Library**: Use `fast-check` for JavaScript property-based testing

**Configuration**:
- Minimum 100 iterations per property test
- Each test must reference its design document property
- Tag format: `// Feature: adopt-conflict-resolution-improvement, Property N: [property text]`

**Property Test Examples**:

```javascript
// Feature: adopt-conflict-resolution-improvement, Property 1: Conflict Display Completeness
test('all conflicts are displayed without duplicates', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ path: fc.string(), type: fc.constant('file') })),
      (conflicts) => {
        const displayed = displayConflicts(conflicts);
        const displayedPaths = extractPaths(displayed);
        const uniquePaths = [...new Set(conflicts.map(c => c.path))];
        return displayedPaths.length === uniquePaths.length &&
               uniquePaths.every(path => displayedPaths.includes(path));
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: adopt-conflict-resolution-improvement, Property 13: Backup Completeness
test('backup contains exactly the files marked for overwrite', () => {
  fc.assert(
    fc.property(
      fc.array(fc.string()),
      async (filesToOverwrite) => {
        const backup = await createSelectiveBackup(projectPath, filesToOverwrite);
        const backupFiles = await listBackupFiles(projectPath, backup.id);
        return backupFiles.length === filesToOverwrite.length &&
               filesToOverwrite.every(file => backupFiles.includes(file));
      }
    ),
    { numRuns: 100 }
  );
});
```

### Test Organization

```
tests/
├── unit/
│   ├── adoption/
│   │   ├── conflict-resolver.test.js
│   │   ├── diff-viewer.test.js
│   │   └── detection-engine.test.js
│   ├── backup/
│   │   └── selective-backup.test.js
│   └── commands/
│       └── adopt.test.js
└── integration/
    └── adopt-conflict-resolution.test.js
```

### Mock Strategy

**External Dependencies to Mock**:
- `inquirer` prompts (for deterministic testing)
- File system operations (for isolated testing)
- Console output (for assertion on displayed messages)

**Real Dependencies**:
- Resolution logic (test actual implementation)
- Categorization logic (test actual implementation)
- Validation logic (test actual implementation)

### Test Coverage Goals

- **Line Coverage**: > 90%
- **Branch Coverage**: > 85%
- **Property Coverage**: 100% (all 34 properties tested)
- **Error Path Coverage**: All error handlers tested

### Manual Testing Checklist

Before release, manually verify:

1. Interactive flow with real terminal
2. Diff display with actual files
3. Backup and restore with real .sce/ directory
4. Force mode in CI environment
5. Auto mode in scripts
6. Dry run mode output formatting
7. Error messages are clear and actionable
8. Rollback instructions work correctly
