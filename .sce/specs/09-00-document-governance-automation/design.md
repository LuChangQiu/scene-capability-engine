# Design Document: Document Governance Automation

## Overview

The Document Governance Automation system provides automated enforcement of document lifecycle management rules established in Spec 08. This system integrates into the existing kiro-spec-engine CLI to detect, validate, and fix document violations across any project adopting the Spec-driven development approach.

The system consists of five core components:
1. **Diagnostic Engine** - Scans and identifies document violations
2. **Cleanup Tool** - Removes non-compliant temporary documents
3. **Validation Engine** - Verifies document structure compliance
4. **Archive Tool** - Organizes Spec artifacts into proper subdirectories
5. **Git Hooks Integration** - Prevents committing document violations

These components integrate seamlessly with existing CLI commands (`doctor`, `status`) and follow established patterns for command structure, error handling, and user interaction.

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI Entry Point                          │
│                  (bin/scene-capability-engine.js)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────────┐
│  Existing       │    │  New Document       │
│  Commands       │    │  Governance         │
│  - doctor       │    │  Commands           │
│  - status       │    │  - cleanup          │
│  - task         │    │  - validate         │
│  - workspace    │    │  - archive          │
└─────────────────┘    │  - hooks            │
                       │  - config docs      │
                       │  - docs stats       │
                       └──────────┬──────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
         ┌──────────────────┐        ┌──────────────────┐
         │  Core Engines    │        │  Utilities       │
         │  - Diagnostic    │        │  - FileScanner   │
         │  - Validation    │        │  - PathResolver  │
         │  - Cleanup       │        │  - Reporter      │
         │  - Archive       │        │  - ConfigMgr     │
         └──────────────────┘        └──────────────────┘
```

### Component Interaction Flow

```
User Command
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Command Handler (lib/commands/docs.js)              │
│ - Parse arguments                                   │
│ - Load configuration                                │
│ - Initialize appropriate engine                     │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ Engine (lib/governance/*.js)                        │
│ - Execute core logic                                │
│ - Use utilities for file operations                 │
│ - Generate results                                  │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ Reporter (lib/governance/reporter.js)               │
│ - Format results                                    │
│ - Display to console                                │
│ - Save reports (if requested)                       │
└─────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Command Handler (lib/commands/docs.js)

Main entry point for all document governance commands.

```javascript
/**
 * Document Governance Command Handler
 * 
 * Provides CLI interface for document governance operations
 */
class DocsCommand {
  /**
   * Execute document governance command
   * 
   * @param {string} subcommand - The subcommand (cleanup, validate, archive, etc.)
   * @param {Object} options - Command options
   * @returns {Promise<void>}
   */
  async execute(subcommand, options) {
    // Route to appropriate handler
  }
  
  /**
   * Display help information
   */
  showHelp() {
    // Display available subcommands and options
  }
}
```

### 2. Diagnostic Engine (lib/governance/diagnostic-engine.js)

Scans project structure and identifies document violations.

```javascript
/**
 * Diagnostic Engine
 * 
 * Scans and analyzes project documentation structure
 */
class DiagnosticEngine {
  constructor(projectPath, config) {
    this.projectPath = projectPath;
    this.config = config;
    this.violations = [];
  }
  
  /**
   * Run full diagnostic scan
   * 
   * @returns {Promise<DiagnosticReport>}
   */
  async scan() {
    await this.scanRootDirectory();
    await this.scanSpecDirectories();
    return this.generateReport();
  }
  
  /**
   * Scan root directory for violations
   * 
   * @returns {Promise<void>}
   */
  async scanRootDirectory() {
    // Check for non-allowed .md files
    // Identify temporary documents
  }
  
  /**
   * Scan all Spec directories
   * 
   * @returns {Promise<void>}
   */
  async scanSpecDirectories() {
    // Check each Spec directory structure
    // Identify missing required files
    // Identify misplaced artifacts
  }
  
  /**
   * Generate diagnostic report
   * 
   * @returns {DiagnosticReport}
   */
  generateReport() {
    return {
      compliant: this.violations.length === 0,
      violations: this.violations,
      summary: this.generateSummary(),
      recommendations: this.generateRecommendations()
    };
  }
}

/**
 * @typedef {Object} DiagnosticReport
 * @property {boolean} compliant - Whether project is compliant
 * @property {Violation[]} violations - List of violations found
 * @property {Object} summary - Summary statistics
 * @property {string[]} recommendations - Actionable recommendations
 */

/**
 * @typedef {Object} Violation
 * @property {string} type - Violation type (root_violation, spec_violation, etc.)
 * @property {string} path - File or directory path
 * @property {string} description - Human-readable description
 * @property {string} severity - Severity level (error, warning, info)
 * @property {string} recommendation - How to fix
 */
```

### 3. Cleanup Tool (lib/governance/cleanup-tool.js)

Removes non-compliant temporary documents.

```javascript
/**
 * Cleanup Tool
 * 
 * Removes temporary and non-compliant documents
 */
class CleanupTool {
  constructor(projectPath, config) {
    this.projectPath = projectPath;
    this.config = config;
    this.deletedFiles = [];
    this.errors = [];
  }
  
  /**
   * Execute cleanup operation
   * 
   * @param {Object} options - Cleanup options
   * @param {boolean} options.dryRun - Preview without deleting
   * @param {boolean} options.interactive - Prompt for each file
   * @param {string} options.spec - Specific Spec to clean
   * @returns {Promise<CleanupReport>}
   */
  async cleanup(options = {}) {
    const filesToDelete = await this.identifyFilesToDelete(options.spec);
    
    if (options.dryRun) {
      return this.generateDryRunReport(filesToDelete);
    }
    
    for (const file of filesToDelete) {
      if (options.interactive) {
        const shouldDelete = await this.promptForConfirmation(file);
        if (!shouldDelete) continue;
      }
      
      await this.deleteFile(file);
    }
    
    return this.generateReport();
  }
  
  /**
   * Identify files to delete
   * 
   * @param {string} specName - Optional specific Spec
   * @returns {Promise<string[]>}
   */
  async identifyFilesToDelete(specName = null) {
    const files = [];
    
    // Scan root directory
    files.push(...await this.scanRootForTemporary());
    
    // Scan Spec directories
    if (specName) {
      files.push(...await this.scanSpecForTemporary(specName));
    } else {
      files.push(...await this.scanAllSpecsForTemporary());
    }
    
    return files;
  }
  
  /**
   * Delete a file safely
   * 
   * @param {string} filePath - Path to file
   * @returns {Promise<void>}
   */
  async deleteFile(filePath) {
    try {
      await fs.remove(filePath);
      this.deletedFiles.push(filePath);
    } catch (error) {
      this.errors.push({ path: filePath, error: error.message });
    }
  }
  
  /**
   * Generate cleanup report
   * 
   * @returns {CleanupReport}
   */
  generateReport() {
    return {
      success: this.errors.length === 0,
      deletedFiles: this.deletedFiles,
      errors: this.errors,
      summary: {
        totalDeleted: this.deletedFiles.length,
        totalErrors: this.errors.length
      }
    };
  }
}

/**
 * @typedef {Object} CleanupReport
 * @property {boolean} success - Whether cleanup succeeded
 * @property {string[]} deletedFiles - Files that were deleted
 * @property {Object[]} errors - Errors encountered
 * @property {Object} summary - Summary statistics
 */
```

### 4. Validation Engine (lib/governance/validation-engine.js)

Verifies document structure against defined rules.

```javascript
/**
 * Validation Engine
 * 
 * Validates project documentation structure
 */
class ValidationEngine {
  constructor(projectPath, config) {
    this.projectPath = projectPath;
    this.config = config;
    this.validationErrors = [];
    this.validationWarnings = [];
  }
  
  /**
   * Validate project structure
   * 
   * @param {Object} options - Validation options
   * @param {string} options.spec - Specific Spec to validate
   * @param {boolean} options.all - Validate all Specs
   * @returns {Promise<ValidationReport>}
   */
  async validate(options = {}) {
    await this.validateRootDirectory();
    
    if (options.spec) {
      await this.validateSpec(options.spec);
    } else if (options.all) {
      await this.validateAllSpecs();
    }
    
    return this.generateReport();
  }
  
  /**
   * Validate root directory
   * 
   * @returns {Promise<void>}
   */
  async validateRootDirectory() {
    const mdFiles = await this.findMarkdownFiles(this.projectPath);
    const allowedFiles = this.config.rootAllowedFiles;
    
    for (const file of mdFiles) {
      const basename = path.basename(file);
      if (!allowedFiles.includes(basename)) {
        this.validationErrors.push({
          type: 'root_violation',
          path: file,
          message: `Unexpected markdown file in root: ${basename}`,
          recommendation: 'Move to appropriate location or delete if temporary'
        });
      }
    }
  }
  
  /**
   * Validate a Spec directory
   * 
   * @param {string} specName - Spec name
   * @returns {Promise<void>}
   */
  async validateSpec(specName) {
    const specPath = path.join(this.projectPath, '.sce/specs', specName);
    
    // Check required files
    const requiredFiles = ['requirements.md', 'design.md', 'tasks.md'];
    for (const file of requiredFiles) {
      const filePath = path.join(specPath, file);
      if (!await fs.pathExists(filePath)) {
        this.validationErrors.push({
          type: 'missing_required_file',
          path: filePath,
          message: `Missing required file: ${file}`,
          recommendation: `Create ${file} in ${specName}`
        });
      }
    }
    
    // Check for misplaced artifacts
    const files = await fs.readdir(specPath);
    const allowedSubdirs = this.config.specSubdirs;
    
    for (const file of files) {
      const filePath = path.join(specPath, file);
      const stat = await fs.stat(filePath);
      
      if (stat.isFile() && !requiredFiles.includes(file)) {
        this.validationWarnings.push({
          type: 'misplaced_artifact',
          path: filePath,
          message: `Artifact not in subdirectory: ${file}`,
          recommendation: `Move to appropriate subdirectory (${allowedSubdirs.join(', ')})`
        });
      }
    }
  }
  
  /**
   * Generate validation report
   * 
   * @returns {ValidationReport}
   */
  generateReport() {
    return {
      valid: this.validationErrors.length === 0,
      errors: this.validationErrors,
      warnings: this.validationWarnings,
      summary: {
        totalErrors: this.validationErrors.length,
        totalWarnings: this.validationWarnings.length
      }
    };
  }
}

/**
 * @typedef {Object} ValidationReport
 * @property {boolean} valid - Whether validation passed
 * @property {Object[]} errors - Validation errors
 * @property {Object[]} warnings - Validation warnings
 * @property {Object} summary - Summary statistics
 */
```

### 5. Archive Tool (lib/governance/archive-tool.js)

Organizes Spec artifacts into proper subdirectories.

```javascript
/**
 * Archive Tool
 * 
 * Organizes Spec artifacts into proper subdirectories
 */
class ArchiveTool {
  constructor(projectPath, config) {
    this.projectPath = projectPath;
    this.config = config;
    this.movedFiles = [];
    this.errors = [];
  }
  
  /**
   * Archive artifacts in a Spec directory
   * 
   * @param {string} specName - Spec name
   * @param {Object} options - Archive options
   * @param {boolean} options.dryRun - Preview without moving
   * @returns {Promise<ArchiveReport>}
   */
  async archive(specName, options = {}) {
    const specPath = path.join(this.projectPath, '.sce/specs', specName);
    const artifacts = await this.identifyArtifacts(specPath);
    
    if (options.dryRun) {
      return this.generateDryRunReport(artifacts);
    }
    
    for (const artifact of artifacts) {
      await this.moveArtifact(artifact);
    }
    
    return this.generateReport();
  }
  
  /**
   * Identify artifacts to archive
   * 
   * @param {string} specPath - Path to Spec directory
   * @returns {Promise<Artifact[]>}
   */
  async identifyArtifacts(specPath) {
    const artifacts = [];
    const files = await fs.readdir(specPath);
    const requiredFiles = ['requirements.md', 'design.md', 'tasks.md'];
    
    for (const file of files) {
      const filePath = path.join(specPath, file);
      const stat = await fs.stat(filePath);
      
      if (stat.isFile() && !requiredFiles.includes(file)) {
        const targetSubdir = this.determineTargetSubdir(file);
        artifacts.push({
          sourcePath: filePath,
          targetSubdir: targetSubdir,
          filename: file
        });
      }
    }
    
    return artifacts;
  }
  
  /**
   * Determine target subdirectory for a file
   * 
   * @param {string} filename - File name
   * @returns {string}
   */
  determineTargetSubdir(filename) {
    const lower = filename.toLowerCase();
    
    // Scripts
    if (lower.endsWith('.js') || lower.endsWith('.py') || 
        lower.endsWith('.sh') || lower.includes('script')) {
      return 'scripts';
    }
    
    // Reports
    if (lower.includes('report') || lower.includes('analysis') || 
        lower.includes('summary')) {
      return 'reports';
    }
    
    // Tests
    if (lower.includes('test') || lower.endsWith('.test.js') || 
        lower.endsWith('.spec.js')) {
      return 'tests';
    }
    
    // Results
    if (lower.includes('result') || lower.includes('output')) {
      return 'results';
    }
    
    // Default to docs
    return 'docs';
  }
  
  /**
   * Move an artifact to its target subdirectory
   * 
   * @param {Artifact} artifact - Artifact to move
   * @returns {Promise<void>}
   */
  async moveArtifact(artifact) {
    try {
      const targetDir = path.join(
        path.dirname(artifact.sourcePath),
        artifact.targetSubdir
      );
      
      // Ensure target directory exists
      await fs.ensureDir(targetDir);
      
      const targetPath = path.join(targetDir, artifact.filename);
      await fs.move(artifact.sourcePath, targetPath);
      
      this.movedFiles.push({
        from: artifact.sourcePath,
        to: targetPath
      });
    } catch (error) {
      this.errors.push({
        path: artifact.sourcePath,
        error: error.message
      });
    }
  }
  
  /**
   * Generate archive report
   * 
   * @returns {ArchiveReport}
   */
  generateReport() {
    return {
      success: this.errors.length === 0,
      movedFiles: this.movedFiles,
      errors: this.errors,
      summary: {
        totalMoved: this.movedFiles.length,
        totalErrors: this.errors.length
      }
    };
  }
}

/**
 * @typedef {Object} Artifact
 * @property {string} sourcePath - Current file path
 * @property {string} targetSubdir - Target subdirectory name
 * @property {string} filename - File name
 */

/**
 * @typedef {Object} ArchiveReport
 * @property {boolean} success - Whether archiving succeeded
 * @property {Object[]} movedFiles - Files that were moved
 * @property {Object[]} errors - Errors encountered
 * @property {Object} summary - Summary statistics
 */
```

### 6. Configuration Manager (lib/governance/config-manager.js)

Manages document governance configuration.

```javascript
/**
 * Configuration Manager
 * 
 * Manages document governance configuration
 */
class ConfigManager {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.configPath = path.join(projectPath, '.sce/config/docs.json');
    this.config = null;
  }
  
  /**
   * Load configuration
   * 
   * @returns {Promise<Object>}
   */
  async load() {
    if (await fs.pathExists(this.configPath)) {
      try {
        this.config = await fs.readJson(this.configPath);
      } catch (error) {
        console.warn('Config file corrupted, using defaults');
        this.config = this.getDefaults();
      }
    } else {
      this.config = this.getDefaults();
    }
    
    return this.config;
  }
  
  /**
   * Get default configuration
   * 
   * @returns {Object}
   */
  getDefaults() {
    return {
      rootAllowedFiles: [
        'README.md',
        'README.zh.md',
        'CHANGELOG.md',
        'CONTRIBUTING.md'
      ],
      specSubdirs: [
        'reports',
        'scripts',
        'tests',
        'results',
        'docs'
      ],
      temporaryPatterns: [
        '*-SUMMARY.md',
        'SESSION-*.md',
        '*-COMPLETE.md',
        'TEMP-*.md',
        'WIP-*.md',
        'MVP-*.md'
      ]
    };
  }
  
  /**
   * Save configuration
   * 
   * @param {Object} config - Configuration to save
   * @returns {Promise<void>}
   */
  async save(config) {
    await fs.ensureDir(path.dirname(this.configPath));
    await fs.writeJson(this.configPath, config, { spaces: 2 });
    this.config = config;
  }
  
  /**
   * Update a configuration value
   * 
   * @param {string} key - Configuration key
   * @param {any} value - New value
   * @returns {Promise<void>}
   */
  async set(key, value) {
    if (!this.config) {
      await this.load();
    }
    
    this.config[key] = value;
    await this.save(this.config);
  }
  
  /**
   * Reset to defaults
   * 
   * @returns {Promise<void>}
   */
  async reset() {
    this.config = this.getDefaults();
    await this.save(this.config);
  }
}
```

### 7. Reporter (lib/governance/reporter.js)

Formats and displays results to users.

```javascript
/**
 * Reporter
 * 
 * Formats and displays governance operation results
 */
class Reporter {
  constructor() {
    this.chalk = require('chalk');
  }
  
  /**
   * Display diagnostic report
   * 
   * @param {DiagnosticReport} report - Diagnostic report
   */
  displayDiagnostic(report) {
    console.log(this.chalk.red('🔥') + ' Document Governance Diagnostic');
    console.log();
    
    if (report.compliant) {
      console.log(this.chalk.green('✅ Project is compliant'));
      console.log('All documents follow the lifecycle management rules.');
      return;
    }
    
    console.log(this.chalk.yellow(`⚠️  Found ${report.violations.length} violation(s)`));
    console.log();
    
    // Group violations by type
    const byType = this.groupBy(report.violations, 'type');
    
    for (const [type, violations] of Object.entries(byType)) {
      console.log(this.chalk.blue(`${this.formatType(type)} (${violations.length})`));
      
      for (const violation of violations) {
        const icon = violation.severity === 'error' ? '❌' : '⚠️';
        console.log(`  ${icon} ${violation.path}`);
        console.log(`     ${this.chalk.gray(violation.description)}`);
        console.log(`     ${this.chalk.cyan('→ ' + violation.recommendation)}`);
      }
      
      console.log();
    }
    
    // Display recommendations
    if (report.recommendations.length > 0) {
      console.log(this.chalk.blue('💡 Recommended Actions'));
      report.recommendations.forEach(rec => {
        console.log(`  • ${rec}`);
      });
      console.log();
    }
  }
  
  /**
   * Display cleanup report
   * 
   * @param {CleanupReport} report - Cleanup report
   * @param {boolean} dryRun - Whether this was a dry run
   */
  displayCleanup(report, dryRun = false) {
    const title = dryRun ? 'Cleanup Preview (Dry Run)' : 'Cleanup Complete';
    console.log(this.chalk.red('🔥') + ` ${title}`);
    console.log();
    
    if (report.deletedFiles.length === 0) {
      console.log(this.chalk.green('✅ No files to clean'));
      return;
    }
    
    const verb = dryRun ? 'Would delete' : 'Deleted';
    console.log(this.chalk.yellow(`${verb} ${report.deletedFiles.length} file(s):`));
    console.log();
    
    report.deletedFiles.forEach(file => {
      console.log(`  🗑️  ${file}`);
    });
    
    if (report.errors.length > 0) {
      console.log();
      console.log(this.chalk.red(`❌ ${report.errors.length} error(s):`));
      report.errors.forEach(err => {
        console.log(`  • ${err.path}: ${err.error}`);
      });
    }
    
    console.log();
    
    if (dryRun) {
      console.log(this.chalk.cyan('Run without --dry-run to actually delete these files'));
    } else if (report.success) {
      console.log(this.chalk.green('✅ Cleanup completed successfully'));
    }
  }
  
  /**
   * Display validation report
   * 
   * @param {ValidationReport} report - Validation report
   */
  displayValidation(report) {
    console.log(this.chalk.red('🔥') + ' Document Structure Validation');
    console.log();
    
    if (report.valid) {
      console.log(this.chalk.green('✅ Validation passed'));
      console.log('All document structures are compliant.');
      return;
    }
    
    if (report.errors.length > 0) {
      console.log(this.chalk.red(`❌ ${report.errors.length} error(s):`));
      console.log();
      
      report.errors.forEach(err => {
        console.log(`  ❌ ${err.path}`);
        console.log(`     ${this.chalk.gray(err.message)}`);
        console.log(`     ${this.chalk.cyan('→ ' + err.recommendation)}`);
      });
      
      console.log();
    }
    
    if (report.warnings.length > 0) {
      console.log(this.chalk.yellow(`⚠️  ${report.warnings.length} warning(s):`));
      console.log();
      
      report.warnings.forEach(warn => {
        console.log(`  ⚠️  ${warn.path}`);
        console.log(`     ${this.chalk.gray(warn.message)}`);
        console.log(`     ${this.chalk.cyan('→ ' + warn.recommendation)}`);
      });
      
      console.log();
    }
  }
  
  /**
   * Display archive report
   * 
   * @param {ArchiveReport} report - Archive report
   * @param {boolean} dryRun - Whether this was a dry run
   */
  displayArchive(report, dryRun = false) {
    const title = dryRun ? 'Archive Preview (Dry Run)' : 'Archive Complete';
    console.log(this.chalk.red('🔥') + ` ${title}`);
    console.log();
    
    if (report.movedFiles.length === 0) {
      console.log(this.chalk.green('✅ No files to archive'));
      return;
    }
    
    const verb = dryRun ? 'Would move' : 'Moved';
    console.log(this.chalk.yellow(`${verb} ${report.movedFiles.length} file(s):`));
    console.log();
    
    report.movedFiles.forEach(move => {
      console.log(`  📦 ${path.basename(move.from)}`);
      console.log(`     ${this.chalk.gray('→')} ${move.to}`);
    });
    
    if (report.errors.length > 0) {
      console.log();
      console.log(this.chalk.red(`❌ ${report.errors.length} error(s):`));
      report.errors.forEach(err => {
        console.log(`  • ${err.path}: ${err.error}`);
      });
    }
    
    console.log();
    
    if (dryRun) {
      console.log(this.chalk.cyan('Run without --dry-run to actually move these files'));
    } else if (report.success) {
      console.log(this.chalk.green('✅ Archive completed successfully'));
    }
  }
  
  /**
   * Helper: Group array by property
   */
  groupBy(array, property) {
    return array.reduce((acc, item) => {
      const key = item[property];
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }
  
  /**
   * Helper: Format violation type
   */
  formatType(type) {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }
}
```

## Data Models

### Configuration Schema

```javascript
{
  // Allowed markdown files in root directory
  rootAllowedFiles: [
    'README.md',
    'README.zh.md',
    'CHANGELOG.md',
    'CONTRIBUTING.md'
  ],
  
  // Recognized Spec subdirectories
  specSubdirs: [
    'reports',
    'scripts',
    'tests',
    'results',
    'docs'
  ],
  
  // Patterns for temporary documents
  temporaryPatterns: [
    '*-SUMMARY.md',
    'SESSION-*.md',
    '*-COMPLETE.md',
    'TEMP-*.md',
    'WIP-*.md',
    'MVP-*.md'
  ]
}
```

### Violation Object

```javascript
{
  type: 'root_violation' | 'spec_violation' | 'missing_file' | 'misplaced_artifact',
  path: '/absolute/path/to/file',
  description: 'Human-readable description',
  severity: 'error' | 'warning' | 'info',
  recommendation: 'How to fix this violation'
}
```

### Report Objects

All report objects follow a consistent structure:

```javascript
{
  success: boolean,           // Overall success status
  [data]: Array,             // Operation-specific data
  errors: Array,             // Errors encountered
  summary: {                 // Summary statistics
    [key]: number
  }
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Root Directory Violation Detection
*For any* root directory containing markdown files, the Diagnostic Engine should identify all .md files that are not in the allowed list (README.md, README.zh.md, CHANGELOG.md, CONTRIBUTING.md) as violations.
**Validates: Requirements 1.2, 3.2**

### Property 2: Spec Required Files Detection
*For any* Spec directory, the Diagnostic Engine should identify missing required files (requirements.md, design.md, tasks.md) as violations.
**Validates: Requirements 1.3, 3.4**

### Property 3: Temporary Document Pattern Matching
*For any* Spec directory containing files matching temporary patterns (*-SUMMARY.md, SESSION-*.md, etc.), the Diagnostic Engine should identify all matching files as violations.
**Validates: Requirements 1.4**

### Property 4: Misplaced Artifact Detection
*For any* Spec directory containing files that are not required files and not in subdirectories, the Diagnostic Engine should identify them as misplaced artifacts.
**Validates: Requirements 1.5**

### Property 5: Violation Recommendations Completeness
*For any* violation found by any governance tool, the violation object should contain a non-empty recommendation field.
**Validates: Requirements 1.8, 3.7**

### Property 6: Report Structure Completeness
*For any* governance operation (diagnostic, cleanup, validation, archive), the generated report should contain all required fields: success/valid status, data array, errors array, and summary object.
**Validates: Requirements 1.6, 2.6, 3.6, 4.9**

### Property 7: Cleanup Removes Temporary Files
*For any* project with temporary documents in root or Spec directories, running cleanup should result in all temporary documents being removed from the file system.
**Validates: Requirements 2.1, 2.2**

### Property 8: Dry Run Idempotence
*For any* governance operation with --dry-run flag, the file system state before and after the operation should be identical (no files created, deleted, or moved).
**Validates: Requirements 2.3, 4.8**

### Property 9: Scoped Cleanup
*For any* project with multiple Specs, running cleanup with --spec flag should only remove files from the specified Spec directory, leaving other Specs unchanged.
**Validates: Requirements 2.5**

### Property 10: Error Resilience
*For any* governance operation encountering file system errors (unreadable, undeletable, unmovable files), the operation should log the error, continue processing remaining files, and include the error in the final report.
**Validates: Requirements 2.7, 8.1, 8.2, 8.3**

### Property 11: Validation Scope
*For any* project with multiple Specs, running validate with --all flag should validate all Spec directories, while running without flags should only validate the root directory.
**Validates: Requirements 3.8**

### Property 12: Subdirectory Naming Validation
*For any* Spec directory containing subdirectories, validation should only pass if all subdirectories match the allowed list (reports, scripts, tests, results, docs) or are hidden directories (starting with .).
**Validates: Requirements 3.5**

### Property 13: File Type Classification
*For any* artifact file, the Archive Tool should correctly classify it into one of the five categories (scripts, reports, tests, results, docs) based on its filename and extension, and move it to the corresponding subdirectory.
**Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6**

### Property 14: Subdirectory Creation
*For any* archiving operation where the target subdirectory does not exist, the Archive Tool should create the subdirectory before moving the file.
**Validates: Requirements 4.7**

### Property 15: Hook Preservation
*For any* project with existing Git hooks, installing document governance hooks should preserve the existing hook content while adding validation logic.
**Validates: Requirements 5.7**

### Property 16: Configuration Persistence
*For any* configuration setting, after setting a value and reloading the configuration, the loaded value should equal the set value.
**Validates: Requirements 6.2, 6.3**

### Property 17: Custom Configuration Precedence
*For any* governance operation when custom configuration exists, the operation should use custom rules instead of default rules for all decision-making.
**Validates: Requirements 6.4, 6.5**

### Property 18: Configuration Reset Round Trip
*For any* configuration state, setting custom values then resetting should result in configuration equal to the default configuration.
**Validates: Requirements 6.6**

### Property 19: Execution Logging
*For any* governance tool execution, a log entry should be created in the history file with timestamp, tool name, and operation details.
**Validates: Requirements 7.1**

### Property 20: Statistics Completeness
*For any* statistics display, the output should contain all required metrics: total violations over time, violations by type, and cleanup actions over time.
**Validates: Requirements 7.3, 7.4, 7.5**

### Property 21: Report File Creation
*For any* report generation operation, a markdown file should be created at `.sce/reports/document-compliance-{timestamp}.md` containing the compliance report.
**Validates: Requirements 7.7**

### Property 22: Corrupted Config Fallback
*For any* corrupted or invalid configuration file, loading the configuration should return the default configuration and log a warning.
**Validates: Requirements 8.5**

### Property 23: Git Hooks Directory Creation
*For any* project without a `.git/hooks` directory, installing hooks should create the directory before creating the hook file.
**Validates: Requirements 8.4**

### Property 24: Error Exit Codes
*For any* governance operation that encounters errors, the process should exit with a non-zero status code.
**Validates: Requirements 8.7**

### Property 25: Cross-Platform Path Handling
*For any* file path operation on any platform, the system should use the platform-appropriate path separator (backslash on Windows, forward slash on Unix-like systems).
**Validates: Requirements 9.1, 9.2**

### Property 26: Error Handling Consistency
*For any* governance command error, the error structure and handling should match the patterns used in existing CLI commands (doctor, status, task).
**Validates: Requirements 10.5**

## Error Handling

### Error Categories

1. **File System Errors**
   - Unreadable files during scanning
   - Undeletable files during cleanup
   - Unmovable files during archiving
   - Permission denied errors

2. **Configuration Errors**
   - Corrupted configuration file
   - Invalid configuration values
   - Missing configuration directory

3. **Git Errors**
   - Missing .git directory
   - Existing hook conflicts
   - Permission issues with hooks directory

4. **Validation Errors**
   - Missing required files
   - Invalid directory structure
   - Non-compliant document placement

### Error Handling Strategy

**Graceful Degradation:**
- Continue operation when individual files fail
- Log all errors for user review
- Provide clear error messages with context
- Include errors in final report

**User Guidance:**
- Suggest specific fixes for each error
- Provide commands to resolve issues
- Link to documentation when appropriate

**Exit Codes:**
- 0: Success, no errors
- 1: Operation completed with errors
- 2: Operation failed completely
- 3: Invalid arguments or configuration

### Error Recovery

**Automatic Recovery:**
- Create missing directories
- Use default configuration if corrupted
- Skip problematic files and continue

**Manual Recovery:**
- Provide clear instructions for permission issues
- Suggest alternative approaches for Git hook conflicts
- Guide users through configuration fixes

## Testing Strategy

### Dual Testing Approach

This system requires both unit tests and property-based tests for comprehensive coverage:

**Unit Tests:**
- Specific examples of each violation type
- Edge cases (empty directories, no Specs, etc.)
- Integration with existing CLI commands
- Error conditions with specific file states
- Configuration loading and saving
- Report generation and formatting

**Property-Based Tests:**
- Universal properties across all inputs
- Randomized file system states
- Various combinations of violations
- Different configuration values
- Cross-platform path handling

### Property-Based Testing Configuration

**Library:** fast-check (already in project dependencies)

**Test Configuration:**
- Minimum 100 iterations per property test
- Each test references its design document property
- Tag format: **Feature: document-governance-automation, Property {number}: {property_text}**

### Test Organization

```
tests/
├── unit/
│   ├── governance/
│   │   ├── diagnostic-engine.test.js
│   │   ├── cleanup-tool.test.js
│   │   ├── validation-engine.test.js
│   │   ├── archive-tool.test.js
│   │   ├── config-manager.test.js
│   │   └── reporter.test.js
│   └── commands/
│       └── docs.test.js
└── properties/
    ├── diagnostic-properties.test.js
    ├── cleanup-properties.test.js
    ├── validation-properties.test.js
    ├── archive-properties.test.js
    └── config-properties.test.js
```

### Key Test Scenarios

**Unit Test Scenarios:**
1. Empty project (no .sce directory)
2. Project with only root violations
3. Project with only Spec violations
4. Project with mixed violations
5. Fully compliant project
6. Cleanup with read-only files
7. Archive with non-existent subdirectories
8. Configuration with invalid JSON
9. Git hooks with existing hooks
10. Cross-platform path handling

**Property Test Scenarios:**
1. Random markdown files in root directory
2. Random Spec directory structures
3. Random temporary file patterns
4. Random artifact file types
5. Random configuration values
6. Random error conditions
7. Random file system states

### Integration Testing

**CLI Integration:**
- Test all commands through CLI entry point
- Verify output formatting matches existing commands
- Test command chaining (doctor → cleanup → validate)
- Verify help text and error messages

**File System Integration:**
- Test with real file system operations
- Verify file creation, deletion, and movement
- Test with various file permissions
- Test with symbolic links and special files

**Git Integration:**
- Test hook installation and removal
- Test with existing hooks
- Test hook execution during commits
- Test with various Git configurations

### Test Data Management

**Fixtures:**
- Sample compliant project structure
- Sample non-compliant project structures
- Sample configuration files
- Sample violation reports

**Generators (for property tests):**
- Random markdown file names
- Random Spec directory structures
- Random temporary file patterns
- Random configuration objects
- Random file system states

### Coverage Goals

- **Line Coverage:** > 90%
- **Branch Coverage:** > 85%
- **Function Coverage:** > 95%
- **Property Test Coverage:** All 26 properties implemented

### Continuous Testing

**Pre-commit:**
- Run unit tests
- Run fast property tests (10 iterations)

**CI Pipeline:**
- Run full unit test suite
- Run full property test suite (100 iterations)
- Generate coverage reports
- Test on multiple platforms (Windows, Linux, macOS)

## Implementation Notes

### Integration with Existing CLI

The document governance system integrates with existing commands:

**doctor command:**
- Add `--docs` flag to run document diagnostics
- Include document compliance in standard doctor output
- Use existing chalk formatting and i18n patterns

**status command:**
- Add document compliance status section
- Show count of violations if any
- Provide quick fix commands

### File System Utilities

Leverage existing utilities where possible:
- Use `fs-extra` for file operations (already in dependencies)
- Use `path` module for cross-platform paths
- Use `minimatch` for pattern matching (already in dependencies)

### Configuration Storage

Store configuration in `.sce/config/docs.json`:
- Create config directory if it doesn't exist
- Use JSON format for easy editing
- Validate configuration on load
- Merge with defaults for missing values

### Logging and History

Store execution history in `.sce/logs/governance-history.json`:
- Append-only log file
- Include timestamp, tool, operation, and results
- Rotate log file when it exceeds 10MB
- Keep last 5 rotated logs

### Performance Considerations

**Optimization Strategies:**
- Cache file system scans within a single operation
- Use parallel scanning for multiple Specs
- Skip hidden directories and node_modules
- Implement early exit for validation when errors found

**Scalability:**
- Handle projects with 100+ Specs
- Handle Specs with 1000+ files
- Implement progress indicators for long operations
- Support cancellation for interactive operations

### Backward Compatibility

**Version Detection:**
- Check for existing .sce directory structure
- Support projects created with older versions
- Provide migration guidance if needed

**Graceful Degradation:**
- Work without configuration file (use defaults)
- Work without logs directory (create on demand)
- Work without Git (skip hook features)

## Future Enhancements

### Phase 2 Features (Not in Current Spec)

1. **Auto-fix Mode:**
   - Automatically fix common violations
   - Move misplaced files to correct locations
   - Rename non-compliant files

2. **Custom Rules:**
   - Allow projects to define custom violation patterns
   - Support project-specific subdirectory names
   - Enable/disable specific checks

3. **CI/CD Integration:**
   - GitHub Actions workflow
   - GitLab CI configuration
   - Jenkins pipeline support

4. **Reporting Dashboard:**
   - HTML report generation
   - Trend analysis over time
   - Compliance score calculation

5. **Watch Mode:**
   - Monitor file system for violations
   - Real-time notifications
   - Auto-cleanup on file creation

### Extensibility Points

**Plugin System:**
- Allow custom violation detectors
- Support custom file type classifiers
- Enable custom report formatters

**API Exposure:**
- Programmatic access to governance engines
- Node.js API for integration
- REST API for remote access (future)

## Dependencies

### Existing Dependencies (No New Additions)

- `chalk` (^4.1.2) - Terminal styling
- `commander` (^9.0.0) - CLI argument parsing
- `fs-extra` (^10.0.0) - Enhanced file system operations
- `inquirer` (^8.2.0) - Interactive prompts
- `minimatch` (^10.1.1) - Glob pattern matching
- `path` (^0.12.7) - Path manipulation
- `fast-check` (^4.5.3) - Property-based testing

### Node.js Built-ins

- `fs` - File system operations
- `path` - Path manipulation
- `process` - Process information and control

## Deployment Considerations

### Installation

No changes to installation process - features are part of the sce CLI.

### Configuration

Users can customize behavior through:
1. `.sce/config/docs.json` - Document governance settings
2. Command-line flags - Per-operation overrides
3. Environment variables - CI/CD integration

### Documentation

Update existing documentation:
1. README.md - Add document governance section
2. docs/spec-workflow.md - Include governance in workflow
3. docs/troubleshooting.md - Add governance troubleshooting
4. Create docs/document-governance.md - Detailed guide

### Migration

For existing projects:
1. Run `sce doctor --docs` to assess current state
2. Run `sce cleanup --dry-run` to preview changes
3. Run `sce cleanup` to fix violations
4. Run `sce validate --all` to confirm compliance
5. Run `sce hooks install` to prevent future violations

## Success Metrics

### Adoption Metrics

- Percentage of projects using document governance
- Number of violations detected per project
- Number of violations fixed automatically
- Time saved on manual document management

### Quality Metrics

- Reduction in document-related issues
- Improvement in project discoverability
- Consistency across projects
- Developer satisfaction with documentation

### Technical Metrics

- Test coverage (>90%)
- Performance (scan 100 Specs in <5 seconds)
- Error rate (<1% of operations)
- Cross-platform compatibility (Windows, Linux, macOS)
