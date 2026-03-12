/**
 * Adopt Command
 * 
 * Intelligently adopts existing projects into scene-capability-engine.
 * 
 * Default Behavior (Smart Mode):
 * - Zero user interaction
 * - Automatic mode selection
 * - Mandatory backups
 * - Smart conflict resolution
 * 
 * Legacy Behavior (Interactive Mode):
 * - Use --interactive flag
 * - Manual conflict resolution
 * - User confirmations
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const path = require('path');
const DetectionEngine = require('../adoption/detection-engine');
const { getAdoptionStrategy } = require('../adoption/adoption-strategy');
const BackupSystem = require('../backup/backup-system');
const VersionManager = require('../version/version-manager');
const SteeringManager = require('../steering/steering-manager');
const AdoptionConfig = require('../steering/adoption-config');
const { detectTool, generateAutoConfig } = require('../utils/tool-detector');
const ConflictResolver = require('../adoption/conflict-resolver');
const SelectiveBackup = require('../backup/selective-backup');
const SmartOrchestrator = require('../adoption/smart-orchestrator');
const { pathExists, ensureDirectory, writeJSON } = require('../utils/fs-utils');
const { applyTakeoverBaseline } = require('../workspace/takeover-baseline');

/**
 * Executes the adopt command
 * 
 * @param {Object} options - Command options
 * @param {boolean} options.interactive - Enable interactive mode (legacy behavior)
 * @param {boolean} options.dryRun - Show what would change without making changes
 * @param {boolean} options.verbose - Show detailed logs
 * @param {boolean} options.noBackup - Skip backup creation (dangerous)
 * @param {boolean} options.skipUpdate - Skip template file updates
 * @param {boolean} options.force - Force overwrite (legacy, implies non-interactive)
 * @param {boolean} options.auto - Skip confirmations (legacy, implies non-interactive)
 * @param {string} options.mode - Force specific adoption mode (legacy)
 * @returns {Promise<void>}
 */
async function adoptCommand(options = {}) {
  const {
    interactive = false,
    dryRun = false,
    verbose = false,
    noBackup = false,
    skipUpdate = false,
    force = false,
    auto = false,
    mode: forcedMode = null
  } = options;
  const projectPath = process.cwd();
  
  console.log(chalk.red('🔥') + ' Scene Capability Engine - Project Adoption');
  console.log();
  
  // Warn about dangerous options
  if (noBackup) {
    console.log(chalk.red('⚠️  WARNING: --no-backup flag detected'));
    console.log(chalk.yellow('   This will skip backup creation - changes cannot be undone!'));
    console.log();
    
    if (!interactive && !force) {
      const { confirmNoBackup } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmNoBackup',
          message: 'Are you sure you want to proceed without backup?',
          default: false
        }
      ]);
      
      if (!confirmNoBackup) {
        console.log(chalk.yellow('Adoption cancelled'));
        return;
      }
    }
  }
  
  // Route to appropriate handler
  if (interactive || (auto && !force)) {
    // Legacy interactive mode
    await adoptInteractive(projectPath, { auto, dryRun, mode: forcedMode, force });
  } else {
    // Smart mode (default)
    await adoptSmart(projectPath, { dryRun, verbose, noBackup, skipUpdate });
  }
}

/**
 * Smart adoption mode (default)
 * Zero interaction, automatic decisions, mandatory backups
 * 
 * @param {string} projectPath - Project path
 * @param {Object} options - Options
 * @returns {Promise<void>}
 */
async function adoptSmart(projectPath, options) {
  const { dryRun, verbose, noBackup, skipUpdate } = options;
  
  try {
    // Create smart orchestrator
    const orchestrator = new SmartOrchestrator();
    
    // Execute orchestration
    console.log(chalk.blue('🚀 Starting adoption...'));
    console.log();
    
    const result = await orchestrator.orchestrate(projectPath, {
      dryRun,
      verbose,
      skipBackup: noBackup,
      skipUpdate
    });
    
    // Handle results
    if (!result.success) {
      console.log();
      console.log(chalk.red('❌ Adoption failed'));
      console.log();
      
      result.errors.forEach(error => {
        console.log(chalk.red(`  ${error}`));
      });
      
      if (result.backup) {
        console.log();
        console.log(chalk.blue('📦 Backup available:'), result.backup.id);
        console.log(chalk.gray('  Run'), chalk.cyan('sce rollback'), chalk.gray('to restore'));
      }
      
      process.exit(1);
    }

    const packageJson = require('../../package.json');
    const takeoverReport = await applyTakeoverBaseline(projectPath, {
      apply: true,
      writeReport: true,
      sceVersion: packageJson.version
    });
    if (takeoverReport.detected_project && (takeoverReport.summary.created > 0 || takeoverReport.summary.updated > 0)) {
      console.log(chalk.blue('🧭 Takeover baseline aligned with current SCE defaults'));
      console.log(chalk.gray(`  created=${takeoverReport.summary.created}, updated=${takeoverReport.summary.updated}`));
      if (takeoverReport.report_file) {
        console.log(chalk.gray(`  report: ${takeoverReport.report_file}`));
      }
      console.log();
    }
    
    // Summary is already displayed by orchestrator
    
    // Detect tool and offer automation setup
    if (!dryRun) {
      await offerAutomationSetup(projectPath);
    }
    
    // Show next steps
    if (!dryRun) {
      console.log(chalk.blue('💡 Next steps:'));
      console.log('  1. Tell your AI: "Read .sce/README.md to understand project methodology"');
      console.log('  2. Start working: Ask AI to implement features following Spec-driven approach');
      console.log('  3. Check progress: ' + chalk.cyan('sce status'));
      console.log();
      console.log(chalk.red('🔥') + ' Project now follows Spec-driven development!');
    }
    
  } catch (error) {
    console.log();
    console.log(chalk.red('❌ Error:'), error.message);
    console.log();
    console.log(chalk.gray('If you need help, please report this issue:'));
    console.log(chalk.cyan('https://github.com/heguangyong/scene-capability-engine/issues'));
    process.exit(1);
  }
}

/**
 * Interactive adoption mode (legacy)
 * Prompts user for decisions, manual conflict resolution
 * 
 * @param {string} projectPath - Project path
 * @param {Object} options - Options
 * @returns {Promise<void>}
 */
async function adoptInteractive(projectPath, options) {
  const { auto, dryRun, mode: forcedMode, force } = options;
  
  try {
    // 1. Detect project structure
    console.log(chalk.blue('📦 Analyzing project structure...'));
    const detectionEngine = new DetectionEngine();
    const detection = await detectionEngine.analyze(projectPath);
    
    // 2. Determine strategy
    const strategy = forcedMode || detectionEngine.determineStrategy(detection);
    
    // 3. Show analysis to user
    console.log();
    console.log(detectionEngine.getSummary(detection));
    console.log();
    
    // 4. Show adoption plan
    console.log(chalk.blue('📋 Adoption Plan:'));
    console.log(`  Mode: ${chalk.cyan(strategy)}`);
    
    if (strategy === 'fresh') {
      console.log('  Actions:');
      console.log('    - Create .sce/ directory structure');
      console.log('    - Copy template files (steering, tools, docs)');
      console.log('    - Create version.json');
    } else if (strategy === 'partial') {
      console.log('  Actions:');
      console.log('    - Preserve existing specs/ and steering/');
      console.log('    - Add missing components');
      console.log('    - Create/update version.json');
      if (detection.hasKiroDir) {
        console.log('    - Create backup before changes');
      }
    } else if (strategy === 'full') {
      console.log('  Actions:');
      console.log(`    - Upgrade from ${detection.existingVersion || 'unknown'} to current version`);
      console.log('    - Update template files');
      console.log('    - Preserve user content (specs/)');
      console.log('    - Create backup before changes');
    }
    
    // Show conflicts if any (brief summary)
    if (detection.conflicts.length > 0) {
      console.log();
      console.log(chalk.yellow('⚠️  Conflicts detected:'));
      detection.conflicts.forEach(conflict => {
        console.log(`    - ${conflict.path}`);
      });
      console.log();
      
      if (force) {
        console.log(chalk.red('  ⚠️  --force enabled: Conflicting files will be overwritten'));
        console.log(chalk.gray('  A backup will be created before overwriting'));
      } else if (auto) {
        console.log(chalk.gray('  --auto mode: Existing files will be preserved'));
      } else {
        console.log(chalk.gray('  You will be prompted to choose how to handle conflicts'));
      }
    }
    
    console.log();
    
    // 5. Dry run mode
    if (dryRun) {
      console.log(chalk.yellow('🔍 Dry run mode - no changes will be made'));
      console.log();
      
      // Show how conflicts would be handled
      if (detection.conflicts.length > 0) {
        console.log(chalk.blue('Conflict Resolution Preview:'));
        console.log();
        
        if (force) {
          console.log(chalk.yellow('  With --force flag:'));
          console.log('    - All conflicting files would be overwritten');
          console.log('    - Backup would be created before overwriting');
          console.log();
          console.log('  Files that would be overwritten:');
          detection.conflicts.forEach(conflict => {
            console.log(chalk.red(`    ~ ${conflict.path}`));
          });
        } else if (auto) {
          console.log(chalk.gray('  With --auto flag:'));
          console.log('    - All conflicting files would be preserved');
          console.log('    - Template files would be skipped');
          console.log();
          console.log('  Files that would be skipped:');
          detection.conflicts.forEach(conflict => {
            console.log(chalk.gray(`    - ${conflict.path}`));
          });
        } else {
          console.log(chalk.blue('  In interactive mode:'));
          console.log('    - You would be prompted to choose:');
          console.log('      • Skip all conflicting files');
          console.log('      • Overwrite all (with backup)');
          console.log('      • Review each conflict individually');
          console.log();
          console.log('  Conflicting files:');
          detection.conflicts.forEach(conflict => {
            console.log(chalk.yellow(`    ? ${conflict.path}`));
          });
        }
        
        console.log();
      }
      
      const adoptionStrategy = getAdoptionStrategy(strategy);
      const versionManager = new VersionManager();
      const packageJson = require('../../package.json');
      
      const result = await adoptionStrategy.execute(projectPath, strategy, {
        sceVersion: packageJson.version,
        dryRun: true,
        force
      });
      
      if (result.success) {
        console.log(chalk.green('✅ Dry run completed successfully'));
        console.log();
        console.log('Files that would be created:');
        result.filesCreated.forEach(file => console.log(`  + ${file}`));
        if (result.filesUpdated.length > 0) {
          console.log('Files that would be updated:');
          result.filesUpdated.forEach(file => console.log(`  ~ ${file}`));
        }
        if (result.filesSkipped.length > 0) {
          console.log('Files that would be skipped:');
          result.filesSkipped.forEach(file => console.log(`  - ${file}`));
        }
      } else {
        console.log(chalk.red('❌ Dry run failed'));
        result.errors.forEach(error => console.log(`  ${error}`));
      }
      
      return;
    }
    
    // 6. Confirm with user (unless --auto)
    if (!auto) {
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: 'Proceed with adoption?',
          default: true
        }
      ]);
      
      if (!confirmed) {
        console.log(chalk.yellow('Adoption cancelled'));
        return;
      }
    }
    
    console.log();
    
    // 7. Handle conflicts interactively
    let resolutionMap = {};
    let conflictBackupId = null;
    
    if (detection.conflicts.length > 0) {
      if (!auto && !force) {
        // Interactive mode: prompt user for conflict resolution
        const resolver = new ConflictResolver();
        
        // Show detailed conflict summary
        resolver.displayConflictSummary(detection.conflicts);
        
        // Get resolution strategy
        const conflictStrategy = await resolver.promptStrategy(detection.conflicts);
        
        // Resolve conflicts
        resolutionMap = await resolver.resolveConflicts(detection.conflicts, conflictStrategy, projectPath);
        
        // Create selective backup if any files will be overwritten
        const filesToOverwrite = Object.entries(resolutionMap)
          .filter(([_, resolution]) => resolution === 'overwrite')
          .map(([filePath, _]) => filePath);
        
        if (filesToOverwrite.length > 0) {
          console.log();
          console.log(chalk.blue('📦 Creating backup of files to be overwritten...'));
          const selectiveBackup = new SelectiveBackup();
          
          try {
            const backup = await selectiveBackup.createSelectiveBackup(
              projectPath,
              filesToOverwrite,
              { type: 'conflict' }
            );
            conflictBackupId = backup.id;
            console.log(chalk.green(`✅ Backup created: ${conflictBackupId}`));
          } catch (backupError) {
            console.log(chalk.red(`❌ Failed to create backup: ${backupError.message}`));
            console.log();
            console.log(chalk.yellow('⚠️  Aborting adoption for safety'));
            console.log(chalk.gray('  Possible causes:'));
            console.log(chalk.gray('    - Insufficient disk space'));
            console.log(chalk.gray('    - Permission denied'));
            console.log(chalk.gray('    - File system error'));
            console.log();
            console.log(chalk.gray('  Please resolve the issue and try again'));
            process.exit(1);
          }
        }
      } else if (force) {
        // Force mode: overwrite all with backup
        console.log();
        console.log(chalk.blue('📦 Creating backup of conflicting files...'));
        const filesToOverwrite = detection.conflicts.map(c => c.path);
        const selectiveBackup = new SelectiveBackup();
        
        try {
          const backup = await selectiveBackup.createSelectiveBackup(
            projectPath,
            filesToOverwrite,
            { type: 'conflict' }
          );
          conflictBackupId = backup.id;
          console.log(chalk.green(`✅ Backup created: ${conflictBackupId}`));
        } catch (backupError) {
          console.log(chalk.red(`❌ Failed to create backup: ${backupError.message}`));
          console.log();
          console.log(chalk.yellow('⚠️  Aborting adoption for safety'));
          console.log(chalk.gray('  Cannot proceed with --force without a backup'));
          console.log();
          console.log(chalk.gray('  Possible solutions:'));
          console.log(chalk.gray('    - Free up disk space'));
          console.log(chalk.gray('    - Check file permissions'));
          console.log(chalk.gray('    - Try without --force to skip conflicts'));
          process.exit(1);
        }
        
        resolutionMap = detection.conflicts.reduce((map, conflict) => {
          map[conflict.path] = 'overwrite';
          return map;
        }, {});
      } else if (auto) {
        // Auto mode: skip all conflicts
        resolutionMap = detection.conflicts.reduce((map, conflict) => {
          map[conflict.path] = 'keep';
          return map;
        }, {});
      }
    }
    
    console.log();
    
    // 8. Handle steering strategy if conflicts detected
    let steeringStrategy = null;
    let steeringBackupId = null;
    
    if (detection.steeringDetection && detection.steeringDetection.hasExistingSteering) {
      console.log(chalk.blue('🎯 Handling steering files...'));
      const steeringManager = new SteeringManager();
      
      // Prompt for strategy
      steeringStrategy = await steeringManager.promptStrategy(detection.steeringDetection);
      
      if (steeringStrategy === 'use-sce') {
        // Backup existing steering files
        console.log(chalk.blue('📦 Backing up existing steering files...'));
        const backupResult = await steeringManager.backupSteering(projectPath);
        
        if (backupResult.success) {
          steeringBackupId = backupResult.backupId;
          console.log(chalk.green(`✅ Steering backup created: ${steeringBackupId}`));
          
          // Install sce steering files
          console.log(chalk.blue('📝 Installing sce steering files...'));
          const installResult = await steeringManager.installSceSteering(projectPath);
          
          if (installResult.success) {
            console.log(chalk.green(`✅ Installed ${installResult.filesInstalled} sce steering file(s)`));
          } else {
            console.log(chalk.red(`❌ Failed to install sce steering: ${installResult.error}`));
            console.log(chalk.yellow('Aborting adoption'));
            return;
          }
        } else {
          console.log(chalk.red(`❌ Failed to backup steering: ${backupResult.error}`));
          console.log(chalk.yellow('Aborting adoption for safety'));
          return;
        }
      } else if (steeringStrategy === 'use-project') {
        console.log(chalk.blue('✅ Keeping existing steering files'));
      }
      
      // Save steering strategy to adoption config
      const adoptionConfig = new AdoptionConfig(projectPath);
      await adoptionConfig.updateSteeringStrategy(steeringStrategy, steeringBackupId);
      
      console.log();
    }
    
    // 9. Create backup if needed (for non-conflict scenarios)
    let backupId = null;
    if (detection.hasKiroDir && (strategy === 'partial' || strategy === 'full')) {
      console.log(chalk.blue('📦 Creating backup...'));
      const backupSystem = new BackupSystem();
      
      try {
        const backup = await backupSystem.createBackup(projectPath, { type: 'adopt' });
        backupId = backup.id;
        console.log(chalk.green(`✅ Backup created: ${backupId}`));
      } catch (error) {
        console.log(chalk.red(`❌ Failed to create backup: ${error.message}`));
        console.log(chalk.yellow('Aborting adoption for safety'));
        return;
      }
    }
    
    console.log();
    
    // 10. Execute adoption
    console.log(chalk.blue('🚀 Executing adoption...'));
    const adoptionStrategy = getAdoptionStrategy(strategy);
    const packageJson = require('../../package.json');
    
    const result = await adoptionStrategy.execute(projectPath, strategy, {
      sceVersion: packageJson.version,
      dryRun: false,
      backupId,
      force,
      resolutionMap // Pass resolution map to adoption strategy
    });
    
    console.log();
    
    // 11. Report results
    if (result.success) {
      const packageJson = require('../../package.json');
      const takeoverReport = await applyTakeoverBaseline(projectPath, {
        apply: true,
        writeReport: true,
        sceVersion: packageJson.version
      });

      console.log(chalk.green('✅ Adoption completed successfully!'));
      console.log();

      if (takeoverReport.detected_project && (takeoverReport.summary.created > 0 || takeoverReport.summary.updated > 0)) {
        console.log(chalk.blue('🧭 Takeover baseline aligned with current SCE defaults'));
        console.log(chalk.gray(`  created=${takeoverReport.summary.created}, updated=${takeoverReport.summary.updated}`));
        if (takeoverReport.report_file) {
          console.log(chalk.gray(`  report: ${takeoverReport.report_file}`));
        }
        console.log();
      }
      
      // Show conflict resolution summary if conflicts were handled
      if (detection.conflicts.length > 0) {
        console.log(chalk.blue('📊 Conflict Resolution Summary:'));
        console.log(`  Total conflicts: ${detection.conflicts.length}`);
        
        const overwrittenFiles = Object.entries(resolutionMap)
          .filter(([_, resolution]) => resolution === 'overwrite')
          .map(([path, _]) => path);
        
        const skippedFiles = Object.entries(resolutionMap)
          .filter(([_, resolution]) => resolution === 'keep')
          .map(([path, _]) => path);
        
        if (overwrittenFiles.length > 0) {
          console.log(chalk.yellow(`  Overwritten: ${overwrittenFiles.length} file(s)`));
          overwrittenFiles.forEach(file => {
            console.log(chalk.red(`    ~ ${file}`));
          });
        }
        
        if (skippedFiles.length > 0) {
          console.log(chalk.gray(`  Skipped: ${skippedFiles.length} file(s)`));
          skippedFiles.forEach(file => {
            console.log(chalk.gray(`    - ${file}`));
          });
        }
        
        if (conflictBackupId) {
          console.log();
          console.log(chalk.blue('📦 Conflict Backup:'), conflictBackupId);
          console.log(chalk.gray('  To restore overwritten files, run:'));
          console.log(chalk.cyan(`  sce rollback ${conflictBackupId}`));
        }
        
        console.log();
      }
      
      if (steeringStrategy) {
        console.log(chalk.blue('Steering Strategy:'), steeringStrategy);
        if (steeringBackupId) {
          console.log(chalk.gray('  Backup:'), steeringBackupId);
        }
        console.log();
      }
      
      if (result.filesCreated.length > 0) {
        console.log(chalk.blue('Files created:'));
        result.filesCreated.forEach(file => console.log(`  + ${file}`));
      }
      
      if (result.filesUpdated.length > 0) {
        console.log(chalk.blue('Files updated:'));
        result.filesUpdated.forEach(file => console.log(`  ~ ${file}`));
      }
      
      if (result.filesSkipped.length > 0 && detection.conflicts.length === 0) {
        // Only show this if not already shown in conflict summary
        console.log(chalk.gray('Files skipped:'));
        result.filesSkipped.forEach(file => console.log(`  - ${file}`));
      }
      
      if (result.warnings.length > 0) {
        console.log();
        console.log(chalk.yellow('⚠️  Warnings:'));
        result.warnings.forEach(warning => console.log(`  ${warning}`));
      }
      
      if (backupId) {
        console.log();
        console.log(chalk.blue('📦 Full Backup:'), backupId);
        console.log(chalk.gray('  Run'), chalk.cyan('sce rollback'), chalk.gray('if you need to undo changes'));
      }
      
      console.log();
      
      // 12. Detect tool and offer automation setup
      console.log(chalk.blue('🔍 Detecting your development environment...'));
      try {
        const toolDetection = await detectTool(projectPath);
        const autoConfig = await generateAutoConfig(toolDetection, projectPath);
        
        console.log();
        console.log(chalk.blue('Tool Detected:'), chalk.cyan(toolDetection.primaryTool));
        console.log(chalk.blue('Confidence:'), autoConfig.confidence);
        
        if (autoConfig.notes.length > 0) {
          console.log();
          autoConfig.notes.forEach(note => console.log(chalk.gray(`  ℹ️  ${note}`)));
        }
        
        // Offer automation setup (unless --auto)
        if (!auto && autoConfig.suggestedPresets.length > 0) {
          console.log();
          const { setupAutomation } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'setupAutomation',
              message: 'Would you like to set up automation for this tool?',
              default: true
            }
          ]);
          
          if (setupAutomation) {
            console.log();
            console.log(chalk.blue('📋 Recommended automation setup:'));
            console.log();
            console.log(chalk.gray('Suggested presets:'));
            autoConfig.suggestedPresets.forEach(preset => {
              console.log(`  - ${preset}`);
            });
            console.log();
            console.log(chalk.gray('Run these commands to set up:'));
            autoConfig.suggestedCommands.forEach(cmd => {
              console.log(chalk.cyan(`  ${cmd}`));
            });
          }
        } else if (autoConfig.suggestedCommands.length > 0) {
          console.log();
          console.log(chalk.blue('💡 Automation setup:'));
          autoConfig.suggestedCommands.forEach(cmd => {
            console.log(chalk.gray(`  ${cmd}`));
          });
        }
      } catch (toolError) {
        // Tool detection is optional, don't fail adoption if it errors
        console.log(chalk.yellow('⚠️  Could not detect development tool'));
        console.log(chalk.gray('  You can manually set up automation later'));
      }
      
      console.log();
      console.log(chalk.blue('💡 Next steps:'));
      console.log('  1. Tell your AI: "Read .sce/README.md to understand project methodology"');
      console.log('  2. Start working: Ask AI to implement features following Spec-driven approach');
      console.log('  3. Check progress: ' + chalk.cyan('sce status'));
      console.log();
      console.log(chalk.red('🔥') + ' Project now follows Spec-driven development!');
    } else {
      console.log(chalk.red('❌ Adoption failed'));
      console.log();
      result.errors.forEach(error => console.log(chalk.red(`  ${error}`)));
      
      if (backupId) {
        console.log();
        console.log(chalk.blue('📦 Backup available:'), backupId);
        console.log(chalk.gray('  Run'), chalk.cyan('sce rollback'), chalk.gray('to restore'));
      }
      
      process.exit(1);
    }
  } catch (error) {
    console.log();
    console.log(chalk.red('❌ Error:'), error.message);
    console.log();
    console.log(chalk.gray('If you need help, please report this issue:'));
    console.log(chalk.cyan('https://github.com/heguangyong/scene-capability-engine/issues'));
    process.exit(1);
  }
}

/**
 * Offers automation setup based on detected tool
 * 
 * @param {string} projectPath - Project path
 * @returns {Promise<void>}
 */
/**
 * Creates default MCP settings for AI IDE
 * Only called when AI IDE is detected
 * 
 * @param {string} projectPath - Project root path
 */
async function setupSceMcpConfig(projectPath) {
  const mcpConfigPath = path.join(projectPath, '.sce', 'settings', 'mcp.json');
  
  // Don't overwrite existing config
  if (await pathExists(mcpConfigPath)) {
    return;
  }
  
  const mcpConfig = {
    mcpServers: {
      shell: {
        command: 'npx',
        args: ['-y', 'mcp-server-commands'],
        env: {},
        disabled: false,
        autoApprove: ['run_process']
      }
    }
  };
  
  try {
    await ensureDirectory(path.join(projectPath, '.sce', 'settings'));
    await writeJSON(mcpConfigPath, mcpConfig);
    console.log(chalk.green('  ✅ Created .sce/settings/mcp.json (shell MCP server)'));
  } catch (error) {
    // Non-fatal, just log warning
    console.log(chalk.yellow('  ⚠️  Could not create MCP config: ' + error.message));
  }
}

async function offerAutomationSetup(projectPath) {
  console.log(chalk.blue('🔍 Detecting your development environment...'));
  
  try {
    const toolDetection = await detectTool(projectPath);
    const autoConfig = await generateAutoConfig(toolDetection, projectPath);
    
    console.log();
    console.log(chalk.blue('Tool Detected:'), chalk.cyan(toolDetection.primaryTool));
    console.log(chalk.blue('Confidence:'), autoConfig.confidence);
    
    if (autoConfig.notes.length > 0) {
      console.log();
      autoConfig.notes.forEach(note => console.log(chalk.gray(`  ℹ️  ${note}`)));
    }
    
    if (autoConfig.suggestedCommands.length > 0) {
      console.log();
      console.log(chalk.blue('💡 Automation setup:'));
      autoConfig.suggestedCommands.forEach(cmd => {
        console.log(chalk.gray(`  ${cmd}`));
      });
    }
    
    // If AI IDE detected, create default MCP settings
    if (toolDetection.primaryTool === 'SCE') {
      await setupSceMcpConfig(projectPath);
    }
  } catch (toolError) {
    // Tool detection is optional, don't fail adoption if it errors
    console.log(chalk.yellow('⚠️  Could not detect development tool'));
    console.log(chalk.gray('  You can manually set up automation later'));
  }
  
  console.log();
}

module.exports = adoptCommand;
