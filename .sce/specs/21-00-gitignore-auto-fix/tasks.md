# Implementation Plan: .gitignore Auto-Fix for Team Collaboration

## Overview

Implement automatic .gitignore detection and fixing during sce adoption and upgrade. The system will detect old blanket `.sce/` exclusion patterns and replace them with a layered strategy that commits Specs while excluding personal state.

**Implementation Language**: JavaScript (Node.js)

**Key Components**:
- GitignoreDetector: Analyze .gitignore status
- GitignoreTransformer: Apply layered strategy
- GitignoreBackup: Create backups before modification
- GitignoreIntegration: Integrate with adopt/upgrade flows

---

## Tasks

- [x] 1. Set up project structure and core interfaces
  - Create `lib/gitignore/` directory
  - Define core interfaces and types (JSDoc)
  - Set up test structure (`tests/unit/gitignore/`, `tests/property/gitignore/`)
  - Install `fast-check` for property-based testing
  - _Requirements: FR-2.1.1, FR-2.2.1, FR-2.4.1_

- [x] 2. Implement GitignoreDetector
  - [x] 2.1 Implement file existence check and content reading
    - Create `lib/gitignore/gitignore-detector.js`
    - Implement `exists(projectPath)` method
    - Implement `readContent(projectPath)` method
    - Handle missing file case
    - _Requirements: FR-2.1.1_
  
  - [ ]* 2.2 Write unit tests for file operations
    - Test missing .gitignore file
    - Test existing .gitignore file
    - Test read-only .gitignore file
    - _Requirements: FR-2.1.1, AC-4.1.4_
  
  - [x] 2.3 Implement .gitignore parser
    - Implement `parseGitignore(content)` method
    - Parse rules, comments, and blank lines
    - Handle different line endings (CRLF/LF)
    - Identify .sce-related rules
    - _Requirements: FR-2.1.2_
  
  - [ ]* 2.4 Write property test for parser
    - **Property 7: Syntax validity**
    - **Validates: Requirements AC-4.2.5**
    - Generate random .gitignore content
    - Verify parser handles all valid syntax
    - _Requirements: AC-4.2.5_
  
  - [x] 2.5 Implement old pattern detection
    - Implement `hasOldPattern(rules)` method
    - Detect blanket `.sce/`, `.sce/*`, `.sce/**` patterns
    - Use regex for pattern matching
    - _Requirements: FR-2.1.3_
  
  - [ ]* 2.6 Write property test for old pattern detection
    - **Property 1: Blanket exclusion detection**
    - **Validates: Requirements AC-4.1.1**
    - Generate .gitignore with various old patterns
    - Verify detection accuracy
    - _Requirements: AC-4.1.1_
  
  - [x] 2.7 Implement layered strategy detection
    - Implement `hasLayeredStrategy(rules)` method
    - Check for all required layered rules
    - Identify missing rules
    - _Requirements: FR-2.1.3_
  
  - [ ]* 2.8 Write property tests for layered strategy detection
    - **Property 2: Missing rules detection**
    - **Property 3: Compliant recognition**
    - **Validates: Requirements AC-4.1.2, AC-4.1.3**
    - Generate .gitignore with various rule combinations
    - Verify detection of missing rules
    - Verify recognition of compliant .gitignore
    - _Requirements: AC-4.1.2, AC-4.1.3_
  
  - [x] 2.9 Implement status analysis
    - Implement `analyzeGitignore(projectPath)` method
    - Determine status: missing, old-pattern, incomplete, compliant
    - Determine strategy: add, update, skip
    - Return GitignoreStatus object
    - _Requirements: FR-2.1.3_
  
  - [ ]* 2.10 Write unit tests for status analysis
    - Test all status types
    - Test all strategy types
    - Test edge cases
    - _Requirements: FR-2.1.3_

- [x] 3. Checkpoint - Ensure detector tests pass
  - Run all GitignoreDetector tests
  - Verify detection accuracy
  - Ask user if questions arise

- [x] 4. Implement GitignoreBackup
  - [x] 4.1 Implement backup creation
    - Create `lib/gitignore/gitignore-backup.js`
    - Implement `createBackup(projectPath)` method
    - Generate timestamped backup ID
    - Store in `.sce/backups/gitignore-{timestamp}`
    - Create metadata file
    - _Requirements: FR-2.2.1, NFR-3.1.1_
  
  - [ ]* 4.2 Write property test for backup creation
    - **Property 8: Backup before modification**
    - **Validates: Requirements AC-4.3.1**
    - Verify backup is created before any modification
    - Verify backup creation succeeds
    - _Requirements: AC-4.3.1_
  
  - [x] 4.3 Implement backup restoration
    - Implement `restore(projectPath, backupId)` method
    - Read backup file
    - Restore to original location
    - Verify restoration success
    - _Requirements: NFR-3.1.1_
  
  - [ ]* 4.4 Write property test for backup restoration
    - **Property 9: Backup restoration round-trip**
    - **Validates: Requirements AC-4.3.2**
    - Create backup, restore, verify content matches
    - Test round-trip property
    - _Requirements: AC-4.3.2_
  
  - [x] 4.5 Implement backup listing and cleanup
    - Implement `listBackups(projectPath)` method
    - Implement auto-cleanup (keep last 10)
    - Sort by timestamp
    - _Requirements: FR-2.2.1_
  
  - [ ]* 4.6 Write unit tests for backup operations
    - Test backup listing
    - Test auto-cleanup
    - Test backup metadata
    - _Requirements: FR-2.2.1_

- [x] 5. Implement GitignoreTransformer
  - [x] 5.1 Create layered rules template
    - Create `lib/gitignore/layered-rules-template.js`
    - Define complete layered rules section
    - Include comments and documentation
    - _Requirements: FR-2.2.2_
  
  - [x] 5.2 Implement old pattern removal
    - Create `lib/gitignore/gitignore-transformer.js`
    - Implement `removeOldPatterns(content)` method
    - Remove blanket `.sce/` exclusion patterns
    - Preserve non-.sce rules
    - _Requirements: FR-2.2.2, FR-2.2.3_
  
  - [ ]* 5.3 Write property test for old pattern removal
    - **Property 4: Blanket exclusion removal**
    - **Validates: Requirements AC-4.2.1**
    - Generate .gitignore with old patterns
    - Verify patterns are removed after transformation
    - _Requirements: AC-4.2.1_
  
  - [x] 5.4 Implement layered rules addition
    - Implement `addLayeredRules(content)` method
    - Add complete layered section
    - Mark as sce-managed section
    - Preserve existing content
    - _Requirements: FR-2.2.2_
  
  - [ ]* 5.5 Write property test for layered rules addition
    - **Property 5: Layered rules completeness**
    - **Validates: Requirements AC-4.2.2**
    - Verify all required rules are added
    - Test across various input content
    - _Requirements: AC-4.2.2_
  
  - [x] 5.6 Implement user rules preservation
    - Ensure non-.sce rules are preserved
    - Maintain rule order where possible
    - Preserve comments and blank lines
    - _Requirements: FR-2.2.3_
  
  - [ ]* 5.7 Write property test for user rules preservation
    - **Property 6: User rules preservation**
    - **Validates: Requirements AC-4.2.3**
    - Generate .gitignore with user rules
    - Verify all user rules are preserved after transformation
    - _Requirements: AC-4.2.3_
  
  - [x] 5.8 Implement main transform method
    - Implement `transform(currentContent, status)` method
    - Coordinate removal and addition
    - Handle add vs update strategies
    - Return TransformResult
    - _Requirements: FR-2.2.2_
  
  - [ ]* 5.9 Write unit tests for transformation
    - Test add strategy (missing .gitignore)
    - Test update strategy (old pattern)
    - Test skip strategy (compliant)
    - Test edge cases (comments, negation rules)
    - _Requirements: FR-2.2.2, FR-2.2.4_

- [x] 6. Checkpoint - Ensure transformer tests pass
  - Run all GitignoreTransformer tests
  - Verify transformation correctness
  - Ask user if questions arise

- [x] 7. Implement GitignoreIntegration
  - [x] 7.1 Implement core check and fix logic
    - Create `lib/gitignore/gitignore-integration.js`
    - Implement `checkAndFix(projectPath, options)` method
    - Coordinate detector → backup → transformer → write
    - Handle errors gracefully
    - _Requirements: FR-2.4.1, FR-2.4.2_
  
  - [x] 7.2 Implement result reporting
    - Generate user-friendly messages
    - Report what changed (added/removed rules)
    - Include backup location
    - Provide rollback instructions
    - _Requirements: FR-2.3.1, FR-2.3.2_
  
  - [ ]* 7.3 Write property test for change reporting
    - **Property 10: Change reporting accuracy**
    - **Validates: Requirements AC-4.4.3**
    - Verify reported changes match actual changes
    - Test across various transformations
    - _Requirements: AC-4.4.3_
  
  - [x] 7.4 Implement adoption flow integration
    - Implement `integrateWithAdopt(projectPath)` method
    - Call from SmartOrchestrator after adoption
    - Include in adoption summary
    - _Requirements: FR-2.4.1_
  
  - [x] 7.5 Implement upgrade flow integration
    - Implement `integrateWithUpgrade(projectPath)` method
    - Call from MigrationEngine after upgrade
    - Include in upgrade summary
    - _Requirements: FR-2.4.2_
  
  - [x] 7.6 Implement standalone doctor command
    - Implement `runDoctor(projectPath)` method
    - Add `sce doctor --fix-gitignore` command
    - Provide detailed output
    - _Requirements: FR-2.4.3_
  
  - [ ]* 7.7 Write integration tests
    - Test adoption flow integration
    - Test upgrade flow integration
    - Test doctor command
    - _Requirements: AC-4.5.1, AC-4.5.2, AC-4.5.3_

- [x] 8. Wire components together
  - [x] 8.1 Update SmartOrchestrator
    - Import GitignoreIntegration
    - Call `integrateWithAdopt()` after adoption completes
    - Include result in adoption summary
    - Handle errors gracefully (don't block adoption)
    - _Requirements: FR-2.4.1_
  
  - [x] 8.2 Update MigrationEngine
    - Import GitignoreIntegration
    - Call `integrateWithUpgrade()` after upgrade completes
    - Include result in upgrade summary
    - Handle errors gracefully (don't block upgrade)
    - _Requirements: FR-2.4.2_
  
  - [x] 8.3 Add doctor command
    - Update CLI command parser
    - Add `--fix-gitignore` flag to doctor command
    - Wire to GitignoreIntegration.runDoctor()
    - _Requirements: FR-2.4.3_
  
  - [x]* 8.4 Write end-to-end tests
    - Test full adopt flow with .gitignore fix
    - Test full upgrade flow with .gitignore fix
    - Test doctor command execution
    - _Requirements: AC-4.5.1, AC-4.5.2, AC-4.5.3_

- [x] 9. Error handling and edge cases
  - [x] 9.1 Implement error handling
    - Handle file system errors (read/write failures)
    - Handle backup creation failures
    - Handle transformation errors
    - Implement graceful degradation
    - _Requirements: NFR-3.1.1, NFR-3.1.2_
  
  - [x] 9.2 Handle platform-specific concerns
    - Handle different line endings (CRLF/LF)
    - Preserve original line ending style
    - Test on Windows, Linux, macOS
    - _Requirements: NFR-3.4.1_
  
  - [ ]* 9.3 Write error handling tests
    - Test read-only .gitignore
    - Test backup directory creation failure
    - Test disk full scenario
    - Test concurrent modification
    - _Requirements: NFR-3.1.1_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Run complete test suite (unit + property tests)
  - Verify all properties pass (100+ iterations each)
  - Verify integration with adopt/upgrade flows
  - Ask user if questions arise

- [x] 11. Documentation and cleanup
  - [x] 11.1 Update documentation
    - Verify team-collaboration-guide.md is accurate
    - Add .gitignore auto-fix section to adoption guide
    - Document rollback procedure
    - _Requirements: FR-2.3.2_
  
  - [x] 11.2 Add inline documentation
    - Add JSDoc comments to all public methods
    - Document parameters and return types
    - Add usage examples
    - _Requirements: NFR-3.3.1_
  
  - [x] 11.3 Clean up temporary files
    - Remove any test artifacts
    - Clean up debug logs
    - Verify no temporary files in project root

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (min 100 iterations)
- Unit tests validate specific examples and edge cases
- Integration tests verify end-to-end flows

---

**Version**: 1.0  
**Created**: 2026-01-30  
**Status**: Draft
---

## SCE Status Markers

- [x] 1 Legacy spec baseline reconciled for current release state
- [x] 2 Core capability outcomes validated and retained
- [x] 3 Tests or verification checkpoints executed
- [x] 4 Documentation and traceability synchronized
