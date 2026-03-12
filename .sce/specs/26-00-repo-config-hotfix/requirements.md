# Requirements Document

## Introduction

This hotfix addresses critical bugs discovered in the nested repository feature (v1.20.0) that prevent multi-repository configurations from being saved and cause command execution issues.

## Glossary

- **Repository**: A Git repository managed by sce
- **Parent_Repository**: A repository that contains other repositories as subdirectories
- **Nested_Repository**: A repository located within another repository's directory structure
- **Parent_Path**: The relative path from workspace root to the parent repository
- **Repository_Path**: The relative path from workspace root to a repository
- **Path_Map**: Internal data structure mapping repository paths to repository objects
- **Configuration**: The `.sce-repos.json` file storing repository metadata

## Requirements

### Requirement 1: Fix Parent Reference Validation

**User Story:** As a developer, I want to initialize multi-repository workspaces with nested repositories, so that the configuration saves successfully without validation errors.

#### Acceptance Criteria

1. WHEN a nested repository has a parent field, THE ConfigManager SHALL validate that the parent path corresponds to an existing repository in the configuration
2. WHEN validating parent references, THE ConfigManager SHALL normalize paths to ensure consistent comparison (handle trailing slashes, relative paths)
3. WHEN a parent path matches a repository's path, THE ConfigManager SHALL consider the parent reference valid
4. IF a parent reference points to a non-existent repository, THEN THE ConfigManager SHALL return a validation error with the invalid parent path
5. WHEN saving a configuration with valid parent references, THE ConfigManager SHALL complete successfully without errors

### Requirement 2: Maintain Backward Compatibility

**User Story:** As a developer with existing sce configurations, I want the hotfix to work with my current setup, so that I don't need to recreate my repository configurations.

#### Acceptance Criteria

1. WHEN loading an existing configuration without parent fields, THE ConfigManager SHALL process it successfully
2. WHEN loading an existing configuration with valid parent fields, THE ConfigManager SHALL validate and accept it
3. THE ConfigManager SHALL support both absolute and relative parent paths for compatibility
4. WHEN encountering legacy configuration formats, THE ConfigManager SHALL handle them gracefully

### Requirement 3: Fix Git Command Duplication

**User Story:** As a developer, I want to execute git commands across repositories, so that commands run correctly without duplication.

#### Acceptance Criteria

1. WHEN executing a command starting with "git", THE ExecHandler SHALL NOT prepend "git" again
2. WHEN executing a non-git command, THE ExecHandler SHALL execute it as-is
3. WHEN a user runs "sce repo exec git branch", THE ExecHandler SHALL execute "git branch" not "git git branch"
4. WHEN a user runs "sce repo exec npm test", THE ExecHandler SHALL execute "npm test" unchanged

### Requirement 4: Preserve Existing Functionality

**User Story:** As a developer, I want the hotfix to maintain all existing features, so that nothing breaks in my current workflow.

#### Acceptance Criteria

1. WHEN running the existing test suite, THE System SHALL pass all 1686 tests
2. WHEN using single repository configurations, THE System SHALL function identically to v1.20.0
3. WHEN using nested repository scanning, THE System SHALL discover repositories correctly
4. WHEN using all existing commands, THE System SHALL behave as documented

### Requirement 5: Add Multi-Repository Test Coverage

**User Story:** As a developer, I want comprehensive tests for multi-repository scenarios, so that these bugs don't reoccur.

#### Acceptance Criteria

1. THE Test_Suite SHALL include tests for configurations with 2+ repositories
2. THE Test_Suite SHALL include tests for nested repository parent validation
3. THE Test_Suite SHALL include tests for git command execution without duplication
4. THE Test_Suite SHALL include tests for parent path normalization
5. WHEN tests run, THE Test_Suite SHALL verify parent references are validated correctly

### Requirement 6: Path Normalization

**User Story:** As a developer, I want parent paths to be normalized consistently, so that validation works regardless of path format variations.

#### Acceptance Criteria

1. WHEN comparing paths, THE ConfigManager SHALL normalize trailing slashes
2. WHEN comparing paths, THE ConfigManager SHALL handle both forward and backward slashes
3. WHEN comparing paths, THE ConfigManager SHALL resolve relative path segments (., ..)
4. WHEN two paths refer to the same location, THE ConfigManager SHALL recognize them as equal

### Requirement 7: Clear Error Messages

**User Story:** As a developer, I want clear error messages when validation fails, so that I can quickly identify and fix configuration issues.

#### Acceptance Criteria

1. WHEN parent validation fails, THE ConfigManager SHALL include the invalid parent path in the error message
2. WHEN parent validation fails, THE ConfigManager SHALL include the repository path that has the invalid parent
3. WHEN parent validation fails, THE ConfigManager SHALL list available repository paths for reference
4. THE Error_Message SHALL be actionable and help users fix the issue

### Requirement 8: Minimal Code Changes

**User Story:** As a maintainer, I want minimal code changes in this hotfix, so that the risk of introducing new bugs is minimized.

#### Acceptance Criteria

1. THE Hotfix SHALL modify only ConfigManager and ExecHandler
2. THE Hotfix SHALL NOT change the configuration file format
3. THE Hotfix SHALL NOT modify the RepoManager scanning logic
4. THE Hotfix SHALL focus on fixing validation and command execution bugs only

### Requirement 9: Version Update

**User Story:** As a user, I want to know this is a hotfix release, so that I understand it's a bug fix update.

#### Acceptance Criteria

1. THE System SHALL update package.json version to 1.20.1
2. THE System SHALL update CHANGELOG.md with hotfix details
3. THE CHANGELOG SHALL clearly mark this as a hotfix release
4. THE CHANGELOG SHALL list all bugs fixed in this release
