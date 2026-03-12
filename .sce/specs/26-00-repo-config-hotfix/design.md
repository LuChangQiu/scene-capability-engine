# Design Document

## Overview

This hotfix addresses three critical bugs in the nested repository feature (v1.20.0):

1. **Parent reference validation failure**: ConfigManager validates parent references by checking if `repo.parent` exists in a path map, but doesn't account for path normalization issues
2. **Configuration save failure**: Multi-repository configurations fail validation and cannot be saved
3. **Git command duplication**: ExecHandler prepends "git" to commands that already start with "git"

The fixes focus on minimal code changes to ConfigManager and ExecHandler while maintaining backward compatibility and all existing functionality.

## Architecture

### Component Overview

```
ConfigManager
├── validateConfig()
├── _validateParentReferences()  ← FIX: Add path normalization
└── saveConfig()

ExecHandler
├── execute()
└── RepoManager.execInAllRepos()  ← FIX: Remove git prefix duplication

RepoManager
└── _scanDirectory()  ← NO CHANGES (sets parent field correctly)
```

### Data Flow

```
1. Repository Discovery (RepoManager)
   ├── Scan directories
   ├── Set parent field to relative path
   └── Return discovered repos

2. Configuration Validation (ConfigManager)
   ├── Validate structure
   ├── Validate parent references  ← FIX HERE
   │   ├── Normalize paths
   │   ├── Build path map
   │   └── Check parent exists
   └── Return validation result

3. Command Execution (ExecHandler)
   ├── Load configuration
   ├── Execute command  ← FIX HERE
   │   ├── Check if command starts with "git"
   │   └── Don't duplicate "git" prefix
   └── Display results
```

## Components and Interfaces

### 1. ConfigManager Path Normalization

**Problem**: Parent paths and repository paths may differ in format (trailing slashes, path separators, relative segments)

**Solution**: Add path normalization helper method

```javascript
/**
 * Normalize path for comparison
 * @private
 * @param {string} pathStr - Path to normalize
 * @returns {string} Normalized path
 */
_normalizePath(pathStr) {
  if (!pathStr) return '';
  
  // Convert backslashes to forward slashes
  let normalized = pathStr.replace(/\\/g, '/');
  
  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '');
  
  // Remove leading './'
  normalized = normalized.replace(/^\.\//, '');
  
  // Handle '.' as current directory
  if (normalized === '.') {
    normalized = '';
  }
  
  return normalized;
}
```

### 2. ConfigManager Parent Validation Fix

**Current Implementation**:
```javascript
_validateParentReferences(repos) {
  const pathMap = new Map();
  repos.forEach(repo => {
    if (repo.path) {
      pathMap.set(repo.path, repo);  // Direct path mapping
    }
  });
  
  repos.forEach((repo, index) => {
    if (repo.parent) {
      if (!pathMap.has(repo.parent)) {  // Direct lookup fails
        errors.push(...);
      }
    }
  });
}
```

**Fixed Implementation**:
```javascript
_validateParentReferences(repos) {
  const pathMap = new Map();
  repos.forEach(repo => {
    if (repo.path) {
      const normalizedPath = this._normalizePath(repo.path);
      pathMap.set(normalizedPath, repo);  // Use normalized path
    }
  });
  
  repos.forEach((repo, index) => {
    if (repo.parent) {
      const normalizedParent = this._normalizePath(repo.parent);
      if (!pathMap.has(normalizedParent)) {  // Normalized lookup
        errors.push(
          `Repository "${repo.name}" (index ${index}): ` +
          `parent path "${repo.parent}" does not reference an existing repository. ` +
          `Available paths: ${Array.from(pathMap.keys()).join(', ')}`
        );
      }
    }
  });
  
  // Circular reference detection remains unchanged
  // ...
}
```

### 3. ExecHandler Git Command Fix

**Problem**: Commands like "git branch" become "git git branch"

**Current Implementation**:
```javascript
async execute(command, options = {}) {
  // ...
  results = await this.repoManager.execInAllRepos(config.repositories, command);
  // RepoManager prepends "git" unconditionally
}
```

**Root Cause**: In RepoManager.execInRepo():
```javascript
async execInRepo(repo, command) {
  const fullCommand = `git ${command}`;  // Always prepends "git"
  // ...
}
```

**Fixed Implementation**:
```javascript
async execInRepo(repo, command) {
  // Check if command already starts with "git"
  const trimmedCommand = command.trim();
  const fullCommand = trimmedCommand.startsWith('git ')
    ? trimmedCommand
    : `git ${trimmedCommand}`;
  
  // Execute command
  // ...
}
```

## Data Models

### Repository Configuration (Unchanged)

```javascript
{
  name: string,           // Repository name
  path: string,           // Relative path from workspace root
  remote: string | null,  // Git remote URL
  branch: string,         // Current branch
  parent: string | null,  // Parent repository path (NEW in v1.20.0)
  // ... other fields
}
```

### Path Normalization Rules

```javascript
// Input → Normalized Output
"backend"      → "backend"
"backend/"     → "backend"
"./backend"    → "backend"
"backend\\"    → "backend"  // Windows
"."            → ""
""             → ""
"a/b/c"        → "a/b/c"
"a/b/c/"       → "a/b/c"
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Path Normalization Idempotence

*For any* path string, normalizing it twice should produce the same result as normalizing it once.

**Validates: Requirements 6.3**

### Property 2: Parent Validation with Normalized Paths

*For any* repository configuration with a parent field, if the normalized parent path matches any normalized repository path in the configuration, validation should succeed.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 3: Git Command Prefix Invariance

*For any* command string, if it starts with "git ", executing it should not result in "git git" duplication.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 4: Backward Compatibility

*For any* existing valid configuration (without parent fields), loading and validating it should succeed without errors.

**Validates: Requirements 2.1, 2.2**

### Property 5: Configuration Round-Trip

*For any* valid configuration, saving it and then loading it should produce an equivalent configuration.

**Validates: Requirements 1.5, 4.2**

### Property 6: Error Message Clarity

*For any* parent validation failure, the error message should include the invalid parent path, the repository name, and the list of available paths.

**Validates: Requirements 7.1, 7.2, 7.3**

## Error Handling

### ConfigManager Error Handling

**Parent Validation Errors**:
- Include invalid parent path
- Include repository name and index
- List all available repository paths
- Provide actionable guidance

**Example Error Message**:
```
Repository "frontend-app" (index 1): parent path "backend" does not reference an existing repository. Available paths: backend-api, shared-lib
```

### ExecHandler Error Handling

**Command Validation**:
- Check for empty commands
- Trim whitespace before processing
- Handle both "git" and non-git commands

**Execution Errors**:
- Maintain existing error handling
- No changes to error reporting

### Backward Compatibility

**Legacy Configurations**:
- Configurations without parent fields: validated normally
- Configurations with null parent: treated as no parent
- Existing path formats: normalized automatically

## Testing Strategy

### Unit Tests

**ConfigManager Tests**:
1. Test `_normalizePath()` with various path formats
2. Test parent validation with normalized paths
3. Test parent validation error messages
4. Test backward compatibility with configs without parent fields
5. Test circular reference detection (unchanged)

**ExecHandler/RepoManager Tests**:
1. Test command execution without "git" duplication
2. Test commands starting with "git"
3. Test commands not starting with "git"
4. Test command trimming

**Integration Tests**:
1. Test multi-repository configuration save/load
2. Test nested repository discovery and validation
3. Test command execution across multiple repos

### Property-Based Tests

Due to the hotfix nature and minimal code changes, property-based tests are marked as optional. The focus is on targeted unit tests that verify the specific bugs are fixed.

### Test Coverage Requirements

- All new code paths must be covered
- All bug scenarios must have regression tests
- All existing tests must pass (1686 tests)
- New tests for multi-repository scenarios

## Implementation Notes

### Minimal Changes Principle

This hotfix follows the principle of minimal code changes:

1. **ConfigManager**: Add `_normalizePath()` method and update `_validateParentReferences()`
2. **RepoManager**: Update `execInRepo()` to check for "git" prefix
3. **No changes** to: RepoManager scanning, configuration format, other handlers

### Performance Considerations

- Path normalization is O(n) where n is path length (negligible)
- Parent validation remains O(n) where n is number of repositories
- No performance regression expected

### Backward Compatibility

- Existing configurations work without changes
- New normalization is transparent to users
- No breaking changes to API or configuration format

## Version Update

- **Current Version**: 1.20.0
- **Hotfix Version**: 1.20.1
- **Release Type**: Patch (bug fixes only)

### CHANGELOG Entry

```markdown
## [1.20.1] - 2026-02-01

### Fixed
- Fixed configuration save failure when discovering multiple nested repositories
- Fixed parent reference validation to correctly match parent paths with repository paths
- Fixed git command duplication in `sce repo exec` (e.g., "git branch" no longer becomes "git git branch")
- Improved error messages for parent validation failures to include available paths

### Technical Details
- Added path normalization in ConfigManager to handle trailing slashes and path format variations
- Updated ExecHandler to detect and avoid duplicating "git" prefix in commands
- All existing tests pass (1686 tests)
```
