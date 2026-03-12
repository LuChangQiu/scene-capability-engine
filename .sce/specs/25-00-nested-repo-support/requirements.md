# Requirements Document

## Introduction

This specification defines the requirements for enhancing sce's multi-repo management functionality to support nested Git repositories. The current implementation (v1.19.0) stops scanning when it encounters a Git repository, preventing discovery of Git subrepositories nested within parent repositories. This enhancement will enable users to manage complex project structures where Git repositories contain other Git repositories as subdirectories.

## Glossary

- **Repository**: A Git repository identified by the presence of a `.git` directory
- **Parent_Repository**: A Git repository that contains one or more nested repositories within its directory structure
- **Nested_Repository**: A Git repository located within the directory tree of another Git repository
- **Repository_Scanner**: The component responsible for discovering Git repositories in the filesystem
- **Repository_Config**: The JSON configuration file storing discovered repository information
- **Scan_Depth**: The level of directory nesting during repository discovery

## Requirements

### Requirement 1: Nested Repository Discovery

**User Story:** As a developer, I want sce to discover all Git repositories including those nested within other repositories, so that I can manage complex project structures with subrepositories.

#### Acceptance Criteria

1. WHEN the Repository_Scanner encounters a Git repository, THE Repository_Scanner SHALL continue scanning subdirectories for additional nested repositories
2. WHEN a Nested_Repository is discovered, THE Repository_Scanner SHALL record its relationship to the Parent_Repository
3. WHEN scanning completes, THE Repository_Config SHALL contain all discovered repositories including both parent and nested repositories
4. WHEN multiple levels of nesting exist, THE Repository_Scanner SHALL discover repositories at all nesting levels
5. THE Repository_Scanner SHALL avoid infinite loops when encountering symbolic links or circular directory structures

### Requirement 2: Scan Control Options

**User Story:** As a developer, I want to control whether nested repositories are discovered, so that I can optimize scan performance for simple project structures.

#### Acceptance Criteria

1. WHEN the user runs `sce repo init` without options, THE System SHALL scan for nested repositories by default
2. WHEN the user runs `sce repo init --no-nested`, THE System SHALL stop scanning when encountering the first Git repository in each directory path
3. WHEN the user runs `sce repo init --nested`, THE System SHALL explicitly enable nested repository scanning
4. THE System SHALL display the scan mode (nested or non-nested) during initialization
5. WHEN the scan mode changes between runs, THE System SHALL update the Repository_Config accordingly

### Requirement 3: Parent-Child Relationship Tracking

**User Story:** As a developer, I want to see which repositories are nested within others, so that I understand the project structure hierarchy.

#### Acceptance Criteria

1. WHEN a Nested_Repository is discovered, THE Repository_Config SHALL store a `parent` field containing the parent repository's path
2. WHEN a repository has no parent, THE Repository_Config SHALL omit the `parent` field or set it to null
3. WHEN displaying repository information, THE System SHALL indicate parent-child relationships clearly
4. THE `parent` field SHALL contain the relative path from the workspace root to the Parent_Repository
5. WHEN a Parent_Repository is removed, THE System SHALL update or remove references in nested repositories

### Requirement 4: Status Command Enhancement

**User Story:** As a developer, I want the status command to work correctly with nested repositories, so that I can see the Git status of all repositories including nested ones.

#### Acceptance Criteria

1. WHEN running `sce repo status`, THE System SHALL display status for all repositories including nested repositories
2. WHEN displaying nested repositories, THE System SHALL visually indicate the parent-child relationship through indentation or markers
3. WHEN a Parent_Repository and Nested_Repository both have changes, THE System SHALL display both statuses independently
4. WHEN filtering by repository name, THE System SHALL match both parent and nested repositories
5. THE System SHALL display the full relative path for nested repositories to avoid ambiguity

### Requirement 5: Health Command Enhancement

**User Story:** As a developer, I want the health command to check all repositories including nested ones, so that I can ensure all repositories are properly configured.

#### Acceptance Criteria

1. WHEN running `sce repo health`, THE System SHALL check all repositories including nested repositories
2. WHEN a Nested_Repository has issues, THE System SHALL report the issue with the full repository path
3. WHEN both Parent_Repository and Nested_Repository have issues, THE System SHALL report both independently
4. THE System SHALL verify that parent paths referenced in nested repositories exist and are valid Git repositories
5. WHEN a parent reference is invalid, THE System SHALL report it as a configuration error

### Requirement 6: Exec Command Enhancement

**User Story:** As a developer, I want to execute commands in nested repositories, so that I can perform batch operations on all repositories regardless of nesting.

#### Acceptance Criteria

1. WHEN running `sce repo exec`, THE System SHALL execute commands in all repositories including nested repositories
2. WHEN executing in nested repositories, THE System SHALL use the correct working directory for each repository
3. WHEN filtering by repository name, THE System SHALL match both parent and nested repositories
4. THE System SHALL display the full repository path when showing command output from nested repositories
5. WHEN a command fails in a Nested_Repository, THE System SHALL continue executing in other repositories unless --fail-fast is specified

### Requirement 7: Configuration File Format

**User Story:** As a developer, I want the configuration file to clearly represent repository relationships, so that I can understand and manually edit the configuration if needed.

#### Acceptance Criteria

1. THE Repository_Config SHALL use a `parent` field to indicate nested repository relationships
2. WHEN a repository is not nested, THE `parent` field SHALL be null or omitted
3. WHEN a repository is nested, THE `parent` field SHALL contain the relative path to the Parent_Repository
4. THE Repository_Config format SHALL remain backward compatible with existing configurations
5. WHEN loading a configuration without `parent` fields, THE System SHALL treat all repositories as non-nested

### Requirement 8: Performance Optimization

**User Story:** As a developer, I want repository scanning to complete in reasonable time even with nested repositories, so that initialization doesn't become a bottleneck.

#### Acceptance Criteria

1. WHEN scanning for nested repositories, THE Repository_Scanner SHALL skip common non-repository directories (node_modules, .git, build, dist)
2. WHEN encountering a symbolic link, THE Repository_Scanner SHALL detect and skip circular references
3. THE Repository_Scanner SHALL limit maximum scan depth to prevent excessive recursion
4. WHEN scanning large directory trees, THE System SHALL provide progress feedback
5. THE Repository_Scanner SHALL cache directory scan results to avoid redundant filesystem operations

### Requirement 9: Documentation Updates

**User Story:** As a developer, I want clear documentation on nested repository support, so that I can understand how to use this feature effectively.

#### Acceptance Criteria

1. THE System SHALL update the multi-repo management guide to document nested repository support
2. THE documentation SHALL include examples of nested repository structures
3. THE documentation SHALL explain the --nested and --no-nested options
4. THE documentation SHALL describe how parent-child relationships are displayed
5. THE documentation SHALL include troubleshooting guidance for common nested repository issues
