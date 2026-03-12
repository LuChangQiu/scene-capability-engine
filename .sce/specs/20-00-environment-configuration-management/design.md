# Design Document: Environment Configuration Management

## Overview

The Environment Configuration Management feature provides a lightweight, integrated solution for managing multiple environment configurations within sce projects. This design focuses on simplicity, reliability, and seamless integration with sce's existing workspace management system.

The system consists of four main components:
1. **Environment Registry** - Persistent storage of environment configurations
2. **Environment Manager** - Core logic for environment operations
3. **Backup System** - Automatic backup and rollback capabilities
4. **CLI Interface** - User-facing commands for environment management

The design prioritizes:
- **Simplicity**: JSON-based configuration, minimal setup required
- **Safety**: Automatic backups before any destructive operations
- **Integration**: Seamless integration with existing workspace management
- **Cross-platform**: Consistent behavior across Windows, Linux, and Mac

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI Interface                          │
│  (sce env list|switch|verify|info|run|rollback)            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Environment Manager                        │
│  - Environment Operations (switch, verify, run)             │
│  - Registry Management (load, save, validate)               │
│  - File Operations (copy, validate paths)                   │
└────────┬──────────────────────────┬─────────────────────────┘
         │                          │
         ▼                          ▼
┌──────────────────┐      ┌──────────────────────────┐
│  Backup System   │      │  Environment Registry    │
│  - Create backup │      │  (.sce/environments.json)│
│  - Restore backup│      │  - Environments list     │
│  - Manage history│      │  - Active environment    │
└──────────────────┘      └──────────────────────────┘
```

### Component Interaction Flow

**Environment Switch Flow**:
```
User: sce env switch production
  ↓
CLI validates command and environment name
  ↓
Environment Manager loads registry
  ↓
Backup System creates backups of target files
  ↓
Environment Manager copies source files to targets
  ↓
Environment Manager updates active_environment in registry
  ↓
CLI displays success message
```

**Environment Verification Flow**:
```
User: sce env verify
  ↓
CLI requests verification
  ↓
Environment Manager loads active environment
  ↓
Environment Manager executes verification command
  ↓
Environment Manager compares output with expected pattern
  ↓
CLI displays verification result
```

## Components and Interfaces

### 1. Environment Registry

**File Location**: `.sce/environments.json` (project-level) or `.sce/workspaces/{workspace-name}/environments.json` (workspace-level)

**Responsibilities**:
- Store all registered environment configurations
- Track the currently active environment
- Provide schema validation for configuration data

**Interface**:
```javascript
class EnvironmentRegistry {
  /**
   * Load registry from disk
   * @param {string} registryPath - Path to environments.json
   * @returns {Object} Registry data
   * @throws {Error} If registry is corrupted or invalid
   */
  static load(registryPath)

  /**
   * Save registry to disk
   * @param {string} registryPath - Path to environments.json
   * @param {Object} registryData - Registry data to save
   * @throws {Error} If save operation fails
   */
  static save(registryPath, registryData)

  /**
   * Validate registry structure
   * @param {Object} registryData - Registry data to validate
   * @returns {boolean} True if valid
   * @throws {Error} If validation fails with details
   */
  static validate(registryData)

  /**
   * Initialize empty registry
   * @returns {Object} Empty registry structure
   */
  static initialize()
}
```

### 2. Environment Manager

**Responsibilities**:
- Execute environment operations (switch, verify, run)
- Manage environment lifecycle
- Coordinate with backup system
- Handle file operations safely

**Interface**:
```javascript
class EnvironmentManager {
  /**
   * Switch to specified environment
   * @param {string} environmentName - Name of environment to switch to
   * @param {Object} options - Switch options (force, skipBackup, etc.)
   * @returns {Object} Switch result with status and details
   * @throws {Error} If switch operation fails
   */
  async switchEnvironment(environmentName, options = {})

  /**
   * Verify current environment configuration
   * @returns {Object} Verification result with status and output
   * @throws {Error} If verification command fails
   */
  async verifyEnvironment()

  /**
   * Run command in environment context
   * @param {string} command - Command to execute
   * @param {string} environmentName - Optional environment name (defaults to active)
   * @returns {Object} Command execution result
   * @throws {Error} If command execution fails
   */
  async runInEnvironment(command, environmentName = null)

  /**
   * List all registered environments
   * @returns {Array} Array of environment objects with metadata
   */
  listEnvironments()

  /**
   * Get active environment details
   * @returns {Object} Active environment configuration
   * @throws {Error} If no environment is active
   */
  getActiveEnvironment()

  /**
   * Register new environment
   * @param {Object} environmentConfig - Environment configuration
   * @returns {Object} Registration result
   * @throws {Error} If registration fails (duplicate name, invalid config, etc.)
   */
  registerEnvironment(environmentConfig)

  /**
   * Unregister environment
   * @param {string} environmentName - Name of environment to remove
   * @throws {Error} If environment is active or doesn't exist
   */
  unregisterEnvironment(environmentName)
}
```

### 3. Backup System

**Responsibilities**:
- Create timestamped backups before environment switches
- Manage backup history (keep last 10 backups per file)
- Restore backups on rollback
- Clean up old backups

**Interface**:
```javascript
class BackupSystem {
  /**
   * Create backup of target files
   * @param {Array} targetFiles - Array of file paths to backup
   * @param {string} environmentName - Name of environment being switched to
   * @returns {Object} Backup metadata (timestamp, files, location)
   * @throws {Error} If backup creation fails
   */
  async createBackup(targetFiles, environmentName)

  /**
   * Restore most recent backup
   * @param {string} environmentName - Optional environment name to restore
   * @returns {Object} Restore result with restored files
   * @throws {Error} If restore fails or no backups exist
   */
  async restoreBackup(environmentName = null)

  /**
   * List available backups
   * @returns {Array} Array of backup metadata objects
   */
  listBackups()

  /**
   * Clean up old backups (keep last 10 per file)
   * @returns {Object} Cleanup result with removed backup count
   */
  async cleanupOldBackups()

  /**
   * Get backup directory path
   * @returns {string} Path to backup directory
   */
  getBackupDirectory()
}
```

### 4. CLI Interface

**Responsibilities**:
- Parse and validate user commands
- Display formatted output to user
- Handle errors gracefully with helpful messages
- Provide consistent cross-platform experience

**Commands**:
```bash
sce env list                          # List all environments
sce env switch <name>                 # Switch to environment
sce env verify                        # Verify current environment
sce env info                          # Show active environment details
sce env run "<command>"               # Run command in current environment
sce env rollback                      # Rollback to previous environment
sce env register <config-file>        # Register new environment from JSON
sce env unregister <name>             # Remove environment
```

**Interface**:
```javascript
class EnvironmentCLI {
  /**
   * Handle env command
   * @param {Array} args - Command arguments
   * @returns {Promise<number>} Exit code
   */
  async handleCommand(args)

  /**
   * Display environment list
   * @param {Array} environments - Array of environment objects
   * @param {string} activeEnvironmentName - Name of active environment
   */
  displayEnvironmentList(environments, activeEnvironmentName)

  /**
   * Display environment details
   * @param {Object} environment - Environment configuration
   */
  displayEnvironmentInfo(environment)

  /**
   * Display verification result
   * @param {Object} result - Verification result object
   */
  displayVerificationResult(result)

  /**
   * Display error message
   * @param {Error} error - Error object
   */
  displayError(error)

  /**
   * Display success message
   * @param {string} message - Success message
   * @param {Object} details - Optional details object
   */
  displaySuccess(message, details = {})
}
```

## Data Models

### Environment Registry Schema

```json
{
  "version": "1.0",
  "environments": [
    {
      "name": "local-151",
      "description": "Local development environment - 151 server",
      "config_files": [
        {
          "source": ".env.local-151",
          "target": ".env"
        },
        {
          "source": "config/database.local-151.json",
          "target": "config/database.json"
        }
      ],
      "verification": {
        "command": "python verify_environment.py",
        "expected_output": "Environment: local-151"
      }
    },
    {
      "name": "production",
      "description": "Production environment",
      "config_files": [
        {
          "source": ".env.production",
          "target": ".env"
        }
      ],
      "verification": {
        "command": "node scripts/verify-env.js",
        "expected_output": "production"
      }
    }
  ],
  "active_environment": "local-151"
}
```

### Environment Configuration Object

```javascript
{
  name: string,              // Unique environment name (kebab-case)
  description: string,       // Human-readable description
  config_files: [            // Array of file mappings
    {
      source: string,        // Source file path (relative to project root)
      target: string         // Target file path (relative to project root)
    }
  ],
  verification: {            // Optional verification rules
    command: string,         // Command to execute for verification
    expected_output: string  // Expected output pattern (substring match)
  }
}
```

### Backup Metadata Object

```javascript
{
  timestamp: string,         // ISO 8601 timestamp
  environment_name: string,  // Environment being switched to
  backup_directory: string,  // Path to backup directory
  files: [                   // Array of backed up files
    {
      original_path: string, // Original file path
      backup_path: string    // Backup file path
    }
  ]
}
```

### Switch Result Object

```javascript
{
  success: boolean,          // Whether switch succeeded
  previous_environment: string, // Previous active environment
  new_environment: string,   // New active environment
  files_copied: number,      // Number of files copied
  backup_created: boolean,   // Whether backup was created
  backup_location: string,   // Path to backup directory
  errors: []                 // Array of error messages (if any)
}
```

### Verification Result Object

```javascript
{
  success: boolean,          // Whether verification passed
  environment_name: string,  // Environment being verified
  command: string,           // Verification command executed
  expected_output: string,   // Expected output pattern
  actual_output: string,     // Actual command output
  exit_code: number,         // Command exit code
  error: string              // Error message (if verification failed)
}
```

## Correctness Properties

The following properties define the correctness guarantees of the Environment Configuration Management system. These properties will be validated through property-based testing using fast-check.

### Property 1: Environment Switch Atomicity
**Validates: Requirements 3.1, 3.2, 3.4**

**Property**: For any environment switch operation, either all configuration files are copied successfully and the active environment is updated, OR no changes are made and the system remains in the previous state.

**Formal Statement**: 
```
∀ environment E, initial_state S:
  switch(E) → (all_files_copied(E) ∧ active_env = E) ∨ (state = S ∧ active_env ≠ E)
```

**Test Strategy**: Generate random environment configurations and simulate switch operations with injected failures at various points. Verify that partial switches never occur.

### Property 2: Backup Completeness
**Validates: Requirements 6.1, 6.2**

**Property**: For any environment switch, all target files that exist before the switch are backed up before being overwritten.

**Formal Statement**:
```
∀ environment E, target_files T:
  switch(E) → ∀ t ∈ T: exists(t) → backed_up(t, timestamp)
```

**Test Strategy**: Generate environments with various file mappings, create target files with random content, perform switches, and verify all existing targets have corresponding backups.

### Property 3: Configuration File Integrity
**Validates: Requirements 3.1, 3.6**

**Property**: After a successful environment switch, the content of each target file exactly matches the content of its corresponding source file, and file permissions are preserved.

**Formal Statement**:
```
∀ environment E, mapping M = (source, target):
  switch(E) ∧ success → content(target) = content(source) ∧ permissions(target) = permissions(source)
```

**Test Strategy**: Generate random file contents and permissions, perform switches, and verify byte-for-byte equality and permission preservation.

### Property 4: Rollback Inverse Property
**Validates: Requirements 6.2, 6.4**

**Property**: After switching from environment A to environment B, rolling back restores the system to a state equivalent to environment A.

**Formal Statement**:
```
∀ environments A, B:
  active_env = A → switch(B) → rollback() → active_env = A ∧ ∀ t ∈ targets: content(t) = content_before_switch(t)
```

**Test Strategy**: Generate pairs of environments, switch between them, rollback, and verify file contents and active environment match the original state.

### Property 5: Registry Consistency
**Validates: Requirements 1.1, 1.2, 3.4**

**Property**: The environment registry always maintains a consistent state: all referenced environments exist, the active environment is in the registry, and no duplicate names exist.

**Formal Statement**:
```
∀ registry R:
  valid(R) → (active_env ∈ R.environments) ∧ (∀ e1, e2 ∈ R.environments: e1 ≠ e2 → e1.name ≠ e2.name)
```

**Test Strategy**: Generate sequences of register/unregister/switch operations and verify registry consistency after each operation.

### Property 6: Verification Determinism
**Validates: Requirements 4.1, 4.2, 4.3**

**Property**: For a given environment configuration and system state, verification produces the same result when executed multiple times.

**Formal Statement**:
```
∀ environment E, state S:
  verify(E, S) = verify(E, S)
```

**Test Strategy**: Generate environment configurations with verification rules, execute verification multiple times, and verify result consistency.

### Property 7: Path Resolution Consistency
**Validates: Requirements 8.1, 8.5**

**Property**: File paths are resolved consistently across all operations, regardless of the current working directory or platform.

**Formal Statement**:
```
∀ path P, operations O1, O2:
  resolve(P, O1) = resolve(P, O2)
```

**Test Strategy**: Generate various relative and absolute paths, execute operations from different working directories, and verify path resolution consistency.

### Property 8: Backup History Limit
**Validates: Requirements 6.6**

**Property**: The backup system never maintains more than 10 backups per target file, automatically removing the oldest backups when the limit is exceeded.

**Formal Statement**:
```
∀ target_file T:
  |backups(T)| ≤ 10
```

**Test Strategy**: Generate sequences of environment switches that create more than 10 backups, and verify the backup count never exceeds 10 and oldest backups are removed first.

### Property 9: Error Isolation
**Validates: Requirements 3.4, 9.1**

**Property**: If an error occurs during environment switch, the error is reported clearly and the system remains in a consistent state (either fully switched or fully rolled back).

**Formal Statement**:
```
∀ environment E, error ERR:
  switch(E) → error(ERR) → (state = previous_state ∨ state = E_state) ∧ reported(ERR)
```

**Test Strategy**: Inject various errors (missing files, permission errors, disk full) during switch operations and verify error handling and state consistency.

### Property 10: Multi-Workspace Isolation
**Validates: Requirements 7.1, 7.2, 7.3**

**Property**: Environment operations in one workspace do not affect environment configurations or active environments in other workspaces.

**Formal Statement**:
```
∀ workspaces W1, W2, environment E:
  W1 ≠ W2 → switch(E, W1) → active_env(W2) = active_env_before(W2)
```

**Test Strategy**: Create multiple workspaces with different environment configurations, perform operations in one workspace, and verify other workspaces remain unchanged.

## Implementation Phases

### Phase 1: Core Environment Management (MVP)
**Goal**: Basic environment switching and listing functionality

**Components**:
- Environment Registry (load, save, validate)
- Environment Manager (switch, list, getActive)
- Basic CLI commands (list, switch, info)
- File operations (copy with validation)

**Deliverables**:
- `lib/environment/environment-registry.js`
- `lib/environment/environment-manager.js`
- `lib/commands/env.js`
- Unit tests for all components
- Property tests for Properties 1, 3, 5

**Success Criteria**:
- Can register environments via JSON file
- Can switch between environments
- Can list all environments
- All tests pass

### Phase 2: Backup and Rollback
**Goal**: Add safety features for environment switches

**Components**:
- Backup System (create, restore, cleanup)
- Enhanced Environment Manager (integrate backup)
- CLI commands (rollback)

**Deliverables**:
- `lib/environment/backup-system.js`
- Enhanced `lib/environment/environment-manager.js`
- Updated `lib/commands/env.js`
- Unit tests for backup system
- Property tests for Properties 2, 4, 8

**Success Criteria**:
- Automatic backups before switches
- Can rollback to previous environment
- Backup history maintained (max 10)
- All tests pass

### Phase 3: Verification and Execution
**Goal**: Add environment verification and command execution

**Components**:
- Verification logic in Environment Manager
- Command execution in environment context
- CLI commands (verify, run)

**Deliverables**:
- Enhanced `lib/environment/environment-manager.js`
- Updated `lib/commands/env.js`
- Unit tests for verification and execution
- Property test for Property 6

**Success Criteria**:
- Can verify environment configuration
- Can run commands in environment context
- Clear verification results displayed
- All tests pass

### Phase 4: Multi-Workspace Integration
**Goal**: Integrate with existing workspace management

**Components**:
- Workspace-aware registry resolution
- Workspace context integration
- Cross-workspace environment isolation

**Deliverables**:
- Enhanced `lib/environment/environment-registry.js`
- Integration with `lib/workspace/multi/workspace-context-resolver.js`
- Unit tests for workspace integration
- Property test for Property 10

**Success Criteria**:
- Each workspace has independent environments
- Workspace switching preserves environment state
- All tests pass

### Phase 5: Documentation and Polish
**Goal**: Complete user documentation and error handling

**Components**:
- User documentation
- Enhanced error messages
- Cross-platform testing

**Deliverables**:
- `docs/environment-management-guide.md`
- Enhanced error handling in all components
- Property tests for Properties 7, 9
- Cross-platform validation

**Success Criteria**:
- Complete user documentation
- Clear error messages for all failure cases
- Works consistently on Windows, Linux, Mac
- All tests pass

## Requirements Traceability

| Requirement | Design Component | Correctness Property |
|-------------|------------------|---------------------|
| 1.1, 1.2, 1.4 | Environment Registry, Environment Manager | Property 5 |
| 1.3, 1.5, 1.6 | Environment Registry | Property 5 |
| 2.1, 2.2, 2.3, 2.4, 2.5 | Environment Manager, CLI Interface | - |
| 3.1, 3.2, 3.4 | Environment Manager, Backup System | Property 1, 3 |
| 3.3, 3.5, 3.6 | Environment Manager | Property 3 |
| 4.1, 4.2, 4.3, 4.4, 4.5 | Environment Manager | Property 6 |
| 5.1, 5.2, 5.3, 5.4, 5.5 | Environment Manager, CLI Interface | - |
| 6.1, 6.2, 6.3, 6.4, 6.5, 6.6 | Backup System | Property 2, 4, 8 |
| 7.1, 7.2, 7.3, 7.4, 7.5 | Environment Registry, Environment Manager | Property 10 |
| 8.1, 8.2, 8.3, 8.4, 8.5 | All components | Property 7 |
| 9.1, 9.2, 9.3, 9.4, 9.5 | CLI Interface | Property 9 |
| 10.1, 10.2, 10.3, 10.4, 10.5 | CLI Interface | - |

## Testing Strategy

### Unit Tests
- Test each component in isolation
- Mock file system operations where appropriate
- Test error conditions and edge cases
- Target 90% line coverage

### Property-Based Tests
- Implement all 10 correctness properties
- Use fast-check for property generation
- Minimum 100 iterations per property
- Focus on state consistency and data integrity

### Integration Tests
- Test end-to-end workflows
- Test CLI command integration
- Test workspace integration
- Test cross-platform compatibility

### Manual Testing
- Test on Windows, Linux, and Mac
- Test with real project configurations
- Test error recovery scenarios
- Validate user experience

## Security Considerations

1. **File Path Validation**: All file paths must be validated to prevent directory traversal attacks
2. **Command Injection**: Verification commands must be executed safely without shell injection vulnerabilities
3. **Backup Security**: Backups should preserve file permissions and not expose sensitive data
4. **Registry Validation**: Registry files must be validated to prevent malicious JSON injection

## Performance Considerations

1. **File Operations**: Use streaming for large files to minimize memory usage
2. **Backup Cleanup**: Run cleanup asynchronously to avoid blocking user operations
3. **Registry Caching**: Cache registry in memory to avoid repeated disk reads
4. **Verification Timeout**: Set reasonable timeouts for verification commands (default 30s)

## Future Enhancements

1. **Environment Templates**: Pre-defined environment templates for common scenarios
2. **Environment Variables**: Support for environment-specific variables beyond file copying
3. **Remote Environments**: Support for remote configuration sources (S3, Git, etc.)
4. **Environment Diff**: Show differences between environments before switching
5. **Hooks**: Pre-switch and post-switch hooks for custom logic
6. **Environment Groups**: Group related environments for batch operations

