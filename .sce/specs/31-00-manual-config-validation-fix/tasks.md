# Implementation Plan: Manual Config Validation Fix

## Overview

This implementation plan addresses the validation issues preventing users from manually editing repository configurations. We'll modify the ConfigManager to accept minimal configurations (name + path only), make the version field optional, add filesystem validation, and improve error messages.

## Tasks

- [x] 1. Make version field optional with default value
  - Modify `validateConfig()` to treat missing version as '1.0'
  - Update validation logic to not require version field
  - Ensure backward compatibility with configs that have version field
  - _Requirements: 2.1, 5.1, 5.3_

- [ ]* 1.1 Write unit tests for optional version field
  - Test config without version field passes validation
  - Test config with version '1.0' passes validation
  - Test both produce equivalent validation results
  - _Requirements: 2.1, 5.1_

- [x] 2. Relax field requirements to minimal (name + path)
  - Update `_validateRepository()` to only require name and path
  - Make remote, defaultBranch, description, tags, group, parent all optional
  - Ensure optional fields are still type-validated when present
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ]* 2.1 Write unit tests for minimal configuration
  - Test config with only name and path passes validation
  - Test optional fields can be omitted
  - Test optional fields are still validated when present
  - _Requirements: 2.1, 2.4_

- [x] 3. Add filesystem validation for repository paths
  - [x] 3.1 Implement `_isGitRepository()` helper method
    - Check if path exists
    - Check if .git exists within path
    - Verify .git is a directory (not file)
    - Return false for errors (path doesn't exist, no permissions)
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.2 Implement `_validateRepositoryPath()` method
    - Call `_isGitRepository()` to check path
    - Generate descriptive error for non-existent path
    - Generate descriptive error for missing .git directory
    - Generate descriptive error for Git worktree (.git file)
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2_

  - [x] 3.3 Integrate filesystem validation into `loadConfig()`
    - Add filesystem validation after structural validation
    - Pass validateFilesystem flag to `validateConfig()`
    - Collect all filesystem errors before throwing
    - _Requirements: 3.1, 3.2, 3.3_

- [ ]* 3.4 Write unit tests for filesystem validation
  - Test valid Git repository path passes validation
  - Test non-existent path fails with clear error
  - Test path without .git fails with clear error
  - Test Git worktree (.git file) fails with clear error
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Improve error messages for clarity
  - Update all error messages to include repository name/index
  - Add specific failure reason to each error
  - Add suggestions for fixing common issues
  - Ensure multiple errors are collected and reported together
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ]* 4.1 Write unit tests for error message format
  - Test error messages include repository identifier
  - Test error messages include specific failure reason
  - Test error messages include fix suggestions
  - Test multiple errors are reported together
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. Checkpoint - Ensure all tests pass
  - Run full test suite: `npm test`
  - Verify no regressions in existing functionality
  - Ensure all new tests pass
  - Ask user if questions arise

- [x] 6. Update documentation
  - Update `docs/multi-repo-management-guide.md` with manual config examples
  - Document minimal configuration format (name + path only)
  - Document optional fields and their purposes
  - Add troubleshooting section for common validation errors
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 7. Update version and changelog
  - Update `package.json` version to 1.21.0
  - Update `CHANGELOG.md` with new features and fixes
  - Document breaking changes (none expected)
  - Document new manual configuration support
  - _Requirements: 5.4_

- [x] 8. Final checkpoint - Prepare for release
  - Run full test suite one final time
  - Verify all 198 repository tests pass
  - Review CHANGELOG.md for completeness
  - Ensure documentation is up to date
  - Ask user for approval to proceed with release

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Filesystem validation is only performed when loading from disk (not during saveConfig)
- Backward compatibility is maintained with all v1.18.0+ configurations
- Version 1.21.0 is a minor version bump (new feature: manual config support)
---

## SCE Status Markers

- [x] 1 Legacy spec baseline reconciled for current release state
- [x] 2 Core capability outcomes validated and retained
- [x] 3 Tests or verification checkpoints executed
- [x] 4 Documentation and traceability synchronized
