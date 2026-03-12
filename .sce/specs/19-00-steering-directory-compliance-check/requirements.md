# Requirements Document

## Introduction

This feature adds a mandatory compliance check for the `.sce/steering/` directory that runs before any sce command execution. The steering directory is automatically loaded in every AI session, making it critical to prevent context pollution and excessive token consumption. This check ensures only approved files exist in the directory and no subdirectories are present.

## Glossary

- **Steering_Directory**: The `.sce/steering/` directory containing AI behavior rules and context
- **Compliance_Check**: Validation process that verifies steering directory contents
- **Allowed_Files**: The four permitted files: CORE_PRINCIPLES.md, ENVIRONMENT.md, CURRENT_CONTEXT.md, RULES_GUIDE.md
- **Version_Cache**: Mechanism to track last successful check per sce version
- **Command_Execution**: Any sce CLI command invocation
- **Non_Compliant_State**: Steering directory containing disallowed files or subdirectories

## Requirements

### Requirement 1: Pre-Command Compliance Check

**User Story:** As a sce user, I want the system to validate steering directory compliance before executing any command, so that I never accidentally pollute the AI context with unwanted files.

#### Acceptance Criteria

1. WHEN any sce command is invoked, THE System SHALL perform a steering directory compliance check before executing the command
2. WHEN the compliance check passes, THE System SHALL proceed with normal command execution
3. WHEN the compliance check fails, THE System SHALL block command execution and display error details
4. THE System SHALL complete the compliance check within 50ms to avoid noticeable delay
5. WHEN the steering directory does not exist, THE System SHALL treat this as compliant and proceed

### Requirement 2: File Allowlist Validation

**User Story:** As a system administrator, I want only specific files allowed in the steering directory, so that the AI context remains focused and efficient.

#### Acceptance Criteria

1. THE System SHALL allow exactly these files in the steering directory: CORE_PRINCIPLES.md, ENVIRONMENT.md, CURRENT_CONTEXT.md, RULES_GUIDE.md
2. WHEN any other file is present in the steering directory, THE System SHALL report it as a compliance violation
3. WHEN a file has a different case (e.g., core_principles.md), THE System SHALL report it as a compliance violation
4. WHEN hidden files (starting with .) are present, THE System SHALL report them as compliance violations
5. THE System SHALL ignore file permissions and focus only on file names

### Requirement 3: Subdirectory Prohibition

**User Story:** As a sce user, I want subdirectories prohibited in the steering directory, so that the directory structure remains flat and manageable.

#### Acceptance Criteria

1. WHEN any subdirectory exists in the steering directory, THE System SHALL report it as a compliance violation
2. WHEN reporting subdirectory violations, THE System SHALL list all subdirectory names found
3. THE System SHALL detect subdirectories regardless of their names or contents
4. WHEN both disallowed files and subdirectories exist, THE System SHALL report both violation types

### Requirement 4: Version-Based Check Caching

**User Story:** As a sce user, I want the compliance check to run only once per sce version, so that I don't experience repeated checks on every command.

#### Acceptance Criteria

1. WHEN a compliance check passes, THE System SHALL record the current sce version in a cache file
2. WHEN a command runs and the cached version matches the current version, THE System SHALL skip the compliance check
3. WHEN the sce version changes, THE System SHALL invalidate the cache and perform a new compliance check
4. THE System SHALL store the version cache in the user's home directory at `~/.sce/steering-check-cache.json`
5. WHEN the cache file is corrupted or unreadable, THE System SHALL perform a full compliance check

### Requirement 5: Clear Error Reporting

**User Story:** As a sce user, I want clear error messages when compliance fails, so that I know exactly what to fix.

#### Acceptance Criteria

1. WHEN disallowed files are detected, THE System SHALL list each file name in the error message
2. WHEN subdirectories are detected, THE System SHALL list each subdirectory name in the error message
3. THE System SHALL provide actionable fix suggestions in the error message
4. THE System SHALL suggest moving disallowed content to appropriate locations (e.g., `.sce/specs/` or `docs/`)
5. THE System SHALL format error messages for readability with clear sections and bullet points

### Requirement 6: Developer Bypass Mechanism

**User Story:** As a sce developer, I want to bypass the compliance check during development and testing, so that I can test non-compliant scenarios.

#### Acceptance Criteria

1. WHEN the `--skip-steering-check` flag is provided, THE System SHALL skip the compliance check entirely
2. WHEN the environment variable `SCE_SKIP_STEERING_CHECK=1` is set, THE System SHALL skip the compliance check
3. WHEN the `--force-steering-check` flag is provided, THE System SHALL ignore the version cache and perform a full check
4. THE System SHALL document these bypass options in the help text
5. WHEN bypass is active, THE System SHALL not update the version cache

### Requirement 7: Integration with Existing Commands

**User Story:** As a sce maintainer, I want the compliance check integrated seamlessly into the command execution flow, so that all commands benefit from the protection.

#### Acceptance Criteria

1. THE System SHALL integrate the compliance check into the main CLI entry point
2. THE System SHALL run the compliance check before any command-specific logic executes
3. WHEN compliance check fails, THE System SHALL exit with a non-zero status code
4. THE System SHALL preserve existing command behavior when compliance passes
5. THE System SHALL not modify command output or logging when compliance passes

### Requirement 8: Cache Management

**User Story:** As a sce user, I want the system to manage the check cache automatically, so that I don't need to manually maintain it.

#### Acceptance Criteria

1. THE System SHALL create the cache file automatically on first successful check
2. THE System SHALL create the `~/.sce/` directory if it doesn't exist
3. WHEN the cache file becomes invalid, THE System SHALL recreate it automatically
4. THE System SHALL store minimal data in the cache: version string and timestamp
5. THE System SHALL handle cache file write failures gracefully and continue execution

### Requirement 9: Robust Error Handling

**User Story:** As a sce user, I want the compliance check to handle unexpected errors gracefully, so that my workflow is not disrupted by edge cases.

#### Acceptance Criteria

1. WHEN file system operations fail (permission denied, disk full), THE System SHALL log the error and allow command execution to proceed
2. WHEN the compliance check encounters an unexpected error, THE System SHALL log the error details and continue execution
3. WHEN the error is "The execution was not in an expected state at transition", THE System SHALL retry the operation once before failing
4. THE System SHALL never crash the entire command due to compliance check failures
5. WHEN errors occur, THE System SHALL provide a warning message but not block command execution
