# Implementation Plan: Multi-Repository Management

## Overview

This implementation plan breaks down the multi-repository management feature into discrete, incremental coding tasks. Each task builds on previous work, with testing integrated throughout to catch errors early. The plan focuses on Phase 1 MVP functionality: init, status, exec, and health commands.

## Tasks

- [x] 1. Set up project structure and core utilities
  - Create directory structure: `lib/repo/`, `lib/repo/handlers/`, `lib/repo/errors/`
  - Create error classes: ConfigError, RepoError, GitError
  - Create PathResolver utility with path normalization and validation
  - Set up test structure: `tests/unit/repo/`, `tests/unit/repo/handlers/`, `tests/unit/repo/properties/`
  - _Requirements: 8.1, 8.6, 8.8_

- [ ]* 1.1 Write property tests for PathResolver
  - **Property 2: Path Resolution Consistency**
  - **Validates: Requirements 1.4, 1.5, 8.1, 8.6, 8.8**

- [ ]* 1.2 Write unit tests for PathResolver edge cases
  - Test Windows drive letters
  - Test relative path resolution
  - Test path normalization
  - _Requirements: 1.4, 1.5, 8.2_

- [x] 2. Implement GitOperations wrapper
  - [x] 2.1 Create GitOperations class with simple-git integration
    - Implement createGitInstance, isGitRepo, getStatus
    - Implement getCurrentBranch, getRemoteUrl, getRemotes
    - Implement isRemoteReachable, execRaw
    - _Requirements: 2.2, 3.1, 3.2, 3.3, 3.4_

  - [ ]* 2.2 Write property tests for GitOperations
    - **Property 3: Path Validation**
    - **Validates: Requirements 1.3**

  - [ ]* 2.3 Write unit tests for GitOperations
    - Test Git repository detection
    - Test remote URL extraction
    - Test status retrieval
    - Test error handling for invalid repos
    - _Requirements: 1.3, 2.2, 3.1_

- [x] 3. Implement ConfigManager
  - [x] 3.1 Create ConfigManager class with JSON schema validation
    - Implement loadConfig, saveConfig, validateConfig
    - Implement configExists, getConfigPath
    - Add validation for required fields, duplicates, overlapping paths
    - _Requirements: 1.1, 1.2, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 3.2 Write property tests for ConfigManager validation
    - **Property 4: Configuration Validation Completeness**
    - **Validates: Requirements 1.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 10.7**

  - [ ]* 3.3 Write property tests for configuration round-trip
    - **Property 11: Configuration Round-Trip Consistency**
    - **Validates: Requirements 1.1, 10.1**

  - [ ]* 3.4 Write property tests for configuration structure
    - **Property 1: Configuration Structure Completeness**
    - **Validates: Requirements 1.2, 10.3, 10.4, 10.5**

  - [ ]* 3.5 Write unit tests for ConfigManager
    - Test missing configuration file handling
    - Test invalid JSON handling
    - Test schema validation errors
    - Test version compatibility
    - _Requirements: 1.6, 6.1, 6.8, 10.8_

- [x] 4. Checkpoint - Ensure core utilities work correctly
  - Run all tests for PathResolver, GitOperations, ConfigManager
  - Verify error handling and validation logic
  - Ask the user if questions arise

- [x] 5. Implement RepoManager
  - [x] 5.1 Create RepoManager class for repository operations
    - Implement discoverRepositories with directory scanning
    - Implement getRepoStatus and getAllRepoStatuses
    - Implement execInRepo and execInAllRepos
    - Implement checkRepoHealth and checkAllReposHealth
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 4.1, 4.3, 5.1, 5.2, 5.4_

  - [ ]* 5.2 Write property tests for repository discovery
    - **Property 5: Repository Discovery Completeness**
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 5.3 Write property tests for status reporting
    - **Property 6: Status Reporting Accuracy**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.6**

  - [ ]* 5.4 Write property tests for command execution
    - **Property 7: Command Execution Across Repositories**
    - **Validates: Requirements 4.1, 4.3, 4.6**

  - [ ]* 5.5 Write property tests for execution summary
    - **Property 8: Execution Summary Accuracy**
    - **Validates: Requirements 4.5, 4.8**

  - [ ]* 5.6 Write property tests for health checks
    - **Property 9: Health Check Completeness**
    - **Validates: Requirements 5.1, 5.2, 5.4, 5.5**

  - [ ]* 5.7 Write property tests for error handling
    - **Property 10: Error Handling and Continuation**
    - **Validates: Requirements 7.1, 7.2, 7.6, 7.7**

  - [ ]* 5.8 Write unit tests for RepoManager
    - Test .sce directory exclusion
    - Test remote selection logic (origin vs first)
    - Test repos without remotes
    - Test error continuation in batch operations
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 4.3, 7.2_

- [x] 6. Implement OutputFormatter
  - Create OutputFormatter class for consistent output
  - Implement formatTable, success, error, warning, info
  - Implement createProgress for progress indicators
  - Add color-coding support using chalk
  - _Requirements: 3.7, 5.7, 9.7_

- [ ]* 6.1 Write unit tests for OutputFormatter
  - Test table formatting
  - Test color-coded output
  - Test progress indicators
  - _Requirements: 3.7, 5.7_

- [x] 7. Checkpoint - Ensure core services work correctly
  - Run all tests for RepoManager and OutputFormatter
  - Verify batch operations and error handling
  - Ask the user if questions arise

- [x] 8. Implement InitHandler
  - [x] 8.1 Create InitHandler class
    - Implement execute method with directory scanning
    - Implement confirmOverwrite for existing configs
    - Implement displaySummary for initialization results
    - Integrate with RepoManager.discoverRepositories
    - Integrate with ConfigManager.saveConfig
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 8.2 Write unit tests for InitHandler
    - Test initialization with various directory structures
    - Test overwrite confirmation logic
    - Test summary display
    - Test error handling for scan failures
    - _Requirements: 2.1, 2.7, 2.8_

- [x] 9. Implement StatusHandler
  - [x] 9.1 Create StatusHandler class
    - Implement execute method with status retrieval
    - Implement formatStatusTable for tabular output
    - Implement formatVerboseStatus for detailed output
    - Integrate with RepoManager.getAllRepoStatuses
    - Integrate with OutputFormatter
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ]* 9.2 Write unit tests for StatusHandler
    - Test status table formatting
    - Test verbose output
    - Test clean state display
    - Test error status display
    - _Requirements: 3.5, 3.7, 3.8_

- [x] 10. Implement ExecHandler
  - [x] 10.1 Create ExecHandler class
    - Implement execute method with command execution
    - Implement displayResults for command output
    - Implement displaySummary for execution summary
    - Add dry-run mode support
    - Integrate with RepoManager.execInAllRepos
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 10.2 Write unit tests for ExecHandler
    - Test command execution across repos
    - Test dry-run mode
    - Test output formatting
    - Test summary accuracy
    - Test exit code preservation
    - _Requirements: 4.5, 4.7, 4.8_

- [x] 11. Implement HealthHandler
  - [x] 11.1 Create HealthHandler class
    - Implement execute method with health checks
    - Implement displayResults for check results
    - Implement displaySummary for overall health
    - Integrate with RepoManager.checkAllReposHealth
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [ ]* 11.2 Write unit tests for HealthHandler
    - Test health check execution
    - Test result display
    - Test summary display
    - Test error message specificity
    - _Requirements: 5.5, 5.6, 5.8_

- [x] 12. Checkpoint - Ensure all handlers work correctly
  - Run all tests for handlers
  - Verify integration with core services
  - Ask the user if questions arise

- [x] 13. Integrate with CLI
  - [x] 13.1 Add `sce repo` command group to bin/scene-capability-engine.js
    - Create `lib/commands/repo.js` with Commander integration
    - Add `init` subcommand with options
    - Add `status` subcommand with --verbose flag
    - Add `exec` subcommand with --dry-run flag
    - Add `health` subcommand
    - Wire up handlers to CLI commands
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 13.2 Write integration tests for CLI commands
    - Test `sce repo init` end-to-end
    - Test `sce repo status` end-to-end
    - Test `sce repo exec` end-to-end
    - Test `sce repo health` end-to-end
    - Test help text display
    - Test invalid command handling
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 14. Add documentation
  - Update README.md with multi-repo management section
  - Create docs/multi-repo-management-guide.md with detailed usage
  - Add examples for common workflows
  - Document configuration file format
  - Add troubleshooting section
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 15. Final checkpoint - Complete system verification
  - Run full test suite (unit + property + integration)
  - Test on Windows, Linux, and Mac if possible
  - Verify all requirements are met
  - Test with real Git repositories
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (minimum 100 iterations each)
- Unit tests validate specific examples and edge cases
- Integration tests verify end-to-end workflows
- The implementation follows a bottom-up approach: utilities → services → handlers → CLI
---

## SCE Status Markers

- [x] 1 Legacy spec baseline reconciled for current release state
- [x] 2 Core capability outcomes validated and retained
- [x] 3 Tests or verification checkpoints executed
- [x] 4 Documentation and traceability synchronized
