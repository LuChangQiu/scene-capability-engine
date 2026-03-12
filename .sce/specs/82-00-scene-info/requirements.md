# Requirements Document

## Introduction

This feature adds a `sce scene info` command that displays detailed information about a specific scene package in the local registry, including all published versions, metadata, and integrity hashes.

## Glossary

- **Info_Command**: The `sce scene info` CLI command.
- **Package_Detail**: Complete metadata for a package including all versions, descriptions, and publish timestamps.

## Requirements

### Requirement 1: Display Package Information

**User Story:** As a developer, I want to view detailed information about a scene package, so that I can understand its contents and version history.

#### Acceptance Criteria

1. WHEN the Info_Command is invoked with a package name, THE Info_Command SHALL load the registry index and display the package metadata.
2. THE Info_Command SHALL display: package name, group, description, latest version, and total version count.
3. THE Info_Command SHALL list all published versions with their publish timestamps and integrity hashes.
4. IF the package does not exist in the registry, THEN THE Info_Command SHALL print an error message and set `process.exitCode` to 1.

### Requirement 2: Output Modes

**User Story:** As a developer, I want flexible output formats.

#### Acceptance Criteria

1. THE Info_Command SHALL display human-readable formatted output by default.
2. WHEN the `--json` flag is provided, THE Info_Command SHALL output a structured JSON object.
3. WHEN the `--versions-only` flag is provided, THE Info_Command SHALL display only the version list.

### Requirement 3: Command Pattern Compliance

#### Acceptance Criteria

1. THE Info_Command SHALL implement `normalizeSceneInfoOptions`, `validateSceneInfoOptions`, `runSceneInfoCommand`, and `printSceneInfoSummary` functions.
2. THE Info_Command SHALL accept a `dependencies` parameter for dependency injection.
3. THE Info_Command SHALL require the `--name` option.
