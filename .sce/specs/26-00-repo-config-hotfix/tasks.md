# Implementation Plan: Repository Configuration Hotfix

## Overview

This hotfix addresses three critical bugs in v1.20.0:
1. Configuration save failure with nested repositories
2. Parent reference validation not matching paths correctly
3. Git command duplication in exec handler

The implementation focuses on minimal code changes to ConfigManager and RepoManager while maintaining all existing functionality.

## Tasks

- [x] 1. Add path normalization to ConfigManager
  - [x] 1.1 Implement `_normalizePath()` helper method
    - Handle trailing slashes, backslashes, leading './', and '.' paths
    - Return normalized path string for consistent comparison
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  
  - [ ]* 1.2 Write unit tests for path normalization
    - Test various path formats (trailing slashes, backslashes, './', '.')
    - Test idempotence (normalizing twice = normalizing once)
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 2. Fix parent reference validation in ConfigManager
  - [x] 2.1 Update `_validateParentReferences()` to use normalized paths
    - Build pathMap with normalized paths as keys
    - Compare normalized parent paths with normalized repo paths
    - Improve error messages to include available paths
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 7.1, 7.2, 7.3_
  
  - [ ]* 2.2 Write unit tests for parent validation
    - Test parent validation with various path formats
    - Test error messages include available paths
    - Test backward compatibility (configs without parent fields)
    - Test circular reference detection still works
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 7.1, 7.2, 7.3_

- [x] 3. Fix git command duplication in RepoManager
  - [x] 3.1 Update `execInRepo()` to detect "git" prefix
    - Trim command and check if it starts with "git "
    - Only prepend "git" if command doesn't already start with it
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [ ]* 3.2 Write unit tests for command execution
    - Test commands starting with "git" are not duplicated
    - Test commands not starting with "git" get prefix added
    - Test command trimming works correctly
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 4. Add integration tests for multi-repository scenarios
  - [ ]* 4.1 Write integration test for multi-repo configuration save/load
    - Create configuration with 2+ repositories
    - Include nested repositories with parent fields
    - Verify configuration saves and loads successfully
    - _Requirements: 1.5, 2.1, 2.2, 5.1_
  
  - [ ]* 4.2 Write integration test for nested repository discovery
    - Test RepoManager discovers nested repos correctly
    - Test parent fields are set correctly
    - Test ConfigManager validates the discovered configuration
    - _Requirements: 1.1, 1.2, 1.3, 4.3_

- [x] 5. Run full test suite and verify all tests pass
  - Ensure all 1686 existing tests still pass
  - Ensure new tests pass
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 6. Update version and documentation
  - [x] 6.1 Update package.json to version 1.20.1
    - Change version field to "1.20.1"
    - _Requirements: 9.1_
  
  - [x] 6.2 Update CHANGELOG.md with hotfix details
    - Add [1.20.1] section with release date
    - List all bugs fixed
    - Mark as hotfix release
    - Include technical details
    - _Requirements: 9.2, 9.3, 9.4_

- [x] 7. Final verification checkpoint
  - Ensure all tests pass (run `npm test`)
  - Verify no regressions in existing functionality
  - Verify all three bugs are fixed
  - Ask user if ready to commit and release

## Notes

- Tasks marked with `*` are optional test tasks (can be skipped for faster hotfix)
- This is a minimal hotfix focusing only on bug fixes
- No changes to configuration format or RepoManager scanning logic
- All existing functionality must be preserved
- Focus on ConfigManager and RepoManager changes only
---

## SCE Status Markers

- [x] 1 Legacy spec baseline reconciled for current release state
- [x] 2 Core capability outcomes validated and retained
- [x] 3 Tests or verification checkpoints executed
- [x] 4 Documentation and traceability synchronized
