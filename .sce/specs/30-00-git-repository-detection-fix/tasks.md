# Implementation Plan: Git Repository Detection Fix

## Overview

Fix the repository scanning logic to only detect actual Git repositories (directories containing `.git` subdirectories), eliminating false positives for regular subdirectories.

## Tasks

- [x] 1. Fix GitOperations.isGitRepo() method
  - Add `.git` directory existence check using `fs.stat()`
  - Verify `.git` is a directory (not a file for Git worktrees)
  - Keep optional `git revparse` verification for additional validation
  - Handle filesystem errors gracefully (treat as non-repository)
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ]* 1.1 Write unit tests for isGitRepo() validation
  - Test valid Git repository with `.git` directory
  - Test directory without `.git` subdirectory
  - Test directory with `.git` file (Git worktree case)
  - Test inaccessible `.git` directory (permission errors)
  - Test `.git` exists but git command fails
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 2. Update existing tests to work with new validation
  - Review and update GitOperations tests if needed
  - Review and update RepoManager tests if needed
  - Ensure all existing tests pass with new logic
  - _Requirements: 5.5_

- [ ]* 2.1 Add integration test for accurate detection
  - Test scanning workspace with 8 Git repos + 26 regular directories
  - Verify exactly 8 repositories are detected
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 3. Run full test suite and verify
  - Execute all tests to ensure no regressions
  - Verify backward compatibility with existing configurations
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Update documentation
  - Update `docs/multi-repo-management-guide.md` to clarify detection criteria
  - Add troubleshooting section for "Why isn't my directory detected?"
  - Update CHANGELOG.md for v1.20.5
  - _Requirements: 4.2_

- [x] 5. Version bump and release preparation
  - Update version to v1.20.5 in package.json
  - Verify all tests pass
  - Prepare for npm release
  - _Requirements: All_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster release
- The core fix is in task 1 (GitOperations.isGitRepo())
- Task 2 ensures existing tests continue to work
- Task 3 validates the fix works correctly
- Tasks 4-5 prepare for release
---

## SCE Status Markers

- [x] 1 Legacy spec baseline reconciled for current release state
- [x] 2 Core capability outcomes validated and retained
- [x] 3 Tests or verification checkpoints executed
- [x] 4 Documentation and traceability synchronized
