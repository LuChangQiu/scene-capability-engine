# Requirements Document

## Introduction

This feature adds a `sce scene deprecate` subcommand that marks a specific version (or all versions) of a published scene package as deprecated in the local registry. The command modifies `registry-index.json` to add or remove a `deprecated` field on version entries. Deprecation warnings are surfaced during `scene install` and `scene info` when a deprecated version is encountered. An `--undo` flag allows removing the deprecation marker.

## Glossary

- **Deprecate_Command**: The `sce scene deprecate` CLI subcommand for marking package versions as deprecated.
- **Registry_Index**: The `registry-index.json` file that stores metadata for all published packages and their versions.
- **Version_Entry**: A single version record within a package in the Registry_Index, containing `published_at`, `integrity`, `tarball`, and optionally `deprecated`.
- **Deprecation_Marker**: The `deprecated` field added to a Version_Entry, containing the deprecation message string.

## Requirements

### Requirement 1: Deprecate a Specific Version

**User Story:** As a package maintainer, I want to mark a specific version of my package as deprecated, so that consumers are warned before installing outdated or broken versions.

#### Acceptance Criteria

1. WHEN the Deprecate_Command is invoked with `--name` and `--version` and `--message`, THE Deprecate_Command SHALL add a `deprecated` field with the message string to the specified Version_Entry in the Registry_Index.
2. WHEN the Deprecate_Command successfully updates the Registry_Index, THE Deprecate_Command SHALL persist the changes to disk using `saveRegistryIndex`.
3. IF the specified package name does not exist in the Registry_Index, THEN THE Deprecate_Command SHALL report an error and set exit code to 1.
4. IF the specified version does not exist for the package, THEN THE Deprecate_Command SHALL report an error and set exit code to 1.

### Requirement 2: Deprecate All Versions

**User Story:** As a package maintainer, I want to deprecate all versions of a package at once, so that I can efficiently mark an entire package as obsolete.

#### Acceptance Criteria

1. WHEN the Deprecate_Command is invoked with `--name` and `--message` but without `--version`, THE Deprecate_Command SHALL add the `deprecated` field to every Version_Entry of the specified package.
2. WHEN deprecating all versions, THE Deprecate_Command SHALL report the count of versions affected.

### Requirement 3: Un-deprecate (Undo)

**User Story:** As a package maintainer, I want to remove the deprecation marker from a version, so that I can restore a version to active status.

#### Acceptance Criteria

1. WHEN the Deprecate_Command is invoked with `--undo` and `--name` and `--version`, THE Deprecate_Command SHALL remove the `deprecated` field from the specified Version_Entry.
2. WHEN the Deprecate_Command is invoked with `--undo` and `--name` but without `--version`, THE Deprecate_Command SHALL remove the `deprecated` field from all Version_Entries of the specified package.
3. IF the `--undo` flag is provided, THEN THE Deprecate_Command SHALL NOT require the `--message` option.

### Requirement 4: Deprecation Warnings in Install

**User Story:** As a package consumer, I want to see deprecation warnings when installing a deprecated version, so that I can make informed decisions about which versions to use.

#### Acceptance Criteria

1. WHEN `scene install` resolves a version that has a Deprecation_Marker, THE Install_Command SHALL print a warning message containing the package name, version, and deprecation message.
2. WHEN `scene install` resolves a deprecated version, THE Install_Command SHALL still proceed with the installation.

### Requirement 5: Deprecation Warnings in Info

**User Story:** As a package consumer, I want to see deprecation status when viewing package info, so that I can identify which versions are deprecated.

#### Acceptance Criteria

1. WHEN `scene info` displays a version that has a Deprecation_Marker, THE Info_Command SHALL include the deprecation message in the version output.
2. WHEN `scene info` outputs JSON for a deprecated version, THE Info_Command SHALL include the `deprecated` field in the version object.

### Requirement 6: CLI Options and Output

**User Story:** As a developer, I want flexible output options, so that I can integrate deprecation into scripts and CI pipelines.

#### Acceptance Criteria

1. THE Deprecate_Command SHALL accept `--name <name>` as a required option to specify the package name.
2. THE Deprecate_Command SHALL accept `--message <msg>` as a required option (unless `--undo` is provided).
3. THE Deprecate_Command SHALL accept `--version <version>` as an optional option to target a specific version.
4. THE Deprecate_Command SHALL accept `--registry <dir>` to specify a custom registry directory, defaulting to `.sce/registry`.
5. THE Deprecate_Command SHALL accept `--json` to output the result as structured JSON.
6. THE Deprecate_Command SHALL accept `--undo` to remove the deprecation marker instead of adding one.
7. WHEN the `--json` flag is provided, THE Deprecate_Command SHALL output a JSON payload containing the package name, affected versions, and action performed.
8. THE Deprecate_Command SHALL display human-readable formatted output by default.

### Requirement 7: Command Pattern Compliance

**User Story:** As a maintainer, I want the command to follow existing patterns, so that the codebase remains consistent.

#### Acceptance Criteria

1. THE Deprecate_Command SHALL implement `normalizeSceneDeprecateOptions`, `validateSceneDeprecateOptions`, `runSceneDeprecateCommand`, and `printSceneDeprecateSummary` functions.
2. THE Deprecate_Command SHALL accept a `dependencies` parameter for dependency injection in the run function.
3. THE Deprecate_Command SHALL reuse existing `loadRegistryIndex` and `saveRegistryIndex` helpers.
4. THE Deprecate_Command SHALL be registered as a subcommand within `registerSceneCommands`.
