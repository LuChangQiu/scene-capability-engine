# Implementation Plan: Scene Stats

## Overview

Add `sce scene stats` subcommand that computes and displays aggregate statistics about the local scene package registry. All code in `lib/commands/scene.js`, following normalize → validate → run → print pattern. Single `runSceneStatsCommand` function computes all metrics in one pass over the registry index.

## Tasks

- [x] 1. Implement core stats command
  - [x] 1.1 Add `normalizeSceneStatsOptions` function
    - Normalize `registry` (default `.sce/registry`), `json`
    - _Requirements: 7.1, 9.1_
  - [x] 1.2 Add `validateSceneStatsOptions` function
    - Minimal validation, return null (no required fields beyond defaults)
    - _Requirements: 9.1_
  - [x] 1.3 Add `runSceneStatsCommand` function
    - Normalize and validate options
    - Load registry index via `loadRegistryIndex`
    - Iterate all packages to compute: totalPackages, totalVersions, totalTags, packagesWithOwner, packagesWithoutOwner, deprecatedPackages, mostRecentlyPublished
    - Handle missing `tags`, `owner`, `versions` fields gracefully
    - Accept `dependencies` parameter for DI (projectRoot, fileSystem)
    - Build and return Stats_Payload
    - _Requirements: 1.1, 1.2, 2.1, 3.1, 3.2, 4.1, 4.2, 4.3, 5.1, 5.2, 6.1, 8.1, 8.2, 9.2, 9.3_
  - [x] 1.4 Add `printSceneStatsSummary` function
    - JSON mode: output payload as JSON
    - Human-readable mode: formatted dashboard with chalk showing all stats
    - _Requirements: 7.2, 7.3, 7.4_
  - [x] 1.5 Register `scene stats` subcommand in `registerSceneCommands`
    - Add `stats` command on `sceneCmd` with `--registry` and `--json` options
    - _Requirements: 9.4_
  - [x] 1.6 Export new functions in `module.exports`
    - Export: `normalizeSceneStatsOptions`, `validateSceneStatsOptions`, `runSceneStatsCommand`, `printSceneStatsSummary`
    - _Requirements: 9.5_

- [x] 2. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 3. Write tests
  - [ ]* 3.1 Write unit tests for stats command
    - Test stats on registry with multiple packages returns correct counts
    - Test stats on empty registry returns all zeros and null mostRecentlyPublished
    - Test ownership counting (with/without owner, empty owner string)
    - Test deprecated counting
    - Test mostRecentlyPublished finds latest across all packages/versions
    - Test missing tags object treated as zero
    - Test --json output structure
    - Test normalize defaults
    - Test validate returns null
    - Test error when registry index cannot be read
    - _Requirements: 1.1, 1.2, 2.1, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 6.1, 7.2, 7.3, 8.1, 8.2_
  - [ ]* 3.2 Write property test: aggregate counts correctness
    - **Property 1: Aggregate counts correctness**
    - **Validates: Requirements 1.1, 2.1, 3.1, 3.2, 6.1**
  - [ ]* 3.3 Write property test: ownership partition invariant
    - **Property 2: Ownership partition invariant**
    - **Validates: Requirements 4.1, 4.2, 4.3**
  - [ ]* 3.4 Write property test: most recently published correctness
    - **Property 3: Most recently published correctness**
    - **Validates: Requirements 5.1, 5.2**

- [x] 4. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped
- Reuse existing `loadRegistryIndex` helper
- All code in `lib/commands/scene.js`, no new dependencies
- Follow existing command patterns (see `runSceneOwnerCommand`, `runSceneTagCommand` for reference)
- Stats is a single command with no sub-subcommands (no action dispatch needed)
- `loadRegistryIndex` returns empty index when file doesn't exist, so empty registry is handled naturally
