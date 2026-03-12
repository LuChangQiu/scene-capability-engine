# Adoption Logger Usage Examples

This document provides examples of how to use the `AdoptionLogger` for debugging and troubleshooting the adoption process.

## Basic Usage

### Creating a Logger

```javascript
const AdoptionLogger = require('./lib/adoption/adoption-logger');

// Create logger with default options (INFO level, file logging enabled)
const logger = new AdoptionLogger();

// Create logger with custom options
const logger = new AdoptionLogger({
  level: 'verbose',        // Log level: error, warn, info, debug, verbose
  logToFile: true,         // Write logs to file
  logToConsole: false,     // Don't output to console
  maxBufferSize: 1000      // Maximum log entries in memory
});
```

### Initializing the Logger

```javascript
// Initialize logger with project path and adoption ID
const projectPath = '/path/to/project';
const adoptionId = '20260127-143022';

logger.initialize(projectPath, adoptionId);
// Creates log file at: /path/to/project/.sce/logs/adopt-20260127-143022.log
```

## Logging Methods

### Basic Logging

```javascript
// Error messages (always logged)
logger.error('Backup creation failed', { 
  reason: 'Insufficient disk space',
  required: '50MB',
  available: '10MB'
});

// Warning messages
logger.warn('Version mismatch detected', {
  current: '1.7.0',
  target: '1.8.0'
});

// Info messages
logger.info('Starting adoption process', {
  mode: 'smart-update',
  filesCount: 5
});

// Debug messages (only in debug/verbose mode)
logger.debug('Checking file permissions', {
  file: '.sce/steering/CORE_PRINCIPLES.md',
  readable: true,
  writable: true
});

// Verbose messages (only in verbose mode)
logger.verbose('File content comparison', {
  file: 'README.md',
  localHash: 'abc123',
  templateHash: 'def456',
  identical: false
});
```

### Operation Logging

```javascript
// Log operation start
logger.startOperation('backup', {
  files: ['file1.txt', 'file2.txt'],
  destination: '.sce/backups/adopt-20260127-143022'
});

// Log operation end
logger.endOperation('backup', {
  success: true,
  filesBackedUp: 2,
  totalSize: 10240
});

// Log operation error
try {
  // ... operation code ...
} catch (error) {
  logger.operationError('backup', error);
}

// Log file operations
logger.fileOperation('create', '.sce/steering/ENVIRONMENT.md', {
  size: 2048,
  source: 'template'
});

logger.fileOperation('update', '.sce/steering/CORE_PRINCIPLES.md', {
  oldVersion: '5.0',
  newVersion: '5.1'
});

logger.fileOperation('preserve', '.sce/specs/my-feature/requirements.md', {
  reason: 'User content'
});
```

## Domain-Specific Logging

### Detection Result

```javascript
const state = {
  hasKiroDir: true,
  hasVersionFile: true,
  currentVersion: '1.7.0',
  targetVersion: '1.8.0',
  conflicts: ['file1.txt', 'file2.txt']
};

logger.detectionResult(state);
// Logs: Project state detected with conflict count
```

### Strategy Selection

```javascript
logger.strategySelected('smart-update', 'Version mismatch detected');
// Logs: Strategy selected with mode and reason
```

### Conflict Resolution

```javascript
logger.conflictResolved(
  '.sce/steering/CORE_PRINCIPLES.md',
  'update',
  'Template file - backup and update'
);
// Logs: Conflict resolved with file path, resolution, and reason
```

### Backup Creation

```javascript
const backup = {
  id: 'backup-20260127-143022',
  location: '.sce/backups/adopt-20260127-143022',
  filesCount: 5,
  totalSize: 51200
};

logger.backupCreated(backup);
// Logs: Backup created with details
```

### Validation Result

```javascript
// Success
const validation = {
  success: true,
  filesVerified: 5
};
logger.validationResult(validation);

// Failure
const validation = {
  success: false,
  error: 'File count mismatch: expected 5, got 4'
};
logger.validationResult(validation);
```

### Adoption Plan

```javascript
const plan = {
  mode: 'smart-update',
  requiresBackup: true,
  changes: {
    created: ['file1.txt'],
    updated: ['file2.txt', 'file3.txt'],
    deleted: [],
    preserved: ['file4.txt']
  }
};

logger.adoptionPlan(plan);
// Logs: Adoption plan with change counts
```

### Adoption Result

```javascript
// Success
const result = {
  success: true,
  mode: 'smart-update',
  backup: { id: 'backup-20260127-143022' },
  changes: {
    created: [],
    updated: ['file1.txt'],
    deleted: [],
    preserved: ['file2.txt']
  }
};
logger.adoptionResult(result);

// Failure
const result = {
  success: false,
  errors: ['Backup creation failed', 'Permission denied']
};
logger.adoptionResult(result);
```

## Complete Example

```javascript
const AdoptionLogger = require('./lib/adoption/adoption-logger');

async function performAdoption(projectPath) {
  // Create logger
  const logger = new AdoptionLogger({
    level: 'verbose',
    logToFile: true,
    logToConsole: false
  });

  // Initialize logger
  const adoptionId = `adopt-${Date.now()}`;
  logger.initialize(projectPath, adoptionId);

  try {
    // Log detection
    logger.startOperation('detection');
    const state = detectProjectState(projectPath);
    logger.detectionResult(state);
    logger.endOperation('detection', { success: true });

    // Log strategy selection
    const mode = selectMode(state);
    logger.strategySelected(mode, 'Based on project state');

    // Log backup creation
    logger.startOperation('backup');
    const backup = await createBackup(projectPath);
    logger.backupCreated(backup);
    logger.endOperation('backup', { success: true });

    // Log file operations
    logger.startOperation('update-files');
    for (const file of filesToUpdate) {
      logger.fileOperation('update', file, { source: 'template' });
      await updateFile(file);
    }
    logger.endOperation('update-files', { filesUpdated: filesToUpdate.length });

    // Log result
    const result = {
      success: true,
      mode,
      backup,
      changes: { updated: filesToUpdate, preserved: preservedFiles }
    };
    logger.adoptionResult(result);

  } catch (error) {
    logger.operationError('adoption', error);
    logger.adoptionResult({ success: false, errors: [error.message] });
  } finally {
    // Flush logs
    logger.flush();
    console.log(`Log file: ${logger.getLogFilePath()}`);
  }
}
```

## Integration with Progress Reporter

The logger is designed to work alongside the `ProgressReporter`:

```javascript
const ProgressReporter = require('./lib/adoption/progress-reporter');
const AdoptionLogger = require('./lib/adoption/adoption-logger');

// Progress reporter for user-facing output
const reporter = new ProgressReporter({ verbose: false });

// Logger for detailed debugging
const logger = new AdoptionLogger({
  level: 'verbose',
  logToFile: true,
  logToConsole: false
});

// Initialize both
reporter.start();
logger.initialize(projectPath, adoptionId);

// Use both together
reporter.reportStage('Analyzing', 'in-progress');
logger.startOperation('detection');

const state = detectProjectState(projectPath);

logger.detectionResult(state);
logger.endOperation('detection', { success: true });
reporter.reportStage('Analyzing', 'complete');
```

## Log Levels

The logger supports 5 log levels:

| Level | Value | When to Use |
|-------|-------|-------------|
| ERROR | 0 | Critical errors that prevent operation |
| WARN | 1 | Warnings about potential issues |
| INFO | 2 | General information about operations (default) |
| DEBUG | 3 | Detailed information for debugging |
| VERBOSE | 4 | Very detailed information including all operations |

**Log Level Filtering**: Only messages at or below the configured level are logged.

Example:
- Level = INFO: Logs ERROR, WARN, INFO (not DEBUG or VERBOSE)
- Level = VERBOSE: Logs all messages

## Log File Format

Log files are created at `.sce/logs/adopt-{timestamp}.log` with the following format:

```
================================================================================
Scene Capability Engine - Adoption Log
Adoption ID: adopt-20260127-143022
Start Time: 2026-01-27T14:30:22.123Z
Log Level: VERBOSE
================================================================================

[2026-01-27T14:30:22.123Z] [+0ms] [INFO] Logger initialized {"logFile":".sce/logs/adopt-20260127-143022.log"}
[2026-01-27T14:30:22.456Z] [+333ms] [INFO] Starting operation: detection
[2026-01-27T14:30:22.789Z] [+666ms] [INFO] Project state detected {"hasKiroDir":true,"currentVersion":"1.7.0"}
[2026-01-27T14:30:23.012Z] [+889ms] [INFO] Completed operation: detection {"success":true}

================================================================================
End Time: 2026-01-27T14:30:25.000Z
Total Duration: 2.88s
Total Log Entries: 15
================================================================================
```

## Buffer Management

The logger maintains an in-memory buffer of recent log entries:

```javascript
// Get log buffer
const buffer = logger.getLogBuffer();
console.log(`${buffer.length} log entries in buffer`);

// Clear buffer
logger.clearBuffer();

// Set max buffer size
const logger = new AdoptionLogger({ maxBufferSize: 500 });
```

## Enabling/Disabling Logging

```javascript
// Disable logging temporarily
logger.disable();
// ... operations not logged ...

// Re-enable logging
logger.enable();
// ... operations logged again ...
```

## Changing Log Level at Runtime

```javascript
// Start with INFO level
const logger = new AdoptionLogger({ level: 'info' });

// Change to VERBOSE for detailed section
logger.setLevel('verbose');
// ... detailed operations ...

// Change back to INFO
logger.setLevel('info');
```

## Best Practices

1. **Initialize Early**: Call `initialize()` as soon as you know the project path and adoption ID
2. **Use Appropriate Levels**: Use ERROR for failures, INFO for major steps, DEBUG/VERBOSE for details
3. **Include Context**: Always include relevant data in the second parameter
4. **Flush on Exit**: Call `flush()` to write the footer and ensure all logs are written
5. **Don't Log Sensitive Data**: Never log passwords, API keys, or personal information
6. **Use Domain Methods**: Prefer domain-specific methods (e.g., `backupCreated()`) over generic `info()`
7. **Combine with Progress Reporter**: Use logger for debugging, progress reporter for user feedback

## Troubleshooting

### Logs Not Being Written

```javascript
// Check if file logging is enabled
console.log('Log to file:', logger.logToFile);

// Check log file path
console.log('Log file:', logger.getLogFilePath());

// Ensure initialize() was called
logger.initialize(projectPath, adoptionId);
```

### Too Much Output

```javascript
// Reduce log level
logger.setLevel('info');  // or 'warn' or 'error'

// Disable console output
const logger = new AdoptionLogger({ logToConsole: false });
```

### Finding Log Files

Log files are stored at:
```
{projectPath}/.sce/logs/adopt-{timestamp}.log
```

Example:
```
/path/to/project/.sce/logs/adopt-20260127-143022.log
```

---

**Version**: 1.0  
**Last Updated**: 2026-01-27  
**Related**: Task 11 - Verbose Logging
