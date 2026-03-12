# Requirements Document

## Introduction

This feature adds a `sce scene install` command that installs a published scene package from the local registry into a target project directory. It is the consumption counterpart to the existing `scene publish` / `scene unpublish` commands (Spec 77), completing the publish → install lifecycle for scene packages. The command resolves a package by name and version from the registry, verifies tarball integrity via SHA-256, extracts contents to a target directory, and writes an install manifest recording what was installed.

## Glossary

- **Installer**: The component responsible for resolving, verifying, extracting, and recording scene package installations from the Local_Registry
- **Local_Registry**: A directory structure at `.sce/registry/packages/` that stores published scene package tarballs and metadata, organized by package name and version
- **Registry_Index**: A JSON file (`registry-index.json`) at the Local_Registry root that contains metadata for all published packages and their versions
- **Install_Manifest**: A JSON file (`scene-install-manifest.json`) written to the target directory after a successful installation, recording package name, version, timestamp, registry path, integrity hash, and list of extracted files
- **Tarball**: A gzip-compressed tar archive (.tgz) containing all template files for a scene package
- **Package_Coordinate**: A unique identifier composed of `sce.scene/{name}@{version}`

## Requirements

### Requirement 1: Package Resolution

**User Story:** As a developer, I want to install a scene package by name and version from the local registry, so that I can consume published scene packages in my project.

#### Acceptance Criteria

1. WHEN `--name <packageName>` and `--version <exactVersion>` are provided, THE Installer SHALL locate the package entry and version in the Registry_Index
2. WHEN `--version latest` is provided or `--version` is omitted, THE Installer SHALL resolve the latest published version using the `latest` pointer in the Registry_Index
3. WHEN the specified package name does not exist in the Registry_Index, THE Installer SHALL report a not-found error including the package name and exit with a non-zero code
4. WHEN the specified version does not exist for the package, THE Installer SHALL report a version-not-found error including the package name and requested version and exit with a non-zero code

### Requirement 2: Integrity Verification

**User Story:** As a developer, I want the install command to verify tarball integrity before extraction, so that I can trust that the installed files have not been corrupted.

#### Acceptance Criteria

1. WHEN a tarball is located in the Local_Registry, THE Installer SHALL read the expected SHA-256 integrity hash from the Registry_Index version entry
2. WHEN a tarball is read from disk, THE Installer SHALL compute the SHA-256 hash of the tarball file contents
3. WHEN the computed hash matches the expected hash from the Registry_Index, THE Installer SHALL proceed with extraction
4. IF the computed hash does not match the expected hash, THEN THE Installer SHALL report an integrity verification failure including both hashes and abort the installation

### Requirement 3: Tarball Extraction

**User Story:** As a developer, I want the install command to extract package contents to a target directory, so that I can use the installed scene files in my project.

#### Acceptance Criteria

1. WHEN integrity verification passes, THE Installer SHALL decompress the gzip tarball and extract all files to the target directory preserving relative paths
2. WHEN the target directory does not exist, THE Installer SHALL create the necessary directory structure
3. WHEN the target directory already contains files and `--force` is not specified, THE Installer SHALL report a conflict error and abort the installation
4. WHEN `--force` is specified and the target directory already contains files, THE Installer SHALL overwrite existing files during extraction
5. WHEN extraction completes, THE Installer SHALL return the list of all extracted file relative paths

### Requirement 4: Install Manifest

**User Story:** As a developer, I want an install manifest written after installation, so that I can track what was installed and verify the installation later.

#### Acceptance Criteria

1. WHEN extraction completes successfully, THE Installer SHALL write a `scene-install-manifest.json` file in the target directory
2. THE Install_Manifest SHALL contain the following fields: packageName, version, installedAt (ISO 8601 timestamp), registryDir, integrity (SHA-256 hash string), and files (array of extracted relative file paths)
3. WHEN `--force` is specified and an Install_Manifest already exists, THE Installer SHALL overwrite the existing manifest
4. FOR ALL valid Install_Manifest objects, serializing then deserializing SHALL produce an equivalent object (round-trip property)

### Requirement 5: Target Directory Resolution

**User Story:** As a developer, I want to control where packages are installed, so that I can organize installed scene packages in my project structure.

#### Acceptance Criteria

1. WHEN `--out <dir>` is provided, THE Installer SHALL use the specified path as the target directory
2. WHEN `--out` is omitted, THE Installer SHALL use `{currentDirectory}/{packageName}` as the default target directory
3. WHEN the `--out` path is relative, THE Installer SHALL resolve the path relative to the project root

### Requirement 6: CLI Command — scene install

**User Story:** As a developer, I want a CLI command to install scene packages, so that I can install packages from the command line.

#### Acceptance Criteria

1. WHEN `sce scene install --name <packageName>` is invoked, THE Installer SHALL normalize and validate the provided options, then execute the install pipeline (resolve → verify → extract → write manifest)
2. WHEN `--registry <path>` is provided, THE Installer SHALL use the specified path as the Local_Registry root instead of the default `.sce/registry`
3. WHEN `--force` is specified, THE Installer SHALL overwrite an existing installation in the target directory
4. WHEN `--json` is specified, THE Installer SHALL output the install result as structured JSON to stdout
5. WHEN the install operation succeeds, THE Installer SHALL display a human-readable summary including the Package_Coordinate, target directory, file count, and integrity hash
6. WHEN the install operation fails, THE Installer SHALL display a descriptive error message and exit with a non-zero code

### Requirement 7: Dry-Run Mode

**User Story:** As a developer, I want to preview what an install operation would do without making changes, so that I can verify the package contents before installing.

#### Acceptance Criteria

1. WHEN `--dry-run` is specified, THE Installer SHALL perform package resolution and integrity verification identically to a normal install
2. WHEN `--dry-run` is specified, THE Installer SHALL list the files that would be extracted without writing any files to disk
3. WHEN `--dry-run` is specified, THE Installer SHALL display the Package_Coordinate, target directory, and file list without creating the target directory or writing the Install_Manifest
4. WHEN `--dry-run` is specified and resolution or verification fails, THE Installer SHALL report errors identically to a normal install

### Requirement 8: Command Pattern Compliance

**User Story:** As a maintainer, I want the install command to follow the established normalize → validate → run → print pattern, so that the codebase remains consistent and maintainable.

#### Acceptance Criteria

1. THE Installer SHALL implement `normalizeSceneInstallOptions` to normalize raw CLI options with default values
2. THE Installer SHALL implement `validateSceneInstallOptions` to validate normalized options and return an error string or null
3. THE Installer SHALL implement `runSceneInstallCommand` as the main command runner accepting raw options and a dependencies object for dependency injection
4. THE Installer SHALL implement `printSceneInstallSummary` to format and display the install result in human-readable or JSON format
5. WHEN dependency injection is used, THE Installer SHALL accept `fileSystem` and `projectRoot` through the dependencies object, consistent with existing scene commands
