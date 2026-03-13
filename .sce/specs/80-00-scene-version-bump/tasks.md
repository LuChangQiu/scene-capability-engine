# Implementation Plan: Scene Version Bump

## Overview

Implement `sce scene version` command following the normalize → validate → run → print pattern. All code in `lib/commands/scene.js`, tests in `tests/unit/commands/scene.test.js`. Uses existing `semver` dependency, no new dependencies.

## Tasks

- [x] 1. Implement normalize and validate functions
  - [x] 1.1 Add `normalizeSceneVersionOptions` and `validateSceneVersionOptions`
    - `normalizeSceneVersionOptions` defaults `package` to `'.'`, lowercases `bump`, normalizes `dryRun` and `json` booleans
    - `validateSceneVersionOptions` checks `--bump` is required, validates bump is a known type or valid semver
    - _Requirements: 2.4, 2.5, 5.1_
  - [x] 1.2 Add `printSceneVersionSummary`
    - JSON mode: `JSON.stringify(payload, null, 2)`
    - Human mode: show package name, old → new version, directory, dry-run label
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 2. Implement run command and register CLI
  - [x] 2.1 Add `runSceneVersionCommand`
    - Read scene-package.json via injected fileSystem
    - Validate current `metadata.version` is valid semver
    - Compute new version: `semver.inc` for bump types, direct assignment for explicit versions with `semver.gt` check
    - Write updated file unless `--dry-run`
    - Build and return payload, call `printSceneVersionSummary`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 5.2_
  - [x] 2.2 Register `scene version` subcommand in `registerSceneCommands`
    - Options: `--package <dir>`, `--bump <type>` (required), `--json`, `--dry-run`
    - _Requirements: 5.1_
  - [x] 2.3 Export new functions in `module.exports`
    - Export: `normalizeSceneVersionOptions`, `validateSceneVersionOptions`, `runSceneVersionCommand`, `printSceneVersionSummary`
    - _Requirements: 5.1, 5.3_

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x]* 4. Write unit tests
  - [x]* 4.1 Write unit tests for normalize, validate, and print functions
    - Test `normalizeSceneVersionOptions` defaults and overrides
    - Test `validateSceneVersionOptions` missing bump, invalid bump, valid types, valid explicit semver
    - Test `printSceneVersionSummary` human-readable, JSON, dry-run indicator
    - _Requirements: 2.4, 2.5, 4.1, 4.2, 4.3_
  - [x]* 4.2 Write unit tests for `runSceneVersionCommand`
    - Test successful patch/minor/major bump with mock fileSystem
    - Test explicit version bump
    - Test error: file not found, invalid current version, explicit version not greater
    - Test dry-run mode (no write calls)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

- [x]* 5. Write property tests
  - [x]* 5.1 Property test: Semver increment correctness
    - **Property 1: Semver increment correctness**
    - **Validates: Requirements 2.1**
  - [x]* 5.2 Property test: Explicit version ordering enforcement
    - **Property 2: Explicit version ordering enforcement**
    - **Validates: Requirements 2.2, 2.3**
  - [x]* 5.3 Property test: Version bump write round-trip
    - **Property 3: Version bump write round-trip**
    - **Validates: Requirements 3.1**
  - [x]* 5.4 Property test: Validation rejects invalid inputs
    - **Property 4: Validation rejects invalid inputs**
    - **Validates: Requirements 1.4, 2.4**
  - [x]* 5.5 Property test: JSON output contains all required fields
    - **Property 5: JSON output contains all required fields**
    - **Validates: Requirements 4.2**

- [x] 6. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All code goes in `lib/commands/scene.js`, tests in `tests/unit/commands/scene.test.js`
- Uses existing `semver` package — no new dependencies
- Property tests use `fast-check` with minimum 100 iterations
- Dependency injection for fileSystem follows `runSceneInstallCommand` pattern
