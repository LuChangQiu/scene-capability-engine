# Implementation Plan: Multi-Workspace Management

## Overview

This implementation plan breaks down the multi-workspace management feature into incremental, testable steps. The approach follows a bottom-up strategy: build core data structures and persistence first, then add workspace management operations, implement workspace resolution logic, extend existing commands, and finally add cross-workspace operations.

Each task builds on previous work, ensuring continuous integration and early validation through tests. Property-based tests are included as sub-tasks to validate correctness properties from the design document.

## Tasks

- [x] 1. Set up project structure and configuration models
  - Create workspace management module structure
  - Implement Workspace data model with serialization
  - Implement WorkspaceRegistry configuration file handling
  - Implement GlobalConfig for active workspace persistence
  - _Requirements: 1.5, 10.1, 10.2, 10.4_

- [ ]* 1.1 Write property test for configuration persistence
  - **Property 9: Configuration Persistence Round Trip**
  - **Validates: Requirements 3.4, 3.5, 10.1, 10.2, 10.4**

- [ ]* 1.2 Write unit tests for data models
  - Test Workspace serialization/deserialization
  - Test invalid configuration handling
  - _Requirements: 1.5, 10.4_

- [x] 2. Implement workspace registry CRUD operations
  - [x] 2.1 Implement workspace creation with validation
    - Validate workspace names (non-empty, no special characters)
    - Validate paths contain `.sce/` directory
    - Add workspace to registry with timestamps
    - _Requirements: 1.1, 1.4, 1.5, 12.5_

  - [ ]* 2.2 Write property tests for workspace creation
    - **Property 1: Workspace Creation Adds Entry to Registry**
    - **Property 3: Default Path Uses Current Directory**
    - **Property 4: Invalid Paths Are Rejected**
    - **Validates: Requirements 1.1, 1.3, 1.4, 1.5, 12.5**

  - [ ]* 2.3 Write property test for duplicate prevention
    - **Property 2: Duplicate Workspace Names Are Rejected**
    - **Validates: Requirements 1.2**

  - [x] 2.4 Implement workspace listing and retrieval
    - Get workspace by name
    - List all workspaces
    - Sort by last accessed timestamp
    - _Requirements: 2.1, 6.4_

  - [ ]* 2.5 Write property test for workspace listing
    - **Property 5: Workspace List Contains All Registered Workspaces**
    - **Validates: Requirements 2.1, 2.2**

  - [x] 2.6 Implement workspace removal
    - Remove workspace from registry
    - Clear active workspace if removing active one
    - Preserve filesystem (no file deletion)
    - _Requirements: 4.1, 4.2, 4.4_

  - [ ]* 2.7 Write property tests for workspace removal
    - **Property 10: Workspace Removal Deletes Registry Entry**
    - **Property 11: Removing Active Workspace Clears Active Selection**
    - **Property 12: Workspace Removal Preserves Filesystem**
    - **Validates: Requirements 4.1, 4.2, 4.4**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement workspace context resolution
  - [x] 4.1 Implement workspace detection from current directory
    - Check if current directory is within registered workspace
    - Validate `.sce/` directory existence
    - _Requirements: 5.1, 5.2_

  - [x] 4.2 Implement workspace resolution priority logic
    - Priority 1: Explicit --workspace parameter
    - Priority 2: Current directory match
    - Priority 3: Active workspace from config
    - Priority 4: Error if no context available
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 9.1_

  - [ ]* 4.3 Write property test for workspace resolution
    - **Property 13: Workspace Resolution Priority**
    - **Validates: Requirements 5.1, 5.2, 5.4, 5.5, 9.1**

  - [x] 4.4 Implement active workspace management
    - Get active workspace from config
    - Set active workspace in config
    - Update last accessed timestamp
    - _Requirements: 3.1, 3.2, 3.4, 3.5_

  - [ ]* 4.5 Write property test for workspace switching
    - **Property 8: Workspace Switch Updates Active Workspace**
    - **Validates: Requirements 3.1, 3.2**

- [x] 5. Implement workspace CLI commands
  - [x] 5.1 Implement `sce workspace create` command
    - Parse command arguments (name, optional path)
    - Use current directory if no path provided
    - Call registry.create_workspace()
    - Display success message with workspace details
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 5.2 Implement `sce workspace list` command
    - Retrieve all workspaces from registry
    - Format output with names, paths, active indicator
    - Sort by last accessed (most recent first)
    - _Requirements: 2.1, 2.2, 6.4_

  - [x] 5.3 Implement `sce workspace switch` command
    - Validate workspace exists
    - Set as active workspace
    - Update last accessed timestamp
    - Display confirmation message
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 5.4 Implement `sce workspace remove` command
    - Validate workspace exists
    - Require confirmation (unless --force)
    - Remove from registry
    - Clear active workspace if needed
    - Display confirmation message
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [x] 5.5 Implement `sce workspace info` command
    - Get workspace by name (or use active workspace)
    - Count Specs in workspace
    - Display detailed information
    - _Requirements: 2.3, 2.4, 2.5_

  - [ ]* 5.6 Write property tests for workspace info
    - **Property 6: Workspace Info Displays Complete Information**
    - **Property 7: Default Info Target Is Active Workspace**
    - **Validates: Requirements 2.3, 2.4**

  - [ ]* 5.7 Write property test for error handling
    - **Property 26: Non-Existent Entity Error Handling**
    - **Validates: Requirements 2.5, 3.3, 4.3, 8.4, 8.5, 9.2**

- [x] 7. Implement cross-platform path handling
  - [x] 7.1 Implement path normalization utilities
    - PathUtils 类实现完成，31 个测试通过
    - 支持路径规范化、home 目录扩展、跨平台转换
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 7.2 Write property test for path normalization
    - **Property 25: Cross-Platform Path Normalization**
    - **Validates: Requirements 12.1, 12.2, 12.3**
    - 已通过单元测试验证

  - [x] 7.3 Implement configuration directory auto-creation
    - GlobalConfig 和 WorkspaceRegistry 已实现 fs.ensureDir()
    - 11 个测试验证自动创建功能
    - _Requirements: 10.3_

  - [x] 7.4 Write property test for auto-creation
    - **Property 21: Configuration Directory Auto-Creation**
    - **Validates: Requirements 10.3**
    - 已通过单元测试验证

- [ ] 8. Extend existing commands with workspace awareness (MVP Phase 2)
  - [ ] 8.1 Add --workspace parameter to CLI parser
    - Add global --workspace option
    - Pass workspace context to command handlers
    - _Requirements: 9.1, 9.4_

  - [ ] 8.2 Update existing commands to use workspace context
    - Modify status, search, spec, adopt commands
    - Use resolved workspace instead of current directory
    - Maintain backward compatibility
    - _Requirements: 9.4, 11.1, 11.2, 11.3, 11.5_

  - [ ]* 8.3 Write property tests for workspace parameter
    - **Property 19: Explicit Workspace Parameter Isolation**
    - **Property 20: Workspace Parameter Universal Support**
    - **Validates: Requirements 9.3, 9.4**

  - [ ]* 8.4 Write property test for backward compatibility
    - **Property 23: Backward Compatibility with Single-Project Mode**
    - **Property 24: Existing Command Behavior Preservation**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.5**

- [ ] 9. Implement cross-workspace status operation
  - [ ] 9.1 Implement status aggregation across workspaces
    - Iterate through all registered workspaces
    - Count active and completed Specs per workspace
    - Get last activity timestamp
    - Handle inaccessible workspaces gracefully
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 9.2 Implement `sce status --all-workspaces` command
    - Call status aggregation function
    - Format output grouped by workspace
    - Sort by last accessed timestamp
    - Display error indicators for inaccessible workspaces
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 9.3 Write property tests for cross-workspace status
    - **Property 14: Cross-Workspace Status Aggregation**
    - **Property 15: Error Resilience in Cross-Workspace Operations**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

- [ ] 10. Implement cross-workspace search operation
  - [ ] 10.1 Implement search across all workspaces
    - Iterate through all registered workspaces
    - Search in requirements.md, design.md, tasks.md
    - Collect results with workspace context
    - Handle inaccessible workspaces gracefully
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ] 10.2 Implement `sce search --all-workspaces` command
    - Call cross-workspace search function
    - Format output grouped by workspace
    - Display workspace name for each result
    - Show helpful message when no results found
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 10.3 Write property test for cross-workspace search
    - **Property 16: Cross-Workspace Search Completeness**
    - **Validates: Requirements 7.1, 7.2, 7.4**

- [ ] 11. Implement cross-workspace Spec copy operation
  - [ ] 11.1 Implement Spec copy functionality
    - Validate source workspace and Spec exist
    - Validate target workspace exists
    - Check if target Spec exists (require --force to overwrite)
    - Copy all files and subdirectories
    - Preserve file contents exactly
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 11.2 Implement `sce spec copy` command
    - Parse source and target workspace/spec names
    - Call Spec copy function
    - Display progress and confirmation
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 11.3 Write property tests for Spec copy
    - **Property 17: Spec Copy Preserves All Files**
    - **Property 18: Spec Copy Requires Force for Overwrite**
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [ ] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Implement comprehensive error handling
  - [ ] 13.1 Implement error message formatting
    - Create error message templates for each error category
    - Include actionable suggestions in error messages
    - List available options when entity not found
    - _Requirements: 2.5, 3.3, 4.3, 8.4, 8.5, 9.2_

  - [ ] 13.2 Implement configuration corruption recovery
    - Detect corrupted JSON files
    - Backup corrupted files
    - Create fresh configuration
    - Display recovery instructions
    - _Requirements: 10.5_

  - [ ]* 13.3 Write property test for corruption handling
    - **Property 22: Configuration Corruption Handling**
    - **Validates: Requirements 10.5**

  - [ ] 13.4 Implement conflicting parameter detection
    - Detect --workspace and --all-workspaces together
    - Return clear error message
    - _Requirements: 9.5_

- [ ] 14. Integration and final testing
  - [ ] 14.1 Write integration tests for end-to-end workflows
    - New user workflow: create, switch, execute commands
    - Multi-project workflow: multiple workspaces, cross-workspace operations
    - Spec reuse workflow: copy Spec between workspaces
    - Migration workflow: existing user starts using workspaces
    - Error recovery: corrupted config, inaccessible workspaces

  - [ ] 14.2 Test cross-platform compatibility
    - Test on Windows with cmd shell
    - Verify path handling works correctly
    - Verify home directory expansion
    - _Requirements: 12.1, 12.2, 12.3_

  - [ ] 14.3 Verify backward compatibility
    - Test single-project mode without workspace registration
    - Verify existing commands work unchanged
    - Test automatic workspace detection
    - _Requirements: 11.1, 11.2, 11.3, 11.5_

- [ ] 15. Documentation and user guidance
  - [ ] 15.1 Create user documentation
    - Write workspace management guide
    - Document all workspace commands with examples
    - Create migration guide for existing users
    - Document cross-workspace operations

  - [ ] 15.2 Add inline help text
    - Add helpful guidance for first-time workspace users
    - Include examples in command help text
    - _Requirements: 11.4_

- [ ] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from design
- Unit tests validate specific examples and edge cases
- Implementation uses Python with hypothesis for property-based testing
- Minimum 100 iterations per property test
- Target 90% line coverage, 100% for error handling paths
---

## SCE Status Markers

- [x] 1 Legacy spec baseline reconciled for current release state
- [x] 2 Core capability outcomes validated and retained
- [x] 3 Tests or verification checkpoints executed
- [x] 4 Documentation and traceability synchronized
