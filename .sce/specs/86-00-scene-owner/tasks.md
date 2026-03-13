# Implementation Plan: Scene Owner

## Overview

Add `sce scene owner` subcommand group with sub-subcommands (set, show, list, transfer) to manage package ownership metadata in the local scene package registry. All code in `lib/commands/scene.js`, following normalize → validate → run → print pattern. Single `runSceneOwnerCommand` dispatcher handles all four actions.

## Tasks

- [x] 1. Implement core owner command
  - [x] 1.1 Add `normalizeSceneOwnerOptions` function
    - Normalize `action`, `name`, `owner`, `from`, `to`, `remove`, `registry` (default `.sce/registry`), `json`
    - _Requirements: 5.1, 6.1_
  - [x] 1.2 Add `validateSceneOwnerOptions` function
    - Validate action is one of set/show/list/transfer
    - Validate required options per action: set needs name + (owner or remove), show needs name, list needs owner, transfer needs name + from + to
    - _Requirements: 6.1_
  - [x] 1.3 Add `runSceneOwnerCommand` function
    - Normalize and validate options
    - Load registry index via `loadRegistryIndex`
    - Dispatch by action:
      - **set**: Resolve package (error if not found). If `--remove` or owner is empty string, delete `owner` field. Otherwise set `owner`. Save index.
      - **show**: Resolve package (error if not found). Read `owner` field (null if not set).
      - **list**: Iterate all packages, collect those whose `owner` matches `--owner` (case-insensitive).
      - **transfer**: Resolve package (error if not found). Error if no owner set. Error if current owner doesn't match `--from` (case-insensitive). Set `owner = --to`. Save index.
    - Build and return action-specific payload
    - Accept `dependencies` parameter for DI (projectRoot, fileSystem)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 6.2, 6.3_
  - [x] 1.4 Add `printSceneOwnerSummary` function
    - JSON mode: output payload as JSON
    - Human-readable mode: format output based on action (set/show/list/transfer)
    - _Requirements: 5.2, 5.3, 5.4_
  - [x] 1.5 Register `scene owner` subcommand group in `registerSceneCommands`
    - Add `owner` command group on `sceneCmd` with four sub-subcommands: set, show, list, transfer
    - Each sub-subcommand passes `action` field to `runSceneOwnerCommand`
    - Options: `--name`, `--owner`, `--from`, `--to`, `--remove`, `--registry`, `--json`
    - _Requirements: 6.4_
  - [x] 1.6 Export new functions in `module.exports`
    - Export: `normalizeSceneOwnerOptions`, `validateSceneOwnerOptions`, `runSceneOwnerCommand`, `printSceneOwnerSummary`
    - _Requirements: 6.5_

- [x] 2. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x]* 3. Write tests
  - [x]* 3.1 Write unit tests for owner command
    - Test set owner persists value
    - Test set owner with empty string removes field
    - Test set owner with --remove removes field
    - Test show returns current owner
    - Test show when no owner reports null
    - Test list returns matching packages (case-insensitive)
    - Test list with no matches returns empty
    - Test transfer updates owner when --from matches
    - Test transfer fails on mismatch
    - Test transfer fails when no owner set
    - Test package not found error for set/show/transfer
    - Test --json output structure
    - Test normalize defaults
    - Test validate rejects missing options
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2_
  - [x]* 3.2 Write property test: set-then-show round trip
    - **Property 1: Set-then-show round trip**
    - **Validates: Requirements 1.1, 2.1**
  - [x]* 3.3 Write property test: package-not-found error
    - **Property 2: Package-not-found error across all actions**
    - **Validates: Requirements 1.4, 2.3, 4.3**
  - [x]* 3.4 Write property test: list filtering is exact
    - **Property 3: List filtering is exact**
    - **Validates: Requirements 3.1**
  - [x]* 3.5 Write property test: transfer updates owner
    - **Property 4: Transfer updates owner when from matches**
    - **Validates: Requirements 4.1**
  - [x]* 3.6 Write property test: transfer rejects mismatch
    - **Property 5: Transfer rejects mismatched from**
    - **Validates: Requirements 4.2**

- [x] 4. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped
- Reuse existing `loadRegistryIndex` and `saveRegistryIndex` helpers
- All code in `lib/commands/scene.js`, no new dependencies
- Follow existing command patterns (see `runSceneDeprecateCommand`, `runSceneAuditCommand` for reference)
- Owner field is stored at package level, not per-version
- Case-insensitive comparison for list and transfer --from matching
