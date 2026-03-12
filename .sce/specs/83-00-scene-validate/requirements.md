# Requirements Document

## Introduction

This feature adds a `sce scene validate` subcommand that performs comprehensive validation of a scene package directory. It checks that `scene-package.json` exists with required fields, validates semver compliance, verifies referenced files exist on disk, validates template variable schemas, and checks inheritance references. All validation errors are collected and reported together rather than failing on the first error.

## Glossary

- **Validate_Command**: The `sce scene validate` CLI subcommand for comprehensive package directory validation.
- **Package_Directory**: A directory containing a `scene-package.json` file and its referenced assets.
- **Validation_Report**: The structured output containing all errors and warnings found during validation.

## Requirements

### Requirement 1: Manifest Existence and Required Fields

**User Story:** As a package author, I want to validate that my scene-package.json exists and contains all required fields, so that I can catch metadata issues before publishing.

#### Acceptance Criteria

1. WHEN the Validate_Command is invoked, THE Validate_Command SHALL check that `scene-package.json` exists in the Package_Directory.
2. IF `scene-package.json` does not exist in the Package_Directory, THEN THE Validate_Command SHALL report an error and set exit code to 1.
3. WHEN `scene-package.json` exists, THE Validate_Command SHALL validate that the required fields `name`, `version`, and `description` are present and non-empty in the metadata section.
4. WHEN `scene-package.json` exists, THE Validate_Command SHALL delegate contract-level validation to the existing `validateScenePackageContract` function.

### Requirement 2: Semver Validation

**User Story:** As a package author, I want the version field validated against semver, so that I can ensure version consistency across the registry.

#### Acceptance Criteria

1. WHEN `metadata.version` is present, THE Validate_Command SHALL validate it as a valid semantic version using the existing `semver` library.
2. IF `metadata.version` is not valid semver, THEN THE Validate_Command SHALL report a descriptive error including the invalid value.

### Requirement 3: Referenced File Existence

**User Story:** As a package author, I want to verify that all files referenced in the package contract exist on disk, so that I can avoid broken packages.

#### Acceptance Criteria

1. WHEN `artifacts.entry_scene` is specified, THE Validate_Command SHALL verify the file exists relative to the Package_Directory.
2. WHEN `artifacts.generates` contains file paths, THE Validate_Command SHALL verify each file exists relative to the Package_Directory.
3. IF a referenced file does not exist, THEN THE Validate_Command SHALL report an error identifying the missing file path.

### Requirement 4: Template Variable Schema Validation

**User Story:** As a package author, I want template variable schemas validated, so that consumers can instantiate my package without errors.

#### Acceptance Criteria

1. WHEN the package contract contains a `parameters` array, THE Validate_Command SHALL validate each parameter entry for required fields (`id`, `type`).
2. WHEN the package contract contains template `variables`, THE Validate_Command SHALL delegate to the existing `validateTemplateVariableSchema` function.
3. IF variable schema validation produces errors, THEN THE Validate_Command SHALL include those errors in the Validation_Report.

### Requirement 5: Comprehensive Error Reporting

**User Story:** As a package author, I want all validation errors reported at once, so that I can fix everything in a single pass.

#### Acceptance Criteria

1. THE Validate_Command SHALL collect all errors and warnings during validation rather than stopping at the first error.
2. THE Validate_Command SHALL report errors and warnings separately in the Validation_Report.
3. WHEN validation completes with zero errors, THE Validate_Command SHALL return exit code 0.
4. WHEN validation completes with one or more errors, THE Validate_Command SHALL return exit code 1.

### Requirement 6: CLI Options and Output Modes

**User Story:** As a developer, I want flexible input and output options, so that I can integrate validation into scripts and CI pipelines.

#### Acceptance Criteria

1. THE Validate_Command SHALL accept `--package <dir>` to specify the Package_Directory, defaulting to the current working directory.
2. WHEN the `--json` flag is provided, THE Validate_Command SHALL output the Validation_Report as structured JSON.
3. WHEN the `--strict` flag is provided, THE Validate_Command SHALL treat warnings as errors, causing exit code 1 when warnings are present.
4. THE Validate_Command SHALL display human-readable formatted output by default.

### Requirement 7: Command Pattern Compliance

**User Story:** As a maintainer, I want the command to follow existing patterns, so that the codebase remains consistent.

#### Acceptance Criteria

1. THE Validate_Command SHALL implement `normalizeSceneValidatePackageOptions`, `validateSceneValidatePackageOptions`, `runSceneValidatePackageCommand`, and `printSceneValidatePackageSummary` functions.
2. THE Validate_Command SHALL accept a `dependencies` parameter for dependency injection in the run function.
3. THE Validate_Command SHALL reuse existing helpers: `validateScenePackageContract`, `validateTemplateVariableSchema`, and `semver.valid`.
4. THE Validate_Command SHALL be registered as a subcommand within `registerSceneCommands`.
