const { spawnSync } = require('child_process');
const chalk = require('chalk');
const fs = require('fs-extra');
const {
  ProjectTimelineStore,
  captureTimelineCheckpoint
} = require('../runtime/project-timeline');
const {
  evaluateCollabGovernanceGate,
  formatCollabGovernanceGateBlockMessage
} = require('../workspace/collab-governance-gate');
const {
  summarizeTimelineAttention,
  buildTimelineEntryViewModel,
  buildTimelineListViewModel,
  buildTimelineShowViewModel
} = require('../magicball/timeline-view-model');

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizePositiveInteger(value, fallback, max = 10000) {
  const parsed = Number.parseInt(`${value}`, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = normalizeText(`${value || ''}`).toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function createStore(dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  return dependencies.timelineStore || new ProjectTimelineStore(projectPath, fileSystem);
}

function printPayload(payload, asJson = false, title = 'Timeline') {
  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.blue(title));
  if (payload.mode) {
    console.log(`  Mode: ${payload.mode}`);
  }
  if (payload.snapshot && payload.snapshot.snapshot_id) {
    console.log(`  Snapshot: ${payload.snapshot.snapshot_id}`);
  }
  if (payload.snapshot_id) {
    console.log(`  Snapshot: ${payload.snapshot_id}`);
  }
  if (payload.restored_from) {
    console.log(`  Restored From: ${payload.restored_from}`);
  }
  if (typeof payload.total === 'number') {
    console.log(`  Total: ${payload.total}`);
  }
  if (Array.isArray(payload.snapshots)) {
    for (const item of payload.snapshots) {
      console.log(`  - ${item.snapshot_id} | ${item.trigger} | ${item.created_at} | files=${item.file_count}`);
    }
  }
  if (payload.created === false && payload.reason) {
    console.log(`  Skipped: ${payload.reason}`);
  }
}

async function runTimelineSaveCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const payload = await store.saveSnapshot({
    trigger: normalizeText(options.trigger) || 'manual',
    event: normalizeText(options.event) || 'manual.save',
    summary: normalizeText(options.summary),
    command: normalizeText(options.command)
  });

  const result = {
    mode: 'timeline-save',
    success: true,
    snapshot: payload
  };
  printPayload(result, options.json, 'Timeline Save');
  return result;
}

async function runTimelineAutoCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const payload = await store.maybeAutoSnapshot({
    event: normalizeText(options.event) || 'auto.tick',
    summary: normalizeText(options.summary),
    intervalMinutes: options.interval
  });

  printPayload(payload, options.json, 'Timeline Auto');
  return payload;
}

async function runTimelineListCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const payload = await store.listSnapshots({
    limit: normalizePositiveInteger(options.limit, 20, 2000),
    trigger: normalizeText(options.trigger)
  });
  payload.view_model = buildTimelineListViewModel(payload);
  printPayload(payload, options.json, 'Timeline List');
  return payload;
}

async function runTimelineShowCommand(snapshotId, options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const payload = await store.getSnapshot(snapshotId);
  payload.view_model = buildTimelineShowViewModel(payload);
  printPayload(payload, options.json, 'Timeline Show');
  return payload;
}

async function runTimelineRestoreCommand(snapshotId, options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const payload = await store.restoreSnapshot(snapshotId, {
    prune: normalizeBoolean(options.prune, false),
    preSave: options.preSave !== false
  });
  printPayload(payload, options.json, 'Timeline Restore');
  return payload;
}

async function runTimelineConfigCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);

  const patch = {};
  if (typeof options.enabled !== 'undefined') {
    patch.enabled = normalizeBoolean(options.enabled, true);
  }
  if (typeof options.interval !== 'undefined') {
    patch.auto_interval_minutes = normalizePositiveInteger(options.interval, 30, 24 * 60);
  }
  if (typeof options.maxEntries !== 'undefined') {
    patch.max_entries = normalizePositiveInteger(options.maxEntries, 120, 10000);
  }

  const hasPatch = Object.keys(patch).length > 0;
  const payload = hasPatch
    ? await store.updateConfig(patch)
    : await store.getConfig();

  const result = {
    mode: 'timeline-config',
    success: true,
    updated: hasPatch,
    config: payload
  };
  printPayload(result, options.json, 'Timeline Config');
  return result;
}

async function runTimelinePushCommand(gitArgs = [], options = {}, dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const collabGovernanceGate = dependencies.evaluateCollabGovernanceGate || evaluateCollabGovernanceGate;
  const checkpointRunner = dependencies.captureTimelineCheckpoint || captureTimelineCheckpoint;
  const runGitPush = dependencies.spawnSync || spawnSync;

  const gatePayload = await collabGovernanceGate({
    projectPath
  }, dependencies);
  if (!gatePayload.passed) {
    const error = new Error(formatCollabGovernanceGateBlockMessage(gatePayload));
    error.exitCode = 2;
    error.gate = gatePayload;
    throw error;
  }

  const checkpoint = await checkpointRunner({
    trigger: 'push',
    event: 'git.push.preflight',
    summary: normalizeText(options.summary) || 'pre-push timeline checkpoint',
    command: `git push ${Array.isArray(gitArgs) ? gitArgs.join(' ') : ''}`.trim()
  }, {
    projectPath,
    fileSystem: dependencies.fileSystem
  });

  const result = runGitPush('git', ['push', ...(Array.isArray(gitArgs) ? gitArgs : [])], {
    cwd: projectPath,
    stdio: 'inherit',
    windowsHide: true
  });

  const statusCode = Number.isInteger(result.status) ? result.status : 1;
  if (statusCode !== 0) {
    const error = new Error(`git push failed with exit code ${statusCode}`);
    error.exitCode = statusCode;
    throw error;
  }

  const payload = {
    mode: 'timeline-push',
    success: true,
    checkpoint,
    command: `git push ${Array.isArray(gitArgs) ? gitArgs.join(' ') : ''}`.trim()
  };

  printPayload(payload, options.json, 'Timeline Push');
  return payload;
}

async function safeRun(handler, options = {}, ...args) {
  try {
    await handler(...args, options);
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: error.message }, null, 2));
    } else {
      console.error(chalk.red('Timeline command failed:'), error.message);
    }
    process.exitCode = error.exitCode || 1;
  }
}

function registerTimelineCommands(program) {
  const timeline = program
    .command('timeline')
    .description('Project local timeline snapshots (auto/key-event/manual/restore)');

  timeline
    .command('save')
    .description('Create a manual timeline snapshot')
    .option('--trigger <trigger>', 'Trigger label', 'manual')
    .option('--event <event>', 'Event label', 'manual.save')
    .option('--summary <text>', 'Summary for this checkpoint')
    .option('--command <text>', 'Command context label')
    .option('--json', 'Output as JSON')
    .action(async (options) => safeRun(runTimelineSaveCommand, options));

  timeline
    .command('auto')
    .description('Run interval-based auto timeline snapshot check')
    .option('--interval <minutes>', 'Override auto interval minutes')
    .option('--event <event>', 'Event label', 'auto.tick')
    .option('--summary <text>', 'Summary for auto checkpoint')
    .option('--json', 'Output as JSON')
    .action(async (options) => safeRun(runTimelineAutoCommand, options));

  timeline
    .command('list')
    .description('List timeline snapshots')
    .option('--limit <n>', 'Maximum snapshots', '20')
    .option('--trigger <trigger>', 'Filter by trigger')
    .option('--json', 'Output as JSON')
    .action(async (options) => safeRun(runTimelineListCommand, options));

  timeline
    .command('show <snapshotId>')
    .description('Show one timeline snapshot')
    .option('--json', 'Output as JSON')
    .action(async (snapshotId, options) => safeRun(runTimelineShowCommand, options, snapshotId));

  timeline
    .command('restore <snapshotId>')
    .description('Restore workspace from a timeline snapshot')
    .option('--prune', 'Delete files not present in snapshot (dangerous)')
    .option('--no-pre-save', 'Do not create a pre-restore snapshot')
    .option('--json', 'Output as JSON')
    .action(async (snapshotId, options) => safeRun(runTimelineRestoreCommand, options, snapshotId));

  timeline
    .command('config')
    .description('Show/update timeline config')
    .option('--enabled <boolean>', 'Enable timeline (true/false)')
    .option('--interval <minutes>', 'Auto snapshot interval in minutes')
    .option('--max-entries <n>', 'Maximum retained snapshots')
    .option('--json', 'Output as JSON')
    .action(async (options) => safeRun(runTimelineConfigCommand, options));

  timeline
    .command('push [gitArgs...]')
    .description('Run collaboration governance gate, create a pre-push timeline snapshot, then run git push')
    .option('--summary <text>', 'Summary for pre-push checkpoint')
    .option('--json', 'Output as JSON')
    .action(async (gitArgs, options) => safeRun(runTimelinePushCommand, options, gitArgs));
}

module.exports = {
  runTimelineSaveCommand,
  runTimelineAutoCommand,
  runTimelineListCommand,
  runTimelineShowCommand,
  runTimelineRestoreCommand,
  runTimelineConfigCommand,
  runTimelinePushCommand,
  registerTimelineCommands
};
