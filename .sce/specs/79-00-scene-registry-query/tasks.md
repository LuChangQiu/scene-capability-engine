# Implementation Plan: Scene Registry Query

## Overview

Implement `sce scene list` and `sce scene search` commands following the normalize → validate → run → print pattern. All code in `lib/commands/scene.js`, tests in `tests/unit/commands/scene.test.js`. No new dependencies.

## Tasks

- [x] 1. Implement shared helpers and scene list command
  - [x] 1.1 Add `buildRegistryPackageList` and `filterRegistryPackages` helper functions
    - `buildRegistryPackageList(registryPackages)` converts packages object to sorted array of display records
    - `filterRegistryPackages(packageList, query)` filters by case-insensitive substring on name, description, group
    - _Requirements: 1.2, 2.2, 2.3, 2.4, 2.6_
  - [x] 1.2 Add `normalizeSceneListOptions`, `validateSceneListOptions`, `runSceneListCommand`, `printSceneListSummary`
    - Follow existing pattern from `runSceneInstallCommand`
    - Handle empty registry, JSON output, error from `loadRegistryIndex`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.3, 3.4_
  - [x] 1.3 Register `scene list` subcommand in `registerSceneCommands`
    - Options: `--registry <path>`, `--json`
    - _Requirements: 1.4, 1.5_
  - [x] 1.4 Export new functions in `module.exports`
    - Export: `buildRegistryPackageList`, `filterRegistryPackages`, `normalizeSceneListOptions`, `validateSceneListOptions`, `runSceneListCommand`, `printSceneListSummary`
    - _Requirements: 3.1_
  - [x] 1.5 Write unit tests for `buildRegistryPackageList` and `filterRegistryPackages`
    - Test empty input, sorting, field mapping, case-insensitive matching, no matches
    - _Requirements: 1.2, 1.3, 2.2, 2.3, 2.4, 2.5_
  - [x] 1.6 Write property tests for helpers
    - **Property 1: Package list preserves all entries**
    - **Validates: Requirements 1.2**
    - **Property 2: Search filter completeness**
    - **Validates: Requirements 2.2, 2.3, 2.4**
    - **Property 3: Empty query returns all packages**
    - **Validates: Requirements 2.6**

- [x] 2. Implement scene search command
  - [x] 2.1 Add `normalizeSceneSearchOptions`, `validateSceneSearchOptions`, `runSceneSearchCommand`, `printSceneSearchSummary`
    - Follow existing pattern, reuse `buildRegistryPackageList` and `filterRegistryPackages`
    - Handle no matches message, empty query, JSON output, error from `loadRegistryIndex`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.2, 3.3, 3.4_
  - [x] 2.2 Register `scene search` subcommand in `registerSceneCommands`
    - Options: `--query <term>` (required), `--registry <path>`, `--json`
    - _Requirements: 2.7, 2.8_
  - [x] 2.3 Export new functions in `module.exports`
    - Export: `normalizeSceneSearchOptions`, `validateSceneSearchOptions`, `runSceneSearchCommand`, `printSceneSearchSummary`
    - _Requirements: 3.2_
  - [x] 2.4 Write unit tests for scene search command
    - Test normalize/validate options, runSceneSearchCommand with mock fileSystem, printSceneSearchSummary output
    - Test no matches message, empty query returns all, JSON output
    - _Requirements: 2.1, 2.5, 2.6, 2.7, 2.8, 3.4_

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Integration tests and list command tests
  - [x] 4.1 Write unit tests for scene list command
    - Test normalize/validate options, runSceneListCommand with mock fileSystem, printSceneListSummary output
    - Test empty registry message, JSON output, error handling
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 3.4_
  - [x] 4.2 Write property test for JSON round-trip
    - **Property 4: JSON output round-trip**
    - **Validates: Requirements 1.4, 2.7**
    - Evidence captured in `custom/query-test-closeout-2026-03-12.md`.

- [x] 5. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All code goes in `lib/commands/scene.js`, tests in `tests/unit/commands/scene.test.js`
- Reuse existing `loadRegistryIndex` — no new file I/O logic needed
- Property tests use `fast-check` with minimum 100 iterations
- No new npm dependencies allowed
