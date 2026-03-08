const chalk = require('chalk');
const fs = require('fs-extra');
const { getSceStateStore } = require('../state/sce-state-store');

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
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

function buildApplicationHome(graph = {}) {
  const bundle = graph.bundle || {};
  const runtimeRelease = graph.runtime_release || {};
  const sceneBindings = Array.isArray(graph.scene_bindings) ? graph.scene_bindings : [];
  return {
    mode: 'application-home',
    query: {
      app_id: bundle.app_id || null
    },
    summary: {
      app_name: bundle.app_name || null,
      runtime_version: runtimeRelease.runtime_version || null,
      environment: bundle.environment || null,
      release_status: runtimeRelease.release_status || null,
      runtime_status: runtimeRelease.runtime_status || null
    },
    relations: {
      runtime_release_id: bundle.runtime_release_id || null,
      ontology_bundle_id: bundle.ontology_bundle_id || null,
      engineering_project_id: bundle.engineering_project_id || null,
      default_scene_id: bundle.default_scene_id || null
    },
    items: [],
    view_model: {
      projection: 'application',
      app_id: bundle.app_id || null,
      app_key: bundle.app_key || null,
      app_name: bundle.app_name || null,
      entrypoint: runtimeRelease.entrypoint || null,
      current_release: runtimeRelease.release_id || null,
      current_environment: bundle.environment || runtimeRelease.current_environment || null,
      scene_binding_count: sceneBindings.length
    },
    mb_status: runtimeRelease.runtime_status || bundle.status || 'unknown'
  };
}

function buildOntologyHome(graph = {}) {
  const bundle = graph.bundle || {};
  const ontologyBundle = graph.ontology_bundle || {};
  return {
    mode: 'ontology-home',
    query: {
      app_id: bundle.app_id || null
    },
    summary: {
      app_name: bundle.app_name || null,
      ontology_version: ontologyBundle.ontology_version || null,
      template_version: ontologyBundle.template_version || null,
      triad_status: ontologyBundle.triad_status || null,
      publish_readiness: ontologyBundle.publish_readiness || null
    },
    relations: {
      ontology_bundle_id: bundle.ontology_bundle_id || null,
      engineering_project_id: bundle.engineering_project_id || null,
      runtime_release_id: bundle.runtime_release_id || null
    },
    items: [],
    view_model: {
      projection: 'ontology',
      ontology_bundle_id: ontologyBundle.ontology_bundle_id || null,
      triad_status: ontologyBundle.triad_status || null,
      template_source: ontologyBundle.template_source || null,
      capability_count: Array.isArray(ontologyBundle.capability_set) ? ontologyBundle.capability_set.length : 0,
      summary: ontologyBundle.summary || {}
    },
    mb_status: ontologyBundle.publish_readiness || ontologyBundle.triad_status || bundle.status || 'unknown'
  };
}

function buildEngineeringHome(graph = {}) {
  const bundle = graph.bundle || {};
  const engineeringProject = graph.engineering_project || {};
  const sceneBindings = Array.isArray(graph.scene_bindings) ? graph.scene_bindings : [];
  return {
    mode: 'engineering-home',
    query: {
      app_id: bundle.app_id || null
    },
    summary: {
      app_name: bundle.app_name || null,
      runtime_version: graph.runtime_release && graph.runtime_release.runtime_version ? graph.runtime_release.runtime_version : null,
      code_version: engineeringProject.code_version || null,
      current_branch: engineeringProject.current_branch || null,
      dirty_state: engineeringProject.dirty_state === true,
      scene_count: sceneBindings.length
    },
    relations: {
      engineering_project_id: bundle.engineering_project_id || null,
      ontology_bundle_id: bundle.ontology_bundle_id || null,
      runtime_release_id: bundle.runtime_release_id || null,
      default_scene_id: bundle.default_scene_id || null
    },
    items: [],
    view_model: {
      projection: 'engineering',
      primary_sections: ['source', 'timeline', 'diff', 'delivery', 'capability', 'assurance'],
      project_name: engineeringProject.project_name || bundle.app_name || null,
      repo_url: engineeringProject.repo_url || null,
      workspace_path: engineeringProject.workspace_path || null,
      default_scene_id: bundle.default_scene_id || null
    },
    mb_status: engineeringProject.dirty_state === true ? 'dirty' : (bundle.status || 'unknown')
  };
}

function printPayload(payload, options = {}, title = 'Mode Home') {
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
}

async function runModeHomeCommand(projection, options = {}, dependencies = {}) {
  const appRef = normalizeString(options.app || options.appRef);
  if (!appRef) {
    throw new Error('--app is required');
  }
  const store = createStore(dependencies);
  const graph = await store.getAppBundleGraph(appRef);
  if (!graph) {
    throw new Error(`app bundle not found: ${appRef}`);
  }
  let payload;
  if (projection === 'application') {
    payload = buildApplicationHome(graph);
  } else if (projection === 'ontology') {
    payload = buildOntologyHome(graph);
  } else {
    payload = buildEngineeringHome(graph);
  }
  printPayload(payload, options, `${projection} home`);
  return payload;
}

function safeRun(handler, options = {}, context = 'mode command') {
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

function registerModeCommands(program) {
  const mode = program
    .command('mode')
    .description('Resolve MagicBall mode projections from SCE app bundle state');

  ['application', 'ontology', 'engineering'].forEach((projection) => {
    const projectionCommand = mode
      .command(projection)
      .description(`Resolve ${projection} mode projection`);

    projectionCommand
      .command('home')
      .description(`Build ${projection} mode home projection for one app bundle`)
      .requiredOption('--app <app-id-or-key>', 'App id or app key')
      .option('--json', 'Print machine-readable JSON output')
      .action((options) => safeRun((runtimeOptions) => runModeHomeCommand(projection, runtimeOptions), options, `mode ${projection} home`));
  });
}

module.exports = {
  buildApplicationHome,
  buildOntologyHome,
  buildEngineeringHome,
  runModeHomeCommand,
  registerModeCommands
};
