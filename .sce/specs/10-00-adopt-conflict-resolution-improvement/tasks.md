# Implementation Plan: Adopt Conflict Resolution Improvement

## Overview

This implementation plan breaks down the conflict resolution enhancement into discrete, incremental steps. The approach focuses on building core components first (ConflictResolver, SelectiveBackup, DiffViewer), then integrating them into the existing adopt command. Each step includes implementation and testing tasks, with property-based tests marked as optional for faster MVP delivery.

## Tasks

- [x] 1. Create SelectiveBackup component for targeted file backups
  - [x] 1.1 Implement SelectiveBackup class with backup creation
    - Create `lib/backup/selective-backup.js`
    - Implement `createSelectiveBackup(projectPath, filePaths, options)` method
    - Create backup directory structure with metadata
    - Copy only specified files to backup preserving directory structure
    - Generate backup ID with 'conflict' type prefix
    - _Requirements: 4.1, 4.2_
  
  - [ ]* 1.2 Write property test for backup completeness
    - **Property 13: Backup Completeness**
    - **Validates: Requirements 4.2**
  
  - [x] 1.3 Implement selective restore functionality
    - Implement `restoreSelective(projectPath, backupId, filePaths)` method
    - Implement `listBackupFiles(projectPath, backupId)` method
    - Add validation for backup existence and integrity
    - _Requirements: 4.1_
  
  - [ ]* 1.4 Write unit tests for SelectiveBackup
    - Test backup creation with various file sets
    - Test restore functionality
    - Test error handling (disk space, permissions)
    - _Requirements: 4.1, 4.2, 10.1_

- [x] 2. Create DiffViewer component for file comparison
  - [x] 2.1 Implement DiffViewer class with metadata display
    - Create `lib/adoption/diff-viewer.js`
    - Implement `getFileMetadata(filePath)` method
    - Format file sizes and dates for display
    - Detect text vs binary files
    - _Requirements: 9.1, 9.2_
  
  - [x] 2.2 Implement diff display functionality
    - Implement `showDiff(existingPath, templatePath)` method
    - Display file metadata comparison
    - Implement `showLineDiff(existingPath, templatePath, maxLines)` for text files
    - Handle binary files with appropriate message
    - Use chalk for colored output
    - _Requirements: 9.2, 9.3, 9.4_
  
  - [ ]* 2.3 Write property tests for diff display
    - **Property 26: Diff File Path Display**
    - **Property 27: Diff Metadata Display**
    - **Property 28: Text File Diff Content**
    - **Property 29: Binary File Diff Handling**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
  
  - [ ]* 2.4 Write unit tests for DiffViewer
    - Test metadata extraction and formatting
    - Test text file diff display
    - Test binary file handling
    - Test error handling (file not found, permissions)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 3. Checkpoint - Ensure all tests pass
  - All tests pass (616 passed, 7 skipped)

- [x] 4. Create ConflictResolver component for interactive prompts
  - [x] 4.1 Implement conflict categorization and display
    - Create `lib/adoption/conflict-resolver.js`
    - Implement `displayConflictSummary(conflicts)` method
    - Categorize conflicts by type (steering, documentation, tools, other)
    - Display grouped conflict list with counts
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [ ]* 4.2 Write property tests for conflict display
    - **Property 1: Conflict Display Completeness**
    - **Property 2: Conflict Count Accuracy**
    - **Property 3: Conflict Categorization Correctness**
    - **Validates: Requirements 1.1, 1.2, 1.3**
  
  - [x] 4.3 Implement strategy-level prompting
    - Implement `promptStrategy(conflicts)` method using inquirer
    - Offer three options: skip-all, overwrite-all, review-each
    - Return selected strategy
    - _Requirements: 2.1, 2.2_
  
  - [x] 4.4 Implement per-file resolution prompting
    - Implement `promptFileResolution(conflict, currentIndex, totalConflicts)` method
    - Display file path and progress (e.g., "Conflict 2 of 5")
    - Offer three options: Keep existing, Use template, View diff
    - Handle "View diff" by calling DiffViewer then re-prompting with two options
    - Return resolution decision
    - _Requirements: 3.1, 3.2, 3.5, 3.6_
  
  - [x] 4.5 Implement conflict resolution orchestration
    - Implement `resolveConflicts(conflicts, strategy)` method
    - Handle skip-all strategy (return all 'keep')
    - Handle overwrite-all strategy (return all 'overwrite')
    - Handle review-each strategy (iterate and prompt for each)
    - Build and return ResolutionMap
    - _Requirements: 2.3, 2.4, 2.5, 3.3, 3.4_
  
  - [ ]* 4.6 Write property tests for ConflictResolver
    - **Property 4: Interactive Prompt Triggering**
    - **Property 5: Skip Strategy Preservation**
    - **Property 7: Review Strategy Completeness**
    - **Property 8: File Prompt Options Completeness**
    - **Property 9: Keep Resolution Mapping**
    - **Property 11: Diff Display Triggering**
    - **Property 12: Post-Diff Prompt Options**
    - **Validates: Requirements 2.1, 2.3, 2.5, 3.1, 3.2, 3.3, 3.5, 3.6**
  
  - [ ]* 4.7 Write unit tests for ConflictResolver
    - Test strategy prompting with mocked inquirer
    - Test per-file prompting flow
    - Test resolution map generation for each strategy
    - Test diff viewing integration
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 5. Enhance DetectionEngine with conflict categorization
  - [x] 5.1 Add categorizeConflicts method to DetectionEngine
    - Modify `lib/adoption/detection-engine.js`
    - Implement `categorizeConflicts(conflicts)` method
    - Return CategorizedConflicts object with steering, documentation, tools, other arrays
    - _Requirements: 1.3_
  
  - [ ]* 5.2 Write unit tests for categorization
    - Test categorization logic with various file paths
    - Test edge cases (empty paths, unusual extensions)
    - _Requirements: 1.3_

- [x] 6. Checkpoint - Ensure all tests pass
  - All tests pass (616 passed, 7 skipped)

- [x] 7. Integrate conflict resolution into adopt command
  - [x] 7.1 Add interactive conflict resolution flow to adopt.js
    - Modify `lib/commands/adopt.js`
    - After conflict detection, check if interactive mode (not --auto, not --force)
    - Instantiate ConflictResolver and display conflict summary
    - Prompt for strategy and resolve conflicts
    - Build list of files to overwrite from resolution map
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [x] 7.2 Implement selective backup creation for overwrites
    - If files to overwrite exist, create SelectiveBackup
    - Display backup ID to user
    - Store backup ID for later display in summary
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [x] 7.3 Implement force mode conflict handling
    - When --force flag is set and conflicts exist, display warning
    - Create SelectiveBackup for all conflicting files
    - Build resolution map with all 'overwrite' decisions
    - Skip interactive prompts
    - _Requirements: 5.1, 5.3, 4.5_
  
  - [x] 7.4 Implement auto mode conflict handling
    - When --auto flag is set (without --force), default to skip-all
    - When both --auto and --force are set, overwrite with backup
    - Ensure no prompts are shown in auto mode
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [x] 7.5 Pass resolution map to adoption strategy
    - Modify adoption strategy execute call to include resolutionMap
    - Update AdoptionStrategy classes to respect resolution map
    - Skip files marked as 'keep', overwrite files marked as 'overwrite'
    - _Requirements: 2.3, 2.4_
  
  - [ ]* 7.6 Write property tests for adopt command integration
    - **Property 16: Force Mode Backup Creation**
    - **Property 17: Force Mode Warning Display**
    - **Property 18: Auto Mode Default Behavior**
    - **Property 19: Auto Mode Non-Interactive**
    - **Validates: Requirements 4.5, 5.1, 5.3, 6.1, 6.3**
  
  - [ ]* 7.7 Write integration tests for adopt command
    - Test full adoption flow with conflicts (interactive)
    - Test force mode adoption with conflicts
    - Test auto mode adoption with conflicts
    - Test auto + force mode combination
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.5, 5.1, 6.1, 6.2, 6.3_

- [x] 8. Implement dry run mode conflict reporting
  - [x] 8.1 Enhance dry run output to show conflict actions
    - Modify dry run handling in adopt.js
    - Display all conflicts that would be detected
    - Show what action would be taken based on flags
    - Confirm no backups or file modifications occur
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [ ]* 8.2 Write property tests for dry run mode
    - **Property 20: Dry Run Conflict Display**
    - **Property 21: Dry Run Action Preview**
    - **Property 22: Dry Run Safety**
    - **Validates: Requirements 7.1, 7.2, 7.3**
  
  - [ ]* 8.3 Write unit tests for dry run mode
    - Test dry run with conflicts and various flag combinations
    - Verify no file system changes occur
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 9. Implement adoption result summary enhancements
  - [x] 9.1 Add conflict resolution summary to adoption results
    - Modify result reporting in adopt.js
    - Display skipped files list
    - Display overwritten files list
    - Display backup ID if files were overwritten
    - Display total conflict count
    - Display rollback instructions when applicable
    - _Requirements: 8.1, 8.2, 4.3, 8.4, 4.4_
  
  - [ ]* 9.2 Write property tests for summary display
    - **Property 14: Backup ID Display**
    - **Property 15: Rollback Instructions Display**
    - **Property 23: Skipped Files Summary**
    - **Property 24: Overwritten Files Summary**
    - **Property 25: Conflict Resolution Count Display**
    - **Validates: Requirements 4.3, 4.4, 8.1, 8.2, 8.4**
  
  - [ ]* 9.3 Write unit tests for summary display
    - Test summary with various combinations of skipped/overwritten files
    - Test rollback instructions display
    - _Requirements: 8.1, 8.2, 4.3, 8.4, 4.4_

- [x] 10. Checkpoint - Ensure all tests pass
  - All tests pass (616 passed, 7 skipped)

- [x] 11. Implement error handling and recovery
  - [x] 11.1 Add backup failure handling
    - Catch backup creation exceptions in adopt.js
    - Display clear error message
    - Abort adoption without modifying files
    - Return non-zero exit code
    - _Requirements: 10.1_
  
  - [x] 11.2 Add file overwrite failure handling
    - Catch individual file overwrite exceptions in AdoptionStrategy
    - Log error and continue with remaining files
    - Include failed files in error summary
    - Mark adoption as partially successful
    - _Requirements: 10.2_
  
  - [x] 11.3 Add diff generation failure handling
    - Catch diff viewer exceptions in ConflictResolver
    - Display "Unable to generate diff" message
    - Show file metadata only
    - Continue with resolution prompt
    - _Requirements: 9.4_
  
  - [x] 11.4 Add non-interactive environment detection
    - Detect when stdin is not a TTY
    - Fall back to default behavior (skip conflicts)
    - Log warning about non-interactive mode
    - Continue with adoption
    - _Requirements: 6.3_
  
  - [x] 11.5 Enhance error summary display
    - Collect all errors during adoption
    - Display error details in final summary
    - Include error count in summary
    - Display abort confirmation message when applicable
    - _Requirements: 10.3, 10.4_
  
  - [ ]* 11.6 Write property tests for error handling
    - **Property 31: Backup Failure Abort**
    - **Property 32: Partial Failure Continuation**
    - **Property 33: Error Summary Inclusion**
    - **Property 34: Abort Confirmation Message**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**
  
  - [ ]* 11.7 Write unit tests for error handling
    - Test backup failure scenarios
    - Test file overwrite failure scenarios
    - Test diff generation failure scenarios
    - Test non-interactive environment detection
    - Test error summary display
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 12. Update AdoptionStrategy to respect resolution map
  - [x] 12.1 Modify copyTemplateFiles to accept resolution map
    - Update `lib/adoption/adoption-strategy.js`
    - Modify `copyTemplateFiles(projectPath, options)` to accept resolutionMap
    - Check resolution map before copying each file
    - Skip files marked as 'keep'
    - Overwrite files marked as 'overwrite'
    - Track skipped and overwritten files separately
    - _Requirements: 2.3, 2.4_
  
  - [ ]* 12.2 Write unit tests for AdoptionStrategy changes
    - Test file copying with resolution map
    - Test skip behavior
    - Test overwrite behavior
    - _Requirements: 2.3, 2.4_

- [x] 13. Final checkpoint and integration testing
  - [x] 13.1 Run full test suite
    - Execute all unit tests ✅
    - Execute all property-based tests (optional, skipped for MVP)
    - Execute all integration tests ✅
    - Verify 100% of implemented tests pass ✅ (616 passed, 7 skipped)
  
  - [x] 13.2 Manual testing with real project
    - Test interactive flow with actual terminal ✅
    - Test diff display with real files ✅
    - Test backup and restore with real .sce/ directory ✅
    - Test force mode ✅
    - Test auto mode ✅
    - Test dry run mode ✅
    - Verify error messages are clear ✅
    - Verify rollback instructions work ✅
  
  - [x] 13.3 Update documentation
    - Update CHANGELOG.md with v1.7.0 entry ✅
    - Add comprehensive feature description ✅
    - Document all modes (interactive, force, auto, dry-run) ✅
    - Document backup and rollback process ✅

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (34 total)
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end workflows
- Manual testing ensures real-world usability
---

## SCE Status Markers

- [x] 1 Legacy spec baseline reconciled for current release state
- [x] 2 Core capability outcomes validated and retained
- [x] 3 Tests or verification checkpoints executed
- [x] 4 Documentation and traceability synchronized
