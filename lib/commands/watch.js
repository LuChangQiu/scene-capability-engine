/**
 * Watch Command Group
 * 
 * Manages watch mode for automated file monitoring and command execution
 */

const chalk = require('chalk');
const path = require('path');
const fs = require('fs-extra');
const inquirer = require('inquirer');
const WatchManager = require('../watch/watch-manager');
const { listPresets, getPreset, mergePreset, validatePreset } = require('../watch/presets');

function sleep(ms) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });
}

/**
 * Start watch mode
 * 
 * @param {Object} options - Command options
 * @param {string} options.config - Custom config file path
 * @param {string} options.patterns - Override patterns (comma-separated)
 * @returns {Promise<void>}
 */
async function startWatch(options = {}) {
  const projectPath = process.cwd();
  const configPath = options.config || path.join(projectPath, '.sce/watch-config.json');
  
  console.log(chalk.red('🔥') + ' Starting Watch Mode');
  console.log();
  
  try {
    const watchManager = new WatchManager({ configPath });
    
    // Load configuration
    await watchManager.loadConfig();
    
    // Override patterns if specified
    if (options.patterns) {
      const patterns = options.patterns.split(',').map(p => p.trim());
      watchManager.config.patterns = patterns;
      console.log('Using custom patterns:', chalk.cyan(patterns.join(', ')));
      console.log();
    }
    
    // Start watch mode
    await watchManager.start();
    
    console.log(chalk.green('✅ Watch mode started'));
    console.log();
    console.log('Watching patterns:');
    for (const pattern of watchManager.config.patterns) {
      console.log(`  ${chalk.gray('•')} ${pattern}`);
    }
    console.log();
    console.log('Actions configured:');
    const actionCount = Object.keys(watchManager.config.actions || {}).length;
    console.log(`  ${chalk.cyan(actionCount)} action(s)`);
    console.log();
    console.log('Commands:');
    console.log(`  ${chalk.cyan('sce watch status')} - Check status`);
    console.log(`  ${chalk.cyan('sce watch logs')} - View logs`);
    console.log(`  ${chalk.cyan('sce watch stop')} - Stop watch mode`);
    console.log();
    console.log(chalk.gray('Press Ctrl+C to stop'));
    
    // Keep process running
    process.on('SIGINT', async () => {
      console.log();
      console.log('Stopping watch mode...');
      await watchManager.stop();
      console.log(chalk.green('✅ Watch mode stopped'));
      process.exit(0);
    });
    
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Stop watch mode
 * 
 * @param {Object} options - Command options
 * @returns {Promise<void>}
 */
async function stopWatch(options = {}) {
  const projectPath = process.cwd();
  const configPath = path.join(projectPath, '.sce/watch-config.json');
  
  console.log(chalk.red('🔥') + ' Stopping Watch Mode');
  console.log();
  
  try {
    const watchManager = new WatchManager({ configPath });
    await watchManager.stop();
    
    console.log(chalk.green('✅ Watch mode stopped'));
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Show watch mode status
 * 
 * @param {Object} options - Command options
 * @returns {Promise<void>}
 */
async function statusWatch(options = {}) {
  const projectPath = process.cwd();
  const configPath = path.join(projectPath, '.sce/watch-config.json');
  
  console.log(chalk.red('🔥') + ' Watch Mode Status');
  console.log();
  
  try {
    const watchManager = new WatchManager({ configPath });
    const status = watchManager.getStatus();
    
    // Running status
    const runningStatus = status.running ? chalk.green('Running') : chalk.gray('Stopped');
    console.log(`Status: ${runningStatus}`);
    console.log();
    
    if (status.running) {
      // Patterns
      console.log('Watching patterns:');
      for (const pattern of status.patterns || []) {
        console.log(`  ${chalk.gray('•')} ${pattern}`);
      }
      console.log();
      
      // Actions
      console.log('Actions:');
      const actionCount = Object.keys(status.actions || {}).length;
      console.log(`  ${chalk.cyan(actionCount)} action(s) configured`);
      console.log();
      
      // Recent activity
      if (status.recentActivity && status.recentActivity.length > 0) {
        console.log('Recent activity:');
        for (const activity of status.recentActivity.slice(0, 5)) {
          const time = new Date(activity.timestamp).toLocaleTimeString();
          const result = activity.result === 'success' ? chalk.green('✓') : chalk.red('✗');
          console.log(`  ${result} ${chalk.gray(time)} ${activity.file}`);
        }
        console.log();
      }
      
      // Error count
      if (status.errorCount > 0) {
        console.log(chalk.yellow(`⚠️  ${status.errorCount} error(s) occurred`));
        console.log(`Run ${chalk.cyan('sce watch logs')} to view details`);
        console.log();
      }
    } else {
      console.log(chalk.gray('Watch mode is not running'));
      console.log();
      console.log(`Run ${chalk.cyan('sce watch start')} to start`);
    }
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Display execution logs
 * 
 * @param {Object} options - Command options
 * @param {number} options.tail - Number of lines to show
 * @param {boolean} options.follow - Follow mode (tail -f)
 * @returns {Promise<void>}
 */
async function logsWatch(options = {}) {
  const projectPath = process.cwd();
  
  console.log(chalk.red('🔥') + ' Watch Mode Logs');
  console.log();
  
  try {
    const lines = parseTailOption(options.tail, 50);
    const logPath = resolveWatchLogPath(projectPath, options);
    const rawLines = await readRawLogLines(logPath);
    const logs = rawLines.slice(-lines).map(parseLogEntry);
    
    if (logs.length === 0 && !options.follow) {
      console.log(chalk.gray('No logs found'));
      return;
    }
    
    if (logs.length > 0) {
      console.log(`Showing last ${chalk.cyan(logs.length)} log entries:`);
      console.log();
      for (const log of logs) {
        printLogEntry(log);
      }
    }
    
    if (options.follow) {
      console.log();
      if (logs.length === 0) {
        console.log(chalk.gray('No logs found yet. Waiting for new entries...'));
      }
      console.log(chalk.gray('Following logs... (Press Ctrl+C to stop)'));
      await followLogStream(logPath, {
        startLineCount: rawLines.length,
        pollIntervalMs: parseTailOption(options.pollIntervalMs, 500),
        followDurationMs: parseTailOption(options.followDurationMs, 0)
      });
    }
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
}

function parseTailOption(input, fallbackValue) {
  const parsed = Number.parseInt(input, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return fallbackValue;
}

function resolveWatchLogPath(projectPath, options = {}) {
  if (options.logPath) {
    return path.isAbsolute(options.logPath)
      ? options.logPath
      : path.join(projectPath, options.logPath);
  }

  const logFile = options.logFile || 'execution.log';
  return path.join(projectPath, '.sce', 'watch', 'logs', logFile);
}

async function readRawLogLines(logPath) {
  if (!await fs.pathExists(logPath)) {
    return [];
  }

  const content = await fs.readFile(logPath, 'utf8');
  if (!content.trim()) {
    return [];
  }

  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

function parseLogEntry(line) {
  try {
    return JSON.parse(line);
  } catch (error) {
    return {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: line
    };
  }
}

function printLogEntry(log) {
  const timestamp = log.timestamp ? new Date(log.timestamp) : new Date();
  const time = Number.isNaN(timestamp.getTime())
    ? String(log.timestamp || '')
    : timestamp.toLocaleTimeString();
  const level = formatLogLevel(log.level || 'info');
  const message = log.message || log.event || JSON.stringify(log);

  console.log(`${chalk.gray(time)} ${level} ${message}`);

  if (log.error) {
    const errorText = typeof log.error === 'string'
      ? log.error
      : JSON.stringify(log.error);
    console.log(`  ${chalk.red('Error:')} ${errorText}`);
  }
}

async function followLogStream(logPath, options = {}) {
  const pollIntervalMs = parseTailOption(options.pollIntervalMs, 500);
  const followDurationMs = parseTailOption(options.followDurationMs, 0);
  const deadline = followDurationMs > 0 ? Date.now() + followDurationMs : null;
  let cursor = Number.isFinite(options.startLineCount) ? options.startLineCount : 0;
  let stopped = false;

  const onSigInt = () => {
    stopped = true;
    console.log();
    console.log(chalk.gray('Stopped following logs.'));
  };

  process.once('SIGINT', onSigInt);

  try {
    while (!stopped) {
      const rawLines = await readRawLogLines(logPath);

      if (rawLines.length < cursor) {
        // File rotation/truncation: reset cursor and continue from new content.
        cursor = 0;
      }

      if (rawLines.length > cursor) {
        const appended = rawLines.slice(cursor).map(parseLogEntry);
        for (const entry of appended) {
          printLogEntry(entry);
        }
        cursor = rawLines.length;
      }

      if (deadline && Date.now() >= deadline) {
        break;
      }

      await sleep(pollIntervalMs);
    }
  } finally {
    process.removeListener('SIGINT', onSigInt);
  }
}

/**
 * Display automation metrics
 * 
 * @param {Object} options - Command options
 * @param {string} options.format - Output format (text/json)
 * @returns {Promise<void>}
 */
async function metricsWatch(options = {}) {
  const projectPath = process.cwd();
  const configPath = path.join(projectPath, '.sce/watch-config.json');
  
  console.log(chalk.red('🔥') + ' Watch Mode Metrics');
  console.log();
  
  try {
    const watchManager = new WatchManager({ configPath });
    const metrics = watchManager.getMetrics();
    
    if (options.format === 'json') {
      console.log(JSON.stringify(metrics, null, 2));
      return;
    }
    
    // Text format
    console.log('Execution Statistics:');
    console.log(`  Total executions: ${chalk.cyan(metrics.totalExecutions || 0)}`);
    console.log(`  Successful: ${chalk.green(metrics.successfulExecutions || 0)}`);
    console.log(`  Failed: ${chalk.red(metrics.failedExecutions || 0)}`);
    console.log(`  Success rate: ${chalk.cyan(((metrics.successRate || 0) * 100).toFixed(1))}%`);
    console.log();
    
    console.log('Performance:');
    console.log(`  Average duration: ${chalk.cyan((metrics.averageDuration || 0).toFixed(0))}ms`);
    console.log(`  Time saved: ${chalk.cyan(formatTimeSaved(metrics.timeSaved || 0))}`);
    console.log();
    
    if (metrics.byAction && Object.keys(metrics.byAction).length > 0) {
      console.log('By Action:');
      for (const [action, count] of Object.entries(metrics.byAction)) {
        console.log(`  ${action}: ${chalk.cyan(count)}`);
      }
      console.log();
    }
    
    if (metrics.errors && metrics.errors.length > 0) {
      console.log(chalk.yellow(`Recent Errors (${metrics.errors.length}):`));
      for (const error of metrics.errors.slice(0, 5)) {
        const time = new Date(error.timestamp).toLocaleTimeString();
        console.log(`  ${chalk.gray(time)} ${error.message}`);
      }
    }
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Initialize watch configuration
 * 
 * @param {Object} options - Command options
 * @param {boolean} options.force - Overwrite existing config
 * @returns {Promise<void>}
 */
async function initWatch(options = {}) {
  const projectPath = process.cwd();
  const configPath = path.join(projectPath, '.sce/watch-config.json');
  
  console.log(chalk.red('🔥') + ' Initialize Watch Configuration');
  console.log();
  
  try {
    // Check if config already exists
    if (await fs.pathExists(configPath) && !options.force) {
      console.log(chalk.yellow('⚠️  Configuration already exists'));
      console.log();
      console.log(`Path: ${chalk.gray(configPath)}`);
      console.log();
      console.log(`Use ${chalk.cyan('--force')} to overwrite`);
      return;
    }
    
    // Create default configuration
    const defaultConfig = {
      enabled: true,
      patterns: [
        '**/tasks.md',
        '**/.sce/specs/*/requirements.md',
        '**/.sce/specs/*/design.md'
      ],
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/coverage/**'
      ],
      actions: {
        '**/tasks.md': {
          command: 'sce workspace sync',
          debounce: 2000,
          description: 'Sync workspace when tasks are updated'
        }
      },
      debounce: {
        default: 2000
      },
      logging: {
        enabled: true,
        level: 'info',
        maxSize: '10MB',
        rotation: true
      },
      retry: {
        enabled: true,
        maxAttempts: 3,
        backoff: 'exponential'
      }
    };
    
    // Ensure directory exists
    await fs.ensureDir(path.dirname(configPath));
    
    // Write configuration
    await fs.writeJson(configPath, defaultConfig, { spaces: 2 });
    
    console.log(chalk.green('✅ Configuration created'));
    console.log();
    console.log(`Path: ${chalk.gray(configPath)}`);
    console.log();
    console.log('Default patterns:');
    for (const pattern of defaultConfig.patterns) {
      console.log(`  ${chalk.gray('•')} ${pattern}`);
    }
    console.log();
    console.log('Next steps:');
    console.log(`  1. Edit config: ${chalk.cyan(configPath)}`);
    console.log(`  2. Start watch: ${chalk.cyan('sce watch start')}`);
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Format log level with color
 * 
 * @param {string} level - Log level
 * @returns {string} Formatted level
 */
function formatLogLevel(level) {
  const levels = {
    debug: chalk.gray('[DEBUG]'),
    info: chalk.blue('[INFO]'),
    warn: chalk.yellow('[WARN]'),
    error: chalk.red('[ERROR]')
  };
  return levels[level] || chalk.gray(`[${level.toUpperCase()}]`);
}

/**
 * Format time saved in human-readable format
 * 
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted time
 */
function formatTimeSaved(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else if (ms < 3600000) {
    return `${(ms / 60000).toFixed(1)}m`;
  } else {
    return `${(ms / 3600000).toFixed(1)}h`;
  }
}

/**
 * List available presets
 * 
 * @param {Object} options - Command options
 * @returns {Promise<void>}
 */
async function listPresetsWatch(options = {}) {
  console.log(chalk.red('🔥') + ' Available Watch Presets');
  console.log();
  
  const presets = listPresets();
  
  for (const preset of presets) {
    console.log(`${chalk.cyan(preset.name)}`);
    console.log(`  ${chalk.gray(preset.description)}`);
    console.log();
  }
  
  console.log('Install a preset:');
  console.log(`  ${chalk.cyan('sce watch install <preset-name>')}`);
}

/**
 * Install a preset
 * 
 * @param {string} presetName - Preset name
 * @param {Object} options - Command options
 * @param {boolean} options.force - Overwrite existing actions
 * @returns {Promise<void>}
 */
async function installPresetWatch(presetName, options = {}) {
  const projectPath = process.cwd();
  const configPath = path.join(projectPath, '.sce/watch-config.json');
  
  console.log(chalk.red('🔥') + ` Installing Preset: ${chalk.cyan(presetName)}`);
  console.log();
  
  try {
    // Validate preset exists
    const validation = validatePreset(presetName);
    if (!validation.valid) {
      console.log(chalk.red('❌ Invalid preset'));
      console.log();
      for (const error of validation.errors) {
        console.log(`  ${chalk.red('•')} ${error}`);
      }
      console.log();
      console.log('Available presets:');
      const presets = listPresets();
      for (const preset of presets) {
        console.log(`  ${chalk.cyan('•')} ${preset.name}`);
      }
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
      throw new Error('Invalid preset');
    }
    
    // Get preset
    const preset = getPreset(presetName);
    
    // Check if config exists
    let existingConfig = {};
    if (await fs.pathExists(configPath)) {
      existingConfig = await fs.readJson(configPath);
    } else {
      // Create default config
      existingConfig = {
        enabled: true,
        patterns: [],
        ignored: ['**/node_modules/**', '**/.git/**', '**/coverage/**'],
        actions: {},
        debounce: { default: 2000 },
        logging: {
          enabled: true,
          level: 'info',
          maxSize: '10MB',
          rotation: true
        },
        retry: {
          enabled: true,
          maxAttempts: 3,
          backoff: 'exponential'
        }
      };
    }
    
    // Check for conflicts
    const conflicts = [];
    for (const pattern of Object.keys(preset.actions)) {
      if (existingConfig.actions && existingConfig.actions[pattern]) {
        conflicts.push(pattern);
      }
    }
    
    if (conflicts.length > 0 && !options.force) {
      console.log(chalk.yellow('⚠️  Conflicts detected'));
      console.log();
      console.log('The following patterns already have actions:');
      for (const pattern of conflicts) {
        console.log(`  ${chalk.yellow('•')} ${pattern}`);
      }
      console.log();
      
      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: 'Overwrite existing actions?',
        default: false
      }]);
      
      if (!proceed) {
        console.log('Installation cancelled');
        return;
      }
    }
    
    // Merge preset
    const mergedConfig = mergePreset(existingConfig, presetName);
    
    // Ensure directory exists
    await fs.ensureDir(path.dirname(configPath));
    
    // Save configuration
    await fs.writeJson(configPath, mergedConfig, { spaces: 2 });
    
    console.log(chalk.green('✅ Preset installed successfully'));
    console.log();
    console.log('Added patterns:');
    for (const pattern of preset.patterns) {
      console.log(`  ${chalk.gray('•')} ${pattern}`);
    }
    console.log();
    console.log('Added actions:');
    for (const [pattern, action] of Object.entries(preset.actions)) {
      console.log(`  ${chalk.gray('•')} ${pattern}`);
      console.log(`    ${chalk.gray(action.description)}`);
    }
    console.log();
    console.log('Next steps:');
    console.log(`  ${chalk.cyan('sce watch start')} - Start watch mode`);
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
}

module.exports = {
  startWatch,
  stopWatch,
  statusWatch,
  logsWatch,
  metricsWatch,
  initWatch,
  listPresetsWatch,
  installPresetWatch,
  _resolveWatchLogPath: resolveWatchLogPath,
  _readRawLogLines: readRawLogLines,
  _parseLogEntry: parseLogEntry,
  _followLogStream: followLogStream
};
