# Requirements Document

## Introduction

This feature adds a `sce scene version` command that bumps the `metadata.version` field in a `scene-package.json` file following semver conventions. The command supports major, minor, patch increments as well as explicit version strings, with optional dry-run and JSON output modes.

## Glossary

- **Version_Command**: The `sce scene version` CLI command that reads, bumps, and writes the version in a scene-package.json file.
- **Scene_Package_File**: The `scene-package.json` file located in a scene package directory, containing a `metadata.version` field.
- **Bump_Type**: One of `major`, `minor`, or `patch`, indicating which semver component to increment.
- **Explicit_Version**: A user-supplied semver string (e.g. `2.0.0`) used to set the version directly instead of incrementing.
- **Bump_Specifier**: Either a Bump_Type or an Explicit_Version, provided via the `--bump` option.

## Requirements

### Requirement 1: Read and Parse Scene Package Version

**User Story:** As a developer, I want the version command to read the current version from scene-package.json, so that I can bump it accurately.

#### Acceptance Criteria

1. WHEN the Version_Command is invoked, THE Version_Command SHALL read the Scene_Package_File from the directory specified by the `--package` option.
2. WHEN the `--package` option is not provided, THE Version_Command SHALL default to the current working directory.
3. IF the Scene_Package_File does not exist in the specified directory, THEN THE Version_Command SHALL print an error message and set `process.exitCode` to 1.
4. IF the Scene_Package_File contains an invalid or missing `metadata.version` field, THEN THE Version_Command SHALL print an error message and set `process.exitCode` to 1.

### Requirement 2: Bump Version Using Semver

**User Story:** As a developer, I want to bump the version by major, minor, or patch, so that I can follow semver conventions without manual editing.

#### Acceptance Criteria

1. WHEN the Bump_Specifier is a Bump_Type (`major`, `minor`, or `patch`), THE Version_Command SHALL increment the corresponding semver component of the current version using the `semver` library.
2. WHEN the Bump_Specifier is an Explicit_Version, THE Version_Command SHALL validate the Explicit_Version as valid semver using the `semver` library.
3. IF the Bump_Specifier is an Explicit_Version that is not greater than the current version, THEN THE Version_Command SHALL print an error message and set `process.exitCode` to 1.
4. IF the Bump_Specifier is not a valid Bump_Type and not a valid semver string, THEN THE Version_Command SHALL print an error message and set `process.exitCode` to 1.
5. THE Version_Command SHALL require the `--bump` option to be provided.

### Requirement 3: Write Updated Version

**User Story:** As a developer, I want the bumped version to be written back to scene-package.json, so that the change is persisted.

#### Acceptance Criteria

1. WHEN the version bump is computed successfully, THE Version_Command SHALL write the updated Scene_Package_File back to disk with the new `metadata.version` value.
2. WHEN the `--dry-run` flag is provided, THE Version_Command SHALL compute the new version and display the result without writing to disk.
3. IF writing the Scene_Package_File fails, THEN THE Version_Command SHALL print an error message and set `process.exitCode` to 1.

### Requirement 4: Output

**User Story:** As a developer, I want to see the old and new version after bumping, so that I can confirm the change.

#### Acceptance Criteria

1. WHEN the version bump completes, THE Version_Command SHALL display a human-readable message showing the package name, old version, and new version.
2. WHEN the `--json` flag is provided, THE Version_Command SHALL output a structured JSON object containing `success`, `name`, `oldVersion`, `newVersion`, `packageDir`, and `dryRun` fields.
3. WHEN the `--dry-run` flag is active, THE Version_Command SHALL include a visual dry-run indicator in the output.

### Requirement 5: Command Pattern Compliance

**User Story:** As a maintainer, I want the version command to follow the established normalize → validate → run → print pattern, so that the codebase remains consistent.

#### Acceptance Criteria

1. THE Version_Command SHALL implement `normalizeSceneVersionOptions`, `validateSceneVersionOptions`, `runSceneVersionCommand`, and `printSceneVersionSummary` functions.
2. THE Version_Command SHALL accept a `dependencies` parameter for dependency injection of file system operations.
3. THE Version_Command SHALL use only modules already imported in `lib/commands/scene.js`.
