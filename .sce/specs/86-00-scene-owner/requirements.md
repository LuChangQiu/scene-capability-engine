# Requirements Document

## Introduction

This feature adds a `sce scene owner` subcommand group to manage package ownership metadata in the local scene package registry. The command allows registry maintainers to set, show, list, and transfer ownership of packages by reading and writing an `owner` string field on package entries in `registry-index.json`. Ownership is tracked at the package level (not per-version).

## Glossary

- **Owner_Command**: The `sce scene owner` CLI subcommand group containing sub-subcommands: set, show, list, transfer.
- **Registry_Index**: The `registry-index.json` file that stores metadata for all published packages and their versions.
- **Package_Entry**: A single package record within the Registry_Index, containing `versions` and optionally `owner`.
- **Owner_Field**: A string field on the Package_Entry representing the current owner/maintainer of the package.

## Requirements

### Requirement 1: Set Package Owner

**User Story:** As a registry maintainer, I want to set the owner of a package, so that I can track who is responsible for maintaining each package.

#### Acceptance Criteria

1. WHEN the Owner_Command `set` is invoked with `--name` and `--owner`, THE Owner_Command SHALL set the Owner_Field on the specified Package_Entry to the provided owner string and persist the Registry_Index using `saveRegistryIndex`.
2. WHEN the Owner_Command `set` is invoked with `--name` and `--owner ""`, THE Owner_Command SHALL remove the Owner_Field from the specified Package_Entry and persist the Registry_Index.
3. WHEN the Owner_Command `set` is invoked with `--name` and `--remove`, THE Owner_Command SHALL remove the Owner_Field from the specified Package_Entry and persist the Registry_Index.
4. IF the specified package name does not exist in the Registry_Index, THEN THE Owner_Command SHALL report an error and set exit code to 1.

### Requirement 2: Show Package Owner

**User Story:** As a registry maintainer, I want to view the current owner of a package, so that I can identify who is responsible for it.

#### Acceptance Criteria

1. WHEN the Owner_Command `show` is invoked with `--name`, THE Owner_Command SHALL display the current Owner_Field value for the specified Package_Entry.
2. WHEN the specified Package_Entry has no Owner_Field, THE Owner_Command SHALL display a message indicating no owner is set.
3. IF the specified package name does not exist in the Registry_Index, THEN THE Owner_Command SHALL report an error and set exit code to 1.

### Requirement 3: List Packages by Owner

**User Story:** As a registry maintainer, I want to list all packages owned by a specific person, so that I can see the scope of their responsibilities.

#### Acceptance Criteria

1. WHEN the Owner_Command `list` is invoked with `--owner`, THE Owner_Command SHALL return all Package_Entries whose Owner_Field matches the provided owner string (case-insensitive comparison).
2. WHEN no packages match the provided owner, THE Owner_Command SHALL display a message indicating no packages found for that owner.

### Requirement 4: Transfer Package Ownership

**User Story:** As a registry maintainer, I want to transfer ownership of a package from one person to another, so that I can manage maintainer transitions.

#### Acceptance Criteria

1. WHEN the Owner_Command `transfer` is invoked with `--name`, `--from`, and `--to`, THE Owner_Command SHALL verify that the current Owner_Field matches the `--from` value (case-insensitive), update the Owner_Field to the `--to` value, and persist the Registry_Index.
2. IF the current Owner_Field does not match the `--from` value, THEN THE Owner_Command SHALL report an error indicating ownership mismatch and set exit code to 1.
3. IF the specified package name does not exist in the Registry_Index, THEN THE Owner_Command SHALL report an error and set exit code to 1.
4. IF the specified Package_Entry has no Owner_Field and `--from` is provided, THEN THE Owner_Command SHALL report an error indicating no current owner is set and set exit code to 1.

### Requirement 5: CLI Options and Output

**User Story:** As a developer, I want flexible output options, so that I can integrate ownership management into scripts and CI pipelines.

#### Acceptance Criteria

1. THE Owner_Command SHALL accept `--registry <dir>` to specify a custom registry directory, defaulting to `.sce/registry`.
2. THE Owner_Command SHALL accept `--json` to output the result as structured JSON.
3. WHEN the `--json` flag is provided, THE Owner_Command SHALL output a JSON payload containing the action performed, package name, and relevant owner information.
4. THE Owner_Command SHALL display human-readable formatted output by default.

### Requirement 6: Command Pattern Compliance

**User Story:** As a maintainer, I want the command to follow existing patterns, so that the codebase remains consistent.

#### Acceptance Criteria

1. THE Owner_Command SHALL implement normalize, validate, run, and print functions for each sub-subcommand (set, show, list, transfer).
2. THE Owner_Command SHALL accept a `dependencies` parameter for dependency injection in run functions.
3. THE Owner_Command SHALL reuse existing `loadRegistryIndex` and `saveRegistryIndex` helpers.
4. THE Owner_Command SHALL be registered as a `scene owner` subcommand group within `registerSceneCommands`.
5. THE Owner_Command SHALL export all new functions in `module.exports`.
