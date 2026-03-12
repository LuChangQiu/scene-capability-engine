# Error Formatter Usage Examples

This document demonstrates how to use the ErrorFormatter in adoption components.

## Basic Usage

```javascript
const ErrorFormatter = require('../lib/adoption/error-formatter');

// Simple error formatting
try {
  // Some operation
} catch (error) {
  console.error(ErrorFormatter.format(error));
  process.exit(1);
}
```

## With Context

```javascript
// Provide context for better error messages
try {
  await backupManager.createBackup(projectPath, files);
} catch (error) {
  console.error(ErrorFormatter.format(error, {
    operation: 'backup',
    filePath: projectPath,
    verbose: true
  }));
  process.exit(1);
}
```

## Specialized Formatters

```javascript
// Backup errors
try {
  await createBackup();
} catch (error) {
  console.error(ErrorFormatter.formatBackupError(error, {
    filePath: backupPath
  }));
}

// Permission errors
try {
  await fs.writeFile(path, content);
} catch (error) {
  console.error(ErrorFormatter.formatPermissionError(error, {
    filePath: path
  }));
}

// Validation errors
try {
  await validateBackup(backup);
} catch (error) {
  console.error(ErrorFormatter.formatValidationError(error));
}
```

## Simple Messages

```javascript
// Quick messages without full template
console.log(ErrorFormatter.formatSuccess('Adoption completed successfully!'));
console.log(ErrorFormatter.formatWarning('Backup skipped - changes cannot be undone'));
console.log(ErrorFormatter.formatInfo('Processing 5 files...'));
console.log(ErrorFormatter.formatSimple('Operation failed'));
```

## Multiple Errors

```javascript
const errors = [
  new Error('Backup creation failed'),
  new Error('Permission denied for file.txt'),
  'Disk space insufficient'
];

console.error(ErrorFormatter.formatMultiple(errors, 'Adoption Failed'));
```

## Integration with Smart Orchestrator

```javascript
class SmartOrchestrator {
  async orchestrate(projectPath, options = {}) {
    try {
      // ... orchestration logic
    } catch (error) {
      // Format error with context
      const formatted = ErrorFormatter.format(error, {
        operation: 'adoption',
        verbose: options.verbose
      });
      
      console.error(formatted);
      
      return {
        success: false,
        errors: [error.message]
      };
    }
  }
}
```

## Integration with Backup Manager

```javascript
class BackupManager {
  async createMandatoryBackup(projectPath, files, options = {}) {
    try {
      // ... backup logic
    } catch (error) {
      // Use specialized backup error formatter
      const formatted = ErrorFormatter.formatBackupError(error, {
        filePath: projectPath,
        verbose: options.verbose
      });
      
      throw new Error(formatted);
    }
  }
}
```

## Error Categories

The formatter automatically detects error categories:

- **BACKUP**: Backup creation/validation failures
- **PERMISSION**: File permission issues
- **DISK_SPACE**: Insufficient disk space
- **FILE_SYSTEM**: File not found, path errors
- **VERSION**: Version mismatch issues
- **VALIDATION**: Data validation failures
- **NETWORK**: Network connectivity issues
- **CONFIGURATION**: Configuration errors
- **UNKNOWN**: Unrecognized errors

## Output Example

```
❌ Error: Backup Creation Failed

Problem:
  Unable to create backup of existing files before making changes

Possible causes:
  • Insufficient disk space
  • Permission denied for .sce/backups/ directory
  • File system error or corruption
  • Another process is accessing the files

Solutions:
  1. Free up disk space (need at least 50MB)
  2. Check file permissions: Run with appropriate permissions
  3. Close other programs that might be accessing the files
  4. Try running the command again
  5. If problem persists, run: sce doctor

💡 Need help?
   Run: sce doctor
   Docs: https://github.com/kiro-ai/kiro-spec-engine#troubleshooting
```

## Best Practices

1. **Always provide context**: Include operation type and file paths when available
2. **Use specialized formatters**: Use `formatBackupError`, `formatPermissionError`, etc. for specific error types
3. **Enable verbose mode**: Pass `verbose: true` in context for debugging
4. **Catch and format**: Always catch errors and format them before displaying
5. **Consistent formatting**: Use the formatter throughout the adoption system for consistency

## Testing

```javascript
const ErrorFormatter = require('../lib/adoption/error-formatter');

describe('Error Handling', () => {
  test('should format backup errors', () => {
    const error = new Error('Backup failed');
    const formatted = ErrorFormatter.formatBackupError(error);
    
    expect(formatted).toContain('Backup Creation Failed');
    expect(formatted).toContain('Solutions:');
  });
});
```
