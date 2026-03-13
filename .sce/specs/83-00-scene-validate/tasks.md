# Implementation Plan: Scene Validate

## Overview

Enhance the existing `scene package-validate` command to support comprehensive directory-level validation. Add `validateScenePackageDirectory` helper, enhance normalize/run/print functions, add `--strict` flag. All code in `lib/commands/scene.js`.

## Tasks

- [x] 1. Implement core validation logic
  - [x] 1.1 Add `validateScenePackageDirectory` async helper function
    - Read `scene-package.json` from directory
    - Run `validateScenePackageContract` for structural validation
    - Validate `metadata.version` with `semver.valid`
    - Check `artifacts.entry_scene` and `artifacts.generates` file existence
    - Validate template variables with `validateTemplateVariableSchema` if present
    - Collect all errors and warnings into aggregated result
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2_
  - [x] 1.2 Enhance `normalizeScenePackageValidateOptions` to add `strict` boolean
    - _Requirements: 6.3_
  - [x] 1.3 Enhance `runScenePackageValidateCommand` to use `validateScenePackageDirectory` when `--package` points to a directory
    - Detect directory vs file input
    - Apply strict mode: promote warnings to errors when `--strict` is true
    - Set exit code based on validation result
    - _Requirements: 5.3, 5.4, 6.1, 6.3_
  - [x] 1.4 Enhance `printScenePackageValidateSummary` to display file check counts, warnings, and strict indicator
    - _Requirements: 6.2, 6.4_
  - [x] 1.5 Register `--strict` option on `scene package-validate` in `registerSceneCommands`
    - _Requirements: 6.3, 7.4_
  - [x] 1.6 Export `validateScenePackageDirectory` in `module.exports`
    - _Requirements: 7.1_

- [x] 2. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x]* 3. Write tests
  - [x]* 3.1 Write unit tests for directory validation
    - Test missing scene-package.json
    - Test valid package directory
    - Test --json output
    - Test --strict with warnings
    - _Requirements: 1.1, 1.2, 5.3, 5.4, 6.2, 6.3_
  - [x]* 3.2 Write property test: required metadata fields
    - **Property 1: Required metadata fields produce errors when missing**
    - **Validates: Requirements 1.3**
  - [x]* 3.3 Write property test: semver validation consistency
    - **Property 2: Semver validation consistency**
    - **Validates: Requirements 2.1, 2.2**
  - [x]* 3.4 Write property test: file existence check completeness
    - **Property 3: File existence check completeness**
    - **Validates: Requirements 3.1, 3.2, 3.3**
  - [x]* 3.5 Write property test: error collection and validity semantics
    - **Property 4: Error collection completeness and validity semantics**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
  - [x]* 3.6 Write property test: strict mode promotes warnings
    - **Property 5: Strict mode promotes warnings to errors**
    - **Validates: Requirements 6.3**

- [x] 4. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped
- Reuse existing `validateScenePackageContract`, `validateTemplateVariableSchema`, `semver.valid`
- Reuse existing `validatePackageForPublish` logic as reference for file checks
- All code in `lib/commands/scene.js`, no new dependencies
