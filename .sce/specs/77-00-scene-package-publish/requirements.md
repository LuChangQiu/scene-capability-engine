# Requirements Document

## Introduction

This feature adds a `sce scene publish` command that packages scene template packages into distributable tarballs (.tgz) and publishes them to a local registry directory. It also adds a `sce scene unpublish` command to remove published versions. Together with the existing `scene instantiate` command, this completes the create → publish → instantiate lifecycle for scene packages.

## Glossary

- **Publisher**: The component responsible for validating, bundling, and writing scene packages to the Local_Registry
- **Local_Registry**: A directory structure at `.sce/registry/packages/` that stores published scene package tarballs and metadata, organized by package name and version
- **Registry_Index**: A JSON file (`registry-index.json`) at the Local_Registry root that contains metadata for all published packages and their versions
- **Scene_Package_Contract**: The `scene-package.json` file that declares package metadata, capabilities, parameters, and artifacts
- **Tarball**: A gzip-compressed tar archive (.tgz) containing all template files referenced by a scene package
- **Package_Coordinate**: A unique identifier composed of `{group}/{name}@{version}` derived from the Scene_Package_Contract metadata

## Requirements

### Requirement 1: Package Validation

**User Story:** As a developer, I want the publish command to validate my scene package before publishing, so that only well-formed packages enter the registry.

#### Acceptance Criteria

1. WHEN a publish command is invoked, THE Publisher SHALL validate the Scene_Package_Contract at the specified path using the existing `validateScenePackageContract` function
2. WHEN the Scene_Package_Contract validation fails, THE Publisher SHALL report all validation errors and abort the publish operation
3. WHEN a publish command is invoked, THE Publisher SHALL verify that every file referenced in `artifacts.generates` and `artifacts.entry_scene` exists relative to the package directory
4. IF a referenced template file does not exist, THEN THE Publisher SHALL report the missing file path and abort the publish operation
5. WHEN a publish command is invoked, THE Publisher SHALL validate that `metadata.version` conforms to semantic versioning format (major.minor.patch)

### Requirement 2: Package Bundling

**User Story:** As a developer, I want the publish command to bundle all template files into a single tarball, so that packages are portable and self-contained.

#### Acceptance Criteria

1. WHEN validation passes, THE Publisher SHALL collect the Scene_Package_Contract file and all files referenced in `artifacts.generates` and `artifacts.entry_scene` into a file list
2. WHEN the file list is assembled, THE Publisher SHALL create a gzip-compressed tar archive (.tgz) containing all collected files with their relative paths preserved
3. THE Publisher SHALL name the tarball using the pattern `{name}-{version}.tgz`
4. WHEN bundling completes, THE Publisher SHALL compute a SHA-256 integrity hash of the generated tarball

### Requirement 3: Local Registry Storage

**User Story:** As a developer, I want published packages stored in an organized directory structure, so that packages are easy to locate and manage.

#### Acceptance Criteria

1. WHEN a package is published, THE Publisher SHALL store the tarball at `{registry_root}/packages/{name}/{version}/{name}-{version}.tgz`
2. WHEN the target directory does not exist, THE Publisher SHALL create the necessary directory structure
3. WHEN a package version already exists in the Local_Registry and `--force` is not specified, THE Publisher SHALL report a duplicate version error and abort
4. WHEN `--force` is specified and a package version already exists, THE Publisher SHALL overwrite the existing tarball and update the Registry_Index entry

### Requirement 4: Registry Index Management

**User Story:** As a developer, I want a central index of all published packages, so that I can discover and query available packages and versions.

#### Acceptance Criteria

1. WHEN a package is published, THE Publisher SHALL update the Registry_Index file at `{registry_root}/registry-index.json`
2. THE Registry_Index SHALL contain for each package entry: name, group, description, latest version, and a list of all published versions with their publish timestamps and integrity hashes
3. WHEN the Registry_Index file does not exist, THE Publisher SHALL create a new Registry_Index with the published package as the first entry
4. WHEN a package version is unpublished, THE Publisher SHALL remove that version entry from the Registry_Index and update the latest version pointer
5. WHEN all versions of a package are removed, THE Publisher SHALL remove the package entry from the Registry_Index

### Requirement 5: Version Management

**User Story:** As a developer, I want the system to enforce semantic versioning and prevent accidental overwrites, so that version integrity is maintained.

#### Acceptance Criteria

1. WHEN a version string does not match the semantic versioning pattern (major.minor.patch with optional pre-release suffix), THE Publisher SHALL reject the publish operation with a descriptive error
2. WHEN listing versions for a package, THE Publisher SHALL return versions sorted in descending semantic version order
3. WHEN a package is published, THE Publisher SHALL set the `latest` pointer in the Registry_Index to the highest semantic version among all published versions of that package

### Requirement 6: CLI Command — scene publish

**User Story:** As a developer, I want a CLI command to publish scene packages, so that I can publish packages from the command line.

#### Acceptance Criteria

1. WHEN `sce scene publish --package <path>` is invoked, THE Publisher SHALL normalize and validate the provided options, then execute the publish pipeline (validate → bundle → store → update index)
2. WHEN `--registry <path>` is provided, THE Publisher SHALL use the specified path as the Local_Registry root instead of the default `.sce/registry/`
3. WHEN `--dry-run` is specified, THE Publisher SHALL perform validation and bundling simulation, display what would be published, and skip writing any files to the Local_Registry
4. WHEN `--force` is specified, THE Publisher SHALL overwrite an existing version in the Local_Registry
5. WHEN `--json` is specified, THE Publisher SHALL output the publish result as structured JSON to stdout
6. WHEN the publish operation succeeds, THE Publisher SHALL display a human-readable summary including the Package_Coordinate, tarball path, file count, and tarball size

### Requirement 7: CLI Command — scene unpublish

**User Story:** As a developer, I want to remove a published package version from the registry, so that I can clean up outdated or incorrect packages.

#### Acceptance Criteria

1. WHEN `sce scene unpublish --name <name> --version <version>` is invoked, THE Publisher SHALL remove the specified version tarball from the Local_Registry
2. WHEN the specified package name or version does not exist in the Local_Registry, THE Publisher SHALL report a not-found error and exit with a non-zero code
3. WHEN a version is successfully removed, THE Publisher SHALL update the Registry_Index to reflect the removal
4. WHEN `--json` is specified, THE Publisher SHALL output the unpublish result as structured JSON to stdout
5. WHEN the unpublish operation succeeds, THE Publisher SHALL display a human-readable summary including the removed Package_Coordinate and remaining version count

### Requirement 8: Dry-Run Mode

**User Story:** As a developer, I want to preview what a publish operation would do without making changes, so that I can verify correctness before committing.

#### Acceptance Criteria

1. WHEN `--dry-run` is specified, THE Publisher SHALL perform all validation steps identically to a normal publish
2. WHEN `--dry-run` is specified, THE Publisher SHALL compute the file list and estimated tarball contents without creating the actual archive
3. WHEN `--dry-run` is specified, THE Publisher SHALL display the Package_Coordinate, file list, and target registry path without writing any files
4. WHEN `--dry-run` is specified and validation fails, THE Publisher SHALL report errors identically to a normal publish

### Requirement 9: Registry Index Serialization

**User Story:** As a developer, I want the registry index to be reliably persisted and loaded, so that registry state is never corrupted.

#### Acceptance Criteria

1. THE Publisher SHALL serialize the Registry_Index as JSON with 2-space indentation
2. WHEN reading the Registry_Index, THE Publisher SHALL parse the JSON and validate that the structure contains a `packages` object
3. IF the Registry_Index file contains invalid JSON, THEN THE Publisher SHALL report a parse error and abort the operation
4. FOR ALL valid Registry_Index objects, serializing then deserializing SHALL produce an equivalent object (round-trip property)
