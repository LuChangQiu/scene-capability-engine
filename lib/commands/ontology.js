const chalk = require('chalk');
const fs = require('fs-extra');
const { ensureWriteAuthorization } = require('../security/write-authorization');
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

function buildStatus(statusLabel, attentionLevel, blockingSummary = '', recommendedAction = '') {
  return {
    attention_level: attentionLevel,
    status_tone: attentionLevel === 'high' ? 'warning' : (attentionLevel === 'medium' ? 'info' : 'success'),
    status_label: statusLabel,
    blocking_summary: blockingSummary,
    recommended_action: recommendedAction
  };
}

function countBy(items = [], key = 'status') {
  return items.reduce((acc, item) => {
    const value = normalizeString(item && item[key]) || 'unknown';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function attachErViewModel(items = []) {
  return items.map((item) => ({
    ...item,
    relations_summary: Array.isArray(item.relations) ? item.relations.map((entry) => normalizeString(entry && entry.target)).filter(Boolean).join(' / ') : '',
    mb_status: buildStatus(
      item.status === 'active' ? '生效中' : '草稿',
      item.status === 'active' ? 'low' : 'medium',
      '',
      Array.isArray(item.relations) && item.relations.length > 0 ? '继续补齐 relation 结构定义' : '补齐 relation 结构化定义'
    )
  }));
}

function attachBrViewModel(items = []) {
  return items.map((item) => ({
    ...item,
    mb_status: buildStatus(
      item.status === 'active' ? '生效中' : '草稿',
      item.severity === 'blocking' || item.severity === 'high' ? 'high' : (item.status === 'active' ? 'low' : 'medium'),
      '',
      '继续补齐 gate 映射'
    )
  }));
}

function attachDlViewModel(items = []) {
  return items.map((item) => ({
    ...item,
    decision_nodes_summary: Array.isArray(item.decision_nodes) ? `${item.decision_nodes.length} nodes` : '0 nodes',
    outputs_summary: Array.isArray(item.outputs) ? item.outputs.join(' / ') : '',
    mb_status: buildStatus(
      item.status === 'active' ? '生效中' : '草稿',
      item.status === 'active' ? 'low' : 'medium',
      '',
      '继续完善输入输出结构'
    )
  }));
}

function printPayload(payload, options = {}, title = 'Ontology') {
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

async function ensureAuthorized(action, options = {}, dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const env = dependencies.env || process.env;
  await ensureWriteAuthorization(action, {
    authLease: options.authLease,
    authPassword: options.authPassword,
    actor: options.actor
  }, {
    projectPath,
    fileSystem,
    env
  });
}

async function readInputJson(inputFile, dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const resolved = require('path').isAbsolute(inputFile)
    ? inputFile
    : require('path').join(projectPath, inputFile);
  return {
    resolved,
    payload: await fileSystem.readJson(resolved)
  };
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

async function runOntologyErListCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const items = attachErViewModel(await store.listOntologyErAssets({
    limit: normalizePositiveInteger(options.limit, 100, 1000),
    status: options.status,
    query: options.query
  }) || []);
  const payload = buildTablePayload('ontology-er-list', { space: normalizeString(options.space) || 'engineering', resource: 'ontology-er' }, items, ['name', 'display_name', 'description', 'key_fields', 'relations_summary', 'status', 'updated_at']);
  printPayload(payload, options, 'Ontology ER List');
  return payload;
}

async function runOntologyErShowCommand(options = {}, dependencies = {}) {
  const id = normalizeString(options.id);
  if (!id) throw new Error('--id is required');
  const store = createStore(dependencies);
  const item = await store.getOntologyErAsset(id);
  if (!item) throw new Error(`ontology er asset not found: ${id}`);
  const payload = { mode: 'ontology-er-show', query: { id }, item: attachErViewModel([item])[0] };
  printPayload(payload, options, 'Ontology ER Show');
  return payload;
}

async function runOntologyErUpsertCommand(options = {}, dependencies = {}) {
  const input = normalizeString(options.input);
  if (!input) throw new Error('--input is required');
  await ensureAuthorized('ontology:er:upsert', options, dependencies);
  const { resolved, payload } = await readInputJson(input, dependencies);
  const store = createStore(dependencies);
  const item = await store.upsertOntologyErAsset(payload);
  const result = { mode: 'ontology-er-upsert', success: true, input_file: resolved, item: attachErViewModel([item])[0] };
  printPayload(result, options, 'Ontology ER Upsert');
  return result;
}

async function runOntologyBrListCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const items = attachBrViewModel(await store.listOntologyBrRules({
    limit: normalizePositiveInteger(options.limit, 100, 1000),
    status: options.status,
    query: options.query
  }) || []);
  const payload = buildTablePayload('ontology-br-list', { space: normalizeString(options.space) || 'engineering', resource: 'ontology-br' }, items, ['rule_id', 'title', 'scope', 'condition', 'consequence', 'status', 'updated_at']);
  printPayload(payload, options, 'Ontology BR List');
  return payload;
}

async function runOntologyBrShowCommand(options = {}, dependencies = {}) {
  const id = normalizeString(options.id);
  if (!id) throw new Error('--id is required');
  const store = createStore(dependencies);
  const item = await store.getOntologyBrRule(id);
  if (!item) throw new Error(`ontology br rule not found: ${id}`);
  const payload = { mode: 'ontology-br-show', query: { id }, item: attachBrViewModel([item])[0] };
  printPayload(payload, options, 'Ontology BR Show');
  return payload;
}

async function runOntologyBrUpsertCommand(options = {}, dependencies = {}) {
  const input = normalizeString(options.input);
  if (!input) throw new Error('--input is required');
  await ensureAuthorized('ontology:br:upsert', options, dependencies);
  const { resolved, payload } = await readInputJson(input, dependencies);
  const store = createStore(dependencies);
  const item = await store.upsertOntologyBrRule(payload);
  const result = { mode: 'ontology-br-upsert', success: true, input_file: resolved, item: attachBrViewModel([item])[0] };
  printPayload(result, options, 'Ontology BR Upsert');
  return result;
}

async function runOntologyDlListCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const items = attachDlViewModel(await store.listOntologyDlChains({
    limit: normalizePositiveInteger(options.limit, 100, 1000),
    status: options.status,
    query: options.query
  }) || []);
  const payload = buildTablePayload('ontology-dl-list', { space: normalizeString(options.space) || 'engineering', resource: 'ontology-dl' }, items, ['chain_id', 'title', 'trigger', 'decision_nodes_summary', 'outputs_summary', 'status', 'updated_at']);
  printPayload(payload, options, 'Ontology DL List');
  return payload;
}

async function runOntologyDlShowCommand(options = {}, dependencies = {}) {
  const id = normalizeString(options.id);
  if (!id) throw new Error('--id is required');
  const store = createStore(dependencies);
  const item = await store.getOntologyDlChain(id);
  if (!item) throw new Error(`ontology dl chain not found: ${id}`);
  const payload = { mode: 'ontology-dl-show', query: { id }, item: attachDlViewModel([item])[0] };
  printPayload(payload, options, 'Ontology DL Show');
  return payload;
}

async function runOntologyDlUpsertCommand(options = {}, dependencies = {}) {
  const input = normalizeString(options.input);
  if (!input) throw new Error('--input is required');
  await ensureAuthorized('ontology:dl:upsert', options, dependencies);
  const { resolved, payload } = await readInputJson(input, dependencies);
  const store = createStore(dependencies);
  const item = await store.upsertOntologyDlChain(payload);
  const result = { mode: 'ontology-dl-upsert', success: true, input_file: resolved, item: attachDlViewModel([item])[0] };
  printPayload(result, options, 'Ontology DL Upsert');
  return result;
}

async function runOntologyTriadSummaryCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const summary = await store.buildOntologyTriadSummary({ limit: normalizePositiveInteger(options.limit, 1000, 5000) });
  const payload = {
    mode: 'ontology-triad-summary',
    query: {
      space: normalizeString(options.space) || 'engineering'
    },
    summary: summary.counts,
    ontology_core: summary.ontology_core,
    ontology_core_ui: summary.ontology_core_ui,
    view_model: {
      type: 'triad-summary',
      triads: summary.ontology_core_ui.triads,
      missing: summary.ontology_core_ui.missing,
      coverage_percent: summary.ontology_core_ui.coverage_percent
    },
    mb_status: {
      status_label: summary.ontology_core_ui.ready ? 'triad 完整' : 'triad 缺项',
      attention_level: summary.ontology_core_ui.ready ? 'low' : 'high'
    }
  };
  printPayload(payload, options, 'Ontology Triad Summary');
  return payload;
}

function safeRun(handler, options = {}, context = 'ontology command') {
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

function registerOntologyCommands(program) {
  const ontology = program
    .command('ontology')
    .description('Engineering ontology data plane for MagicBall ontology mode');

  const er = ontology.command('er').description('Manage ER assets');
  er.command('list').option('--space <space>', 'Space name', 'engineering').option('--limit <n>', 'Maximum rows', '100').option('--status <status>', 'Filter by status').option('--query <text>', 'Free-text query').option('--json', 'Print machine-readable JSON output').action((options) => safeRun(runOntologyErListCommand, options, 'ontology er list'));
  er.command('show').requiredOption('--id <entity-id>', 'Entity id').option('--json', 'Print machine-readable JSON output').action((options) => safeRun(runOntologyErShowCommand, options, 'ontology er show'));
  er.command('upsert').requiredOption('--input <path>', 'ER JSON file').option('--auth-lease <lease-id>', 'Write authorization lease id').option('--auth-password <password>', 'Inline auth password if policy allows').option('--actor <actor>', 'Audit actor override').option('--json', 'Print machine-readable JSON output').action((options) => safeRun(runOntologyErUpsertCommand, options, 'ontology er upsert'));

  const br = ontology.command('br').description('Manage BR rules');
  br.command('list').option('--space <space>', 'Space name', 'engineering').option('--limit <n>', 'Maximum rows', '100').option('--status <status>', 'Filter by status').option('--query <text>', 'Free-text query').option('--json', 'Print machine-readable JSON output').action((options) => safeRun(runOntologyBrListCommand, options, 'ontology br list'));
  br.command('show').requiredOption('--id <rule-id>', 'Rule id').option('--json', 'Print machine-readable JSON output').action((options) => safeRun(runOntologyBrShowCommand, options, 'ontology br show'));
  br.command('upsert').requiredOption('--input <path>', 'BR JSON file').option('--auth-lease <lease-id>', 'Write authorization lease id').option('--auth-password <password>', 'Inline auth password if policy allows').option('--actor <actor>', 'Audit actor override').option('--json', 'Print machine-readable JSON output').action((options) => safeRun(runOntologyBrUpsertCommand, options, 'ontology br upsert'));

  const dl = ontology.command('dl').description('Manage DL chains');
  dl.command('list').option('--space <space>', 'Space name', 'engineering').option('--limit <n>', 'Maximum rows', '100').option('--status <status>', 'Filter by status').option('--query <text>', 'Free-text query').option('--json', 'Print machine-readable JSON output').action((options) => safeRun(runOntologyDlListCommand, options, 'ontology dl list'));
  dl.command('show').requiredOption('--id <chain-id>', 'Chain id').option('--json', 'Print machine-readable JSON output').action((options) => safeRun(runOntologyDlShowCommand, options, 'ontology dl show'));
  dl.command('upsert').requiredOption('--input <path>', 'DL JSON file').option('--auth-lease <lease-id>', 'Write authorization lease id').option('--auth-password <password>', 'Inline auth password if policy allows').option('--actor <actor>', 'Audit actor override').option('--json', 'Print machine-readable JSON output').action((options) => safeRun(runOntologyDlUpsertCommand, options, 'ontology dl upsert'));

  const triad = ontology.command('triad').description('Summarize ontology triad completeness');
  triad.command('summary').option('--space <space>', 'Space name', 'engineering').option('--limit <n>', 'Limit for source scans', '1000').option('--json', 'Print machine-readable JSON output').action((options) => safeRun(runOntologyTriadSummaryCommand, options, 'ontology triad summary'));
}

module.exports = {
  runOntologyErListCommand,
  runOntologyErShowCommand,
  runOntologyErUpsertCommand,
  runOntologyBrListCommand,
  runOntologyBrShowCommand,
  runOntologyBrUpsertCommand,
  runOntologyDlListCommand,
  runOntologyDlShowCommand,
  runOntologyDlUpsertCommand,
  runOntologyTriadSummaryCommand,
  registerOntologyCommands
};
