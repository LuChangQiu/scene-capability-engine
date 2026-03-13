/**
 * Document Governance Command Handler
 * 
 * Provides CLI interface for document governance operations
 */

const chalk = require('chalk');
const ConfigManager = require('../governance/config-manager');
const DiagnosticEngine = require('../governance/diagnostic-engine');
const CleanupTool = require('../governance/cleanup-tool');
const ValidationEngine = require('../governance/validation-engine');
const ArchiveTool = require('../governance/archive-tool');
const HooksManager = require('../governance/hooks-manager');
const Reporter = require('../governance/reporter');
const ExecutionLogger = require('../governance/execution-logger');
const DocReferenceChecker = require('../governance/doc-reference-checker');

/**
 * Execute document governance command
 * 
 * @param {string} subcommand - The subcommand (cleanup, validate, archive, etc.)
 * @param {Object} options - Command options
 * @returns {Promise<number>} - Exit code (0 for success, non-zero for error)
 */
async function docsCommand(subcommand, options = {}) {
  const projectPath = process.cwd();
  const reporter = new Reporter();
  
  try {
    // Load configuration
    const configManager = new ConfigManager(projectPath);
    const config = await configManager.load();
    
    // Route to appropriate handler
    switch (subcommand) {
      case 'diagnose':
      case 'diagnostic':
        return await handleDiagnostic(projectPath, config, reporter);
        
      case 'cleanup':
        return await handleCleanup(projectPath, config, reporter, options);
        
      case 'validate':
        return await handleValidate(projectPath, config, reporter, options);
        
      case 'archive':
        return await handleArchive(projectPath, config, reporter, options);
        
      case 'hooks':
        return await handleHooks(projectPath, reporter, options);
        
      case 'config':
        return await handleConfig(projectPath, configManager, reporter, options);
        
      case 'stats':
        return await handleStats(projectPath, reporter, options);
        
      case 'report':
        return await handleReport(projectPath, reporter, options);
        
      case 'check-refs':
      case 'check-references':
        return await handleCheckReferences(projectPath, reporter, options);
        
      case 'help':
      default:
        showHelp();
        return 0;
    }
  } catch (error) {
    reporter.displayError(error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    return 2; // Fatal error
  }
}

/**
 * Handle diagnostic command
 */
async function handleDiagnostic(projectPath, config, reporter) {
  const engine = new DiagnosticEngine(projectPath, config);
  const report = await engine.scan();
  
  reporter.displayDiagnostic(report);
  
  // Log execution
  const logger = new ExecutionLogger(projectPath);
  await logger.logExecution('diagnostic', 'scan', report);
  
  return report.compliant ? 0 : 1;
}

/**
 * Handle cleanup command
 */
async function handleCleanup(projectPath, config, reporter, options) {
  const tool = new CleanupTool(projectPath, config);
  
  const cleanupOptions = {
    dryRun: options.dryRun || options.dry || false,
    interactive: options.interactive || options.i || false,
    spec: options.spec || null
  };
  
  const report = await tool.cleanup(cleanupOptions);
  
  reporter.displayCleanup(report, cleanupOptions.dryRun);
  
  // Log execution (only if not dry run)
  if (!cleanupOptions.dryRun) {
    const logger = new ExecutionLogger(projectPath);
    await logger.logExecution('cleanup', 'delete', report);
  }
  
  return report.success ? 0 : 1;
}

/**
 * Handle validate command
 */
async function handleValidate(projectPath, config, reporter, options) {
  const engine = new ValidationEngine(projectPath, config);
  
  const validateOptions = {
    spec: options.spec || null,
    all: options.all || false
  };
  
  const report = await engine.validate(validateOptions);
  
  reporter.displayValidation(report);
  
  // Log execution
  const logger = new ExecutionLogger(projectPath);
  await logger.logExecution('validation', 'validate', report);
  
  return report.valid ? 0 : 1;
}

/**
 * Handle archive command
 */
async function handleArchive(projectPath, config, reporter, options) {
  if (!options.spec) {
    reporter.displayError('--spec option is required for archive command');
    console.log('Usage: sce docs archive --spec <spec-name> [--dry-run]');
    return 2;
  }
  
  const tool = new ArchiveTool(projectPath, config);
  
  const archiveOptions = {
    dryRun: options.dryRun || options.dry || false
  };
  
  const report = await tool.archive(options.spec, archiveOptions);
  
  reporter.displayArchive(report, archiveOptions.dryRun);
  
  // Log execution (only if not dry run)
  if (!archiveOptions.dryRun) {
    const logger = new ExecutionLogger(projectPath);
    await logger.logExecution('archive', 'move', report);
  }
  
  return report.success ? 0 : 1;
}

/**
 * Handle hooks command
 */
async function handleHooks(projectPath, reporter, options) {
  const manager = new HooksManager(projectPath);
  
  // Determine subcommand (install, uninstall, status)
  const hookSubcommand = options._?.[0] || 'status';
  
  switch (hookSubcommand) {
    case 'install':
      return await handleHooksInstall(manager, reporter);
      
    case 'uninstall':
      return await handleHooksUninstall(manager, reporter);
      
    case 'status':
    default:
      return await handleHooksStatus(manager, reporter);
  }
}

/**
 * Handle hooks install
 */
async function handleHooksInstall(manager, reporter) {
  console.log(chalk.cyan('🔧 Installing document governance hooks...\n'));
  
  const result = await manager.installHooks();
  
  if (result.success) {
    console.log(chalk.green('✅ ' + result.message));
    
    if (result.backupCreated) {
      console.log(chalk.gray('   Backup created at: .git/hooks/pre-commit.backup'));
    }
    
    console.log(chalk.cyan('\nThe pre-commit hook will now validate documents before each commit.'));
    console.log(chalk.gray('To bypass validation, use: git commit --no-verify\n'));
    
    return 0;
  } else {
    console.log(chalk.red('❌ ' + result.message));
    
    if (result.reason === 'not_git_repo') {
      console.log(chalk.yellow('\nThis is not a Git repository.'));
      console.log(chalk.gray('Initialize Git first: git init\n'));
    }
    
    return 1;
  }
}

/**
 * Handle hooks uninstall
 */
async function handleHooksUninstall(manager, reporter) {
  console.log(chalk.cyan('🔧 Uninstalling document governance hooks...\n'));
  
  const result = await manager.uninstallHooks();
  
  if (result.success) {
    console.log(chalk.green('✅ ' + result.message + '\n'));
    return 0;
  } else {
    console.log(chalk.red('❌ ' + result.message));
    
    if (result.reason === 'not_our_hook') {
      console.log(chalk.yellow('\nThe pre-commit hook was not installed by scene-capability-engine.'));
      console.log(chalk.gray('You may need to manually edit: .git/hooks/pre-commit\n'));
    }
    
    return 1;
  }
}

/**
 * Handle hooks status
 */
async function handleHooksStatus(manager, reporter) {
  console.log(chalk.cyan('🔍 Checking Git hooks status...\n'));
  
  const status = await manager.checkHooksInstalled();
  
  if (status.installed) {
    console.log(chalk.green('✅ Document governance hooks are installed'));
    console.log(chalk.gray('   Pre-commit validation is active\n'));
    return 0;
  } else {
    console.log(chalk.yellow('⚠️  Document governance hooks are not installed'));
    console.log(chalk.gray('   Reason: ' + status.message));
    console.log(chalk.cyan('\nTo install hooks: sce docs hooks install\n'));
    return 1;
  }
}

/**
 * Handle config command
 */
async function handleConfig(projectPath, configManager, reporter, options) {
  // Check if --set flag is provided
  if (options.set) {
    return await handleConfigSet(configManager, reporter, options);
  }
  
  // Check if --reset flag is provided
  if (options.reset) {
    return await handleConfigReset(configManager, reporter);
  }
  
  // Default: display current configuration
  return await handleConfigDisplay(configManager, reporter);
}

/**
 * Handle config display
 */
async function handleConfigDisplay(configManager, reporter) {
  console.log(chalk.bold.cyan('\n⚙️  Document Governance Configuration\n'));
  
  const config = configManager.getAll();
  
  console.log(chalk.bold('Root Allowed Files:'));
  config.rootAllowedFiles.forEach(file => {
    console.log(`  • ${file}`);
  });
  console.log();
  
  console.log(chalk.bold('Spec Subdirectories:'));
  config.specSubdirs.forEach(dir => {
    console.log(`  • ${dir}`);
  });
  console.log();

  console.log(chalk.bold('Spec Allowed Root Files:'));
  (config.specAllowedRootFiles || []).forEach(file => {
    console.log(`  • ${file}`);
  });
  console.log();
  
  console.log(chalk.bold('Temporary Patterns:'));
  config.temporaryPatterns.forEach(pattern => {
    console.log(`  • ${pattern}`);
  });
  console.log();
  
  console.log(chalk.gray('Configuration file: .sce/config/docs.json'));
  console.log(chalk.gray('To modify: sce docs config --set <key> <value>'));
  console.log(chalk.gray('To reset: sce docs config --reset\n'));
  
  return 0;
}

/**
 * Handle config set
 */
async function handleConfigSet(configManager, reporter, options) {
  // Parse the key and value from options
  // Expected format: --set key value or --set key "value1,value2"
  const args = options._ || [];
  
  // Find the index of the key after 'config'
  const configIndex = args.indexOf('config');
  const keyIndex = configIndex + 1;
  
  if (keyIndex >= args.length) {
    reporter.displayError('Missing configuration key');
    console.log(chalk.gray('Usage: sce docs config --set <key> <value>'));
    console.log(chalk.gray('Example: sce docs config --set root-allowed-files "README.md,CUSTOM.md"\n'));
    return 2;
  }
  
  const key = args[keyIndex];
  const valueIndex = keyIndex + 1;
  
  if (valueIndex >= args.length) {
    reporter.displayError('Missing configuration value');
    console.log(chalk.gray('Usage: sce docs config --set <key> <value>'));
    console.log(chalk.gray('Example: sce docs config --set root-allowed-files "README.md,CUSTOM.md"\n'));
    return 2;
  }
  
  const valueStr = args[valueIndex];
  
  // Convert kebab-case to camelCase
  const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  
  // Validate key
  const validKeys = ['rootAllowedFiles', 'specAllowedRootFiles', 'specSubdirs', 'temporaryPatterns'];
  if (!validKeys.includes(camelKey)) {
    reporter.displayError(`Invalid configuration key: ${key}`);
    console.log(chalk.gray('Valid keys: root-allowed-files, spec-allowed-root-files, spec-subdirs, temporary-patterns\n'));
    return 2;
  }
  
  // Parse value (comma-separated list)
  const value = valueStr.split(',').map(v => v.trim()).filter(v => v.length > 0);
  
  if (value.length === 0) {
    reporter.displayError('Value cannot be empty');
    return 2;
  }
  
  // Set the value
  try {
    await configManager.set(camelKey, value);
    
    console.log(chalk.green(`✅ Configuration updated: ${key}`));
    console.log(chalk.gray(`   New value: ${value.join(', ')}\n`));
    
    return 0;
  } catch (error) {
    reporter.displayError(`Failed to update configuration: ${error.message}`);
    return 1;
  }
}

/**
 * Handle config reset
 */
async function handleConfigReset(configManager, reporter) {
  console.log(chalk.yellow('⚠️  Resetting configuration to defaults...\n'));
  
  try {
    await configManager.reset();
    
    console.log(chalk.green('✅ Configuration reset to defaults'));
    console.log(chalk.gray('   Run "sce docs config" to view current configuration\n'));
    
    return 0;
  } catch (error) {
    reporter.displayError(`Failed to reset configuration: ${error.message}`);
    return 1;
  }
}

/**
 * Handle stats command
 */
async function handleStats(projectPath, reporter, options) {
  const logger = new ExecutionLogger(projectPath);
  
  // Get execution history
  const history = await logger.getHistory();
  
  if (history.length === 0) {
    console.log(chalk.yellow('⚠️  No execution history found'));
    console.log(chalk.gray('   Run document governance commands to generate statistics\n'));
    return 0;
  }
  
  // Calculate statistics
  const stats = calculateStatistics(history);
  
  // Display statistics
  reporter.displayStats(stats);
  
  return 0;
}

/**
 * Handle report command
 */
async function handleReport(projectPath, reporter, options) {
  const logger = new ExecutionLogger(projectPath);
  const fs = require('fs-extra');
  const path = require('path');
  
  // Get execution history
  const history = await logger.getHistory();
  
  if (history.length === 0) {
    console.log(chalk.yellow('⚠️  No execution history found'));
    console.log(chalk.gray('   Run document governance commands to generate a report\n'));
    return 0;
  }
  
  // Calculate statistics
  const stats = calculateStatistics(history);
  
  // Generate markdown report
  const report = generateMarkdownReport(stats, history);
  
  // Ensure reports directory exists
  const reportsDir = path.join(projectPath, '.sce', 'reports');
  await fs.ensureDir(reportsDir);
  
  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = `document-compliance-${timestamp}.md`;
  const reportPath = path.join(reportsDir, filename);
  
  // Save report
  await fs.writeFile(reportPath, report, 'utf8');
  
  console.log(chalk.green('✅ Compliance report generated'));
  console.log(chalk.gray(`   Saved to: ${reportPath}\n`));
  
  return 0;
}

/**
 * Calculate statistics from execution history
 * 
 * @param {Array} history - Execution history entries
 * @returns {Object} - Statistics object
 */
function calculateStatistics(history) {
  const stats = {
    totalExecutions: history.length,
    executionsByTool: {},
    totalViolations: 0,
    violationsByType: {},
    totalCleanupActions: 0,
    totalArchiveActions: 0,
    totalErrors: 0,
    firstExecution: null,
    lastExecution: null,
    violationsOverTime: [],
    cleanupActionsOverTime: []
  };
  
  // Process each history entry
  history.forEach(entry => {
    // Track executions by tool
    if (!stats.executionsByTool[entry.tool]) {
      stats.executionsByTool[entry.tool] = 0;
    }
    stats.executionsByTool[entry.tool]++;
    
    // Track timestamps
    if (!stats.firstExecution || entry.timestamp < stats.firstExecution) {
      stats.firstExecution = entry.timestamp;
    }
    if (!stats.lastExecution || entry.timestamp > stats.lastExecution) {
      stats.lastExecution = entry.timestamp;
    }
    
    // Process diagnostic results
    if (entry.tool === 'diagnostic' && entry.results) {
      if (entry.results.violations) {
        const violationCount = entry.results.violations.length;
        stats.totalViolations += violationCount;
        
        // Track violations over time
        stats.violationsOverTime.push({
          timestamp: entry.timestamp,
          count: violationCount
        });
        
        // Track violations by type
        entry.results.violations.forEach(violation => {
          if (!stats.violationsByType[violation.type]) {
            stats.violationsByType[violation.type] = 0;
          }
          stats.violationsByType[violation.type]++;
        });
      }
    }
    
    // Process cleanup results
    if (entry.tool === 'cleanup' && entry.results) {
      if (entry.results.deletedFiles) {
        const cleanupCount = entry.results.deletedFiles.length;
        stats.totalCleanupActions += cleanupCount;
        
        // Track cleanup actions over time
        stats.cleanupActionsOverTime.push({
          timestamp: entry.timestamp,
          count: cleanupCount
        });
      }
      
      if (entry.results.errors) {
        stats.totalErrors += entry.results.errors.length;
      }
    }
    
    // Process archive results
    if (entry.tool === 'archive' && entry.results) {
      if (entry.results.movedFiles) {
        stats.totalArchiveActions += entry.results.movedFiles.length;
      }
      
      if (entry.results.errors) {
        stats.totalErrors += entry.results.errors.length;
      }
    }
    
    // Process validation results
    if (entry.tool === 'validation' && entry.results) {
      if (entry.results.errors) {
        stats.totalErrors += entry.results.errors.length;
      }
    }
  });
  
  return stats;
}

/**
 * Generate markdown compliance report
 * 
 * @param {Object} stats - Statistics object
 * @param {Array} history - Execution history
 * @returns {string} - Markdown report
 */
function generateMarkdownReport(stats, history) {
  const lines = [];
  
  // Header
  lines.push('# Document Compliance Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');
  
  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total Executions:** ${stats.totalExecutions}`);
  lines.push(`- **Total Violations Found:** ${stats.totalViolations}`);
  lines.push(`- **Total Cleanup Actions:** ${stats.totalCleanupActions}`);
  lines.push(`- **Total Archive Actions:** ${stats.totalArchiveActions}`);
  lines.push(`- **Total Errors:** ${stats.totalErrors}`);
  lines.push(`- **First Execution:** ${stats.firstExecution || 'N/A'}`);
  lines.push(`- **Last Execution:** ${stats.lastExecution || 'N/A'}`);
  lines.push('');
  
  // Executions by Tool
  lines.push('## Executions by Tool');
  lines.push('');
  lines.push('| Tool | Count |');
  lines.push('|------|-------|');
  Object.entries(stats.executionsByTool).forEach(([tool, count]) => {
    lines.push(`| ${tool} | ${count} |`);
  });
  lines.push('');
  
  // Violations by Type
  if (Object.keys(stats.violationsByType).length > 0) {
    lines.push('## Violations by Type');
    lines.push('');
    lines.push('| Type | Count |');
    lines.push('|------|-------|');
    Object.entries(stats.violationsByType)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        lines.push(`| ${type} | ${count} |`);
      });
    lines.push('');
  }
  
  // Violations Over Time
  if (stats.violationsOverTime.length > 0) {
    lines.push('## Violations Over Time');
    lines.push('');
    lines.push('| Timestamp | Count |');
    lines.push('|-----------|-------|');
    stats.violationsOverTime.forEach(entry => {
      lines.push(`| ${entry.timestamp} | ${entry.count} |`);
    });
    lines.push('');
  }
  
  // Cleanup Actions Over Time
  if (stats.cleanupActionsOverTime.length > 0) {
    lines.push('## Cleanup Actions Over Time');
    lines.push('');
    lines.push('| Timestamp | Files Deleted |');
    lines.push('|-----------|---------------|');
    stats.cleanupActionsOverTime.forEach(entry => {
      lines.push(`| ${entry.timestamp} | ${entry.count} |`);
    });
    lines.push('');
  }
  
  // Recent Executions
  lines.push('## Recent Executions');
  lines.push('');
  const recentHistory = history.slice(-10).reverse();
  recentHistory.forEach(entry => {
    lines.push(`### ${entry.tool} - ${entry.operation}`);
    lines.push('');
    lines.push(`**Timestamp:** ${entry.timestamp}`);
    lines.push('');
    
    if (entry.results) {
      if (entry.results.violations) {
        lines.push(`**Violations Found:** ${entry.results.violations.length}`);
      }
      if (entry.results.deletedFiles) {
        lines.push(`**Files Deleted:** ${entry.results.deletedFiles.length}`);
      }
      if (entry.results.movedFiles) {
        lines.push(`**Files Moved:** ${entry.results.movedFiles.length}`);
      }
      if (entry.results.errors && entry.results.errors.length > 0) {
        lines.push(`**Errors:** ${entry.results.errors.length}`);
      }
    }
    
    lines.push('');
  });
  
  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*Generated by scene-capability-engine document governance system*');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Display help information
 */
function showHelp() {
  console.log(chalk.bold.cyan('\n📋 Document Governance Commands\n'));
  
  console.log(chalk.bold('Usage:'));
  console.log('  sce docs <subcommand> [options]\n');
  
  console.log(chalk.bold('Subcommands:'));
  console.log('  diagnose              Scan project for document violations');
  console.log('  cleanup               Remove temporary documents');
  console.log('  validate              Validate document structure');
  console.log('  archive               Organize Spec artifacts into subdirectories');
  console.log('  hooks <action>        Manage Git hooks (install, uninstall, status)');
  console.log('  config                Display or modify configuration');
  console.log('  stats                 Display compliance statistics');
  console.log('  report                Generate compliance report');
  console.log('  check-refs            Check for incorrect project references and placeholders');
  console.log('  help                  Show this help message\n');
  
  console.log(chalk.bold('Options:'));
  console.log('  --dry-run, --dry      Preview changes without applying them');
  console.log('  --interactive, -i     Prompt for confirmation (cleanup only)');
  console.log('  --spec <name>         Target specific Spec directory');
  console.log('  --all                 Validate all Specs (validate only)');
  console.log('  --set <key> <value>   Set configuration value (config only)');
  console.log('  --reset               Reset configuration to defaults (config only)');
  console.log('  --report              Save report to file (check-refs only)');
  console.log('  --verbose             Show detailed error information\n');
  
  console.log(chalk.bold('Examples:'));
  console.log('  sce docs diagnose');
  console.log('  sce docs cleanup --dry-run');
  console.log('  sce docs cleanup --spec my-spec');
  console.log('  sce docs validate --all');
  console.log('  sce docs archive --spec my-spec --dry-run');
  console.log('  sce docs hooks install');
  console.log('  sce docs hooks status');
  console.log('  sce docs config');
  console.log('  sce docs config --set root-allowed-files "README.md,CUSTOM.md"');
  console.log('  sce docs config --reset');
  console.log('  sce docs stats');
  console.log('  sce docs report');
  console.log('  sce docs check-refs');
  console.log('  sce docs check-refs --report\n');
}

/**
 * Handle check-references subcommand
 * 
 * @param {string} projectPath - Project root path
 * @param {Object} reporter - Reporter instance
 * @param {Object} options - Command options
 * @returns {Promise<number>} - Exit code
 */
async function handleCheckReferences(projectPath, reporter, options) {
  const path = require('path');
  
  try {
    console.log(chalk.bold.cyan('\n🔍 Checking Document References...\n'));
    
    const checker = new DocReferenceChecker(projectPath);
    const results = await checker.checkAll();
    
    // Display results
    if (results.issuesFound === 0) {
      console.log(chalk.green('✅ No issues found! All documentation is clean.\n'));
      console.log(`Files checked: ${results.filesChecked}`);
      return 0;
    }
    
    console.log(chalk.yellow(`⚠️  Found ${results.issuesFound} issue(s) in ${results.filesChecked} file(s)\n`));
    
    // Display incorrect references
    if (results.incorrectReferences.length > 0) {
      console.log(chalk.red.bold('🔴 Incorrect Project References:\n'));
      results.incorrectReferences.forEach(item => {
        console.log(chalk.bold(`  ${item.file}:`));
        item.references.forEach(ref => {
          console.log(chalk.red(`    Line ${ref.line}: Found "${ref.reference}"`));
          console.log(chalk.gray(`      ${ref.content}`));
        });
        console.log();
      });
    }
    
    // Display unresolved placeholders
    if (results.unresolvedPlaceholders.length > 0) {
      console.log(chalk.yellow.bold('🟡 Unresolved Placeholders:\n'));
      results.unresolvedPlaceholders.forEach(item => {
        console.log(chalk.bold(`  ${item.file}:`));
        item.placeholders.forEach(ph => {
          console.log(chalk.yellow(`    Line ${ph.line}: ${ph.placeholder}`));
          console.log(chalk.gray(`      ${ph.content}`));
        });
        console.log();
      });
    }
    
    // Recommendations
    console.log(chalk.bold.cyan('💡 Recommendations:\n'));
    if (results.incorrectReferences.length > 0) {
      console.log('  1. Remove or replace incorrect project references');
      console.log('  2. Ensure all documentation reflects the correct project identity');
    }
    if (results.unresolvedPlaceholders.length > 0) {
      console.log('  3. Replace all [TODO: ...] placeholders with actual project information');
      console.log('  4. Update ENVIRONMENT.md with correct project details');
    }
    console.log();
    
    // Save report if requested
    if (options.report) {
      const report = checker.generateReport(results);
      const reportPath = path.join(projectPath, '.sce/reports', `doc-reference-check-${new Date().toISOString().split('T')[0]}.md`);
      await checker.saveReport(report, reportPath);
      console.log(chalk.green(`✅ Report saved to: ${reportPath}\n`));
    }
    
    return results.issuesFound > 0 ? 1 : 0;
  } catch (error) {
    reporter.displayError(`Failed to check references: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    return 2;
  }
}

module.exports = docsCommand;
