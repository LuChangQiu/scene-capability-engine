# Design Document

## Overview

This design addresses the validation issues preventing users from manually editing repository configurations. The current implementation requires a `version` field that users may not know to include, and the validation logic doesn't provide clear guidance for manual configuration creation. We'll relax validation requirements to support minimal configurations while maintaining data integrity through filesystem validation.

## Architecture

The solution involves modifying the `ConfigManager` class to:

1. Make the `version` field optional with a sensible default
2. Relax field requirements to only mandate `name` and `path`
3. Add filesystem validation to verify paths exist and contain `.git` directories
4. Improve error messages to guide users in fixing configuration issues
5. Maintain backward compatibility with auto-generated configurations

## Components and Interfaces

### ConfigManager (Modified)

**Location**: `lib/repo/config-manager.js`

**Modified Methods**:

```javascript
/**
 * Validate configuration structure and content
 * @param {Object} config - The configuration object to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.validateFilesystem - Whether to validate paths on filesystem (default: false)
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
validateConfig(config, options = {})

/**
 * Validate a single repository configuration
 * @private
 * @param {Object} repo - Repository configuration object
 * @param {number} index - Repository index in array
 * @param {Array<Object>} allRepos - All repositories (for parent validation)
 * @param {boolean} validateFilesystem - Whether to validate paths on filesystem
 * @returns {string[]} Array of validation errors
 */
_validateRepository(repo, index, allRepos = [], validateFilesystem = false)

/**
 * Validate that a repository path exists and is a valid Git repository
 * @private
 * @param {string} repoPath - Repository path to validate
 * @param {string} repoName - Repository name (for error messages)
 * @returns {Promise<string[]>} Array of validation errors
 */
async _validateRepositoryPath(repoPath, repoName)

/**
 * Load and validate configuration from disk
 * @returns {Promise<Object>} The loaded and validated configuration
 * @throws {ConfigError} If file is missing, invalid JSON, or validation fails
 */
async loadConfig()
```

**New Validation Rules**:

1. **Version Field**: Optional, defaults to '1.0' if missing
2. **Required Fields**: Only `name` and `path` are mandatory
3. **Optional Fields**: `remote`, `defaultBranch`, `description`, `tags`, `group`, `parent` all optional
4. **Filesystem Validation**: When loading from disk, validate that paths exist and contain `.git` directories
5. **Error Messages**: Include repository name, field name, and suggested fix in all error messages

### Git Repository Detection

**New Helper Method**:

```javascript
/**
 * Check if a path is a valid Git repository
 * @private
 * @param {string} dirPath - Directory path to check
 * @returns {Promise<boolean>} True if path contains a .git directory (not file)
 */
async _isGitRepository(dirPath)
```

This method will:
- Check if the path exists
- Check if `.git` exists within the path
- Verify `.git` is a directory (not a file, which indicates a Git worktree)
- Return false for any errors (path doesn't exist, no permissions, etc.)

## Data Models

### Configuration File Format

**Minimal Valid Configuration** (user-friendly):
```json
{
  "repositories": [
    {
      "name": "my-repo",
      "path": "./my-repo"
    }
  ]
}
```

**Complete Configuration** (auto-generated):
```json
{
  "version": "1.0",
  "repositories": [
    {
      "name": "my-repo",
      "path": "./my-repo",
      "remote": "https://github.com/user/my-repo.git",
      "defaultBranch": "main",
      "description": "My repository",
      "tags": ["backend"],
      "group": "services"
    }
  ],
  "groups": {
    "services": {
      "description": "Backend services"
    }
  },
  "settings": {
    "nestedMode": false
  }
}
```

### Validation Error Format

```javascript
{
  valid: false,
  errors: [
    'Repository "my-repo" (index 0): path "./invalid" does not exist',
    'Repository "my-repo" (index 0): path "./invalid" is not a Git repository (no .git directory found)',
    'Repository "worktree-repo" (index 1): path "./worktree" appears to be a Git worktree (not supported)'
  ]
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Minimal Configuration Acceptance

*For any* configuration object containing a repositories array with entries having name and path fields, the validation should accept the configuration as structurally valid (before filesystem checks).

**Validates: Requirements 1.1, 2.1, 2.4**

### Property 2: Version Field Optional

*For any* configuration object without a version field, the validation should treat it as version '1.0' and accept it if all other validation passes.

**Validates: Requirements 2.1, 5.1**

### Property 3: Filesystem Validation Accuracy

*For any* repository path that exists and contains a .git directory (not file), the filesystem validation should accept it as a valid Git repository.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 4: Error Message Completeness

*For any* validation failure, the error message should include the repository name (or index if name is missing), the specific field or condition that failed, and a suggestion for how to fix it.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 5: Backward Compatibility

*For any* valid configuration from v1.18.0 or later, the new validation logic should accept it without modification.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 6: Multiple Error Reporting

*For any* configuration with multiple validation failures, all failures should be collected and reported together, not just the first failure.

**Validates: Requirements 4.4**

## Error Handling

### Validation Error Categories

1. **Structural Errors**: Missing required fields, wrong field types
   - Example: `Repository at index 0: missing required field "name"`
   - Action: Report error with field name and expected type

2. **Filesystem Errors**: Path doesn't exist, not a Git repository
   - Example: `Repository "my-repo": path "./invalid" does not exist`
   - Action: Report error with path and suggest checking the path

3. **Git Worktree Detection**: Path contains `.git` file instead of directory
   - Example: `Repository "worktree": path "./worktree" appears to be a Git worktree (not supported)`
   - Action: Report error and suggest using the main repository path

4. **Duplicate/Overlap Errors**: Duplicate names or paths
   - Example: `Duplicate repository name: "my-repo"`
   - Action: Report error with conflicting values

### Error Message Format

All error messages follow this pattern:
```
Repository "{name}" (index {index}): {specific_error}. {suggestion}
```

Examples:
- `Repository "backend" (index 0): path "./backend" does not exist. Please check the path is correct.`
- `Repository "frontend" (index 1): path "./frontend" is not a Git repository (no .git directory found). Please ensure this is a Git repository.`
- `Repository at index 2: missing required field "name". Please add a name field.`

## Testing Strategy

### Unit Tests

**Test Coverage**:
1. Minimal configuration acceptance (name + path only)
2. Version field optional (missing version defaults to '1.0')
3. Optional fields can be omitted (remote, defaultBranch, etc.)
4. Filesystem validation for existing paths
5. Filesystem validation for non-existent paths
6. Git repository detection (directory vs file)
7. Error message format and completeness
8. Backward compatibility with existing configs
9. Multiple error collection and reporting

**Test Files**:
- `tests/unit/repo/config-manager.test.js` (extend existing tests)

### Property-Based Tests

Each property test should run minimum 100 iterations and be tagged with:
```javascript
// Feature: manual-config-validation-fix, Property {N}: {property_text}
```

**Property Test 1: Minimal Configuration Acceptance**
- Generate random configurations with only name and path fields
- Verify all pass structural validation
- Tag: `Feature: manual-config-validation-fix, Property 1: Minimal Configuration Acceptance`

**Property Test 2: Version Field Optional**
- Generate random configurations with and without version field
- Verify both are treated equivalently (version defaults to '1.0')
- Tag: `Feature: manual-config-validation-fix, Property 2: Version Field Optional`

**Property Test 3: Filesystem Validation Accuracy**
- Create temporary Git repositories with random names
- Generate configurations pointing to these repositories
- Verify all pass filesystem validation
- Clean up temporary repositories
- Tag: `Feature: manual-config-validation-fix, Property 3: Filesystem Validation Accuracy`

**Property Test 4: Error Message Completeness**
- Generate random invalid configurations (missing fields, invalid paths)
- Verify all error messages include repository identifier and specific failure reason
- Tag: `Feature: manual-config-validation-fix, Property 4: Error Message Completeness`

**Property Test 5: Backward Compatibility**
- Generate random configurations in v1.18.0+ format (with version field and all optional fields)
- Verify all pass validation unchanged
- Tag: `Feature: manual-config-validation-fix, Property 5: Backward Compatibility`

**Property Test 6: Multiple Error Reporting**
- Generate configurations with multiple intentional errors
- Verify all errors are reported, not just the first one
- Tag: `Feature: manual-config-validation-fix, Property 6: Multiple Error Reporting`

### Integration Tests

1. **Manual Configuration Workflow**:
   - User creates minimal config file manually
   - Run `sce repo status` to trigger validation
   - Verify command succeeds

2. **Invalid Path Detection**:
   - User creates config with non-existent path
   - Run `sce repo status`
   - Verify clear error message is displayed

3. **Git Worktree Detection**:
   - Create a Git worktree
   - Add worktree path to config
   - Run `sce repo status`
   - Verify worktree is detected and rejected with helpful message

### Test Execution

Run all tests before committing:
```bash
npm test
```

Verify no regressions in existing functionality:
```bash
npm test -- tests/unit/repo/config-manager.test.js
```
