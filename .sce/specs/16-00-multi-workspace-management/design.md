# Design Document: Multi-Workspace Management

## Overview

The multi-workspace management feature extends sce to support simultaneous management of multiple projects. This design introduces a workspace registry system that maintains a global catalog of sce projects, enabling developers to switch between projects, execute cross-workspace operations, and reuse Specs without manual directory navigation.

The architecture follows a layered approach:
- **Configuration Layer**: Manages workspace registry and global settings
- **Detection Layer**: Automatically identifies the active workspace context
- **Command Layer**: Extends existing CLI commands with workspace awareness
- **Operation Layer**: Implements cross-workspace operations (status, search, copy)

Key design principles:
- **Backward Compatibility**: Single-project mode continues to work without workspace registration
- **Automatic Context Detection**: Commands automatically detect workspace from current directory
- **Explicit Override**: `--workspace` parameter allows explicit workspace targeting
- **Human-Readable Configuration**: JSON format for easy inspection and manual editing

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Entry Point                       │
│                    (sce command parser)                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Workspace Context Resolver                 │
│  - Detects current workspace from directory                  │
│  - Loads active workspace from config                        │
│  - Resolves --workspace parameter                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Workspace Registry Manager                  │
│  - CRUD operations on workspace registry                     │
│  - Validates workspace paths                                 │
│  - Manages active workspace state                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Command Execution Layer                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Workspace  │  │ Cross-WS Ops │  │  Existing    │      │
│  │   Commands   │  │ (status,     │  │  Commands    │      │
│  │              │  │  search, copy)│  │  (enhanced)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Configuration Storage                     │
│  ~/.sce/workspaces.json  |  ~/.sce/config.json              │
└─────────────────────────────────────────────────────────────┘
```

### Workspace Resolution Priority

When executing any sce command, the system resolves the target workspace using this priority order:

1. **Explicit `--workspace <name>` parameter** (highest priority)
2. **Current directory matches a registered workspace path**
3. **Active workspace from global config**
4. **Current directory contains `.sce/` (single-project mode)**
5. **Error: No workspace context available** (lowest priority)

This priority ensures intuitive behavior: explicit parameters override everything, automatic detection works when in a workspace directory, and the active workspace serves as a fallback.

## Components and Interfaces

### 1. Workspace Registry Manager

**Responsibilities**:
- Load and save workspace registry from/to `~/.sce/workspaces.json`
- Validate workspace paths and names
- Perform CRUD operations on workspace entries
- Manage active workspace state

**Interface**:

```python
class WorkspaceRegistry:
    def __init__(self, config_path: str = "~/.sce/workspaces.json"):
        """Initialize registry from config file"""
        
    def create_workspace(self, name: str, path: str) -> Workspace:
        """Register a new workspace"""
        
    def get_workspace(self, name: str) -> Optional[Workspace]:
        """Retrieve workspace by name"""
        
    def list_workspaces(self) -> List[Workspace]:
        """Get all registered workspaces"""
        
    def remove_workspace(self, name: str) -> bool:
        """Remove workspace from registry"""
        
    def update_last_accessed(self, name: str) -> None:
        """Update last accessed timestamp"""
        
    def validate_workspace_path(self, path: str) -> bool:
        """Check if path is a valid sce project"""
        
    def save(self) -> None:
        """Persist registry to disk"""
```

**Data Model**:

```python
@dataclass
class Workspace:
    name: str
    path: str  # Absolute path
    created_at: datetime
    last_accessed: datetime
    
    def to_dict(self) -> dict:
        """Serialize to JSON-compatible dict"""
        
    @classmethod
    def from_dict(cls, data: dict) -> 'Workspace':
        """Deserialize from dict"""
```

### 2. Workspace Context Resolver

**Responsibilities**:
- Determine the active workspace for command execution
- Implement workspace resolution priority logic
- Handle automatic workspace detection from current directory
- Provide workspace context to command handlers

**Interface**:

```python
class WorkspaceContextResolver:
    def __init__(self, registry: WorkspaceRegistry, config: GlobalConfig):
        """Initialize with registry and config"""
        
    def resolve_workspace(
        self, 
        explicit_workspace: Optional[str] = None,
        current_dir: Optional[str] = None
    ) -> Optional[Workspace]:
        """Resolve workspace using priority rules"""
        
    def detect_workspace_from_path(self, path: str) -> Optional[Workspace]:
        """Find workspace containing the given path"""
        
    def is_valid_kse_directory(self, path: str) -> bool:
        """Check if directory contains .sce/ structure"""
        
    def get_active_workspace(self) -> Optional[Workspace]:
        """Get the currently active workspace from config"""
        
    def set_active_workspace(self, name: str) -> None:
        """Set the active workspace in config"""
```

### 3. Global Configuration Manager

**Responsibilities**:
- Manage `~/.sce/config.json` for global settings
- Store and retrieve active workspace
- Handle configuration file creation and validation

**Interface**:

```python
class GlobalConfig:
    def __init__(self, config_path: str = "~/.sce/config.json"):
        """Initialize from config file"""
        
    def get_active_workspace(self) -> Optional[str]:
        """Get active workspace name"""
        
    def set_active_workspace(self, name: Optional[str]) -> None:
        """Set active workspace name"""
        
    def save(self) -> None:
        """Persist config to disk"""
        
    def load(self) -> None:
        """Load config from disk"""
```

### 4. Workspace Command Handlers

**Responsibilities**:
- Implement workspace management commands
- Provide user-friendly output and error messages
- Handle user confirmations for destructive operations

**Interface**:

```python
class WorkspaceCommands:
    def __init__(self, registry: WorkspaceRegistry, config: GlobalConfig):
        """Initialize with registry and config"""
        
    def create(self, name: str, path: Optional[str] = None) -> None:
        """Handle: sce workspace create <name> [path]"""
        
    def list(self) -> None:
        """Handle: sce workspace list"""
        
    def switch(self, name: str) -> None:
        """Handle: sce workspace switch <name>"""
        
    def remove(self, name: str, force: bool = False) -> None:
        """Handle: sce workspace remove <name>"""
        
    def info(self, name: Optional[str] = None) -> None:
        """Handle: sce workspace info [name]"""
```

### 5. Cross-Workspace Operations

**Responsibilities**:
- Implement operations that span multiple workspaces
- Handle errors gracefully when workspaces are inaccessible
- Aggregate and format results from multiple workspaces

**Interface**:

```python
class CrossWorkspaceOperations:
    def __init__(self, registry: WorkspaceRegistry):
        """Initialize with workspace registry"""
        
    def status_all(self) -> Dict[str, WorkspaceStatus]:
        """Get status for all workspaces"""
        
    def search_all(self, keyword: str) -> Dict[str, List[SearchResult]]:
        """Search across all workspaces"""
        
    def copy_spec(
        self, 
        source_workspace: str,
        source_spec: str,
        target_workspace: str,
        target_spec: str,
        force: bool = False
    ) -> None:
        """Copy spec between workspaces"""
```

**Data Models**:

```python
@dataclass
class WorkspaceStatus:
    workspace_name: str
    active_specs: int
    completed_specs: int
    last_activity: datetime
    accessible: bool
    error_message: Optional[str] = None

@dataclass
class SearchResult:
    workspace_name: str
    spec_name: str
    file_name: str
    line_number: int
    context: str
```

## Data Models

### Workspace Registry File Format

**File**: `~/.sce/workspaces.json`

```json
{
  "version": "1.0",
  "workspaces": [
    {
      "name": "project-alpha",
      "path": "/home/user/projects/alpha",
      "created_at": "2026-01-28T10:30:00Z",
      "last_accessed": "2026-01-28T15:45:00Z"
    },
    {
      "name": "project-beta",
      "path": "/home/user/projects/beta",
      "created_at": "2026-01-27T09:00:00Z",
      "last_accessed": "2026-01-28T14:20:00Z"
    }
  ]
}
```

### Global Configuration File Format

**File**: `~/.sce/config.json`

```json
{
  "version": "1.0",
  "active_workspace": "project-alpha",
  "preferences": {
    "auto_detect_workspace": true,
    "confirm_destructive_operations": true
  }
}
```

### Path Storage Convention

All paths in configuration files are stored as absolute paths using forward slashes (`/`), regardless of platform. At runtime, paths are converted to platform-specific format:

- **Storage**: `/home/user/projects/alpha`
- **Windows Runtime**: `C:\Users\user\projects\alpha`
- **Unix Runtime**: `/home/user/projects/alpha`

This ensures configuration files are portable across platforms while maintaining correct path resolution.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property Reflection

After analyzing all 60 acceptance criteria, I've identified several areas where properties can be consolidated:

**Redundancy Elimination**:
- Error handling properties (2.5, 3.3, 4.3, 8.4, 8.5, 9.2) all test "non-existent entity returns error" - can be combined into one comprehensive error handling property
- Persistence properties (3.4, 3.5, 10.1, 10.2) all test configuration persistence - can be combined into a round-trip persistence property
- Output completeness properties (2.1, 2.3, 6.2, 7.2) all test "output contains required fields" - can be combined
- Workspace detection properties (5.1, 5.2, 5.4) all test workspace resolution priority - can be combined into one priority property
- Cross-platform path properties (12.1, 12.2, 12.3) all test path handling - can be combined into a path normalization property

**Properties to Keep Separate**:
- Duplicate prevention (1.2) - unique validation logic
- Default parameter behavior (1.3, 2.4) - different contexts
- Data structure invariants (1.5) - fundamental data integrity
- Ordering properties (6.4) - specific sorting logic
- Copy completeness (8.2) - file system operations
- Backward compatibility (11.1, 11.2, 11.5) - critical for existing users
- Error resilience (6.3, 7.3) - graceful degradation

This reflection reduces ~60 testable criteria to ~35 unique properties while maintaining complete coverage.

### Correctness Properties

Property 1: Workspace Creation Adds Entry to Registry
*For any* valid workspace name and path containing a `.sce/` directory, creating a workspace should result in the registry containing an entry with that name, path, and valid timestamps.
**Validates: Requirements 1.1, 1.5**

Property 2: Duplicate Workspace Names Are Rejected
*For any* workspace name that already exists in the registry, attempting to create another workspace with the same name should return an error and leave the registry unchanged.
**Validates: Requirements 1.2**

Property 3: Default Path Uses Current Directory
*For any* valid workspace name, when no path is provided to workspace create, the current directory should be used as the workspace path.
**Validates: Requirements 1.3**

Property 4: Invalid Paths Are Rejected
*For any* path that does not contain a `.sce/` directory, attempting to create a workspace with that path should return an error and not modify the registry.
**Validates: Requirements 1.4, 12.5**

Property 5: Workspace List Contains All Registered Workspaces
*For any* set of registered workspaces, executing workspace list should display all workspaces with their names, paths, and active status indicators.
**Validates: Requirements 2.1, 2.2**

Property 6: Workspace Info Displays Complete Information
*For any* registered workspace, executing workspace info should display name, path, creation time, last accessed time, and Spec count.
**Validates: Requirements 2.3**

Property 7: Default Info Target Is Active Workspace
*For any* active workspace, executing workspace info without a name parameter should display information for the active workspace.
**Validates: Requirements 2.4**

Property 8: Workspace Switch Updates Active Workspace
*For any* registered workspace, switching to it should set it as the active workspace in the global config and update its last accessed timestamp.
**Validates: Requirements 3.1, 3.2**

Property 9: Configuration Persistence Round Trip
*For any* workspace registry and active workspace configuration, saving then loading the configuration should produce equivalent data structures.
**Validates: Requirements 3.4, 3.5, 10.1, 10.2, 10.4**

Property 10: Workspace Removal Deletes Registry Entry
*For any* registered workspace, removing it should result in it no longer appearing in the registry or workspace list.
**Validates: Requirements 4.1**

Property 11: Removing Active Workspace Clears Active Selection
*For any* workspace that is currently active, removing it should clear the active workspace selection in the global config.
**Validates: Requirements 4.2**

Property 12: Workspace Removal Preserves Filesystem
*For any* registered workspace, removing it from the registry should not delete or modify any files in the workspace directory.
**Validates: Requirements 4.4**

Property 13: Workspace Resolution Priority
*For any* command execution context, the workspace resolution should follow priority: explicit --workspace parameter > current directory match > active workspace > error.
**Validates: Requirements 5.1, 5.2, 5.4, 5.5, 9.1**

Property 14: Cross-Workspace Status Aggregation
*For any* set of registered workspaces, executing status --all-workspaces should display status information for all workspaces, ordered by last accessed timestamp (most recent first).
**Validates: Requirements 6.1, 6.2, 6.4**

Property 15: Error Resilience in Cross-Workspace Operations
*For any* cross-workspace operation (status, search), if one workspace is inaccessible, the operation should display an error indicator for that workspace and continue with others.
**Validates: Requirements 6.3, 7.3**

Property 16: Cross-Workspace Search Completeness
*For any* keyword and set of registered workspaces, executing search --all-workspaces should search within all Spec documents (requirements, design, tasks) across all workspaces and group results by workspace.
**Validates: Requirements 7.1, 7.2, 7.4**

Property 17: Spec Copy Preserves All Files
*For any* Spec directory in a source workspace, copying it to a target workspace should result in all files (requirements.md, design.md, tasks.md, subdirectories) existing in the target with identical content.
**Validates: Requirements 8.1, 8.2**

Property 18: Spec Copy Requires Force for Overwrite
*For any* existing Spec in a target workspace, attempting to copy another Spec to the same location without the --force flag should return an error and leave the target unchanged.
**Validates: Requirements 8.3**

Property 19: Explicit Workspace Parameter Isolation
*For any* command executed with --workspace parameter, the active workspace setting should remain unchanged after command execution.
**Validates: Requirements 9.3**

Property 20: Workspace Parameter Universal Support
*For any* existing sce command (status, search, spec, adopt), adding the --workspace parameter should execute the command in the context of the specified workspace.
**Validates: Requirements 9.4**

Property 21: Configuration Directory Auto-Creation
*For any* system state where ~/.sce/ does not exist, executing any workspace command should automatically create the directory and initialize configuration files.
**Validates: Requirements 10.3**

Property 22: Configuration Corruption Handling
*For any* corrupted configuration file, attempting to load it should return a descriptive error message with recovery instructions and not crash the CLI.
**Validates: Requirements 10.5**

Property 23: Backward Compatibility with Single-Project Mode
*For any* valid sce project directory, when no workspaces are registered, all existing commands should function as before without requiring workspace setup.
**Validates: Requirements 11.1, 11.2, 11.5**

Property 24: Existing Command Behavior Preservation
*For any* existing sce command executed without workspace-specific parameters, the command behavior and output should be identical to pre-workspace versions.
**Validates: Requirements 11.3**

Property 25: Cross-Platform Path Normalization
*For any* workspace path stored in the registry, the path should be stored with forward slashes and converted to platform-appropriate separators at runtime, with home directory expansion working correctly on all platforms.
**Validates: Requirements 12.1, 12.2, 12.3**

Property 26: Non-Existent Entity Error Handling
*For any* command that references a workspace or Spec by name, if the entity does not exist, the command should return a descriptive error message listing available entities.
**Validates: Requirements 2.5, 3.3, 4.3, 8.4, 8.5, 9.2**

## Error Handling

### Error Categories

**1. Validation Errors**
- Invalid workspace names (empty, special characters, too long)
- Invalid paths (non-existent, not a sce project, inaccessible)
- Duplicate workspace names
- Missing required parameters

**Error Response Format**:
```
Error: [Error Type]
Details: [Specific error message]
Suggestion: [Actionable next step]
```

**Example**:
```
Error: Invalid Workspace Path
Details: Path '/home/user/invalid' does not contain a .sce/ directory
Suggestion: Initialize a sce project in this directory first with 'sce init'
```

**2. Not Found Errors**
- Workspace not found
- Spec not found
- Configuration file not found

**Error Response Format**:
```
Error: [Entity] Not Found
Details: [Entity name] does not exist
Available [Entities]: [List of valid options]
```

**Example**:
```
Error: Workspace Not Found
Details: Workspace 'project-gamma' does not exist
Available Workspaces: project-alpha, project-beta
```

**3. Conflict Errors**
- Duplicate workspace name
- Target Spec already exists (without --force)
- Conflicting parameters (--workspace and --all-workspaces)

**Error Response Format**:
```
Error: [Conflict Type]
Details: [Specific conflict description]
Resolution: [How to resolve the conflict]
```

**Example**:
```
Error: Spec Already Exists
Details: Spec 'user-auth' already exists in workspace 'project-beta'
Resolution: Use --force flag to overwrite, or choose a different target name
```

**4. Access Errors**
- Workspace directory inaccessible
- Configuration file read/write errors
- Permission denied

**Error Response Format**:
```
Error: Access Denied
Details: [Specific access issue]
Cause: [Likely cause]
```

**Example**:
```
Error: Access Denied
Details: Cannot read workspace directory '/home/user/projects/alpha'
Cause: Directory may have been moved or permissions changed
```

**5. State Errors**
- No active workspace when required
- No workspaces registered
- Configuration corrupted

**Error Response Format**:
```
Error: Invalid State
Details: [State issue description]
Action Required: [What user needs to do]
```

**Example**:
```
Error: Invalid State
Details: No active workspace set and current directory is not a workspace
Action Required: Run 'sce workspace switch <name>' or 'sce workspace create <name>'
```

### Error Recovery Strategies

**Configuration Corruption**:
1. Detect corrupted JSON during load
2. Backup corrupted file to `~/.sce/workspaces.json.backup`
3. Create fresh configuration file
4. Display recovery instructions to user

**Workspace Inaccessibility**:
1. Detect inaccessible workspace during operation
2. Mark workspace as inaccessible in operation results
3. Continue with other workspaces (for cross-workspace operations)
4. Suggest workspace removal or path update

**Missing Configuration**:
1. Detect missing ~/.sce/ directory
2. Automatically create directory structure
3. Initialize default configuration files
4. Log initialization for user awareness

### Graceful Degradation

**Cross-Workspace Operations**:
- If some workspaces are inaccessible, continue with accessible ones
- Display partial results with clear indicators of which workspaces failed
- Aggregate errors at the end of output

**Workspace Detection**:
- If automatic detection fails, fall back to active workspace
- If no active workspace, provide clear guidance on next steps
- Never fail silently - always inform user of context resolution

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests for comprehensive coverage:

**Unit Tests** focus on:
- Specific examples of workspace operations
- Edge cases (empty registry, single workspace, many workspaces)
- Error conditions (invalid paths, missing files, corrupted config)
- Integration points (CLI parsing, file system operations, config loading)
- User interaction flows (confirmations, prompts)

**Property-Based Tests** focus on:
- Universal properties across all valid inputs
- Workspace creation, listing, switching, removal with random data
- Configuration persistence round-trips
- Path normalization across platforms
- Error handling consistency

### Property Test Configuration

**Testing Library**: Use `hypothesis` for Python (sce is Python-based)

**Test Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with feature name and property number
- Tag format: `# Feature: multi-workspace-management, Property N: [property text]`

**Example Property Test Structure**:

```python
from hypothesis import given, strategies as st
import hypothesis

# Feature: multi-workspace-management, Property 1: Workspace Creation Adds Entry to Registry
@given(
    name=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='/')),
    path=st.sampled_from(valid_kse_project_paths())
)
@hypothesis.settings(max_examples=100)
def test_workspace_creation_adds_entry(name, path):
    """For any valid workspace name and path, creation adds entry to registry"""
    registry = WorkspaceRegistry()
    initial_count = len(registry.list_workspaces())
    
    workspace = registry.create_workspace(name, path)
    
    assert len(registry.list_workspaces()) == initial_count + 1
    assert registry.get_workspace(name) is not None
    assert registry.get_workspace(name).path == path
    assert registry.get_workspace(name).created_at is not None
```

### Test Coverage Requirements

**Minimum Coverage**:
- 90% line coverage for all workspace management code
- 100% coverage for error handling paths
- All 26 correctness properties implemented as property tests
- Unit tests for all edge cases identified in prework

**Critical Test Scenarios**:
1. Empty registry operations
2. Single workspace operations
3. Multiple workspace operations
4. Concurrent access (if applicable)
5. Configuration file corruption
6. Filesystem errors (permissions, missing directories)
7. Cross-platform path handling
8. Backward compatibility with single-project mode

### Integration Testing

**End-to-End Scenarios**:
1. New user workflow: create first workspace, switch, execute commands
2. Multi-project workflow: register multiple workspaces, switch between them, cross-workspace search
3. Spec reuse workflow: copy Spec from one workspace to another, verify completeness
4. Migration workflow: existing single-project user starts using workspaces
5. Error recovery: handle corrupted config, inaccessible workspaces, invalid operations

**Test Environment**:
- Isolated test directories for each test
- Mock filesystem operations where appropriate
- Platform-specific test runs (Windows, Linux, Mac)
- Cleanup after each test to prevent state leakage
