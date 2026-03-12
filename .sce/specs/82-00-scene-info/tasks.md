# Implementation Plan: Scene Info

## Overview

Implement `sce scene info` command following normalize → validate → run → print pattern. All code in `lib/commands/scene.js`. No new dependencies.

## Tasks

- [x] 1. Implement all functions and register CLI
  - [x] 1.1 Add `normalizeSceneInfoOptions`, `validateSceneInfoOptions`, `runSceneInfoCommand`, `printSceneInfoSummary`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_
  - [x] 1.2 Register `scene info` subcommand in `registerSceneCommands`
    - Options: `--name` (required), `--registry`, `--json`, `--versions-only`
    - _Requirements: 3.1, 3.3_
  - [x] 1.3 Export new functions in `module.exports`
    - _Requirements: 3.1_

- [x] 2. Checkpoint
  - Ensure all tests pass.

- [ ]* 3. Write tests
  - [ ]* 3.1 Write unit tests for info command
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3_
  - [ ]* 3.2 Write property test for version list completeness
    - **Property 1: Version list completeness**
    - **Validates: Requirements 1.2, 1.3**

- [x] 4. Final checkpoint
  - Ensure all tests pass.

## Notes

- Tasks marked with `*` are optional
- Reuse existing `loadRegistryIndex`, `resolveLatestVersion`
- Use `semver.rcompare` for version sorting
