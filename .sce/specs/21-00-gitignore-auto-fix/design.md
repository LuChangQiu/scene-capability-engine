# Design: .gitignore Auto-Fix for Team Collaboration

## 1. Overview

### Purpose

Automatically detect and fix .gitignore files during sce adoption and upgrade to ensure team collaboration works correctly. The system replaces old blanket `.sce/` exclusion patterns with a layered strategy that commits Specs while excluding personal state.

### Goals

- **Zero-friction adoption**: Users get correct .gitignore automatically
- **Safe migration**: Always create backups before modification
- **Clear communication**: Explain what changed and why
- **Team collaboration**: Enable Spec sharing from day one

### Key Design Decisions

1. **Automatic by default**: No user confirmation needed (with backup safety net)
2. **Layered strategy**: Commit Specs, exclude personal state (follows team-collaboration-guide.md)
3. **Backup-first**: Always create backup before modification
4. **Integration points**: Adopt, upgrade, and standalone doctor command
5. **Pattern-based detection**: Use regex patterns to identify old rules

---

## 2. Architecture

### System Components

```
GitignoreAutoFix System
├── GitignoreDetector      - Analyzes .gitignore status
├── GitignoreTransformer   - Applies layered strategy
├── GitignoreBackup        - Creates backups before modification
└── GitignoreIntegration   - Integrates with adopt/upgrade flows
```

### Component Responsibilities

**GitignoreDetector**:
- Detect .gitignore file existence
- Parse and analyze current rules
- Identify old patterns (blanket `.sce/` exclusion)
- Determine fix strategy (add, update, skip)

**GitignoreTransformer**:
- Remove old blanket exclusion patterns
- Add layered exclusion rules
- Preserve user customizations
- Generate compliant .gitignore content

**GitignoreBackup**:
- Create timestamped backups
- Store in `.sce/backups/gitignore-{timestamp}`
- Provide rollback capability
- Track backup metadata

**GitignoreIntegration**:
- Integrate with SmartOrchestrator (adopt flow)
- Integrate with MigrationEngine (upgrade flow)
- Provide standalone doctor command
- Coordinate detection → backup → transform → report

### Data Flow

```
┌─────────────────┐
│ Adopt/Upgrade   │
│ or Doctor       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ GitignoreDetector│
│ - Analyze status│
└────────┬────────┘
         │
         ▼
    ┌────────┐
    │ Status │
    └───┬────┘
        │
        ├─── Missing ────────┐
        ├─── Old Pattern ────┤
        ├─── Incomplete ─────┤
        └─── Compliant ──────┼─── Skip (no action)
                             │
                             ▼
                    ┌─────────────────┐
                    │ GitignoreBackup │
                    │ - Create backup │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────────┐
                    │ GitignoreTransformer│
                    │ - Apply layered     │
                    │   strategy          │
                    └────────┬────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Write .gitignore│
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Report Result   │
                    └─────────────────┘
```

---

## 3. Components and Interfaces

### 3.1 GitignoreDetector

**Purpose**: Analyze .gitignore file and determine fix strategy

**Interface**:

```javascript
class GitignoreDetector {
  /**
   * Analyzes .gitignore status
   * 
   * @param {string} projectPath - Project root path
   * @returns {Promise<GitignoreStatus>}
   */
  async analyzeGitignore(projectPath)
  
  /**
   * Checks if .gitignore exists
   * 
   * @param {string} projectPath - Project root path
   * @returns {Promise<boolean>}
   */
  async exists(projectPath)
  
  /**
   * Parses .gitignore content into rules
   * 
   * @param {string} content - .gitignore file content
   * @returns {GitignoreRule[]}
   */
  parseGitignore(content)
  
  /**
   * Detects old blanket exclusion patterns
   * 
   * @param {GitignoreRule[]} rules - Parsed rules
   * @returns {boolean}
   */
  hasOldPattern(rules)
  
  /**
   * Checks if layered strategy is present
   * 
   * @param {GitignoreRule[]} rules - Parsed rules
   * @returns {boolean}
   */
  hasLayeredStrategy(rules)
}
```

**GitignoreStatus Type**:

```javascript
{
  exists: boolean,           // .gitignore file exists
  status: string,            // 'missing' | 'old-pattern' | 'incomplete' | 'compliant'
  strategy: string,          // 'add' | 'update' | 'skip'
  oldPatterns: string[],     // Old patterns found (e.g., ['.sce/', '.sce/*'])
  missingRules: string[],    // Missing layered rules
  content: string            // Current .gitignore content (if exists)
}
```

**Detection Logic**:

1. **Missing**: .gitignore doesn't exist → Strategy: `add`
2. **Old Pattern**: Contains `.sce/` or `.sce/*` → Strategy: `update`
3. **Incomplete**: Missing some layered rules → Strategy: `update`
4. **Compliant**: Has all layered rules, no old patterns → Strategy: `skip`

**Old Pattern Detection**:

```javascript
// Patterns that indicate old blanket exclusion
const OLD_PATTERNS = [
  /^\.sce\/?\s*$/,           // .sce/ or .sce
  /^\.sce\/\*\s*$/,          // .sce/*
  /^\.sce\/\*\*\s*$/         // .sce/**
];
```

### 3.2 GitignoreTransformer

**Purpose**: Transform .gitignore content to use layered strategy

**Interface**:

```javascript
class GitignoreTransformer {
  /**
   * Applies layered strategy to .gitignore
   * 
   * @param {string} currentContent - Current .gitignore content (or empty)
   * @param {GitignoreStatus} status - Detection status
   * @returns {TransformResult}
   */
  transform(currentContent, status)
  
  /**
   * Removes old blanket exclusion patterns
   * 
   * @param {string} content - .gitignore content
   * @returns {string}
   */
  removeOldPatterns(content)
  
  /**
   * Adds layered exclusion rules
   * 
   * @param {string} content - .gitignore content
   * @returns {string}
   */
  addLayeredRules(content)
  
  /**
   * Generates layered rules section
   * 
   * @returns {string}
   */
  generateLayeredSection()
}
```

**TransformResult Type**:

```javascript
{
  content: string,           // New .gitignore content
  added: string[],           // Rules added
  removed: string[],         // Rules removed
  preserved: string[]        // User rules preserved
}
```

**Layered Rules Template**:

```gitignore
# ========================================
# .sce/ Directory - Layered Management
# ========================================
# Generated by sce - DO NOT EDIT THIS SECTION
# See: docs/team-collaboration-guide.md

# Personal state files (DO NOT commit)
.sce/steering/CURRENT_CONTEXT.md
.sce/contexts/.active
.sce/contexts/*/CURRENT_CONTEXT.md

# Environment configuration (DO NOT commit)
.sce/environments.json
.sce/env-backups/

# Temporary files and backups (DO NOT commit)
.sce/backups/
.sce/logs/
.sce/reports/

# Spec artifacts (COMMIT - but exclude temporary files)
.sce/specs/**/SESSION-*.md
.sce/specs/**/*-SUMMARY.md
.sce/specs/**/*-COMPLETE.md
.sce/specs/**/TEMP-*.md
.sce/specs/**/WIP-*.md
.sce/specs/**/MVP-*.md

# ========================================
# End of sce-managed section
# ========================================
```

**Transformation Strategy**:

1. **Add Strategy** (missing .gitignore):
   - Create new .gitignore with layered rules
   - No removal needed

2. **Update Strategy** (old pattern or incomplete):
   - Remove old blanket patterns (`.sce/`, `.sce/*`)
   - Remove incomplete layered rules (if any)
   - Add complete layered section
   - Preserve all non-.sce rules

**Preservation Rules**:

- Keep all rules not related to `.sce/`
- Maintain rule order where possible
- Preserve comments (except in sce-managed section)
- Keep blank lines for readability

### 3.3 GitignoreBackup

**Purpose**: Create backups before modifying .gitignore

**Interface**:

```javascript
class GitignoreBackup {
  /**
   * Creates backup of .gitignore
   * 
   * @param {string} projectPath - Project root path
   * @returns {Promise<BackupInfo>}
   */
  async createBackup(projectPath)
  
  /**
   * Restores .gitignore from backup
   * 
   * @param {string} projectPath - Project root path
   * @param {string} backupId - Backup ID
   * @returns {Promise<RestoreResult>}
   */
  async restore(projectPath, backupId)
  
  /**
   * Lists available .gitignore backups
   * 
   * @param {string} projectPath - Project root path
   * @returns {Promise<BackupInfo[]>}
   */
  async listBackups(projectPath)
}
```

**BackupInfo Type**:

```javascript
{
  id: string,                // Backup ID (e.g., 'gitignore-2026-01-30-143022')
  created: string,           // ISO timestamp
  path: string,              // Backup file path
  size: number               // File size in bytes
}
```

**Backup Strategy**:

- Store in `.sce/backups/gitignore-{timestamp}`
- Use timestamp format: `YYYY-MM-DD-HHMMSS`
- Keep metadata in `.sce/backups/gitignore-{timestamp}.meta.json`
- Limit to last 10 backups (auto-cleanup)

**Metadata Format**:

```json
{
  "id": "gitignore-2026-01-30-143022",
  "created": "2026-01-30T14:30:22.000Z",
  "originalPath": ".gitignore",
  "size": 1234,
  "checksum": "sha256-hash"
}
```

### 3.4 GitignoreIntegration

**Purpose**: Integrate with adopt, upgrade, and doctor flows

**Interface**:

```javascript
class GitignoreIntegration {
  /**
   * Runs .gitignore check and fix
   * 
   * @param {string} projectPath - Project root path
   * @param {Object} options - Integration options
   * @returns {Promise<GitignoreFixResult>}
   */
  async checkAndFix(projectPath, options = {})
  
  /**
   * Integrates with adoption flow
   * 
   * @param {string} projectPath - Project root path
   * @returns {Promise<GitignoreFixResult>}
   */
  async integrateWithAdopt(projectPath)
  
  /**
   * Integrates with upgrade flow
   * 
   * @param {string} projectPath - Project root path
   * @returns {Promise<GitignoreFixResult>}
   */
  async integrateWithUpgrade(projectPath)
  
  /**
   * Standalone doctor command
   * 
   * @param {string} projectPath - Project root path
   * @returns {Promise<GitignoreFixResult>}
   */
  async runDoctor(projectPath)
}
```

**GitignoreFixResult Type**:

```javascript
{
  success: boolean,          // Fix succeeded
  action: string,            // 'created' | 'updated' | 'skipped'
  backupId: string,          // Backup ID (if created)
  added: string[],           // Rules added
  removed: string[],         // Rules removed
  message: string            // User-friendly message
}
```

**Integration Points**:

1. **SmartOrchestrator** (adopt flow):
   - Call after adoption completes
   - Include in adoption summary
   - Show backup location

2. **MigrationEngine** (upgrade flow):
   - Call after upgrade completes
   - Include in upgrade summary
   - Show backup location

3. **Doctor Command** (standalone):
   - `sce doctor --fix-gitignore`
   - Can be run independently
   - Useful for existing projects

---

## 4. Data Models

### GitignoreRule

Represents a single rule in .gitignore

```javascript
{
  pattern: string,           // Rule pattern (e.g., '.sce/backups/')
  type: string,              // 'exclusion' | 'negation' | 'comment'
  line: number,              // Line number in file
  isKiroRelated: boolean,    // Rule relates to .sce/
  isManaged: boolean         // Rule is in sce-managed section
}
```

### GitignoreStatus

Current status of .gitignore file

```javascript
{
  exists: boolean,           // File exists
  status: string,            // 'missing' | 'old-pattern' | 'incomplete' | 'compliant'
  strategy: string,          // 'add' | 'update' | 'skip'
  oldPatterns: string[],     // Old patterns found
  missingRules: string[],    // Missing layered rules
  content: string            // Current content
}
```

### TransformResult

Result of transformation

```javascript
{
  content: string,           // New .gitignore content
  added: string[],           // Rules added
  removed: string[],         // Rules removed
  preserved: string[]        // User rules preserved
}
```

### BackupInfo

Backup metadata

```javascript
{
  id: string,                // Backup ID
  created: string,           // ISO timestamp
  path: string,              // Backup file path
  size: number               // File size in bytes
}
```

### GitignoreFixResult

Final result of fix operation

```javascript
{
  success: boolean,          // Fix succeeded
  action: string,            // 'created' | 'updated' | 'skipped'
  backupId: string,          // Backup ID (if created)
  added: string[],           // Rules added
  removed: string[],         // Rules removed
  message: string            // User-friendly message
}
```

---

## 5. Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Detection Properties

**Property 1: Blanket exclusion detection**

*For any* .gitignore content containing patterns like `.sce/`, `.sce/*`, or `.sce/**`, the detector should identify it as having an old pattern.

**Validates: Requirements AC-4.1.1**

**Property 2: Missing rules detection**

*For any* .gitignore content that lacks one or more required layered rules, the detector should identify which rules are missing.

**Validates: Requirements AC-4.1.2**

**Property 3: Compliant recognition**

*For any* .gitignore content that contains all required layered rules and no old blanket patterns, the detector should recognize it as compliant and recommend no action.

**Validates: Requirements AC-4.1.3**

### Transformation Properties

**Property 4: Blanket exclusion removal**

*For any* .gitignore content containing blanket `.sce/` exclusion patterns, after transformation the result should not contain those patterns.

**Validates: Requirements AC-4.2.1**

**Property 5: Layered rules completeness**

*For any* .gitignore content requiring fix, after transformation the result should contain all required layered rules (personal state, environment config, temporary files, spec artifacts).

**Validates: Requirements AC-4.2.2**

**Property 6: User rules preservation**

*For any* .gitignore content with non-.sce rules, after transformation all those user rules should still be present in the result.

**Validates: Requirements AC-4.2.3**

**Property 7: Syntax validity**

*For any* transformation result, the output should be valid .gitignore syntax (parseable, no syntax errors, follows git ignore rules).

**Validates: Requirements AC-4.2.5**

### Safety Properties

**Property 8: Backup before modification**

*For any* .gitignore modification operation, a backup must be created before the modification is applied, and the backup creation must succeed before modification proceeds.

**Validates: Requirements AC-4.3.1**

**Property 9: Backup restoration round-trip**

*For any* .gitignore backup created, restoring from that backup should produce content equivalent to the original .gitignore content.

**Validates: Requirements AC-4.3.2**

### Reporting Properties

**Property 10: Change reporting accuracy**

*For any* transformation operation, the reported changes (added rules, removed rules) should exactly match the actual differences between the original and transformed content.

**Validates: Requirements AC-4.4.3**

---

## 6. Error Handling

### Error Categories

**1. File System Errors**

- .gitignore read failure
- .gitignore write failure
- Backup creation failure
- Backup directory access failure

**Handling**:
- Fail fast with clear error message
- Never modify .gitignore if backup fails
- Preserve original file on any error
- Log error details for debugging

**2. Parse Errors**

- Invalid .gitignore syntax
- Encoding issues
- Malformed patterns

**Handling**:
- Attempt best-effort parsing
- Preserve unparseable content
- Add layered rules without removing unclear patterns
- Warn user about potential issues

**3. Transformation Errors**

- Pattern matching failures
- Rule generation errors
- Content assembly errors

**Handling**:
- Rollback to original content
- Restore from backup if needed
- Report specific error to user
- Provide manual fix instructions

**4. Integration Errors**

- Adopt/upgrade flow failures
- Doctor command failures
- Concurrent modification conflicts

**Handling**:
- Don't block adopt/upgrade on .gitignore fix failure
- Log error and continue
- Provide manual fix instructions
- Allow retry with doctor command

### Error Recovery

**Backup-First Strategy**:

```javascript
async function safeModify(projectPath) {
  let backupId = null;
  
  try {
    // 1. Create backup first
    backupId = await backup.create(projectPath);
    
    // 2. Perform modification
    await modify(projectPath);
    
    return { success: true, backupId };
  } catch (error) {
    // 3. Restore from backup on error
    if (backupId) {
      await backup.restore(projectPath, backupId);
    }
    
    throw error;
  }
}
```

**Graceful Degradation**:

- If .gitignore fix fails during adopt/upgrade, continue with adoption/upgrade
- Log error and show warning to user
- Provide manual fix instructions
- Allow retry with `sce doctor --fix-gitignore`

### Error Messages

**User-Friendly Format**:

```
❌ Failed to fix .gitignore: [reason]

What happened:
- [Detailed explanation]

What you can do:
1. Check .gitignore file permissions
2. Run: sce doctor --fix-gitignore
3. Manual fix: See docs/team-collaboration-guide.md

Backup location: .sce/backups/gitignore-[timestamp]
```

---

## 7. Testing Strategy

### Dual Testing Approach

This feature requires both **unit tests** and **property-based tests** for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs

Together, they provide comprehensive coverage where unit tests catch concrete bugs and property tests verify general correctness.

### Property-Based Testing

**Library**: Use `fast-check` for JavaScript property-based testing

**Configuration**:
- Minimum 100 iterations per property test
- Each test must reference its design document property
- Tag format: `Feature: gitignore-auto-fix, Property {number}: {property_text}`

**Property Test Coverage**:

1. **Detection Properties** (Properties 1-3):
   - Generate random .gitignore content with various patterns
   - Test detection accuracy across all inputs
   - Verify correct status determination

2. **Transformation Properties** (Properties 4-7):
   - Generate random .gitignore content needing fix
   - Test transformation correctness
   - Verify preservation of user rules
   - Validate output syntax

3. **Safety Properties** (Properties 8-9):
   - Test backup creation before modification
   - Test backup restoration round-trip
   - Verify no data loss

4. **Reporting Properties** (Property 10):
   - Test change reporting accuracy
   - Verify reported changes match actual changes

### Unit Testing

**Focus Areas**:

1. **Specific Examples**:
   - Empty .gitignore → Add layered rules
   - Old pattern `.sce/` → Replace with layered rules
   - Compliant .gitignore → No changes

2. **Edge Cases**:
   - Missing .gitignore file
   - .gitignore with only comments
   - .gitignore with negation rules (`!.sce/specs/`)
   - .gitignore with mixed line endings (CRLF/LF)
   - Very large .gitignore files (>10KB)

3. **Error Conditions**:
   - Read-only .gitignore
   - Backup directory creation failure
   - Disk full during write
   - Concurrent modification

4. **Integration Points**:
   - Adopt flow integration
   - Upgrade flow integration
   - Doctor command execution

### Test Organization

```
tests/
├── unit/
│   ├── gitignore-detector.test.js
│   ├── gitignore-transformer.test.js
│   ├── gitignore-backup.test.js
│   └── gitignore-integration.test.js
└── property/
    ├── detection-properties.test.js
    ├── transformation-properties.test.js
    ├── safety-properties.test.js
    └── reporting-properties.test.js
```

### Test Data Generators

**For Property Tests**:

```javascript
// Generate random .gitignore content
const gitignoreArbitrary = fc.record({
  kiroRules: fc.array(fc.constantFrom(
    '.sce/',
    '.sce/*',
    '.sce/**',
    '.sce/backups/',
    '.sce/steering/CURRENT_CONTEXT.md'
  )),
  userRules: fc.array(fc.string()),
  comments: fc.array(fc.string().map(s => `# ${s}`))
});

// Generate .gitignore with old pattern
const oldPatternGitignore = fc.record({
  oldPattern: fc.constantFrom('.sce/', '.sce/*', '.sce/**'),
  otherRules: fc.array(fc.string())
});

// Generate compliant .gitignore
const compliantGitignore = fc.constant(LAYERED_RULES_TEMPLATE);
```

---

## 8. Implementation Notes

### Platform Considerations

**Line Endings**:
- Detect existing line ending style (CRLF vs LF)
- Preserve line ending style in output
- Use `os.EOL` for new content

**Path Separators**:
- .gitignore always uses forward slashes (/)
- No platform-specific path handling needed

**File Permissions**:
- Check write permissions before modification
- Preserve original file permissions
- Handle read-only files gracefully

### Performance Considerations

**File Size**:
- .gitignore files are typically small (<10KB)
- Read entire file into memory (acceptable)
- No streaming needed

**Pattern Matching**:
- Use compiled regex for pattern detection
- Cache compiled patterns
- O(n) complexity for n rules (acceptable)

**Backup Storage**:
- Limit to 10 most recent backups
- Auto-cleanup old backups
- Minimal disk space impact (<100KB total)

### Security Considerations

**Path Traversal**:
- Validate .gitignore path is in project root
- No user-provided paths in backup location
- Use path.join() for safe path construction

**Content Validation**:
- Validate .gitignore content before parsing
- Limit file size (max 1MB)
- Sanitize error messages (no file content in errors)

**Backup Security**:
- Store backups in `.sce/backups/` (gitignored)
- No sensitive data in backup metadata
- Secure file permissions on backups

### Maintenance Considerations

**Layered Rules Updates**:
- Centralize layered rules template
- Version the template
- Support template updates in future versions

**Backward Compatibility**:
- Detect old sce-managed sections
- Update old sections to new format
- Preserve user customizations during updates

**Documentation**:
- Keep team-collaboration-guide.md in sync
- Document layered strategy rationale
- Provide migration guide for old users

---

## 9. Future Enhancements

### Phase 2 (Out of Scope for v1.15.0)

1. **Interactive Mode**:
   - Show diff before applying changes
   - Allow user to review and approve
   - Provide `--interactive` flag

2. **Custom Rules**:
   - Allow users to add custom .sce rules
   - Preserve custom rules during updates
   - Support `.sce.config.json` for custom patterns

3. **Multi-Repository Support**:
   - Fix .gitignore in all team repositories
   - Sync .gitignore across team
   - Detect and report inconsistencies

4. **Advanced Detection**:
   - Detect .git/info/exclude patterns
   - Analyze git history for .gitignore changes
   - Suggest improvements based on usage

5. **Rollback UI**:
   - `sce doctor --list-gitignore-backups`
   - `sce doctor --restore-gitignore <backup-id>`
   - Interactive backup selection

---

## 10. Dependencies

### Internal Dependencies

- **BackupSystem** (`lib/backup/backup-system.js`): Backup infrastructure
- **SelectiveBackup** (`lib/backup/selective-backup.js`): Selective file backup
- **SmartOrchestrator** (`lib/adoption/smart-orchestrator.js`): Adoption flow
- **MigrationEngine** (`lib/upgrade/migration-engine.js`): Upgrade flow
- **fs-utils** (`lib/utils/fs-utils.js`): File system utilities

### External Dependencies

- **fs-extra**: Enhanced file system operations
- **path**: Path manipulation
- **os**: Operating system utilities (line endings)

### New Dependencies

- **fast-check**: Property-based testing library (dev dependency)

---

## 11. Traceability Matrix

| Requirement | Design Component | Property | Test |
|-------------|------------------|----------|------|
| FR-2.1.1 | GitignoreDetector.exists() | - | Unit |
| FR-2.1.2 | GitignoreDetector.analyzeGitignore() | Property 1, 2, 3 | Property + Unit |
| FR-2.1.3 | GitignoreDetector.hasOldPattern() | Property 1 | Property |
| FR-2.2.1 | GitignoreBackup.createBackup() | Property 8 | Property + Unit |
| FR-2.2.2 | GitignoreTransformer.transform() | Property 4, 5, 7 | Property + Unit |
| FR-2.2.3 | GitignoreTransformer.removeOldPatterns() | Property 6 | Property + Unit |
| FR-2.2.4 | GitignoreTransformer (edge cases) | - | Unit |
| FR-2.3.1 | GitignoreIntegration (messaging) | - | Unit |
| FR-2.3.2 | GitignoreIntegration (summary) | Property 10 | Property + Unit |
| FR-2.3.3 | GitignoreIntegration (no fix) | - | Unit |
| FR-2.4.1 | GitignoreIntegration.integrateWithAdopt() | - | Unit |
| FR-2.4.2 | GitignoreIntegration.integrateWithUpgrade() | - | Unit |
| FR-2.4.3 | GitignoreIntegration.runDoctor() | - | Unit |
| NFR-3.1.1 | GitignoreBackup | Property 8 | Property |
| NFR-3.1.2 | GitignoreTransformer | Property 6 | Property |
| NFR-3.2.1 | All components (performance) | - | Performance |
| NFR-3.3.1 | GitignoreIntegration (messaging) | - | Unit |
| NFR-3.3.2 | GitignoreIntegration (automatic) | - | Unit |
| NFR-3.4.1 | All components (cross-platform) | - | Unit |
| NFR-3.4.2 | GitignoreTransformer (git compat) | Property 7 | Property |
| AC-4.1.1 | GitignoreDetector | Property 1 | Property |
| AC-4.1.2 | GitignoreDetector | Property 2 | Property |
| AC-4.1.3 | GitignoreDetector | Property 3 | Property |
| AC-4.1.4 | GitignoreDetector | - | Unit |
| AC-4.2.1 | GitignoreTransformer | Property 4 | Property |
| AC-4.2.2 | GitignoreTransformer | Property 5 | Property |
| AC-4.2.3 | GitignoreTransformer | Property 6 | Property |
| AC-4.2.4 | GitignoreTransformer | - | Manual |
| AC-4.2.5 | GitignoreTransformer | Property 7 | Property |
| AC-4.3.1 | GitignoreBackup | Property 8 | Property |
| AC-4.3.2 | GitignoreBackup | Property 9 | Property |
| AC-4.3.3 | Error handling | - | Unit |
| AC-4.3.4 | GitignoreBackup | Property 9 | Property |
| AC-4.4.1 | GitignoreIntegration | - | Manual |
| AC-4.4.2 | GitignoreIntegration | - | Manual |
| AC-4.4.3 | GitignoreIntegration | Property 10 | Property |
| AC-4.4.4 | GitignoreIntegration | - | Manual |
| AC-4.4.5 | GitignoreIntegration | - | Manual |
| AC-4.5.1 | GitignoreIntegration | - | Unit |
| AC-4.5.2 | GitignoreIntegration | - | Unit |
| AC-4.5.3 | GitignoreIntegration | - | Unit |
| AC-4.5.4 | All components | - | Integration |

---

**Version**: 1.0  
**Created**: 2026-01-30  
**Status**: Draft

