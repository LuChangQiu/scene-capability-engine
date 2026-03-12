# Requirements Document: Multi-Workspace Management

## Introduction

This feature enables developers to manage multiple sce projects simultaneously, improving multi-project development efficiency. Based on MoltBot research (Spec 15-00), multi-workspace management is identified as the highest priority feature (⭐⭐⭐⭐⭐). Currently, sce operates only within a single project directory, requiring developers to frequently switch directories. Multi-workspace management will allow developers to register multiple projects, switch between them seamlessly, view cross-workspace status, and reuse Specs across workspaces.

## Glossary

- **Workspace**: A registered sce project directory with its own `.sce/` structure
- **Active_Workspace**: The currently selected workspace for command execution
- **Workspace_Registry**: Global configuration file storing all registered workspaces
- **CLI**: Command-line interface for sce
- **Spec**: A feature specification document in the `.sce/specs/` directory
- **Global_Config**: User-level configuration stored in `~/.sce/`

## Requirements

### Requirement 1: Workspace Registration and Management

**User Story:** As a developer, I want to register and manage multiple sce projects, so that I can organize my work across different projects.

#### Acceptance Criteria

1. WHEN a developer executes `sce workspace create <name> [path]`, THE CLI SHALL create a new workspace entry in the Workspace_Registry with the specified name and path
2. WHEN a workspace name already exists in the Workspace_Registry, THE CLI SHALL return an error and prevent duplicate registration
3. WHEN no path is provided to workspace create, THE CLI SHALL use the current directory as the workspace path
4. WHEN the specified path does not contain a `.sce/` directory, THE CLI SHALL return an error indicating the path is not a valid sce project
5. THE Workspace_Registry SHALL store workspace name, absolute path, creation timestamp, and last accessed timestamp for each workspace

### Requirement 2: Workspace Listing and Information Display

**User Story:** As a developer, I want to view all registered workspaces and their details, so that I can understand my workspace configuration.

#### Acceptance Criteria

1. WHEN a developer executes `sce workspace list`, THE CLI SHALL display all registered workspaces with their names, paths, and active status
2. WHEN displaying the workspace list, THE CLI SHALL indicate the Active_Workspace with a visual marker
3. WHEN a developer executes `sce workspace info [name]`, THE CLI SHALL display detailed information including name, path, creation time, last accessed time, and Spec count
4. WHEN no workspace name is provided to workspace info, THE CLI SHALL display information for the Active_Workspace
5. WHEN the specified workspace does not exist, THE CLI SHALL return an error with available workspace names

### Requirement 3: Workspace Switching

**User Story:** As a developer, I want to switch between workspaces without changing directories, so that I can work efficiently across multiple projects.

#### Acceptance Criteria

1. WHEN a developer executes `sce workspace switch <name>`, THE CLI SHALL set the specified workspace as the Active_Workspace
2. WHEN switching workspaces, THE CLI SHALL update the last accessed timestamp for the new Active_Workspace
3. WHEN the specified workspace does not exist, THE CLI SHALL return an error with available workspace names
4. WHEN a workspace is switched, THE CLI SHALL persist the Active_Workspace selection to the Global_Config
5. WHEN sce starts, THE CLI SHALL load the Active_Workspace from the Global_Config

### Requirement 4: Workspace Removal

**User Story:** As a developer, I want to remove workspaces from the registry, so that I can clean up workspaces I no longer use.

#### Acceptance Criteria

1. WHEN a developer executes `sce workspace remove <name>`, THE CLI SHALL remove the workspace entry from the Workspace_Registry
2. WHEN removing the Active_Workspace, THE CLI SHALL clear the Active_Workspace selection
3. WHEN the specified workspace does not exist, THE CLI SHALL return an error
4. WHEN removing a workspace, THE CLI SHALL NOT delete any files from the workspace directory
5. THE CLI SHALL require confirmation before removing a workspace

### Requirement 5: Automatic Workspace Detection

**User Story:** As a developer, I want sce to automatically detect which workspace I'm working in, so that I don't need to manually switch workspaces when I change directories.

#### Acceptance Criteria

1. WHEN a developer executes any sce command, THE CLI SHALL check if the current directory is within a registered workspace
2. WHEN the current directory matches a registered workspace path, THE CLI SHALL use that workspace regardless of the Active_Workspace setting
3. WHEN the current directory is not within any registered workspace and contains a `.sce/` directory, THE CLI SHALL prompt the user to register it as a workspace
4. WHEN the current directory is not within any registered workspace and does not contain a `.sce/` directory, THE CLI SHALL use the Active_Workspace if set
5. WHEN no Active_Workspace is set and the current directory is not a workspace, THE CLI SHALL return an error prompting workspace creation or switching

### Requirement 6: Cross-Workspace Status Viewing

**User Story:** As a developer, I want to view the status of all my workspaces at once, so that I can get an overview of my projects.

#### Acceptance Criteria

1. WHEN a developer executes `sce status --all-workspaces`, THE CLI SHALL display status information for all registered workspaces
2. WHEN displaying cross-workspace status, THE CLI SHALL show workspace name, active Spec count, completed Spec count, and last activity time
3. WHEN a workspace is inaccessible, THE CLI SHALL display an error indicator for that workspace and continue with others
4. THE CLI SHALL display workspaces in order of last accessed timestamp (most recent first)
5. WHEN no workspaces are registered, THE CLI SHALL display a message prompting workspace creation

### Requirement 7: Cross-Workspace Search

**User Story:** As a developer, I want to search for content across all my workspaces, so that I can find information regardless of which project it's in.

#### Acceptance Criteria

1. WHEN a developer executes `sce search "keyword" --all-workspaces`, THE CLI SHALL search for the keyword in all registered workspaces
2. WHEN displaying search results, THE CLI SHALL group results by workspace and show the workspace name for each result
3. WHEN a workspace is inaccessible, THE CLI SHALL skip that workspace and continue searching others
4. THE CLI SHALL search within Spec requirements, design, and tasks documents
5. WHEN no results are found, THE CLI SHALL display a message indicating no matches across all workspaces

### Requirement 8: Cross-Workspace Spec Reuse

**User Story:** As a developer, I want to copy Specs between workspaces, so that I can reuse proven designs and requirements across projects.

#### Acceptance Criteria

1. WHEN a developer executes `sce spec copy <source-ws>/<spec> <target-ws>/<spec>`, THE CLI SHALL copy the Spec directory from source to target workspace
2. WHEN copying a Spec, THE CLI SHALL copy all files including requirements.md, design.md, tasks.md, and any subdirectories
3. WHEN the target Spec already exists, THE CLI SHALL require a `--force` flag to overwrite
4. WHEN the source workspace or Spec does not exist, THE CLI SHALL return an error
5. WHEN the target workspace does not exist, THE CLI SHALL return an error

### Requirement 9: Workspace-Scoped Command Execution

**User Story:** As a developer, I want to execute commands in a specific workspace without switching to it, so that I can perform operations across workspaces efficiently.

#### Acceptance Criteria

1. WHEN any sce command includes the `--workspace <name>` parameter, THE CLI SHALL execute the command in the context of the specified workspace
2. WHEN the specified workspace does not exist, THE CLI SHALL return an error
3. WHEN using `--workspace` parameter, THE CLI SHALL NOT change the Active_Workspace setting
4. THE CLI SHALL support the `--workspace` parameter for all existing commands (status, search, spec, adopt, etc.)
5. WHEN both `--workspace` and `--all-workspaces` are specified, THE CLI SHALL return an error indicating conflicting parameters

### Requirement 10: Configuration Persistence

**User Story:** As a developer, I want my workspace configuration to persist across sessions, so that I don't need to reconfigure workspaces every time I use sce.

#### Acceptance Criteria

1. THE CLI SHALL store the Workspace_Registry in `~/.sce/workspaces.json`
2. THE CLI SHALL store the Active_Workspace in `~/.sce/config.json`
3. WHEN the Global_Config directory does not exist, THE CLI SHALL create it automatically
4. THE CLI SHALL use JSON format for all configuration files to ensure human readability
5. WHEN configuration files are corrupted, THE CLI SHALL display an error and provide instructions for recovery

### Requirement 11: Backward Compatibility

**User Story:** As an existing sce user, I want the multi-workspace feature to work seamlessly with my current single-project workflow, so that I don't need to change my existing habits.

#### Acceptance Criteria

1. WHEN no workspaces are registered, THE CLI SHALL operate in single-project mode using the current directory
2. WHEN executing commands in a `.sce/` directory without workspace registration, THE CLI SHALL function as before without requiring workspace setup
3. THE CLI SHALL maintain all existing command syntax and behavior when not using workspace-specific features
4. WHEN a user first uses workspace commands, THE CLI SHALL provide helpful guidance on workspace concepts
5. THE CLI SHALL NOT require workspace registration for basic sce operations in a valid sce project directory

### Requirement 12: Cross-Platform Support

**User Story:** As a developer working on different operating systems, I want workspace management to work consistently across Windows, Linux, and Mac, so that I can use the same workflow everywhere.

#### Acceptance Criteria

1. THE CLI SHALL resolve workspace paths using platform-appropriate path separators
2. THE CLI SHALL store absolute paths in the Workspace_Registry using forward slashes and convert them at runtime
3. WHEN resolving `~/.sce/` paths, THE CLI SHALL use the appropriate home directory for each platform
4. THE CLI SHALL handle case-sensitive and case-insensitive file systems appropriately
5. THE CLI SHALL validate workspace paths exist and are accessible on the current platform before registration
