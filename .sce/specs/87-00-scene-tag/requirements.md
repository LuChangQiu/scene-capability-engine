# Requirements Document

## Introduction

This feature adds a `sce scene tag` subcommand group to manage distribution tags on scene packages in the local registry. Tags (like "latest", "stable", "beta", "experimental") are aliases that point to specific versions, similar to npm dist-tags. This allows users to install specific release channels without knowing exact version numbers. The command group provides three sub-subcommands: `add`, `rm`, and `ls`.

## Glossary

- **Tag_Command**: The `sce scene tag` CLI subcommand group containing sub-subcommands: add, rm, ls.
- **Registry_Index**: The `registry-index.json` file that stores metadata for all published packages and their versions.
- **Package_Entry**: A single package record within the Registry_Index, containing `versions`, `latest`, and optionally `tags`.
- **Tags_Object**: A plain object on the Package_Entry mapping tag names (strings) to version strings, e.g. `{ "stable": "1.1.0", "beta": "1.3.0-beta.1" }`.
- **Distribution_Tag**: A named alias (string key in the Tags_Object) that points to a specific published version of a package.

## Requirements

### Requirement 1: Add a Distribution Tag

**User Story:** As a registry maintainer, I want to point a tag to a specific version of a package, so that users can install release channels by name instead of exact version numbers.

#### Acceptance Criteria

1. WHEN the Tag_Command `add` is invoked with `--name`, `--tag`, and `--version`, THE Tag_Command SHALL set the specified Distribution_Tag to the provided version in the Tags_Object and persist the Registry_Index using `saveRegistryIndex`.
2. WHEN the Tag_Command `add` is invoked with a tag name that already exists, THE Tag_Command SHALL overwrite the existing tag value with the new version.
3. IF the specified package name does not exist in the Registry_Index, THEN THE Tag_Command SHALL report an error and set exit code to 1.
4. IF the specified version does not exist in the Package_Entry versions object, THEN THE Tag_Command SHALL report an error and set exit code to 1.
5. IF the tag name is "latest", THEN THE Tag_Command SHALL report an error indicating that the "latest" tag is managed automatically by publish and set exit code to 1.

### Requirement 2: Remove a Distribution Tag

**User Story:** As a registry maintainer, I want to remove a tag from a package, so that I can clean up obsolete or incorrect release channel aliases.

#### Acceptance Criteria

1. WHEN the Tag_Command `rm` is invoked with `--name` and `--tag`, THE Tag_Command SHALL remove the specified Distribution_Tag from the Tags_Object and persist the Registry_Index using `saveRegistryIndex`.
2. WHEN the specified tag does not exist in the Tags_Object, THE Tag_Command SHALL report an error indicating the tag was not found and set exit code to 1.
3. IF the specified package name does not exist in the Registry_Index, THEN THE Tag_Command SHALL report an error and set exit code to 1.
4. IF the tag name is "latest", THEN THE Tag_Command SHALL report an error indicating that the "latest" tag is managed automatically by publish and set exit code to 1.

### Requirement 3: List Distribution Tags

**User Story:** As a registry maintainer, I want to list all tags for a package, so that I can see which release channels are available and what versions they point to.

#### Acceptance Criteria

1. WHEN the Tag_Command `ls` is invoked with `--name`, THE Tag_Command SHALL display all Distribution_Tags from the Tags_Object along with the version each tag points to.
2. WHEN the Tag_Command `ls` is invoked and the Tags_Object is empty or absent, THE Tag_Command SHALL display a message indicating no tags are set for the package.
3. WHEN the Tag_Command `ls` is invoked, THE Tag_Command SHALL also display the `latest` field value from the Package_Entry alongside the tags.
4. IF the specified package name does not exist in the Registry_Index, THEN THE Tag_Command SHALL report an error and set exit code to 1.

### Requirement 4: CLI Options and Output

**User Story:** As a developer, I want flexible output options, so that I can integrate tag management into scripts and CI pipelines.

#### Acceptance Criteria

1. THE Tag_Command SHALL accept `--registry <dir>` to specify a custom registry directory, defaulting to `.sce/registry`.
2. THE Tag_Command SHALL accept `--json` to output the result as structured JSON.
3. WHEN the `--json` flag is provided, THE Tag_Command SHALL output a JSON payload containing the action performed, package name, and relevant tag information.
4. THE Tag_Command SHALL display human-readable formatted output by default.

### Requirement 5: Command Pattern Compliance

**User Story:** As a maintainer, I want the command to follow existing patterns, so that the codebase remains consistent.

#### Acceptance Criteria

1. THE Tag_Command SHALL implement normalize, validate, run, and print functions following the established pattern.
2. THE Tag_Command SHALL use a single `runSceneTagCommand` dispatcher with an `action` field to route to add, rm, and ls logic.
3. THE Tag_Command SHALL accept a `dependencies` parameter for dependency injection in the run function.
4. THE Tag_Command SHALL reuse existing `loadRegistryIndex` and `saveRegistryIndex` helpers.
5. THE Tag_Command SHALL be registered as a `scene tag` subcommand group within `registerSceneCommands`.
6. THE Tag_Command SHALL export all new functions in `module.exports`.
