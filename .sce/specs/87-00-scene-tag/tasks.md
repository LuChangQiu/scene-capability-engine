# Implementation Plan: Scene Tag

## Overview

Add `sce scene tag` subcommand group with sub-subcommands (add, rm, ls) to manage distribution tags on scene packages in the local registry. All code in `lib/commands/scene.js`, following normalize → validate → run → print pattern. Single `runSceneTagCommand` dispatcher handles all three actions.

## Tasks

- [x] 1. Implement core tag command
  - [x] 1.1 Add `normalizeSceneTagOptions` function
    - Normalize `action`, `name`, `tag`, `version`, `registry` (default `.sce/registry`), `json`
    - _Requirements: 4.1, 5.1_
  - [x] 1.2 Add `validateSceneTagOptions` function
    - Validate action is one of add/rm/ls
    - Validate required options per action: add needs name + tag + version, rm needs name + tag, ls needs name
    - Reject "latest" as tag name for add and rm
    - _Requirements: 1.5, 2.4, 5.1_
  - [x] 1.3 Add `runSceneTagCommand` function
    - Normalize and validate options
    - Load registry index via `loadRegistryIndex`
    - Dispatch by action:
      - **add**: Resolve package (error if not found). Verify version exists in `pkg.versions` (error if not). Initialize `pkg.tags` if absent. Set `pkg.tags[tag] = version`. Save index.
      - **rm**: Resolve package (error if not found). Verify tag exists in `pkg.tags` (error if not). Delete `pkg.tags[tag]`. Save index.
      - **ls**: Resolve package (error if not found). Read `pkg.tags` and `pkg.latest`.
    - Build and return action-specific payload
    - Accept `dependencies` parameter for DI (projectRoot, fileSystem)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 5.2, 5.3, 5.4_
  - [x] 1.4 Add `printSceneTagSummary` function
    - JSON mode: output payload as JSON
    - Human-readable mode: format output based on action (add/rm/ls)
    - For ls: show latest field and all tags with versions
    - _Requirements: 4.2, 4.3, 4.4_
  - [x] 1.5 Register `scene tag` subcommand group in `registerSceneCommands`
    - Add `tag` command group on `sceneCmd` with three sub-subcommands: add, rm, ls
    - Each sub-subcommand passes `action` field to `runSceneTagCommand`
    - Options: `--name`, `--tag`, `--version`, `--registry`, `--json`
    - _Requirements: 5.5_
  - [x] 1.6 Export new functions in `module.exports`
    - Export: `normalizeSceneTagOptions`, `validateSceneTagOptions`, `runSceneTagCommand`, `printSceneTagSummary`
    - _Requirements: 5.6_

- [x] 2. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 3. Write tests
  - [ ]* 3.1 Write unit tests for tag command
    - Test add tag persists value
    - Test add tag overwrites existing tag
    - Test add with non-existent package returns error
    - Test add with non-existent version returns error
    - Test add with "latest" tag returns validation error
    - Test rm removes tag
    - Test rm with non-existent tag returns error
    - Test rm with non-existent package returns error
    - Test rm with "latest" tag returns validation error
    - Test ls returns all tags and latest
    - Test ls with empty tags
    - Test ls with non-existent package returns error
    - Test --json output structure
    - Test normalize defaults
    - Test validate rejects missing options
    - _Requirements: 1.1–1.5, 2.1–2.4, 3.1–3.4, 4.1–4.3_
  - [ ]* 3.2 Write property test: add-then-ls round trip
    - **Property 1: Add-then-ls round trip**
    - **Validates: Requirements 1.1, 3.1, 3.3**
  - [ ]* 3.3 Write property test: add-then-rm round trip
    - **Property 2: Add-then-rm round trip**
    - **Validates: Requirements 1.1, 2.1**
  - [ ]* 3.4 Write property test: package-not-found error
    - **Property 3: Package-not-found error across all actions**
    - **Validates: Requirements 1.3, 2.3, 3.4**
  - [ ]* 3.5 Write property test: version-not-found error
    - **Property 4: Version-not-found error for add**
    - **Validates: Requirements 1.4**
  - [ ]* 3.6 Write property test: rm rejects non-existent tag
    - **Property 5: Rm rejects non-existent tag**
    - **Validates: Requirements 2.2**

- [x] 4. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped
- Reuse existing `loadRegistryIndex` and `saveRegistryIndex` helpers
- All code in `lib/commands/scene.js`, no new dependencies
- Follow existing command patterns (see `runSceneOwnerCommand` for reference)
- Tags stored as `tags` object on package entry, separate from `latest` field
- "latest" tag is protected — managed automatically by publish
