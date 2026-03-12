# Requirements Document

## Introduction

This feature adds two read-only query commands to the sce CLI for browsing the local scene package registry: `sce scene list` (list all packages) and `sce scene search --query <term>` (search packages by name, description, or group). Both commands reuse the existing `loadRegistryIndex` function and follow the established normalize → validate → run → print pattern.

## Glossary

- **Registry_Index**: The `registry-index.json` file containing metadata for all published scene packages in a local registry directory.
- **Package_Entry**: A single package record inside the Registry_Index, containing name, group, description, latest version, and a map of version records.
- **List_Command**: The `sce scene list` CLI command that displays all packages in the Registry_Index.
- **Search_Command**: The `sce scene search --query <term>` CLI command that filters packages by a search term.
- **Search_Term**: A user-supplied string used for case-insensitive substring matching against package name, description, and group fields.

## Requirements

### Requirement 1: List All Packages

**User Story:** As a developer, I want to list all packages in the local registry, so that I can see what scene packages are available.

#### Acceptance Criteria

1. WHEN the List_Command is invoked, THE List_Command SHALL load the Registry_Index from the resolved registry directory using `loadRegistryIndex`.
2. WHEN the Registry_Index contains one or more Package_Entry records, THE List_Command SHALL display each Package_Entry showing name, latest version, version count, and description in a human-readable table format.
3. WHEN the Registry_Index contains zero Package_Entry records, THE List_Command SHALL display the message "No packages found".
4. WHEN the `--json` flag is provided, THE List_Command SHALL output the result payload as formatted JSON instead of the human-readable table.
5. WHEN the `--registry <dir>` option is provided, THE List_Command SHALL use the specified directory as the registry root instead of the default `.sce/registry`.

### Requirement 2: Search Packages

**User Story:** As a developer, I want to search packages by keyword, so that I can quickly find scene packages matching my needs.

#### Acceptance Criteria

1. WHEN the Search_Command is invoked with a Search_Term, THE Search_Command SHALL load the Registry_Index from the resolved registry directory using `loadRegistryIndex`.
2. WHEN a Package_Entry name contains the Search_Term as a case-insensitive substring, THE Search_Command SHALL include that Package_Entry in the results.
3. WHEN a Package_Entry description contains the Search_Term as a case-insensitive substring, THE Search_Command SHALL include that Package_Entry in the results.
4. WHEN a Package_Entry group contains the Search_Term as a case-insensitive substring, THE Search_Command SHALL include that Package_Entry in the results.
5. WHEN no Package_Entry matches the Search_Term, THE Search_Command SHALL display the message "No packages matching '<term>'" where `<term>` is the actual Search_Term provided.
6. WHEN the Search_Term is empty or not provided, THE Search_Command SHALL return all Package_Entry records (equivalent to the List_Command).
7. WHEN the `--json` flag is provided, THE Search_Command SHALL output the result payload as formatted JSON instead of the human-readable table.
8. WHEN the `--registry <dir>` option is provided, THE Search_Command SHALL use the specified directory as the registry root instead of the default `.sce/registry`.

### Requirement 3: Command Pattern Compliance

**User Story:** As a maintainer, I want the new commands to follow the established normalize → validate → run → print pattern, so that the codebase remains consistent.

#### Acceptance Criteria

1. THE List_Command SHALL implement `normalizeSceneListOptions`, `validateSceneListOptions`, `runSceneListCommand`, and `printSceneListSummary` functions.
2. THE Search_Command SHALL implement `normalizeSceneSearchOptions`, `validateSceneSearchOptions`, `runSceneSearchCommand`, and `printSceneSearchSummary` functions.
3. THE List_Command and Search_Command SHALL accept a `dependencies` parameter for dependency injection of file system operations.
4. IF `loadRegistryIndex` throws an error, THEN THE List_Command and Search_Command SHALL print an error message and set `process.exitCode` to 1.

### Requirement 4: No New Dependencies

**User Story:** As a maintainer, I want the implementation to use only existing project dependencies, so that the package footprint remains unchanged.

#### Acceptance Criteria

1. THE List_Command and Search_Command SHALL use only modules already imported in `lib/commands/scene.js`.
