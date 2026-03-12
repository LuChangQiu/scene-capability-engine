# Implementation Plan: Scene Audit

## Overview

Add `sce scene audit` subcommand to perform health checks on the local scene package registry. Scans registry-index.json, verifies tarball existence and SHA-256 integrity, detects orphaned tarballs, reports deprecated versions, and optionally fixes issues. All code in `lib/commands/scene.js`, following normalize → validate → run → print pattern.

## Tasks

- [x] 1. Implement core audit command
  - [x] 1.1 Add `normalizeSceneAuditOptions` function
    - Normalize `registry` (default `.sce/registry`), `json`, `fix`
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 1.2 Add `validateSceneAuditOptions` function
    - No required options, return null
    - _Requirements: 9.1_
  - [x] 1.3 Add `collectTgzFiles` helper function
    - Recursively walk `packages/` directory under registry root
    - Return array of relative paths (relative to registry root) for all `.tgz` files
    - _Requirements: 4.1_
  - [x] 1.4 Add `computeFileIntegrity` helper function
    - Read file, compute SHA-256 hash using `crypto` module, return `sha256-<hex>` string
    - _Requirements: 3.1_
  - [x] 1.5 Add `runSceneAuditCommand` function
    - Load registry index via `loadRegistryIndex`
    - For each package/version: check tarball existence, compute integrity if exists, compare hash, check deprecated field
    - Scan disk for `.tgz` files, detect orphans by comparing against referenced tarball set
    - If `--fix`: delete orphaned files, remove missing-tarball version entries from index, save via `saveRegistryIndex`
    - Build and return audit payload with summary, issues by type, and fix results
    - Accept `dependencies` parameter for DI (projectRoot, fileSystem)
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.1, 6.1, 6.2, 7.1, 7.2, 7.3, 9.2, 9.3_
  - [x] 1.6 Add `printSceneAuditSummary` function
    - JSON mode: output payload as JSON
    - Human-readable mode: show registry path, summary counts, grouped issue lists, fix results
    - _Requirements: 8.2, 8.4, 8.5_
  - [x] 1.7 Register `scene audit` subcommand in `registerSceneCommands`
    - Options: `--registry`, `--json`, `--fix`
    - _Requirements: 9.4_
  - [x] 1.8 Export new functions in `module.exports`
    - Export: `normalizeSceneAuditOptions`, `validateSceneAuditOptions`, `runSceneAuditCommand`, `printSceneAuditSummary`, `collectTgzFiles`, `computeFileIntegrity`
    - _Requirements: 9.1_

- [x] 2. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 3. Write tests
  - [ ]* 3.1 Write unit tests for audit command
    - Test empty registry returns zero counts
    - Test all-healthy registry returns correct summary
    - Test missing tarball detection
    - Test integrity mismatch detection
    - Test orphaned tarball detection
    - Test deprecated version reporting
    - Test --fix removes orphaned files and missing entries
    - Test --json output structure
    - Test normalize defaults
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.1, 6.1, 7.1, 7.2, 8.1, 8.2_
  - [ ]* 3.2 Write property test: summary counts invariant
    - **Property 1: Summary counts are consistent with index contents**
    - **Validates: Requirements 1.1, 6.1**
  - [ ]* 3.3 Write property test: missing tarball detection is exact
    - **Property 2: Missing tarball detection is exact**
    - **Validates: Requirements 2.1, 2.2**
  - [ ]* 3.4 Write property test: integrity mismatch detection is exact
    - **Property 3: Integrity mismatch detection is exact**
    - **Validates: Requirements 3.1, 3.2**
  - [ ]* 3.5 Write property test: orphaned tarball detection is exact
    - **Property 4: Orphaned tarball detection is exact**
    - **Validates: Requirements 4.1, 4.2**
  - [ ]* 3.6 Write property test: deprecated version reporting is exact
    - **Property 5: Deprecated version reporting is exact**
    - **Validates: Requirements 5.1**
  - [ ]* 3.7 Write property test: fix mode cleanup
    - **Property 6: Fix mode removes orphaned tarballs and missing-tarball entries**
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 4. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped
- Reuse existing `loadRegistryIndex`, `saveRegistryIndex`, `buildRegistryTarballPath` helpers
- All code in `lib/commands/scene.js`, no new dependencies
- `crypto` module is already imported in scene.js
- Follow existing command patterns (see `runSceneDeprecateCommand` for reference)
