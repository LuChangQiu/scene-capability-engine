# Implementation Plan: Scene Diff

## Overview

Implement `sce scene diff` command following the normalize → validate → run → print pattern. All code in `lib/commands/scene.js`. No new dependencies.

## Tasks

- [x] 1. Implement helpers and diff logic
  - [x] 1.1 Add `buildPackageDiff` helper function
    - Accepts two file arrays from `extractTarBuffer`
    - Returns `{ added, removed, modified, unchanged }` categorization
    - For modified files, computes changed line count
    - _Requirements: 2.1, 2.2, 2.3, 5.3_
  - [x] 1.2 Add `normalizeSceneDiffOptions`, `validateSceneDiffOptions`, `printSceneDiffSummary`
    - Normalize: defaults registry to `.sce/registry`, trims strings
    - Validate: require name, from, to; reject same version
    - Print: human-readable with `+`/`-`/`~` prefixes, JSON mode, stat mode
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 5.1_

- [x] 2. Implement run command and register CLI
  - [x] 2.1 Add `runSceneDiffCommand`
    - Load registry index, verify package and versions exist
    - Read and decompress both tarballs
    - Extract files with `extractTarBuffer`
    - Call `buildPackageDiff`, build payload, print summary
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.3, 5.2_
  - [x] 2.2 Register `scene diff` subcommand in `registerSceneCommands`
    - Options: `--name`, `--from`, `--to` (required), `--registry`, `--json`, `--stat`
    - _Requirements: 5.1_
  - [x] 2.3 Export new functions in `module.exports`
    - Export: `buildPackageDiff`, `normalizeSceneDiffOptions`, `validateSceneDiffOptions`, `runSceneDiffCommand`, `printSceneDiffSummary`
    - _Requirements: 5.1_

- [x] 3. Checkpoint
  - Ensure all tests pass.

- [x] 4. Write tests
  - [x] 4.1 Write unit tests for `buildPackageDiff`
    - Test empty inputs, added/removed/modified/unchanged categorization
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 4.2 Write property tests for diff
    - **Property 1: Diff symmetry**
    - **Validates: Requirements 2.1**
    - **Property 2: Diff completeness**
    - **Validates: Requirements 2.1**
    - Evidence captured in `custom/diff-test-closeout-2026-03-12.md`.

- [x] 5. Final checkpoint
  - Ensure all tests pass.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All code goes in `lib/commands/scene.js`
- Reuse existing `extractTarBuffer`, `loadRegistryIndex`, `zlib.gunzipSync`
- No new npm dependencies allowed
