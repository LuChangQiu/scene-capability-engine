# Implementation Plan: Steering Directory Compliance Check

## Overview

This implementation plan breaks down the steering directory compliance check feature into discrete, testable steps. The approach follows a bottom-up strategy: build core components first, add testing, then integrate into the CLI.

## Tasks

- [x] 1. Set up project structure and testing framework
  - Create directory structure for new components
  - Set up fast-check for property-based testing
  - Create test fixtures and helpers
  - _Requirements: 1.1, 7.1_

- [x] 2. Implement SteeringComplianceChecker core logic
  - [x] 2.1 Create SteeringComplianceChecker class with allowlist validation
    - Implement `getAllowedFiles()` method returning the four allowed files
    - Implement `check(steeringPath)` method with file validation logic
    - Handle non-existent directory as compliant case
    - _Requirements: 1.5, 2.1, 2.2_
  
  - [ ]* 2.2 Write property test for allowlist validation
    - **Property 1: Compliant Directories Allow Execution**
    - **Validates: Requirements 1.2, 2.1**
  
  - [ ]* 2.3 Write property test for disallowed file detection
    - **Property 3: Disallowed File Detection**
    - **Validates: Requirements 2.2**
  
  - [x] 2.4 Add subdirectory detection logic
    - Detect subdirectories in steering directory
    - Collect all subdirectory names for reporting
    - _Requirements: 3.1, 3.2_
  
  - [ ]* 2.5 Write property test for subdirectory detection
    - **Property 4: Subdirectory Detection and Complete Reporting**
    - **Validates: Requirements 3.1, 3.2**
  
  - [ ]* 2.6 Write property test for multiple violation types
    - **Property 5: Multiple Violation Types Reported Together**
    - **Validates: Requirements 3.4**
  
  - [ ]* 2.7 Write unit tests for edge cases
    - Test non-existent directory (compliant)
    - Test empty directory (compliant)
    - Test case sensitivity (core_principles.md is non-compliant)
    - Test hidden files (.gitkeep is non-compliant)

- [x] 3. Implement ComplianceCache for version-based caching
  - [x] 3.1 Create ComplianceCache class with file operations
    - Implement `isValid(currentVersion)` method
    - Implement `update(version)` method
    - Implement `clear()` method
    - Handle cache file creation and directory creation
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 8.1, 8.2_
  
  - [ ]* 3.2 Write property test for cache creation
    - **Property 6: Cache Creation on Success**
    - **Validates: Requirements 4.1**
  
  - [ ]* 3.3 Write property test for cache hit behavior
    - **Property 7: Cache Hit Skips Check**
    - **Validates: Requirements 4.2**
  
  - [ ]* 3.4 Write property test for cache invalidation
    - **Property 8: Cache Invalidation on Version Change**
    - **Validates: Requirements 4.3**
  
  - [ ]* 3.5 Write property test for cache content validation
    - **Property 12: Cache Content Validation**
    - **Validates: Requirements 8.4**
  
  - [ ]* 3.6 Write unit tests for cache edge cases
    - Test corrupted cache file (invalid JSON)
    - Test missing cache directory
    - Test cache write failure (read-only filesystem)

- [x] 4. Checkpoint - Ensure core components work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement ComplianceErrorReporter for user-friendly messages
  - [x] 5.1 Create ComplianceErrorReporter class
    - Implement `formatError(violations)` method
    - Implement `reportAndExit(violations)` method
    - Format error messages with clear sections and bullet points
    - Include fix suggestions in error messages
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [ ]* 5.2 Write property test for complete violation reporting
    - **Property 9: Complete Violation Reporting**
    - **Validates: Requirements 5.1, 5.2**
  
  - [ ]* 5.3 Write unit tests for error message formatting
    - Test message with only disallowed files
    - Test message with only subdirectories
    - Test message with both violation types
    - Verify fix suggestions are present

- [x] 6. Implement error handling and retry logic
  - [x] 6.1 Add robust error handling to all components
    - Wrap file system operations in try-catch blocks
    - Log warnings for non-critical errors
    - Implement retry logic for "not in expected state" error
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [ ]* 6.2 Write property test for error resilience
    - **Property 14: Error Handling Resilience**
    - **Validates: Requirements 9.2, 9.4, 9.5**
  
  - [ ]* 6.3 Write unit tests for specific error scenarios
    - Test permission denied error (EACCES)
    - Test disk full error (ENOSPC)
    - Test "not in expected state" error with retry
    - Test cache recovery from corruption

- [x] 7. Integrate compliance check into CLI entry point
  - [x] 7.1 Add compliance check to main CLI entry point
    - Hook check before command routing
    - Parse bypass flags (--skip-steering-check, --force-steering-check)
    - Check environment variable (SCE_SKIP_STEERING_CHECK)
    - Exit with non-zero code on compliance failure
    - _Requirements: 1.1, 1.2, 1.3, 6.1, 6.2, 6.3, 7.2, 7.3_
  
  - [ ]* 7.2 Write property test for bypass behavior
    - **Property 10: Bypass Preserves Cache**
    - **Validates: Requirements 6.5**
  
  - [ ]* 7.3 Write property test for silent operation
    - **Property 11: Silent Operation When Compliant**
    - **Validates: Requirements 7.5**
  
  - [ ]* 7.4 Write integration tests for CLI integration
    - Test check runs before command execution
    - Test bypass flags work end-to-end
    - Test non-compliant directory blocks command
    - Test compliant directory allows command
    - Test cache persists across invocations

- [x] 8. Add performance monitoring and optimization
  - [x] 8.1 Add performance measurement to compliance check
    - Measure check duration
    - Log warning if check exceeds 50ms
    - Use synchronous file operations for speed
    - _Requirements: 1.4_
  
  - [ ]* 8.2 Write performance benchmark tests
    - Test check completes in <50ms for typical directories
    - Test check completes in <50ms with cache hit

- [x] 9. Update documentation and help text
  - [x] 9.1 Add bypass options to CLI help text
    - Document --skip-steering-check flag
    - Document --force-steering-check flag
    - Document SCE_SKIP_STEERING_CHECK environment variable
    - _Requirements: 6.4_
  
  - [x] 9.2 Create user-facing documentation
    - Add section to README about steering directory compliance
    - Document allowed files and rationale
    - Provide troubleshooting guide for common violations
  
  - [x] 9.3 Update CHANGELOG.md
    - Document new feature
    - Note breaking change (commands may now fail if steering non-compliant)

- [x] 10. Final checkpoint - Comprehensive testing
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties (100+ iterations each)
- Unit tests validate specific examples and edge cases
- Integration tests verify end-to-end CLI behavior
- Performance target: <50ms for compliance check
---

## SCE Status Markers

- [x] 1 Legacy spec baseline reconciled for current release state
- [x] 2 Core capability outcomes validated and retained
- [x] 3 Tests or verification checkpoints executed
- [x] 4 Documentation and traceability synchronized
