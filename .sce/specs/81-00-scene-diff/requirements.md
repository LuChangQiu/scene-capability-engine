# Requirements Document

## Introduction

This feature adds a `sce scene diff` command that compares two versions of a scene package in the local registry by extracting their tarballs and diffing file contents.

## Glossary

- **Diff_Command**: The `sce scene diff` CLI command that compares two versions of a scene package.
- **From_Version**: The source version to compare from.
- **To_Version**: The target version to compare to.
- **Package_Diff**: The computed difference between two versions, categorizing files as added, removed, modified, or unchanged.

## Requirements

### Requirement 1: Load and Extract Package Versions

**User Story:** As a developer, I want to compare two versions of a scene package, so that I can understand what changed between releases.

#### Acceptance Criteria

1. WHEN the Diff_Command is invoked, THE Diff_Command SHALL load the registry index and verify both versions exist for the specified package.
2. IF the package does not exist in the registry, THEN THE Diff_Command SHALL print an error message and set `process.exitCode` to 1.
3. IF either version does not exist in the registry, THEN THE Diff_Command SHALL print an error message and set `process.exitCode` to 1.
4. THE Diff_Command SHALL read and decompress both tarballs from the registry.
5. THE Diff_Command SHALL extract file lists from both tarballs using `extractTarBuffer`.

### Requirement 2: Compute File Differences

**User Story:** As a developer, I want to see which files were added, removed, or modified between versions.

#### Acceptance Criteria

1. THE Diff_Command SHALL categorize files as added (in To_Version only), removed (in From_Version only), modified (content differs), or unchanged.
2. FOR modified text files, THE Diff_Command SHALL compute the number of changed lines.
3. THE Diff_Command SHALL handle binary content by reporting "binary content differs" without line-level diff.

### Requirement 3: Output

**User Story:** As a developer, I want clear output showing the differences between versions.

#### Acceptance Criteria

1. THE Diff_Command SHALL display a human-readable summary showing added, removed, and modified file counts.
2. THE Diff_Command SHALL list each changed file with a prefix: `+` for added, `-` for removed, `~` for modified.
3. WHEN the `--json` flag is provided, THE Diff_Command SHALL output a structured JSON object.
4. WHEN the `--stat` flag is provided, THE Diff_Command SHALL show only file change summary without content details.

### Requirement 4: Validation and Error Handling

**User Story:** As a developer, I want clear error messages when I provide invalid inputs.

#### Acceptance Criteria

1. THE Diff_Command SHALL require `--name`, `--from`, and `--to` options.
2. IF `--from` and `--to` are the same version, THEN THE Diff_Command SHALL print an error and set `process.exitCode` to 1.
3. IF tarball read or decompression fails, THEN THE Diff_Command SHALL print an error and set `process.exitCode` to 1.

### Requirement 5: Command Pattern Compliance

**User Story:** As a maintainer, I want the diff command to follow established patterns.

#### Acceptance Criteria

1. THE Diff_Command SHALL implement `normalizeSceneDiffOptions`, `validateSceneDiffOptions`, `runSceneDiffCommand`, and `printSceneDiffSummary` functions.
2. THE Diff_Command SHALL accept a `dependencies` parameter for dependency injection.
3. THE Diff_Command SHALL export a `buildPackageDiff` helper function.
