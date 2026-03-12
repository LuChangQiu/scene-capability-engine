# Implementation Plan: Scene Deprecate

## Overview

Add `sce scene deprecate` subcommand to mark/unmark package versions as deprecated in the local registry. Enhance `scene install` and `scene info` to surface deprecation warnings. All code in `lib/commands/scene.js`, following normalize → validate → run → print pattern.

## Tasks

- [x] 1. Implement core deprecate command
  - [x] 1.1 Add `normalizeSceneDeprecateOptions` function
    - Normalize `name`, `version`, `message`, `registry` (default `.sce/registry`), `json`, `undo`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  - [x] 1.2 Add `validateSceneDeprecateOptions` function
    - Require `--name`; require `--message` unless `--undo` is provided
    - _Requirements: 6.1, 6.2, 3.3_
  - [x] 1.3 Add `runSceneDeprecateCommand` function
    - Load registry index, resolve package and version(s)
    - If `--undo`: delete `deprecated` field from targeted version entries
    - Else: set `deprecated = message` on targeted version entries
    - Save registry index, build and return payload
    - Accept `dependencies` parameter for DI (projectRoot, fileSystem)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 3.1, 3.2, 7.2, 7.3_
  - [x] 1.4 Add `printSceneDeprecateSummary` function
    - JSON mode: output payload as JSON
    - Human-readable mode: show package, action, affected versions, message
    - _Requirements: 6.5, 6.7, 6.8_
  - [x] 1.5 Register `scene deprecate` subcommand in `registerSceneCommands`
    - Options: `--name`, `--version`, `--message`, `--registry`, `--json`, `--undo`
    - _Requirements: 7.4_
  - [x] 1.6 Export new functions in `module.exports`
    - _Requirements: 7.1_

- [x] 2. Enhance install and info for deprecation warnings
  - [x] 2.1 Enhance `runSceneInstallCommand` to check for `deprecated` field on resolved version and print warning
    - Warning includes package name, version, and deprecation message
    - Installation proceeds normally
    - _Requirements: 4.1, 4.2_
  - [x] 2.2 Enhance `runSceneInfoCommand` and `printSceneInfoSummary` to include deprecation data
    - Add `deprecated` field to version objects in payload
    - Human-readable: append `[DEPRECATED]` marker with message
    - JSON: include `deprecated` field as-is
    - _Requirements: 5.1, 5.2_

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 4. Write tests
  - [ ]* 4.1 Write unit tests for deprecate command
    - Test deprecate single version, deprecate all, undo single, undo all
    - Test missing package error, missing version error
    - Test --json output, validation errors
    - _Requirements: 1.1, 1.3, 1.4, 2.1, 3.1, 3.2, 3.3, 6.5_
  - [ ]* 4.2 Write unit tests for install/info deprecation warnings
    - Test install prints warning for deprecated version
    - Test info includes deprecated field in payload
    - _Requirements: 4.1, 5.1, 5.2_
  - [ ]* 4.3 Write property test: deprecate sets marker on targeted versions
    - **Property 1: Deprecate sets the marker on targeted versions**
    - **Validates: Requirements 1.1, 2.1**
  - [ ]* 4.4 Write property test: deprecate-then-undo round trip
    - **Property 2: Deprecate-then-undo round trip restores original state**
    - **Validates: Requirements 3.1, 3.2**
  - [ ]* 4.5 Write property test: error on invalid target
    - **Property 3: Error on invalid package or version target**
    - **Validates: Requirements 1.3, 1.4**
  - [ ]* 4.6 Write property test: deprecation count matches affected versions
    - **Property 4: Deprecation count matches affected versions**
    - **Validates: Requirements 2.2**
  - [ ]* 4.7 Write property test: info output includes deprecation data
    - **Property 5: Info output includes deprecation data for deprecated versions**
    - **Validates: Requirements 5.1, 5.2**

- [x] 5. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped
- Reuse existing `loadRegistryIndex`, `saveRegistryIndex` helpers
- All code in `lib/commands/scene.js`, no new dependencies
- Follow existing command patterns (see `runSceneInfoCommand`, `runSceneUnpublishCommand` for reference)
