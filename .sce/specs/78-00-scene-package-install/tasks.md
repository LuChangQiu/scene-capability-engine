# Implementation Plan: Scene Package Install

## Overview

Implement `sce scene install` command following the normalize → validate → run → print pattern. All code in `lib/commands/scene.js`, all tests in `tests/unit/commands/scene.test.js`. Reuses existing registry infrastructure from Spec 77 (`loadRegistryIndex`, `buildRegistryTarballPath`, `resolveLatestVersion`, `extractTarBuffer`). No new dependencies.

## Tasks

- [x] 1. Implement normalizeSceneInstallOptions and validateSceneInstallOptions
  - [x] 1.1 Add `normalizeSceneInstallOptions(options)` function
    - Normalize: name (trim), version (trim, default undefined), out (trim), registry (default '.sce/registry'), force (boolean), dryRun (boolean), json (boolean)
    - Place after `normalizeSceneUnpublishOptions` in scene.js
    - _Requirements: 8.1_
  - [x] 1.2 Add `validateSceneInstallOptions(options)` function
    - Validate: --name required, --version if provided and not 'latest' must be valid semver
    - Return error string or null
    - _Requirements: 8.2_
  - [ ]* 1.3 Write unit tests for normalizeSceneInstallOptions
    - Test default values, trimming whitespace, boolean coercion
    - _Requirements: 8.1_
  - [ ]* 1.4 Write unit tests for validateSceneInstallOptions
    - Test missing name, invalid semver, valid 'latest', valid exact version, omitted version
    - _Requirements: 8.2_

- [x] 2. Implement buildInstallManifest helper and printSceneInstallSummary
  - [x] 2.1 Add `buildInstallManifest(packageName, version, registryDir, integrity, files)` helper function
    - Returns object with: packageName, version, installedAt (new Date().toISOString()), registryDir, integrity, files
    - _Requirements: 4.1, 4.2_
  - [x] 2.2 Add `printSceneInstallSummary(options, payload, projectRoot)` function
    - JSON mode: JSON.stringify(payload, null, 2)
    - Human mode: Package coordinate, target dir, file count, integrity, overwritten flag, dry-run label
    - _Requirements: 6.4, 6.5, 8.4_
  - [ ]* 2.3 Write property test for install manifest completeness (Property 2)
    - **Property 2: Install manifest completeness**
    - Generate random packageName, version, registryDir, integrity, files arrays
    - Verify all six required fields present and installedAt is valid ISO 8601
    - **Validates: Requirements 4.1, 4.2**
  - [ ]* 2.4 Write property test for install manifest JSON round-trip (Property 3)
    - **Property 3: Install manifest JSON round-trip**
    - Generate random manifest objects, JSON.stringify then JSON.parse, verify deep equality
    - **Validates: Requirements 4.4**

- [x] 3. Implement runSceneInstallCommand
  - [x] 3.1 Add `runSceneInstallCommand(rawOptions, dependencies)` function
    - Full pipeline: normalize → validate → resolve registry → load index → resolve package/version → read tarball → verify integrity → resolve target dir → check conflicts → extract → write files → write manifest → build payload → print
    - Dependency injection: fileSystem, projectRoot
    - Dry-run mode: resolve + verify + build payload without writing files
    - Force mode: overwrite existing target directory
    - Error handling: console.error + process.exitCode = 1 + return null
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.6, 7.1, 7.2, 7.3, 7.4_
  - [ ]* 3.2 Write unit tests for runSceneInstallCommand happy path
    - Mock file system with published package in registry
    - Verify payload fields, extracted files, install manifest written
    - _Requirements: 6.1, 3.1, 4.1_
  - [ ]* 3.3 Write unit tests for runSceneInstallCommand error cases
    - Package not found, version not found, integrity mismatch, target dir exists without force
    - _Requirements: 1.3, 1.4, 2.4, 3.3_
  - [ ]* 3.4 Write unit tests for runSceneInstallCommand dry-run mode
    - Verify payload has dry_run: true, installed: false, no files written
    - _Requirements: 7.1, 7.2, 7.3_
  - [ ]* 3.5 Write unit tests for runSceneInstallCommand --force mode
    - Verify overwrite of existing target directory, payload has overwritten: true
    - _Requirements: 3.4, 6.3_
  - [ ]* 3.6 Write unit tests for runSceneInstallCommand latest version resolution
    - Verify omitted --version resolves to latest, --version latest resolves to latest
    - _Requirements: 1.2_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Register CLI command and wire exports
  - [x] 5.1 Add `scene install` subcommand to `registerSceneCommands`
    - Options: --name (required), --version, --out, --registry (default .sce/registry), --force, --dry-run, --json
    - Place after the `unpublish` command registration
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1_
  - [x] 5.2 Add new functions to module.exports
    - Export: normalizeSceneInstallOptions, validateSceneInstallOptions, buildInstallManifest, printSceneInstallSummary, runSceneInstallCommand
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 6. Property-based tests
  - [ ]* 6.1 Write property test for missing package/version error (Property 4)
    - **Property 4: Missing package or version produces error**
    - Generate registry indexes, pick names/versions not in them, verify command returns null with exitCode 1
    - **Validates: Requirements 1.3, 1.4**
  - [ ]* 6.2 Write property test for integrity mismatch error (Property 5)
    - **Property 5: Integrity mismatch produces error**
    - Generate valid tarballs, store with wrong hash in mock index, verify command returns null with exitCode 1
    - **Validates: Requirements 2.4**
  - [ ]* 6.3 Write property test for existing target dir requires --force (Property 6)
    - **Property 6: Existing target directory requires --force**
    - Generate mock file systems with pre-existing target dirs, verify without force → error, with force → success
    - **Validates: Requirements 3.3, 3.4, 6.3**
  - [ ]* 6.4 Write property test for default target directory (Property 7)
    - **Property 7: Default target directory is projectRoot/packageName**
    - Generate random package names and project roots, verify resolved target dir
    - **Validates: Requirements 5.2, 5.3**
  - [ ]* 6.5 Write property test for dry-run writes no files (Property 8)
    - **Property 8: Dry-run writes no files but returns file list**
    - Generate valid install scenarios with dryRun: true, verify no writes, payload has files
    - **Validates: Requirements 7.1, 7.2, 7.3**
  - [ ]* 6.6 Write property test for JSON output (Property 9)
    - **Property 9: JSON output mode produces valid parseable JSON**
    - Generate random payloads, call printSceneInstallSummary with json: true, verify stdout is parseable JSON
    - **Validates: Requirements 6.4**

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (fast-check, min 100 iterations)
- Unit tests validate specific examples and edge cases
- All existing registry functions (loadRegistryIndex, extractTarBuffer, etc.) are reused — not reimplemented
