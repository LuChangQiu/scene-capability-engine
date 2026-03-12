# Requirements Document

## Introduction

This specification addresses a critical bug in the repository scanning logic where `sce repo init --nested` incorrectly identifies regular subdirectories as Git repositories. The current implementation detects 34 "repositories" when only 8 are actual Git repositories (containing .git directories), causing confusion and poor user experience.

## Glossary

- **Git_Repository**: A directory containing a `.git` subdirectory that stores Git version control metadata
- **Scanner**: The component responsible for discovering Git repositories in a directory tree
- **Repository_Path**: The absolute path to a Git repository root directory
- **Nested_Mode**: Configuration mode that allows repositories to be nested within other repositories
- **False_Positive**: A directory incorrectly identified as a Git repository when it lacks a `.git` subdirectory

## Requirements

### Requirement 1: Git Directory Validation

**User Story:** As a developer, I want the scanner to only detect actual Git repositories, so that I don't see false positives for regular directories.

#### Acceptance Criteria

1. WHEN scanning a directory tree, THE Scanner SHALL verify that each candidate directory contains a `.git` subdirectory before identifying it as a Git repository
2. WHEN a directory lacks a `.git` subdirectory, THE Scanner SHALL exclude it from the repository list
3. WHEN the `.git` subdirectory exists but is not accessible, THE Scanner SHALL exclude that directory from the repository list
4. THE Scanner SHALL check for `.git` as a directory (not a file, which can occur in Git worktrees)

### Requirement 2: Accurate Repository Detection

**User Story:** As a developer, I want to see only real Git repositories in the scan results, so that I can accurately manage my multi-repository workspace.

#### Acceptance Criteria

1. WHEN scanning a workspace with 8 Git repositories and 26 regular directories, THE Scanner SHALL report exactly 8 repositories
2. WHEN displaying scan results, THE System SHALL show only directories that passed Git directory validation
3. FOR ALL detected repositories, querying the repository path SHALL return a directory containing a `.git` subdirectory

### Requirement 3: Backward Compatibility

**User Story:** As an existing user, I want my valid repository configurations to continue working, so that the fix doesn't break my workflow.

#### Acceptance Criteria

1. WHEN loading an existing valid repository configuration, THE System SHALL continue to recognize all previously configured repositories
2. WHEN a previously configured repository no longer has a `.git` directory, THE System SHALL emit a warning but not fail
3. WHEN validating existing configurations, THE System SHALL apply the same `.git` validation rules

### Requirement 4: Error Handling and Reporting

**User Story:** As a developer, I want clear feedback when directories are excluded, so that I understand why certain directories weren't detected as repositories.

#### Acceptance Criteria

1. WHEN verbose mode is enabled, THE Scanner SHALL log each directory that was excluded due to missing `.git` subdirectory
2. WHEN no Git repositories are found, THE System SHALL display a helpful message explaining the detection criteria
3. IF an error occurs while checking for `.git` subdirectory, THE Scanner SHALL log the error and continue scanning other directories

### Requirement 5: Test Coverage

**User Story:** As a maintainer, I want comprehensive test coverage for the Git detection logic, so that future changes don't reintroduce this bug.

#### Acceptance Criteria

1. THE Test_Suite SHALL include tests for directories with `.git` subdirectories (valid repositories)
2. THE Test_Suite SHALL include tests for directories without `.git` subdirectories (false positives)
3. THE Test_Suite SHALL include tests for `.git` files (Git worktrees) versus `.git` directories
4. THE Test_Suite SHALL include tests for inaccessible `.git` subdirectories
5. THE Test_Suite SHALL verify that existing tests continue to pass after the fix
