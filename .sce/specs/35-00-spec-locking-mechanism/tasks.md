# Implementation Plan: Spec Locking Mechanism

## Overview

This implementation plan breaks down the Spec locking mechanism into discrete coding tasks. The implementation uses JavaScript (Node.js) following the existing project patterns. Tasks are ordered to build incrementally, with core components first, then CLI integration, and finally testing.

## Tasks

- [x] 1. Implement MachineIdentifier component
  - [x] 1.1 Create `lib/lock/machine-identifier.js` with MachineIdentifier class
    - Implement `getMachineId()` to read/generate machine ID
    - Implement `generateMachineId()` using hostname + UUID
    - Implement `getMachineInfo()` for human-readable info
    - Persist machine ID to `.sce/config/machine-id.json`
    - _Requirements: 7.1, 7.2, 7.5_
  
  - [x]* 1.2 Write property test for Machine ID persistence
    - **Property 10: Machine ID Persistence**
    - **Validates: Requirements 7.1**
  
  - [x]* 1.3 Write property test for Machine ID format
    - **Property 11: Machine ID Format**
    - **Validates: Requirements 7.2**

- [x] 2. Implement LockFile component
  - [x] 2.1 Create `lib/lock/lock-file.js` with LockFile class
    - Implement `read(specName)` to read lock metadata from `.lock` file
    - Implement `write(specName, metadata)` with JSON validation
    - Implement `delete(specName)` to remove lock file
    - Implement `exists(specName)` to check lock existence
    - Implement `listLockedSpecs()` to find all locked specs
    - Handle corrupted JSON files gracefully
    - _Requirements: 5.1, 5.2, 5.3, 8.1, 8.2, 8.4, 8.5_
  
  - [x]* 2.2 Write property test for Lock Metadata Round-Trip
    - **Property 12: Lock Metadata Round-Trip**
    - **Validates: Requirements 8.1, 8.2, 8.3**
  
  - [x]* 2.3 Write property test for corrupted lock file handling
    - **Property 13: Corrupted Lock File Handling**
    - **Validates: Requirements 8.4**

- [x] 3. Checkpoint - Core components complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement LockManager component
  - [x] 4.1 Create `lib/lock/lock-manager.js` with LockManager class
    - Implement `acquireLock(specName, options)` with contention handling
    - Implement `releaseLock(specName, options)` with ownership validation
    - Implement `getLockStatus(specName)` for single/all specs
    - Implement `cleanupStaleLocks()` for stale lock removal
    - Implement `isLocked(specName)` and `isLockedByMe(specName)`
    - Add stale detection based on configurable timeout
    - _Requirements: 1.1-1.5, 2.1-2.5, 3.1-3.5, 4.1-4.5, 6.4, 9.1-9.5, 10.1_
  
  - [x]* 4.2 Write property test for Lock Contention Rejection
    - **Property 2: Lock Contention Rejection**
    - **Validates: Requirements 1.3**
  
  - [x]* 4.3 Write property test for Stale Lock Detection
    - **Property 7: Stale Lock Detection**
    - **Validates: Requirements 3.4, 4.1, 4.4**
  
  - [x]* 4.4 Write property test for Own Lock Identification
    - **Property 9: Own Lock Identification**
    - **Validates: Requirements 6.4**

- [x] 5. Implement CLI commands
  - [x] 5.1 Create `lib/commands/lock-commands.js` with lock command handlers
    - Implement `lock <spec-name>` command with `--reason` and `--timeout` options
    - Implement `unlock <spec-name>` command with `--force` option
    - Implement `lock status [spec-name]` command
    - Implement `lock cleanup` command
    - Implement `lock whoami` command
    - Add colored output and status indicators
    - _Requirements: 1.1, 1.4, 1.5, 2.1, 2.3, 2.4, 2.5, 3.1-3.5, 4.2, 4.3, 7.4_
  
  - [x] 5.2 Register lock commands in `bin/scene-capability-engine.js`
    - Add `lock` command group with subcommands
    - Add `unlock` as alias for `lock release`
    - _Requirements: 8 (CLI Commands)_

- [x] 6. Checkpoint - CLI commands complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Integrate with existing Spec commands
  - [x] 7.1 Update `lib/commands/spec-commands.js` to show lock status
    - Add lock indicator to `sce spec list` output
    - Add lock warning to `sce spec edit` when spec is locked
    - Support `--ignore-lock` flag for read-only operations
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

- [x] 8. Add .gitignore configuration
  - [x] 8.1 Update `.gitignore` template to exclude `.lock` files
    - Add `.sce/specs/**/.lock` pattern
    - _Requirements: 5.5_

- [x] 9. Create index file and exports
  - [x] 9.1 Create `lib/lock/index.js` to export lock components
    - Export LockManager, MachineIdentifier, LockFile classes
    - _Requirements: N/A (code organization)_

- [x] 10. Write unit tests
  - [x]* 10.1 Create `tests/unit/lock/machine-identifier.test.js`
    - Test ID generation, persistence, format validation
    - Test fallback when hostname unavailable
    - _Requirements: 7.1, 7.2, 7.5_
  
  - [x]* 10.2 Create `tests/unit/lock/lock-file.test.js`
    - Test read/write operations
    - Test corrupted file handling
    - Test missing file handling
    - _Requirements: 5.1-5.4, 8.1-8.5_
  
  - [x]* 10.3 Create `tests/unit/lock/lock-manager.test.js`
    - Test lock acquisition and release
    - Test ownership validation
    - Test stale detection and cleanup
    - _Requirements: 1.1-1.5, 2.1-2.5, 3.1-3.5, 4.1-4.5_

- [x] 11. Write integration tests
  - [x]* 11.1 Create `tests/integration/lock-commands.test.js`
    - Test CLI commands end-to-end
    - Test lock workflow scenarios
    - _Requirements: All CLI requirements_

- [x] 12. Final checkpoint - All tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Update documentation
  - [x] 13.1 Update `README.md` with lock feature overview
    - Add lock commands to feature list
    - _Requirements: 10.4_
  
  - [x] 13.2 Create `docs/spec-locking-guide.md` with detailed usage guide
    - Document all lock commands with examples
    - Document configuration options
    - Document multi-user workflow best practices
    - _Requirements: 10.4_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Implementation uses JavaScript following existing project patterns
