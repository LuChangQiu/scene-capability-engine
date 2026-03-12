# Requirements Document

## Introduction

This document specifies requirements for improving the `sce adopt` command's conflict handling mechanism. Currently, when conflicts are detected during adoption (existing steering files, README.md, etc.), users are not given interactive options to resolve them. The `--force` flag exists but is not exposed in the interactive flow, leading to a poor user experience. This feature will provide users with clear, interactive choices for handling conflicts during the adoption process.

## Glossary

- **Adoption_System**: The sce adopt command and its supporting modules that integrate projects into the Scene Capability Engine
- **Conflict**: A situation where a template file would overwrite an existing file in the project
- **Template_File**: A file from the sce template directory that would be copied during adoption
- **Backup**: A timestamped copy of files before they are modified or overwritten
- **Interactive_Flow**: The user-facing prompts and choices during the adoption process
- **Conflict_Resolution_Strategy**: The user's choice for how to handle conflicts (skip, overwrite, or review)

## Requirements

### Requirement 1: Interactive Conflict Detection

**User Story:** As a developer running `sce adopt`, I want to be clearly informed when conflicts are detected, so that I understand what files would be affected.

#### Acceptance Criteria

1. WHEN the Adoption_System detects conflicts, THE Adoption_System SHALL display a list of all conflicting file paths
2. WHEN displaying conflicts, THE Adoption_System SHALL show the count of total conflicts detected
3. WHEN conflicts are detected, THE Adoption_System SHALL categorize conflicts by type (steering files, documentation, tools)
4. WHEN no conflicts are detected, THE Adoption_System SHALL proceed without showing conflict resolution options

### Requirement 2: Interactive Conflict Resolution Options

**User Story:** As a developer, I want to choose how to handle conflicts interactively, so that I can make informed decisions about my project files.

#### Acceptance Criteria

1. WHEN conflicts are detected AND the user has not specified `--force` or `--auto`, THE Adoption_System SHALL prompt the user with resolution options
2. WHEN prompting for resolution, THE Adoption_System SHALL offer three options: "Skip conflicting files", "Overwrite conflicting files", and "Review conflicts one by one"
3. WHEN the user selects "Skip conflicting files", THE Adoption_System SHALL preserve all existing files and skip template file installation for conflicts
4. WHEN the user selects "Overwrite conflicting files", THE Adoption_System SHALL create a backup before overwriting any files
5. WHEN the user selects "Review conflicts one by one", THE Adoption_System SHALL prompt for each conflict individually

### Requirement 3: Per-File Conflict Resolution

**User Story:** As a developer, I want to review and decide on each conflict individually, so that I can selectively preserve or overwrite specific files.

#### Acceptance Criteria

1. WHEN the user chooses per-file review, THE Adoption_System SHALL iterate through each conflict sequentially
2. WHEN reviewing a conflict, THE Adoption_System SHALL display the file path and offer options: "Keep existing", "Use template", and "View diff"
3. WHEN the user selects "Keep existing", THE Adoption_System SHALL preserve the existing file and mark it as skipped
4. WHEN the user selects "Use template", THE Adoption_System SHALL create a backup of the existing file before overwriting
5. WHEN the user selects "View diff", THE Adoption_System SHALL display a summary of differences between existing and template files
6. AFTER viewing diff, THE Adoption_System SHALL re-prompt with "Keep existing" and "Use template" options

### Requirement 4: Backup Creation and Management

**User Story:** As a developer, I want automatic backups created before any files are overwritten, so that I can recover my original files if needed.

#### Acceptance Criteria

1. WHEN any conflict resolution involves overwriting files, THE Adoption_System SHALL create a backup before making changes
2. WHEN creating a backup, THE Adoption_System SHALL include all files that will be overwritten in the backup
3. WHEN a backup is created, THE Adoption_System SHALL display the backup ID to the user
4. WHEN adoption completes with overwrites, THE Adoption_System SHALL inform the user how to rollback using the backup ID
5. WHEN the `--force` flag is used, THE Adoption_System SHALL create a backup before overwriting without prompting

### Requirement 5: Force Flag Behavior

**User Story:** As a developer, I want the `--force` flag to automatically overwrite conflicts with backups, so that I can automate adoption in scripts.

#### Acceptance Criteria

1. WHEN the `--force` flag is specified, THE Adoption_System SHALL skip interactive conflict resolution prompts
2. WHEN the `--force` flag is specified AND conflicts exist, THE Adoption_System SHALL create a backup before overwriting
3. WHEN the `--force` flag is specified, THE Adoption_System SHALL display a warning that files will be overwritten
4. WHEN the `--force` flag is specified, THE Adoption_System SHALL show the backup ID after creation

### Requirement 6: Auto Mode Compatibility

**User Story:** As a developer using `--auto` mode, I want conflicts to be handled with a sensible default, so that automated adoption works smoothly.

#### Acceptance Criteria

1. WHEN the `--auto` flag is specified AND conflicts exist, THE Adoption_System SHALL default to skipping conflicting files
2. WHEN both `--auto` and `--force` flags are specified, THE Adoption_System SHALL overwrite conflicts with backup creation
3. WHEN the `--auto` flag is specified, THE Adoption_System SHALL not prompt for any user input

### Requirement 7: Dry Run Conflict Reporting

**User Story:** As a developer, I want to see what conflicts would occur in dry run mode, so that I can plan my adoption strategy.

#### Acceptance Criteria

1. WHEN the `--dry-run` flag is specified AND conflicts exist, THE Adoption_System SHALL display all conflicts that would be detected
2. WHEN in dry run mode, THE Adoption_System SHALL show what action would be taken for each conflict based on current flags
3. WHEN in dry run mode, THE Adoption_System SHALL not create any backups or modify any files

### Requirement 8: Conflict Resolution Summary

**User Story:** As a developer, I want to see a summary of conflict resolution actions after adoption completes, so that I understand what changes were made.

#### Acceptance Criteria

1. WHEN adoption completes, THE Adoption_System SHALL display a summary of files that were skipped due to conflicts
2. WHEN adoption completes, THE Adoption_System SHALL display a summary of files that were overwritten
3. WHEN files were overwritten, THE Adoption_System SHALL display the backup ID in the summary
4. WHEN adoption completes, THE Adoption_System SHALL display the total count of conflicts resolved

### Requirement 9: Diff Display for Conflicts

**User Story:** As a developer reviewing conflicts, I want to see a summary of differences between my existing file and the template, so that I can make informed decisions.

#### Acceptance Criteria

1. WHEN the user requests to view a diff, THE Adoption_System SHALL display the file path being compared
2. WHEN displaying a diff, THE Adoption_System SHALL show a summary including file sizes and modification dates
3. WHEN displaying a diff, THE Adoption_System SHALL show the first 10 lines of differences if files are text files
4. IF files are binary or very large, THE Adoption_System SHALL display a message indicating detailed diff is not available
5. WHEN diff display completes, THE Adoption_System SHALL return to the conflict resolution prompt

### Requirement 10: Error Handling and Recovery

**User Story:** As a developer, I want clear error messages and recovery options if conflict resolution fails, so that I can troubleshoot issues.

#### Acceptance Criteria

1. IF backup creation fails, THE Adoption_System SHALL abort the adoption process and display an error message
2. IF file overwrite fails, THE Adoption_System SHALL log the error and continue with remaining files
3. WHEN errors occur during conflict resolution, THE Adoption_System SHALL include error details in the final summary
4. IF adoption is aborted due to errors, THE Adoption_System SHALL inform the user that no changes were made
