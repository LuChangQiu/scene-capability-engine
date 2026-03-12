# Design Document: Nested Repository Support

## Overview

This design extends sce's multi-repo management functionality to support nested Git repositories. The current implementation stops scanning when it encounters a Git repository, preventing discovery of subrepositories. This enhancement enables management of complex project structures where Git repositories contain other Git repositories as subdirectories.

The design maintains backward compatibility with existing configurations while adding new capabilities for nested repository discovery, tracking, and management.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLI Layer (repo init)                    │
│                  --nested / --no-nested flags                │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                      InitHandler                             │
│              • Parse scan options                            │
│              • Coordinate discovery                          │
│              • Display results                               │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                      RepoManager                             │
│              • discoverRepositories()                        │
│              • _scanDirectory() [MODIFIED]                   │
│              • Track parent-child relationships              │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    ConfigManager                             │
│              • Validate parent field                         │
│              • Backward compatibility                        │
│              • Parent reference validation                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                  project-repos.json                          │
│              {                                               │
│                "version": "1.0",                             │
│                "repositories": [                             │
│                  {                                           │
│                    "name": "backend",                        │
│                    "path": "backend",                        │
│                    "parent": null                            │
│                  },                                          │
│                  {                                           │
│                    "name": "backend-runtime-component-...",  │
│                    "path": "backend/runtime/component/...",  │
│                    "parent": "backend"                       │
│                  }                                           │
│                ]                                             │
│              }                                               │
└─────────────────────────────────────────────────────────────┘
```

### Component Interactions

1. **CLI → InitHandler**: User invokes `sce repo init` with optional `--nested` or `--no-nested` flags
2. **InitHandler → RepoManager**: Passes scan options including nested mode
3. **RepoManager → Filesystem**: Recursively scans directories, now continuing into Git repositories
4. **RepoManager → ConfigManager**: Provides discovered repositories with parent relationships
5. **ConfigManager → Validation**: Validates parent references and configuration structure
6. **ConfigManager → Disk**: Saves configuration with parent fields

## Components and Interfaces

### 1. RepoManager (Modified)

**File**: `lib/repo/repo-manager.js`

**New/Modified Methods**:

```javascript
/**
 * Scan directory for Git repositories (MODIFIED)
 * @param {string} rootPath - Root path to scan
 * @param {Object} options - Scan options
 * @param {number} options.maxDepth - Maximum depth to scan (default: 3)
 * @param {string[]} options.exclude - Directories to exclude (default: ['.sce'])
 * @param {boolean} options.nested - Enable nested repository scanning (default: true)
 * @returns {Promise<Array<{path: string, name: string, remote: string|null, branch: string, hasRemote: boolean, parent: string|null}>>}
 */
async discoverRepositories(rootPath, options = {})

/**
 * Recursively scan directory for Git repositories (MODIFIED)
 * @private
 * @param {string} currentPath - Current directory path
 * @param {string} rootPath - Root path for relative path calculation
 * @param {number} depth - Current depth
 * @param {number} maxDepth - Maximum depth
 * @param {string[]} exclude - Directories to exclude
 * @param {Array} discovered - Array to store discovered repositories
 * @param {boolean} nested - Enable nested repository scanning
 * @param {string|null} parentPath - Parent repository path (for nested repos)
 * @param {Set<string>} visitedPaths - Set of visited paths (for symlink detection)
 */
async _scanDirectory(currentPath, rootPath, depth, maxDepth, exclude, discovered, nested, parentPath, visitedPaths)

/**
 * Check if directory should be skipped during scanning (NEW)
 * @private
 * @param {string} dirName - Directory name
 * @param {string[]} exclude - User-specified exclusions
 * @returns {boolean} True if directory should be skipped
 */
_shouldSkipDirectory(dirName, exclude)
```

**Key Changes**:
- Add `nested` parameter to `discoverRepositories()` (default: true)
- Add `parentPath` parameter to `_scanDirectory()` to track parent repository
- Add `visitedPaths` Set to detect circular symlinks
- When a Git repository is found and `nested` is true, continue scanning subdirectories
- Track parent-child relationships in discovered repository objects
- Skip common non-repository directories (node_modules, .git, build, dist, target, out, .next, .nuxt, vendor)

### 2. ConfigManager (Modified)

**File**: `lib/repo/config-manager.js`

**Modified Methods**:

```javascript
/**
 * Validate a single repository configuration (MODIFIED)
 * @private
 * @param {Object} repo - Repository configuration object
 * @param {number} index - Repository index in array
 * @param {Array<Object>} allRepos - All repositories (for parent validation)
 * @returns {string[]} Array of validation errors
 */
_validateRepository(repo, index, allRepos)

/**
 * Validate parent references (NEW)
 * @private
 * @param {Array<Object>} repos - All repositories
 * @returns {string[]} Array of validation errors
 */
_validateParentReferences(repos)
```

**Key Changes**:
- Add validation for optional `parent` field (must be string or null)
- Validate that parent paths reference existing repositories
- Validate that parent paths don't create circular references
- Maintain backward compatibility (parent field is optional)

### 3. InitHandler (Modified)

**File**: `lib/repo/handlers/init-handler.js`

**Modified Methods**:

```javascript
/**
 * Execute repository initialization (MODIFIED)
 * @param {Object} options - Initialization options
 * @param {boolean} options.yes - Skip confirmation prompts
 * @param {number} options.maxDepth - Maximum scan depth
 * @param {string[]} options.exclude - Directories to exclude
 * @param {boolean} options.nested - Enable nested repository scanning (default: true)
 * @returns {Promise<Object>} Initialization result
 */
async execute(options = {})

/**
 * Display initialization summary (MODIFIED)
 * @param {Object} result - Initialization result
 * @param {Array} result.discovered - Discovered repositories
 * @param {string} result.configPath - Configuration file path
 * @param {boolean} result.nestedMode - Whether nested scanning was enabled
 */
displaySummary(result)
```

**Key Changes**:
- Add `nested` option (default: true)
- Pass `nested` option to RepoManager
- Display scan mode in output
- Show parent-child relationships in summary table

### 4. CLI Command (Modified)

**File**: `lib/commands/repo.js`

**Modified Command**:

```javascript
program
  .command('init')
  .description('Initialize repository configuration by scanning for Git repositories')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--max-depth <number>', 'Maximum directory depth to scan', '3')
  .option('--exclude <dirs>', 'Comma-separated list of directories to exclude', '.sce')
  .option('--nested', 'Enable nested repository scanning (default)')
  .option('--no-nested', 'Disable nested repository scanning')
  .action(async (options) => {
    // Handle nested option
    const nested = options.nested !== false; // Default to true
    // ...
  });
```

### 5. OutputFormatter (Modified)

**File**: `lib/repo/output-formatter.js`

**New Methods**:

```javascript
/**
 * Format repository list with parent-child relationships (NEW)
 * @param {Array<Object>} repos - Repositories to format
 * @param {Object} options - Formatting options
 * @param {boolean} options.showParent - Show parent column
 * @param {boolean} options.indent - Indent nested repositories
 * @returns {string} Formatted table
 */
formatRepositoryTable(repos, options = {})

/**
 * Build repository hierarchy tree (NEW)
 * @param {Array<Object>} repos - Repositories
 * @returns {Object} Tree structure with parent-child relationships
 */
buildRepositoryTree(repos)
```

**Key Changes**:
- Add support for displaying parent-child relationships
- Add indentation for nested repositories
- Add parent column to tables when relevant

## Data Models

### Repository Configuration (Modified)

```javascript
{
  "version": "1.0",
  "repositories": [
    {
      "name": "string",              // Required: Repository identifier
      "path": "string",              // Required: Relative path from project root
      "remote": "string|null",       // Optional: Remote URL
      "defaultBranch": "string",     // Optional: Default branch name
      "description": "string",       // Optional: Repository description
      "tags": ["string"],            // Optional: Tags for categorization
      "group": "string",             // Optional: Group name
      "parent": "string|null"        // NEW: Parent repository path (null for top-level)
    }
  ],
  "groups": {},                      // Optional: Group definitions
  "settings": {}                     // Optional: Global settings
}
```

**New Field**:
- `parent`: Relative path to parent repository (null or omitted for top-level repositories)

### Discovered Repository Object (Modified)

```javascript
{
  path: "string",           // Relative path from root
  name: "string",           // Generated repository name
  remote: "string|null",    // Remote URL
  branch: "string",         // Current branch
  hasRemote: boolean,       // Whether remote is configured
  parent: "string|null"     // NEW: Parent repository path
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Nested Repository Discovery Completeness

*For any* directory structure containing nested Git repositories, when nested scanning is enabled, the scanner should discover all Git repositories at all nesting levels, not just top-level repositories.

**Validates: Requirements 1.1, 1.3, 1.4**

### Property 2: Parent-Child Relationship Accuracy

*For any* nested repository discovered during scanning, the repository's parent field should contain the relative path to its immediate parent Git repository, and top-level repositories should have null or omitted parent fields.

**Validates: Requirements 1.2, 3.1, 3.2, 3.4, 7.1, 7.2, 7.3**

### Property 3: Non-Nested Mode Behavior

*For any* directory structure, when nested scanning is disabled (--no-nested), the scanner should stop at the first Git repository encountered in each directory path and not discover any repositories nested within.

**Validates: Requirements 2.2**

### Property 4: Parent Reference Validation

*For any* repository configuration with a parent field, the parent path should reference an existing repository in the configuration, and there should be no circular parent references.

**Validates: Requirements 5.4**

### Property 5: Command Execution Completeness

*For any* set of repositories including nested repositories, commands executed via `sce repo exec`, `sce repo status`, and `sce repo health` should operate on all repositories regardless of nesting level.

**Validates: Requirements 4.1, 5.1, 6.1**

### Property 6: Repository Filtering Consistency

*For any* repository name filter applied to status, health, or exec commands, the filter should match both parent and nested repositories based on their names.

**Validates: Requirements 4.4, 6.3**

### Property 7: Working Directory Correctness

*For any* command executed in a nested repository, the working directory should be set to the nested repository's path, not the parent repository's path.

**Validates: Requirements 6.2**

### Property 8: Path Display Uniqueness

*For any* nested repository displayed in status, health, or exec output, the full relative path should be shown to avoid ambiguity between repositories with similar names.

**Validates: Requirements 4.5, 6.4**

### Property 9: Directory Exclusion Consistency

*For any* directory scan, common non-repository directories (node_modules, .git, build, dist, target, out, .next, .nuxt, vendor) should be skipped to optimize performance.

**Validates: Requirements 8.1**

### Property 10: Backward Compatibility

*For any* existing configuration file without parent fields, loading the configuration should succeed and treat all repositories as non-nested (parent = null).

**Validates: Requirements 7.4, 7.5**

## Error Handling

### Circular Symlink Detection

**Problem**: Symbolic links can create circular directory structures causing infinite loops.

**Solution**:
- Maintain a `visitedPaths` Set containing resolved absolute paths
- Before scanning a directory, resolve symlinks and check if path is in `visitedPaths`
- If path is already visited, skip the directory
- Add current path to `visitedPaths` before scanning subdirectories

**Error Message**: "Skipping circular symlink: {path}"

### Invalid Parent References

**Problem**: Configuration may contain parent references to non-existent repositories.

**Solution**:
- During validation, check that all parent paths reference existing repositories
- Build a map of repository paths for O(1) lookup
- Report validation errors for invalid parent references

**Error Message**: "Invalid parent reference in repository '{name}': parent '{parent}' does not exist"

### Circular Parent References

**Problem**: Configuration may contain circular parent relationships (A → B → A).

**Solution**:
- During validation, detect cycles using depth-first search
- Track visited repositories and current path
- Report validation errors for circular references

**Error Message**: "Circular parent reference detected: {path}"

### Maximum Depth Exceeded

**Problem**: Extremely deep directory structures can cause stack overflow or excessive scan time.

**Solution**:
- Enforce `maxDepth` parameter (default: 3)
- When depth exceeds maxDepth, stop scanning subdirectories
- Log warning if repositories might be missed due to depth limit

**Warning Message**: "Maximum scan depth ({maxDepth}) reached, some nested repositories may not be discovered"

### Parent Repository Removed

**Problem**: If a parent repository is removed from configuration, nested repositories have invalid parent references.

**Solution**:
- During validation, detect orphaned nested repositories
- Provide clear error messages with remediation steps
- Suggest running `sce repo init` to rescan

**Error Message**: "Repository '{name}' references non-existent parent '{parent}'. Run 'sce repo init' to rescan."

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs

### Property-Based Testing

**Library**: fast-check (JavaScript property-based testing library)

**Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with: **Feature: nested-repo-support, Property {number}: {property_text}**

**Test Generators**:
- Generate random directory structures with varying nesting levels
- Generate random repository configurations with parent relationships
- Generate random symlink structures for edge case testing

### Unit Testing

**Focus Areas**:
- Specific examples of nested structures (2-level, 3-level nesting)
- Edge cases: empty directories, symlinks, permission errors
- Integration: CLI flag parsing, configuration file I/O
- Error conditions: invalid parent references, circular references

**Test Structure**:
```javascript
describe('Nested Repository Support', () => {
  describe('RepoManager._scanDirectory', () => {
    it('should discover nested repositories when nested=true', async () => {
      // Test specific 2-level nesting example
    });
    
    it('should stop at first repo when nested=false', async () => {
      // Test non-nested mode
    });
    
    it('should handle circular symlinks gracefully', async () => {
      // Test symlink edge case
    });
  });
  
  describe('ConfigManager validation', () => {
    it('should validate parent references', async () => {
      // Test parent validation
    });
    
    it('should detect circular parent references', async () => {
      // Test cycle detection
    });
  });
});
```

### Integration Testing

**Scenarios**:
1. End-to-end: `sce repo init --nested` → verify configuration → `sce repo status` → verify output
2. Backward compatibility: Load old configuration → verify no errors → verify behavior
3. Mode switching: Run init with --nested → run init with --no-nested → verify config updates

### Test Coverage Goals

- Line coverage: > 90%
- Branch coverage: > 85%
- Property tests: All 10 correctness properties implemented
- Unit tests: All edge cases and error conditions covered

## Performance Considerations

### Scan Optimization

**Directory Exclusions**:
- Skip common non-repository directories: node_modules, .git, build, dist, target, out, .next, .nuxt, vendor
- Skip hidden directories (starting with .) except .git
- User-configurable exclusions via --exclude flag

**Depth Limiting**:
- Default maxDepth: 3 (configurable)
- Prevents excessive recursion in deep directory trees
- Balance between discovery completeness and performance

**Symlink Handling**:
- Resolve symlinks to detect circular references
- Skip already-visited paths
- Minimal performance impact (Set lookup is O(1))

### Expected Performance

**Typical Project** (< 100 directories, 5 repositories):
- Scan time: < 1 second
- Memory usage: < 10 MB

**Large Project** (> 1000 directories, 20 repositories):
- Scan time: < 5 seconds
- Memory usage: < 50 MB

**Very Large Project** (> 10000 directories, 50 repositories):
- Scan time: < 30 seconds
- Memory usage: < 100 MB
- Consider increasing --exclude list or reducing --max-depth

## Migration and Compatibility

### Backward Compatibility

**Existing Configurations**:
- Configurations without `parent` fields remain valid
- Loading old configurations treats all repositories as non-nested
- No migration required for existing users

**Default Behavior**:
- Nested scanning enabled by default (matches user expectations)
- Users can opt-out with --no-nested flag
- Existing workflows continue to work

### Migration Path

**For Users with Nested Repositories**:
1. Upgrade to version with nested support
2. Run `sce repo init` to rescan and discover nested repositories
3. Review generated configuration
4. Existing commands (status, health, exec) automatically work with nested repos

**For Users Without Nested Repositories**:
- No action required
- Behavior unchanged (no nested repos to discover)
- Configuration format remains compatible

## Documentation Updates

### Multi-Repo Management Guide

**New Sections**:
1. **Nested Repository Support**
   - Explanation of nested repositories
   - Use cases and examples
   - Parent-child relationship visualization

2. **Scanning Options**
   - --nested and --no-nested flags
   - When to use each mode
   - Performance implications

3. **Configuration Format**
   - parent field documentation
   - Examples of nested configurations
   - Validation rules

4. **Troubleshooting**
   - Circular symlink errors
   - Invalid parent references
   - Maximum depth warnings
   - Performance optimization tips

### CLI Help Text

**Updated Commands**:
```
sce repo init [options]

Options:
  -y, --yes              Skip confirmation prompts
  --max-depth <number>   Maximum directory depth to scan (default: 3)
  --exclude <dirs>       Comma-separated list of directories to exclude (default: .sce)
  --nested               Enable nested repository scanning (default)
  --no-nested            Disable nested repository scanning

Description:
  Scans the project directory for Git repositories and creates a configuration file.
  By default, discovers nested repositories (Git repos within Git repos).
  Use --no-nested to only discover top-level repositories.
```

### Examples

**Example 1: Basic Nested Structure**
```
project/
├── backend/              ← Git repo
│   └── runtime/
│       └── component/
│           ├── HiveMind/     ← Nested Git repo
│           └── mantle-udm/   ← Nested Git repo
└── frontend/             ← Git repo

$ sce repo init
✓ Found 4 Git repositories (nested scanning enabled)

Discovered repositories:
┌─────────────────────────┬──────────────────────────────┬────────┬────────────┬────────┐
│ Name                    │ Path                         │ Branch │ Has Remote │ Parent │
├─────────────────────────┼──────────────────────────────┼────────┼────────────┼────────┤
│ backend                 │ backend                      │ main   │ ✓          │        │
│ backend-...-HiveMind    │ backend/runtime/.../HiveMind │ main   │ ✓          │ backend│
│ backend-...-mantle-udm  │ backend/runtime/.../mantle.. │ main   │ ✓          │ backend│
│ frontend                │ frontend                     │ main   │ ✓          │        │
└─────────────────────────┴──────────────────────────────┴────────┴────────────┴────────┘
```

**Example 2: Non-Nested Mode**
```
$ sce repo init --no-nested
✓ Found 2 Git repositories (nested scanning disabled)

Discovered repositories:
┌──────────┬──────────┬────────┬────────────┐
│ Name     │ Path     │ Branch │ Has Remote │
├──────────┼──────────┼────────┼────────────┤
│ backend  │ backend  │ main   │ ✓          │
│ frontend │ frontend │ main   │ ✓          │
└──────────┴──────────┴────────┴────────────┘
```

## Implementation Notes

### Phase 1: Core Scanning (High Priority)
- Modify `_scanDirectory()` to continue scanning in Git repositories
- Add `nested` parameter and parent tracking
- Implement symlink detection
- Add directory exclusion logic

### Phase 2: Configuration (High Priority)
- Add `parent` field to configuration schema
- Implement parent reference validation
- Implement circular reference detection
- Ensure backward compatibility

### Phase 3: CLI and Display (Medium Priority)
- Add --nested and --no-nested flags
- Update InitHandler to pass nested option
- Enhance OutputFormatter for parent-child display
- Update summary display

### Phase 4: Command Integration (Medium Priority)
- Verify status command works with nested repos
- Verify health command validates parent references
- Verify exec command uses correct working directories
- Update filtering logic for nested repos

### Phase 5: Testing (High Priority)
- Implement property-based tests for all 10 properties
- Implement unit tests for edge cases
- Implement integration tests for end-to-end scenarios
- Achieve coverage goals

### Phase 6: Documentation (Medium Priority)
- Update multi-repo management guide
- Add nested repository examples
- Update CLI help text
- Add troubleshooting section
