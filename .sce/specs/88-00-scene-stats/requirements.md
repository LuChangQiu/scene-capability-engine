# Requirements Document

## Introduction

This feature adds a `sce scene stats` subcommand that displays aggregate statistics about the local scene package registry. The command reads `registry-index.json` and computes a dashboard of metrics including total packages, total versions, total tags, ownership coverage, deprecation count, and most recently published package. Follows the normalize → validate → run → print pattern. All code in `lib/commands/scene.js`. No new dependencies.

## Glossary

- **Stats_Command**: The `sce scene stats` CLI subcommand that computes and displays registry statistics.
- **Registry_Index**: The `registry-index.json` file that stores metadata for all published packages and their versions.
- **Package_Entry**: A single package record within the Registry_Index, containing `versions`, `latest`, and optionally `owner`, `tags`, `deprecated`.
- **Stats_Payload**: The structured result object containing all computed statistics returned by the run function.

## Requirements

### Requirement 1: Package Count

**User Story:** As a registry maintainer, I want to see the total number of packages in the registry, so that I can understand the size of the registry.

#### Acceptance Criteria

1. WHEN the Stats_Command is invoked, THE Stats_Command SHALL compute and display the total number of Package_Entries in the Registry_Index.
2. WHEN the Registry_Index contains no packages, THE Stats_Command SHALL display a total package count of zero.

### Requirement 2: Version Count

**User Story:** As a registry maintainer, I want to see the total number of versions across all packages, so that I can understand the volume of published releases.

#### Acceptance Criteria

1. WHEN the Stats_Command is invoked, THE Stats_Command SHALL compute and display the total number of versions across all Package_Entries by summing the count of keys in each Package_Entry's `versions` object.

### Requirement 3: Tag Count

**User Story:** As a registry maintainer, I want to see the total number of distribution tags across all packages, so that I can understand how many release channels are in use.

#### Acceptance Criteria

1. WHEN the Stats_Command is invoked, THE Stats_Command SHALL compute and display the total number of tags across all Package_Entries by summing the count of keys in each Package_Entry's `tags` object.
2. WHEN a Package_Entry has no `tags` object, THE Stats_Command SHALL treat the tag count for that package as zero.

### Requirement 4: Ownership Statistics

**User Story:** As a registry maintainer, I want to see how many packages have owners versus those without, so that I can identify unowned packages that need attention.

#### Acceptance Criteria

1. WHEN the Stats_Command is invoked, THE Stats_Command SHALL compute and display the count of Package_Entries that have a non-empty `owner` field (packages with owners).
2. WHEN the Stats_Command is invoked, THE Stats_Command SHALL compute and display the count of Package_Entries that have no `owner` field or an empty `owner` field (packages without owners).
3. THE Stats_Command SHALL ensure that the sum of packages with owners and packages without owners equals the total package count.

### Requirement 5: Most Recently Published Package

**User Story:** As a registry maintainer, I want to see which package was most recently published, so that I can track recent activity in the registry.

#### Acceptance Criteria

1. WHEN the Stats_Command is invoked, THE Stats_Command SHALL identify the package with the most recent `published_at` timestamp across all versions of all packages and display the package name, version, and timestamp.
2. WHEN the Registry_Index contains no packages, THE Stats_Command SHALL display no most-recently-published information.

### Requirement 6: Deprecated Packages Count

**User Story:** As a registry maintainer, I want to see how many packages are deprecated, so that I can understand the health of the registry.

#### Acceptance Criteria

1. WHEN the Stats_Command is invoked, THE Stats_Command SHALL compute and display the count of Package_Entries that have a truthy `deprecated` field.

### Requirement 7: CLI Options and Output

**User Story:** As a developer, I want flexible output options, so that I can integrate registry statistics into scripts and CI pipelines.

#### Acceptance Criteria

1. THE Stats_Command SHALL accept `--registry <dir>` to specify a custom registry directory, defaulting to `.sce/registry`.
2. THE Stats_Command SHALL accept `--json` to output the result as structured JSON.
3. WHEN the `--json` flag is provided, THE Stats_Command SHALL output a JSON Stats_Payload containing all computed statistics.
4. THE Stats_Command SHALL display human-readable formatted output by default using chalk for colored output.

### Requirement 8: Error Handling

**User Story:** As a developer, I want clear error messages when the registry is unavailable, so that I can diagnose issues.

#### Acceptance Criteria

1. IF the Registry_Index file does not exist or cannot be read, THEN THE Stats_Command SHALL report an error and set exit code to 1.
2. WHEN the Registry_Index exists but contains no packages, THE Stats_Command SHALL display statistics with all counts as zero and no most-recently-published information.

### Requirement 9: Command Pattern Compliance

**User Story:** As a maintainer, I want the command to follow existing patterns, so that the codebase remains consistent.

#### Acceptance Criteria

1. THE Stats_Command SHALL implement `normalizeSceneStatsOptions`, `validateSceneStatsOptions`, `runSceneStatsCommand`, and `printSceneStatsSummary` functions.
2. THE Stats_Command SHALL accept a `dependencies` parameter for dependency injection in the run function.
3. THE Stats_Command SHALL reuse the existing `loadRegistryIndex` helper.
4. THE Stats_Command SHALL be registered as a `scene stats` subcommand within `registerSceneCommands`.
5. THE Stats_Command SHALL export all four functions in `module.exports`.
