# Requirements Document

## Introduction

This feature adds a `sce scene lock` subcommand group to manage version locking on scene packages in the local registry. Locking a specific version prevents accidental unpublish or overwrite of that version. The command group provides three sub-subcommands: `set` (lock a version), `rm` (unlock a version), and `ls` (list locked versions for a package). Lock state is tracked via a `locked: true` flag on individual version entries in `registry-index.json`.

## Glossary

- **Lock_Command**: The `sce scene lock` CLI subcommand group containing sub-subcommands: set, rm, ls.
- **Registry_Index**: The `registry-index.json` file that stores metadata for all published packages and their versions.
- **Package_Entry**: A single package record within the Registry_Index, containing `versions`, `latest`, and other metadata.
- **Version_Entry**: A single version record within a Package_Entry's `versions` object, containing `published_at`, `integrity`, `tarball`, and optionally `locked`.
- **Locked_Flag**: A boolean field (`locked: true`) on a Version_Entry indicating that the version is protected from unpublish or overwrite.

## Requirements

### Requirement 1: Lock a Specific Version

**User Story:** As a registry maintainer, I want to lock a specific version of a package, so that it cannot be accidentally unpublished or overwritten.

#### Acceptance Criteria

1. WHEN the Lock_Command `set` is invoked with `--name` and `--version`, THE Lock_Command SHALL set `locked: true` on the specified Version_Entry and persist the Registry_Index using `saveRegistryIndex`.
2. IF the specified package name does not exist in the Registry_Index, THEN THE Lock_Command SHALL report an error and set exit code to 1.
3. IF the specified version does not exist in the Package_Entry versions object, THEN THE Lock_Command SHALL report an error and set exit code to 1.
4. IF the specified Version_Entry already has `locked: true`, THEN THE Lock_Command SHALL report an error indicating the version is already locked and set exit code to 1.

### Requirement 2: Unlock a Specific Version

**User Story:** As a registry maintainer, I want to unlock a previously locked version, so that I can allow unpublish or overwrite when needed.

#### Acceptance Criteria

1. WHEN the Lock_Command `rm` is invoked with `--name` and `--version`, THE Lock_Command SHALL remove the Locked_Flag from the specified Version_Entry and persist the Registry_Index using `saveRegistryIndex`.
2. IF the specified package name does not exist in the Registry_Index, THEN THE Lock_Command SHALL report an error and set exit code to 1.
3. IF the specified version does not exist in the Package_Entry versions object, THEN THE Lock_Command SHALL report an error and set exit code to 1.
4. IF the specified Version_Entry does not have `locked: true`, THEN THE Lock_Command SHALL report an error indicating the version is not locked and set exit code to 1.

### Requirement 3: List Locked Versions

**User Story:** As a registry maintainer, I want to list all locked versions for a package, so that I can see which versions are protected.

#### Acceptance Criteria

1. WHEN the Lock_Command `ls` is invoked with `--name`, THE Lock_Command SHALL display all Version_Entries that have `locked: true`, showing the version string for each.
2. WHEN the Lock_Command `ls` is invoked and no versions are locked, THE Lock_Command SHALL display a message indicating no locked versions exist for the package.
3. IF the specified package name does not exist in the Registry_Index, THEN THE Lock_Command SHALL report an error and set exit code to 1.

### Requirement 4: CLI Options and Output

**User Story:** As a developer, I want flexible output options, so that I can integrate lock management into scripts and CI pipelines.

#### Acceptance Criteria

1. THE Lock_Command SHALL accept `--registry <dir>` to specify a custom registry directory, defaulting to `.sce/registry`.
2. THE Lock_Command SHALL accept `--json` to output the result as structured JSON.
3. WHEN the `--json` flag is provided, THE Lock_Command SHALL output a JSON payload containing the action performed, package name, and relevant lock information.
4. THE Lock_Command SHALL display human-readable formatted output by default.

### Requirement 5: Command Pattern Compliance

**User Story:** As a maintainer, I want the command to follow existing patterns, so that the codebase remains consistent.

#### Acceptance Criteria

1. THE Lock_Command SHALL implement `normalizeSceneLockOptions`, `validateSceneLockOptions`, `runSceneLockCommand`, and `printSceneLockSummary` functions following the established pattern.
2. THE Lock_Command SHALL use a single `runSceneLockCommand` dispatcher with an `action` field to route to set, rm, and ls logic.
3. THE Lock_Command SHALL accept a `dependencies` parameter for dependency injection in the run function.
4. THE Lock_Command SHALL reuse existing `loadRegistryIndex` and `saveRegistryIndex` helpers.
5. THE Lock_Command SHALL be registered as a `scene lock` subcommand group within `registerSceneCommands`.
6. THE Lock_Command SHALL export all four functions in `module.exports`.
