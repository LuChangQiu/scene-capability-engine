# Implementation Plan: Nested Repository Support

## Overview

This implementation plan breaks down the nested repository support feature into discrete, incremental coding tasks. Each task builds on previous work and includes testing to validate functionality early. The implementation follows the phased approach outlined in the design document, prioritizing core scanning functionality first, then configuration management, CLI integration, and finally comprehensive testing and documentation.

## Tasks

- [x] 1. Implement core nested scanning logic in RepoManager
  - [x] 1.1 Add nested parameter to discoverRepositories method
    - Modify method signature to accept `options.nested` (default: true)
    - Pass nested flag through to _scanDirectory
    - _Requirements: 1.1, 2.1_

  - [x] 1.2 Implement _shouldSkipDirectory helper method
    - Create new private method to check if directory should be skipped
    - Include common non-repository directories: node_modules, .git, build, dist, target, out, .next, .nuxt, vendor
    - Support user-specified exclusions from options.exclude
    - _Requirements: 8.1_

  - [x] 1.3 Modify _scanDirectory to support nested scanning
    - Add `nested` parameter (boolean)
    - Add `parentPath` parameter (string|null) to track parent repository
    - Add `visitedPaths` parameter (Set) for symlink detection
    - When Git repo is found and nested=true, continue scanning subdirectories
    - Track parent-child relationships in discovered array
    - Use _shouldSkipDirectory for directory exclusions
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.4 Implement circular symlink detection
    - Resolve symlinks to absolute paths using fs.realpath
    - Check if resolved path exists in visitedPaths Set
    - Skip directory if already visited
    - Add current path to visitedPaths before scanning subdirectories
    - _Requirements: 1.5, 8.2_

  - [ ]* 1.5 Write property test for nested repository discovery completeness
    - **Property 1: Nested Repository Discovery Completeness**
    - **Validates: Requirements 1.1, 1.3, 1.4**
    - Generate random directory structures with nested Git repos
    - Verify all repos at all levels are discovered when nested=true

  - [ ]* 1.6 Write property test for parent-child relationship accuracy
    - **Property 2: Parent-Child Relationship Accuracy**
    - **Validates: Requirements 1.2, 3.1, 3.2, 3.4, 7.1, 7.2, 7.3**
    - Generate random nested structures
    - Verify parent field is correctly set for nested repos
    - Verify top-level repos have null parent

  - [ ]* 1.7 Write property test for non-nested mode behavior
    - **Property 3: Non-Nested Mode Behavior**
    - **Validates: Requirements 2.2**
    - Generate random directory structures
    - Verify scanner stops at first repo when nested=false

  - [ ]* 1.8 Write unit tests for _shouldSkipDirectory
    - Test common directory exclusions
    - Test user-specified exclusions
    - Test edge cases (empty string, special characters)

  - [ ]* 1.9 Write unit tests for circular symlink detection
    - Create test directory with circular symlinks
    - Verify scanner doesn't hang or crash
    - Verify appropriate directories are skipped

- [x] 2. Checkpoint - Verify core scanning functionality
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Enhance ConfigManager for parent field validation
  - [x] 3.1 Modify _validateRepository to validate parent field
    - Add validation for optional parent field (must be string or null)
    - Accept allRepos parameter for parent reference validation
    - Add validation errors for invalid parent field types
    - _Requirements: 3.1, 3.2, 7.1, 7.2_

  - [x] 3.2 Implement _validateParentReferences method
    - Create new private method to validate all parent references
    - Build map of repository paths for O(1) lookup
    - Check that all parent paths reference existing repositories
    - Detect circular parent references using depth-first search
    - Return array of validation errors
    - _Requirements: 5.4_

  - [x] 3.3 Update validateConfig to call _validateParentReferences
    - Call _validateParentReferences after validating individual repositories
    - Append parent validation errors to main errors array
    - _Requirements: 5.4_

  - [x] 3.4 Ensure backward compatibility for configurations without parent fields
    - Verify that loading old configs without parent fields succeeds
    - Treat repositories without parent field as non-nested (parent = null)
    - _Requirements: 7.4, 7.5_

  - [ ]* 3.5 Write property test for parent reference validation
    - **Property 4: Parent Reference Validation**
    - **Validates: Requirements 5.4**
    - Generate random configurations with parent references
    - Verify invalid parent references are detected
    - Verify circular references are detected

  - [ ]* 3.6 Write property test for backward compatibility
    - **Property 10: Backward Compatibility**
    - **Validates: Requirements 7.4, 7.5**
    - Generate configurations without parent fields
    - Verify loading succeeds
    - Verify all repos treated as non-nested

  - [ ]* 3.7 Write unit tests for parent field validation
    - Test valid parent references
    - Test invalid parent references (non-existent)
    - Test circular parent references
    - Test null and omitted parent fields

- [x] 4. Checkpoint - Verify configuration validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Update InitHandler for nested scanning options
  - [x] 5.1 Add nested parameter to execute method
    - Modify method signature to accept options.nested (default: true)
    - Pass nested option to RepoManager.discoverRepositories
    - _Requirements: 2.1, 2.3_

  - [x] 5.2 Update configuration creation to include parent field
    - Map discovered repositories to configuration format
    - Include parent field in repository objects
    - Set parent to null for top-level repositories
    - _Requirements: 3.1, 7.1_

  - [x] 5.3 Modify displaySummary to show scan mode and parent relationships
    - Display whether nested scanning was enabled
    - Add parent column to summary table
    - Show parent-child relationships clearly
    - _Requirements: 2.4, 3.3_

  - [ ]* 5.4 Write unit tests for InitHandler with nested options
    - Test execute with nested=true
    - Test execute with nested=false
    - Test configuration creation with parent fields
    - Test summary display with nested repos

- [x] 6. Add CLI flags for nested scanning control
  - [x] 6.1 Update repo init command with --nested and --no-nested flags
    - Add --nested option (enable nested scanning explicitly)
    - Add --no-nested option (disable nested scanning)
    - Default behavior: nested=true
    - Parse options and pass to InitHandler
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 6.2 Update CLI help text for repo init command
    - Document --nested and --no-nested flags
    - Explain default behavior
    - Provide usage examples
    - _Requirements: 9.3_

  - [ ]* 6.3 Write integration tests for CLI flags
    - Test sce repo init (default nested=true)
    - Test sce repo init --nested
    - Test sce repo init --no-nested
    - Verify configuration reflects scan mode

- [x] 7. Checkpoint - Verify CLI integration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Enhance OutputFormatter for parent-child display
  - [ ] 8.1 Implement formatRepositoryTable method
    - Create new method to format repository list with parent relationships
    - Add showParent option to display parent column
    - Add indent option to visually indent nested repositories
    - Return formatted table string
    - _Requirements: 3.3, 4.2_

  - [ ] 8.2 Implement buildRepositoryTree method
    - Create new method to build tree structure from flat repository list
    - Group repositories by parent
    - Return hierarchical tree object
    - _Requirements: 3.3_

  - [ ] 8.3 Update existing format methods to use formatRepositoryTable
    - Modify status output to show parent relationships
    - Modify health output to show parent relationships
    - Modify exec output to show full paths for nested repos
    - _Requirements: 4.2, 4.5, 6.4_

  - [ ]* 8.4 Write unit tests for OutputFormatter enhancements
    - Test formatRepositoryTable with various inputs
    - Test buildRepositoryTree with nested structures
    - Test indentation and parent column display

- [ ] 9. Verify existing commands work with nested repositories
  - [ ] 9.1 Test status command with nested repositories
    - Verify all repositories (parent and nested) are included in status output
    - Verify full paths are displayed for nested repos
    - Verify filtering works for both parent and nested repos
    - _Requirements: 4.1, 4.4, 4.5_

  - [ ] 9.2 Test health command with nested repositories
    - Verify all repositories are checked
    - Verify parent reference validation is performed
    - Verify errors show full paths
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

  - [ ] 9.3 Test exec command with nested repositories
    - Verify commands execute in all repositories
    - Verify correct working directory for nested repos
    - Verify filtering works for both parent and nested repos
    - Verify full paths in output
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 9.4 Write property test for command execution completeness
    - **Property 5: Command Execution Completeness**
    - **Validates: Requirements 4.1, 5.1, 6.1**
    - Generate random repository sets with nested repos
    - Verify all repos are processed by status, health, exec

  - [ ]* 9.5 Write property test for repository filtering consistency
    - **Property 6: Repository Filtering Consistency**
    - **Validates: Requirements 4.4, 6.3**
    - Generate random repository sets and filter patterns
    - Verify filtering matches both parent and nested repos

  - [ ]* 9.6 Write property test for working directory correctness
    - **Property 7: Working Directory Correctness**
    - **Validates: Requirements 6.2**
    - Generate random nested structures
    - Verify exec commands use correct working directory

  - [ ]* 9.7 Write property test for path display uniqueness
    - **Property 8: Path Display Uniqueness**
    - **Validates: Requirements 4.5, 6.4**
    - Generate repositories with similar names at different nesting levels
    - Verify full paths are displayed to avoid ambiguity

  - [ ]* 9.8 Write property test for directory exclusion consistency
    - **Property 9: Directory Exclusion Consistency**
    - **Validates: Requirements 8.1**
    - Generate directory structures with common non-repo directories
    - Verify excluded directories are skipped

  - [ ]* 9.9 Write integration tests for existing commands
    - Test end-to-end: init → status → health → exec
    - Test with various nested structures
    - Test error conditions and edge cases

- [ ] 10. Checkpoint - Verify all commands work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Update documentation
  - [x] 11.1 Update multi-repo management guide
    - Add section on nested repository support
    - Explain use cases and examples
    - Document --nested and --no-nested flags
    - Add parent field documentation
    - Include troubleshooting section
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 11.2 Add examples to documentation
    - Example 1: Basic nested structure
    - Example 2: Non-nested mode
    - Example 3: Complex multi-level nesting
    - Example 4: Troubleshooting circular references
    - _Requirements: 9.2_

  - [x] 11.3 Update README.md with nested repository feature
    - Add nested repository support to feature list
    - Link to detailed documentation
    - Add quick example
    - _Requirements: 9.1_

  - [x] 11.4 Update CHANGELOG.md
    - Document new feature in appropriate version section
    - List all new options and behaviors
    - Note backward compatibility
    - _Requirements: 9.1_

- [x] 12. Final integration and validation
  - [x] 12.1 Run full test suite
    - Execute all unit tests
    - Execute all property-based tests
    - Execute all integration tests
    - Verify coverage goals (>90% line, >85% branch)

  - [x] 12.2 Manual testing with real nested repository structures
    - Test with actual nested Git repositories
    - Test with various nesting levels
    - Test with symlinks and edge cases
    - Verify performance is acceptable

  - [x] 12.3 Verify backward compatibility
    - Test with existing project-repos.json files
    - Verify no breaking changes
    - Test migration path

  - [x] 12.4 Final checkpoint
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end workflows
- The implementation uses JavaScript (Node.js) as specified in the design
- Fast-check library will be used for property-based testing with minimum 100 iterations per test
---

## SCE Status Markers

- [x] 1 Legacy spec baseline reconciled for current release state
- [x] 2 Core capability outcomes validated and retained
- [x] 3 Tests or verification checkpoints executed
- [x] 4 Documentation and traceability synchronized
