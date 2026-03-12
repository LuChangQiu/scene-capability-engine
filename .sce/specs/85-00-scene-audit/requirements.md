# Requirements Document

## Introduction

This feature adds a `sce scene audit` subcommand that performs a health check on the local scene package registry. The command scans `registry-index.json`, verifies tarball file existence and SHA-256 integrity for every version entry, identifies orphaned tarballs on disk not referenced in the index, reports deprecated versions, and provides a summary of registry health. An optional `--fix` flag automatically removes orphaned tarballs and cleans up index entries for missing tarballs.

## Glossary

- **Audit_Command**: The `sce scene audit` CLI subcommand for scanning and reporting registry health.
- **Registry_Index**: The `registry-index.json` file that stores metadata for all published packages and their versions.
- **Version_Entry**: A single version record within a package in the Registry_Index, containing `published_at`, `integrity`, `tarball`, and optionally `deprecated`.
- **Tarball**: A `.tgz` archive file stored on disk for a published package version.
- **Orphaned_Tarball**: A tarball file present on disk inside the registry `packages/` directory that is not referenced by any Version_Entry in the Registry_Index.
- **Missing_Tarball**: A tarball referenced by a Version_Entry in the Registry_Index but not present on disk.
- **Integrity_Mismatch**: A tarball whose computed SHA-256 hash does not match the `integrity` field stored in the Version_Entry.

## Requirements

### Requirement 1: Scan Registry Index

**User Story:** As a registry maintainer, I want to scan all packages and versions in the registry index, so that I can get a complete picture of registry contents.

#### Acceptance Criteria

1. WHEN the Audit_Command is invoked, THE Audit_Command SHALL load the Registry_Index using `loadRegistryIndex` and enumerate every package and Version_Entry.
2. WHEN the Registry_Index contains zero packages, THE Audit_Command SHALL report an empty registry with zero totals and no issues.

### Requirement 2: Verify Tarball Existence

**User Story:** As a registry maintainer, I want to verify that every referenced tarball exists on disk, so that I can detect missing files before they cause install failures.

#### Acceptance Criteria

1. WHEN a Version_Entry references a tarball path, THE Audit_Command SHALL check whether the file exists on disk at the resolved path within the registry directory.
2. WHEN a referenced tarball file does not exist on disk, THE Audit_Command SHALL record a Missing_Tarball issue containing the package name, version, and expected tarball path.

### Requirement 3: Verify Tarball Integrity

**User Story:** As a registry maintainer, I want to verify SHA-256 integrity of tarballs, so that I can detect corrupted or tampered files.

#### Acceptance Criteria

1. WHEN a referenced tarball file exists on disk, THE Audit_Command SHALL compute the SHA-256 hash of the file contents and compare it against the `integrity` field in the Version_Entry.
2. WHEN the computed hash does not match the stored integrity value, THE Audit_Command SHALL record an Integrity_Mismatch issue containing the package name, version, expected integrity, and actual integrity.

### Requirement 4: Detect Orphaned Tarballs

**User Story:** As a registry maintainer, I want to find tarball files on disk that are not referenced in the index, so that I can reclaim disk space.

#### Acceptance Criteria

1. WHEN the Audit_Command scans the registry `packages/` directory, THE Audit_Command SHALL identify all `.tgz` files on disk.
2. WHEN a `.tgz` file on disk is not referenced by any Version_Entry in the Registry_Index, THE Audit_Command SHALL record an Orphaned_Tarball issue containing the file path.

### Requirement 5: Report Deprecated Versions

**User Story:** As a registry maintainer, I want to see which versions are deprecated, so that I can review deprecation status during audits.

#### Acceptance Criteria

1. WHEN a Version_Entry has a `deprecated` field, THE Audit_Command SHALL record a deprecation notice containing the package name, version, and deprecation message.

### Requirement 6: Provide Audit Summary

**User Story:** As a registry maintainer, I want a clear summary of registry health, so that I can quickly assess the overall state.

#### Acceptance Criteria

1. THE Audit_Command SHALL report total package count, total version count, healthy version count, and total issue count.
2. WHEN issues are found, THE Audit_Command SHALL list each issue grouped by type (missing tarballs, integrity mismatches, orphaned tarballs, deprecated versions).

### Requirement 7: Auto-Fix Mode

**User Story:** As a registry maintainer, I want to automatically fix common issues, so that I can clean up the registry without manual intervention.

#### Acceptance Criteria

1. WHEN the `--fix` flag is provided and Orphaned_Tarballs are detected, THE Audit_Command SHALL delete each orphaned tarball file from disk.
2. WHEN the `--fix` flag is provided and Missing_Tarballs are detected, THE Audit_Command SHALL remove the corresponding Version_Entry from the Registry_Index and persist the updated index using `saveRegistryIndex`.
3. WHEN the `--fix` flag is provided, THE Audit_Command SHALL report the count of fixes applied for each fix type.

### Requirement 8: CLI Options and Output

**User Story:** As a developer, I want flexible CLI options and output formats, so that I can integrate audit into scripts and CI pipelines.

#### Acceptance Criteria

1. THE Audit_Command SHALL accept `--registry <dir>` to specify a custom registry directory, defaulting to `.sce/registry`.
2. THE Audit_Command SHALL accept `--json` to output the audit result as structured JSON.
3. THE Audit_Command SHALL accept `--fix` to enable automatic cleanup of orphaned tarballs and missing tarball index entries.
4. THE Audit_Command SHALL display human-readable formatted output by default.
5. WHEN the `--json` flag is provided, THE Audit_Command SHALL output a JSON payload containing the summary, all issues grouped by type, and fix results when applicable.

### Requirement 9: Command Pattern Compliance

**User Story:** As a maintainer, I want the command to follow existing patterns, so that the codebase remains consistent.

#### Acceptance Criteria

1. THE Audit_Command SHALL implement `normalizeSceneAuditOptions`, `validateSceneAuditOptions`, `runSceneAuditCommand`, and `printSceneAuditSummary` functions.
2. THE Audit_Command SHALL accept a `dependencies` parameter for dependency injection in the run function.
3. THE Audit_Command SHALL reuse existing `loadRegistryIndex`, `saveRegistryIndex`, and `buildRegistryTarballPath` helpers.
4. THE Audit_Command SHALL be registered as a subcommand within `registerSceneCommands`.
