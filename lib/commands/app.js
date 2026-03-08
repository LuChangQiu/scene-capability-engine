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

function normalizePositiveInteger(value, fallback = 50, max = 1000) {
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

function printPayload(payload, options = {}, title = 'App Bundle') {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.blue(title));
  if (payload.mode) {
    console.log(`  Mode: ${payload.mode}`);
  }
  if (payload.summary && typeof payload.summary === 'object') {
    for (const [key, value] of Object.entries(payload.summary)) {
      console.log(`  ${key}: ${value}`);
    }
  }
  if (Array.isArray(payload.items)) {
    payload.items.forEach((item) => {
      console.log(`  - ${item.app_id} | ${item.app_key} | ${item.app_name} | ${item.status}`);
    });
  }
}

function buildBundleSummary(graph = {}) {
  const bundle = graph.bundle || {};
  const runtimeRelease = graph.runtime_release || {};
  const ontologyBundle = graph.ontology_bundle || {};
  const engineeringProject = graph.engineering_project || {};
  const sceneBindings = Array.isArray(graph.scene_bindings) ? graph.scene_bindings : [];
  return {
    app_id: bundle.app_id || null,
    app_key: bundle.app_key || null,
    app_name: bundle.app_name || null,
    status: bundle.status || null,
    environment: bundle.environment || null,
    runtime_version: runtimeRelease.runtime_version || null,
    ontology_version: ontologyBundle.ontology_version || null,
    code_version: engineeringProject.code_version || null,
    scene_binding_count: sceneBindings.length
  };
}

async function runAppBundleListCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const items = await store.listAppBundles({
    limit: normalizePositiveInteger(options.limit, 50, 1000),
    status: options.status,
    environment: options.environment,
    workspaceId: options.workspaceId,
    query: options.query
  });
  const payload = {
    mode: 'app-bundle-list',
    generated_at: new Date().toISOString(),
    query: {
      limit: normalizePositiveInteger(options.limit, 50, 1000),
      status: normalizeString(options.status) || null,
      environment: normalizeString(options.environment) || null,
      workspace_id: normalizeString(options.workspaceId) || null,
      query: normalizeString(options.query) || null
    },
    summary: {
      total: Array.isArray(items) ? items.length : 0
    },
    items: Array.isArray(items) ? items : []
  };
  printPayload(payload, options, 'App Bundle List');
  return payload;
}

async function runAppBundleShowCommand(options = {}, dependencies = {}) {
  const appRef = normalizeString(options.app || options.appRef);
  if (!appRef) {
    throw new Error('--app is required');
  }
  const store = createStore(dependencies);
  const graph = await store.getAppBundleGraph(appRef);
  if (!graph) {
    throw new Error(`app bundle not found: ${appRef}`);
  }
  const payload = {
    mode: 'app-bundle-show',
    generated_at: new Date().toISOString(),
    query: {
      app: appRef
    },
    summary: buildBundleSummary(graph),
    bundle: graph.bundle,
    runtime_release: graph.runtime_release,
    ontology_bundle: graph.ontology_bundle,
    engineering_project: graph.engineering_project,
    scene_bindings: graph.scene_bindings || []
  };
  printPayload(payload, options, 'App Bundle Show');
  return payload;
}

async function runAppBundleRegisterCommand(options = {}, dependencies = {}) {
  const inputFile = normalizeString(options.input);
  if (!inputFile) {
    throw new Error('--input is required');
  }
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const env = dependencies.env || process.env;
  await ensureWriteAuthorization('app:bundle:register', {
    authLease: options.authLease,
    authPassword: options.authPassword,
    actor: options.actor
  }, {
    projectPath,
    fileSystem,
    env
  });
  const resolvedInput = require('path').isAbsolute(inputFile)
    ? inputFile
    : require('path').join(projectPath, inputFile);
  const payloadJson = await fileSystem.readJson(resolvedInput);
  const store = createStore({ ...dependencies, projectPath, fileSystem, env });
  const graph = await store.registerAppBundle(payloadJson);
  const payload = {
    mode: 'app-bundle-register',
    success: true,
    input_file: resolvedInput,
    summary: buildBundleSummary(graph),
    bundle: graph.bundle,
    runtime_release: graph.runtime_release,
    ontology_bundle: graph.ontology_bundle,
    engineering_project: graph.engineering_project,
    scene_bindings: graph.scene_bindings || []
  };
  printPayload(payload, options, 'App Bundle Register');
  return payload;
}

function safeRun(handler, options = {}, context = 'app command') {
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

function registerAppCommands(program) {
  const app = program
    .command('app')
    .description('Manage app bundles that bind application/ontology/engineering projections');

  const bundle = app
    .command('bundle')
    .description('Manage app bundle registry');

  bundle
    .command('list')
    .description('List app bundles')
    .option('--limit <n>', 'Maximum rows', '50')
    .option('--status <status>', 'Filter by status')
    .option('--environment <env>', 'Filter by environment')
    .option('--workspace-id <id>', 'Filter by workspace id')
    .option('--query <text>', 'Free-text query against id/key/name')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppBundleListCommand, options, 'app bundle list'));

  bundle
    .command('show')
    .description('Show one app bundle with linked runtime/ontology/engineering records')
    .requiredOption('--app <app-id-or-key>', 'App id or app key')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppBundleShowCommand, options, 'app bundle show'));

  bundle
    .command('register')
    .description('Register or update an app bundle from JSON input')
    .requiredOption('--input <path>', 'Bundle JSON input file')
    .option('--auth-lease <lease-id>', 'Write authorization lease id')
    .option('--auth-password <password>', 'Inline auth password if policy allows')
    .option('--actor <actor>', 'Audit actor override')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppBundleRegisterCommand, options, 'app bundle register'));
}

module.exports = {
  runAppBundleListCommand,
  runAppBundleShowCommand,
  runAppBundleRegisterCommand,
  registerAppCommands
};
