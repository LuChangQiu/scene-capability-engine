# Design Document

## Overview

This design addresses the bug where `sce repo init --nested` incorrectly identifies regular subdirectories as Git repositories. The root cause is that the current `isGitRepo()` method uses `git revparse --git-dir`, which returns true for any directory within a Git repository tree, not just repository roots.

The fix involves adding explicit `.git` directory validation to ensure only actual Git repository roots are detected.

## Architecture

### Current Flow (Buggy)
```
discoverRepositories()
  └─> _scanDirectory() (recursive)
      └─> gitOps.isGitRepo(path)
          └─> git revparse --git-dir  ✗ Returns true for subdirectories
```

### Fixed Flow
```
discoverRepositories()
  └─> _scanDirectory() (recursive)
      └─> gitOps.isGitRepo(path)
          ├─> Check if .git directory exists  ✓ Validates repository root
          └─> git revparse --git-dir (optional verification)
```

## Components and Interfaces

### 1. GitOperations.isGitRepo() Enhancement

**Current Implementation**:
```javascript
async isGitRepo(path) {
  try {
    const git = this.createGitInstance(path);
    await git.revparse(['--git-dir']);
    return true;
  } catch (error) {
    return false;
  }
}
```

**Fixed Implementation**:
```javascript
async isGitRepo(path) {
  try {
    // Check if .git directory exists
    const gitDir = require('path').join(path, '.git');
    const stats = await require('fs').promises.stat(gitDir);
    
    // Verify it's a directory (not a file, which can occur in Git worktrees)
    if (!stats.isDirectory()) {
      return false;
    }
    
    // Optional: Verify with git command for additional validation
    const git = this.createGitInstance(path);
    await git.revparse(['--git-dir']);
    return true;
  } catch (error) {
    return false;
  }
}
```

**Interface**:
- **Input**: `path: string` - Directory path to check
- **Output**: `Promise<boolean>` - True if path is a Git repository root
- **Side Effects**: None (read-only filesystem access)

### 2. RepoManager._scanDirectory() (No Changes Required)

The scanning logic remains unchanged. It already calls `isGitRepo()` for each directory, so fixing `isGitRepo()` automatically fixes the scanning behavior.

**Current Logic** (remains the same):
```javascript
// Check if current directory is a Git repository
const isRepo = await this.gitOps.isGitRepo(currentPath);

if (isRepo) {
  // Extract repository information
  // ...
}
```

## Data Models

No data model changes required. The repository configuration format remains unchanged:

```javascript
{
  path: string,           // Relative path to repository
  name: string,           // Repository name
  remote: string|null,    // Remote URL
  branch: string,         // Current branch
  hasRemote: boolean,     // Whether remote exists
  parent: string|null     // Parent repository (for nested repos)
}
```

## Correctness Properties

### Property 1: Git Directory Existence
*For any* directory path, if `isGitRepo(path)` returns true, then `path/.git` must exist as a directory.

**Validates: Requirements 1.1, 1.2**

### Property 2: Accurate Detection Count
*For any* directory tree with N Git repositories (directories containing `.git`), `discoverRepositories()` should return exactly N repositories.

**Validates: Requirements 2.1, 2.2**

### Property 3: No False Positives
*For any* directory without a `.git` subdirectory, `isGitRepo()` must return false.

**Validates: Requirements 1.2, 2.3**

### Property 4: Git Worktree Exclusion
*For any* directory containing a `.git` file (not directory), `isGitRepo()` must return false.

**Validates: Requirements 1.4**

### Property 5: Backward Compatibility
*For any* valid existing repository configuration, loading and validating the configuration should succeed if the repositories still have `.git` directories.

**Validates: Requirements 3.1, 3.3**

## Error Handling

### 1. Filesystem Access Errors

**Scenario**: Cannot access `.git` directory due to permissions or I/O errors

**Handling**:
```javascript
try {
  const stats = await fs.stat(gitDir);
  // ...
} catch (error) {
  // Treat as non-repository (fail-safe)
  return false;
}
```

**Rationale**: If we can't verify the `.git` directory exists, we should not claim it's a repository.

### 2. Git Command Errors

**Scenario**: `git revparse` fails even though `.git` directory exists

**Handling**:
```javascript
try {
  await git.revparse(['--git-dir']);
  return true;
} catch (error) {
  // .git exists but git command failed - still treat as repository
  // since .git directory is the authoritative indicator
  return true;
}
```

**Rationale**: The `.git` directory is the authoritative indicator. Git command failures might be due to corrupted repos, but they're still repos.

**Alternative (Stricter)**:
```javascript
// If we want to be stricter and only accept valid repos:
return false;
```

**Decision**: Use the lenient approach (return true if `.git` exists) to avoid false negatives.

### 3. Missing `.git` in Existing Config

**Scenario**: User's configuration references a repository that no longer has a `.git` directory

**Handling**: Already handled by existing health check logic. No changes needed.

### 4. Verbose Logging

**Scenario**: User wants to understand why directories were excluded

**Handling**: Add optional verbose logging in `_scanDirectory()`:

```javascript
if (options.verbose && !isRepo) {
  console.log(`Skipping ${currentPath}: not a Git repository (no .git directory)`);
}
```

**Note**: This is optional and not critical for the fix.

## Testing Strategy

### Unit Tests

**Test File**: `tests/unit/repo/git-operations.test.js`

1. **Test: Valid Git repository with .git directory**
   - Setup: Mock fs.stat to return directory stats for `.git`
   - Action: Call `isGitRepo(path)`
   - Assert: Returns true

2. **Test: Directory without .git**
   - Setup: Mock fs.stat to throw ENOENT error
   - Action: Call `isGitRepo(path)`
   - Assert: Returns false

3. **Test: Directory with .git file (worktree)**
   - Setup: Mock fs.stat to return file stats (not directory)
   - Action: Call `isGitRepo(path)`
   - Assert: Returns false

4. **Test: Inaccessible .git directory**
   - Setup: Mock fs.stat to throw EACCES error
   - Action: Call `isGitRepo(path)`
   - Assert: Returns false

5. **Test: .git exists but git command fails**
   - Setup: Mock fs.stat to succeed, mock git.revparse to fail
   - Action: Call `isGitRepo(path)`
   - Assert: Returns true (lenient approach)

**Test File**: `tests/unit/repo/repo-manager.test.js`

6. **Test: Scan detects only directories with .git**
   - Setup: Mock filesystem with 8 repos + 26 regular dirs
   - Action: Call `discoverRepositories()`
   - Assert: Returns exactly 8 repositories

7. **Test: Existing tests continue to pass**
   - Action: Run all existing tests
   - Assert: All tests pass

### Property-Based Tests

**Test File**: `tests/unit/repo/git-operations.pbt.test.js` (new file)

1. **Property Test: Git directory existence invariant**
   - **Property 1: Git Directory Existence**
   - Generate: Random directory paths
   - Setup: Mock some with `.git` directories, some without
   - Action: Call `isGitRepo()` on each
   - Assert: Returns true ⟺ `.git` directory exists
   - **Validates: Requirements 1.1, 1.2**

### Integration Tests

**Test File**: `tests/integration/repo-scanning.test.js` (optional)

1. **Test: Real filesystem scanning**
   - Setup: Create temporary directory with real Git repos
   - Action: Run `sce repo init --nested`
   - Assert: Detects correct number of repositories

## Implementation Plan

### Phase 1: Fix GitOperations.isGitRepo()
1. Add `.git` directory check using `fs.stat()`
2. Verify it's a directory (not a file)
3. Keep optional `git revparse` verification
4. Handle errors gracefully

### Phase 2: Update Tests
1. Update existing GitOperations tests
2. Add new test cases for `.git` validation
3. Update RepoManager tests if needed
4. Ensure all existing tests pass

### Phase 3: Verification
1. Run full test suite
2. Manual testing with real repositories
3. Verify backward compatibility

## Backward Compatibility

### Existing Configurations
- **No breaking changes**: Existing `project-repos.json` files remain valid
- **Health checks**: Existing health check logic already validates repository paths
- **Migration**: No migration needed

### Behavior Changes
- **Before**: Detects subdirectories within Git repos as separate repos
- **After**: Only detects actual repository roots (with `.git` directories)
- **Impact**: Users will see fewer false positives, which is the desired behavior

### Edge Cases
1. **Git worktrees**: Correctly excluded (`.git` is a file, not directory)
2. **Submodules**: Correctly detected (have their own `.git` directories)
3. **Nested repos**: Correctly detected when `--nested` flag is used

## Performance Considerations

### Filesystem Access
- **Added overhead**: One `fs.stat()` call per directory scanned
- **Impact**: Negligible (stat is fast, and we're already doing directory reads)
- **Optimization**: None needed

### Git Command Reduction
- **Current**: Calls `git revparse` for every directory
- **After**: Calls `git revparse` only for directories with `.git`
- **Impact**: Slight performance improvement (fewer git commands)

## Security Considerations

### Symlink Attacks
- **Risk**: Malicious symlinks pointing to `.git` directories
- **Mitigation**: Already handled by existing `fs.realpath()` checks in `_scanDirectory()`
- **Additional**: `fs.stat()` follows symlinks, which is acceptable

### Permission Escalation
- **Risk**: None (read-only operations)
- **Mitigation**: Errors are caught and treated as non-repositories

## Documentation Updates

### User-Facing Documentation
- **File**: `docs/multi-repo-management-guide.md`
- **Update**: Clarify that only directories with `.git` are detected
- **Add**: Troubleshooting section for "Why isn't my directory detected?"

### Changelog
- **Version**: v1.20.5
- **Type**: Bug fix
- **Description**: Fixed repository scanning to only detect actual Git repositories (directories with `.git`), eliminating false positives for regular subdirectories

## Rollout Plan

1. **Development**: Implement fix and tests
2. **Testing**: Run full test suite + manual verification
3. **Version bump**: Update to v1.20.5
4. **Release**: Publish to npm via GitHub Actions
5. **Monitoring**: Watch for user feedback on GitHub issues
