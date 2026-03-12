# Implementation Plan: Scene Lock

## Overview

Add `sce scene lock` subcommand group with sub-subcommands (set, rm, ls) to manage version locking on scene packages in the local registry. All code in `lib/commands/scene.js`, following normalize → validate → run → print pattern. Single `runSceneLockCommand` dispatcher handles all three actions.

## Tasks

- [x] 1. Implement core lock command
  - [x] 1.1 Add `normalizeSceneLockOptions` function
    - Normalize `action`, `name`, `version`, `registry` (default `.sce/registry`), `json`
    - _Requirements: 4.1, 5.1_
  - [x] 1.2 Add `validateSceneLockOptions` function
    - Validate action is one of set/rm/ls
    - Validate required options per action: set needs name + version, rm needs name + version, ls needs name
    - _Requirements: 5.1_
  - [x] 1.3 Add `runSceneLockCommand` function
    - Normalize and validate options
    - Load registry index via `loadRegistryIndex`
    - Dispatch by action:
      - **set**: Resolve package (error if not found). Verify version exists (error if not). Check if already locked (error if so). Set `locked: true`. Save index.
      - **rm**: Resolve package (error if not found). Verify version exists (error if not). Check if locked (error if not). Delete `locked` property. Save index.
      - **ls**: Resolve package (error if not found). Filter versions with `locked: true`. Return list.
    - Build and return action-specific payload
    - Accept `dependencies` parameter for DI (projectRoot, fileSystem)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 5.2, 5.3, 5.4_
  - [x] 1.4 Add `printSceneLockSummary` function
    - JSON mode: output payload as JSON
    - Human-readable mode: format output based on action (set/rm/ls)
    - For ls: show locked versions list or "no locked versions" message
    - _Requirements: 4.2, 4.3, 4.4_
  - [x] 1.5 Register `scene lock` subcommand group in `registerSceneCommands`
    - Add `lock` command group on `sceneCmd` with three sub-subcommands: set, rm, ls
    - Each sub-subcommand passes `action` field to `runSceneLockCommand`
    - Options: `--name`, `--version`, `--registry`, `--json`
    - _Requirements: 5.5_
  - [x] 1.6 Export new functions in `module.exports`
    - Export: `normalizeSceneLockOptions`, `validateSceneLockOptions`, `runSceneLockCommand`, `printSceneLockSummary`
    - _Requirements: 5.6_

- [x] 2. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 3. Write tests
  - [ ]* 3.1 Write unit tests for lock command
    - Test set lock persists `locked: true` on version entry
    - Test set lock on already-locked version returns error
    - Test set lock with non-existent package returns error
    - Test set lock with non-existent version returns error
    - Test rm lock removes `locked` property from version entry
    - Test rm lock on non-locked version returns error
    - Test rm lock with non-existent package returns error
    - Test rm lock with non-existent version returns error
    - Test ls returns all locked versions
    - Test ls with no locked versions returns empty list
    - Test ls with non-existent package returns error
    - Test --json output structure for all actions
    - Test normalize defaults
    - Test validate rejects missing options per action
    - _Requirements: 1.1–1.4, 2.1–2.4, 3.1–3.3, 4.1–4.3_
  - [ ]* 3.2 Write property test: set-then-ls round trip
    - **Property 1: Set-then-ls round trip**
    - **Validates: Requirements 1.1, 3.1**
  - [ ]* 3.3 Write property test: set-then-rm round trip
    - **Property 2: Set-then-rm round trip**
    - **Validates: Requirements 1.1, 2.1**
  - [ ]* 3.4 Write property test: package-not-found error
    - **Property 3: Package-not-found error across all actions**
    - **Validates: Requirements 1.2, 2.2, 3.3**
  - [ ]* 3.5 Write property test: version-not-found error
    - **Property 4: Version-not-found error for set and rm**
    - **Validates: Requirements 1.3, 2.3**
  - [ ]* 3.6 Write property test: ls filtering is exact
    - **Property 5: Ls filtering is exact**
    - **Validates: Requirements 3.1**

- [x] 4. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped
- Reuse existing `loadRegistryIndex` and `saveRegistryIndex` helpers
- All code in `lib/commands/scene.js`, no new dependencies
- Follow existing command patterns (see `runSceneTagCommand` for reference)
- Lock state stored as `locked: true` on version entries; absence means unlocked
- `rm` deletes the `locked` property rather than setting it to `false`
