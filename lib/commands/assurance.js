const chalk = require('chalk');
const fs = require('fs-extra');
const { getSceStateStore } = require('../state/sce-state-store');

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizePositiveInteger(value, fallback = 100, max = 1000) {
  const parsed = Number.parseInt(`${value}`, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function createStore(dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const env = dependencies.env || process.env;
  return dependencies.stateStore || getSceStateStore(projectPath, {
    fileSystem,
    env
  });
}

function countBy(items = [], key = 'status') {
  return items.reduce((acc, item) => {
    const value = normalizeString(item && item[key]) || 'unknown';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function buildStatus(statusLabel, attentionLevel, blockingSummary = '', recommendedAction = '') {
  return {
    attention_level: attentionLevel,
    status_tone: attentionLevel === 'high' ? 'warning' : (attentionLevel === 'medium' ? 'info' : 'success'),
    status_label: statusLabel,
    blocking_summary: blockingSummary,
    recommended_action: recommendedAction
  };
}

function attachResourceViewModel(items = []) {
  return items.map((item) => ({
    ...item,
    mb_status: buildStatus(
      item.status === 'healthy' ? '正常' : '关注',
      item.status === 'blocked' || item.status === 'degraded' ? 'high' : 'low',
      item.summary || '',
      '继续检查资源状态与恢复策略'
    )
  }));
}

function attachLogViewModel(items = []) {
  return items.map((item) => ({
    ...item,
    mb_status: buildStatus(
      item.status === 'ready' ? '可查看' : '待处理',
      item.status === 'error' ? 'high' : 'low',
      item.summary || '',
      '继续查看日志摘要与过滤视图'
    )
  }));
}

function attachBackupViewModel(items = []) {
  return items.map((item) => ({
    ...item,
    mb_status: buildStatus(
      item.recoverable === true ? '可恢复' : '仅归档',
      item.recoverable === true ? 'low' : 'medium',
      item.summary || '',
      '继续核对备份可恢复性'
    )
  }));
}

function attachConfigViewModel(items = []) {
  return items.map((item) => ({
    ...item,
    mb_status: buildStatus(
      item.status === 'aligned' ? '已对齐' : '待确认',
      item.status === 'drift' ? 'high' : 'medium',
      item.summary || '',
      '继续核对 desired/actual state'
    )
  }));
}

function buildTablePayload(mode, query, items, columns) {
  return {
    mode,
    query,
    summary: {
      total: items.length,
      by_status: countBy(items, 'status')
    },
    items,
    filters: [],
    sort: [{ key: 'updated_at', direction: 'desc' }],
    view_model: {
      type: 'table',
      columns
    },
    mb_status: {
      status_label: items.length > 0 ? '有数据' : '空状态',
      attention_level: items.length > 0 ? 'low' : 'medium'
    }
  };
}

function printPayload(payload, options = {}, title = 'Assurance') {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(chalk.blue(title));
  if (payload.mode) console.log(`  Mode: ${payload.mode}`);
  if (payload.summary && typeof payload.summary === 'object') {
    for (const [key, value] of Object.entries(payload.summary)) {
      console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
    }
  }
}

async function runAssuranceResourceStatusCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const items = attachResourceViewModel(await store.listAssuranceResourceSnapshots({
    limit: normalizePositiveInteger(options.limit, 100, 1000),
    status: options.status
  }) || []);
  const payload = buildTablePayload('assurance-resource-status', { space: normalizeString(options.space) || 'engineering', resource: 'resource' }, items, ['snapshot_id', 'resource_type', 'resource_name', 'status', 'summary', 'updated_at']);
  printPayload(payload, options, 'Assurance Resource Status');
  return payload;
}

async function runAssuranceLogsViewsCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const items = attachLogViewModel(await store.listAssuranceLogViews({
    limit: normalizePositiveInteger(options.limit, 100, 1000),
    status: options.status
  }) || []);
  const payload = buildTablePayload('assurance-logs-views', { space: normalizeString(options.space) || 'engineering', resource: 'logs' }, items, ['view_id', 'title', 'source', 'status', 'summary', 'path_ref', 'updated_at']);
  printPayload(payload, options, 'Assurance Logs Views');
  return payload;
}

async function runAssuranceBackupListCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const items = attachBackupViewModel(await store.listAssuranceBackupRecords({
    limit: normalizePositiveInteger(options.limit, 100, 1000),
    status: options.status
  }) || []);
  const payload = buildTablePayload('assurance-backup-list', { space: normalizeString(options.space) || 'engineering', resource: 'backup' }, items, ['backup_id', 'title', 'backup_type', 'scope', 'status', 'recoverable', 'generated_at', 'updated_at']);
  printPayload(payload, options, 'Assurance Backup List');
  return payload;
}

async function runAssuranceConfigSwitchesCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const items = attachConfigViewModel(await store.listAssuranceConfigSwitches({
    limit: normalizePositiveInteger(options.limit, 100, 1000),
    status: options.status
  }) || []);
  const payload = buildTablePayload('assurance-config-switches', { space: normalizeString(options.space) || 'engineering', resource: 'config' }, items, ['switch_id', 'title', 'scope', 'switch_key', 'desired_state', 'actual_state', 'status', 'updated_at']);
  printPayload(payload, options, 'Assurance Config Switches');
  return payload;
}

function safeRun(handler, options = {}, context = 'assurance command') {
  Promise.resolve(handler(options))
    .catch((error) => {
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: error.message }, null, 2));
      } else {
        console.error(chalk.red(`${context} failed:`), error.message);
      }
      process.exitCode = 1;
    });
}

function registerAssuranceCommands(program) {
  const assurance = program
    .command('assurance')
    .description('Engineering assurance data plane for MagicBall engineering mode');

  const resource = assurance.command('resource').description('Resource status views');
  resource.command('status').option('--space <space>', 'Space name', 'engineering').option('--limit <n>', 'Maximum rows', '100').option('--status <status>', 'Filter by status').option('--json', 'Print machine-readable JSON output').action((options) => safeRun(runAssuranceResourceStatusCommand, options, 'assurance resource status'));

  const logs = assurance.command('logs').description('Log view summaries');
  logs.command('views').option('--space <space>', 'Space name', 'engineering').option('--limit <n>', 'Maximum rows', '100').option('--status <status>', 'Filter by status').option('--json', 'Print machine-readable JSON output').action((options) => safeRun(runAssuranceLogsViewsCommand, options, 'assurance logs views'));

  const backup = assurance.command('backup').description('Backup and restore summaries');
  backup.command('list').option('--space <space>', 'Space name', 'engineering').option('--limit <n>', 'Maximum rows', '100').option('--status <status>', 'Filter by status').option('--json', 'Print machine-readable JSON output').action((options) => safeRun(runAssuranceBackupListCommand, options, 'assurance backup list'));

  const config = assurance.command('config').description('Config switch summaries');
  config.command('switches').option('--space <space>', 'Space name', 'engineering').option('--limit <n>', 'Maximum rows', '100').option('--status <status>', 'Filter by status').option('--json', 'Print machine-readable JSON output').action((options) => safeRun(runAssuranceConfigSwitchesCommand, options, 'assurance config switches'));
}

module.exports = {
  runAssuranceResourceStatusCommand,
  runAssuranceLogsViewsCommand,
  runAssuranceBackupListCommand,
  runAssuranceConfigSwitchesCommand,
  registerAssuranceCommands
};
