const chalk = require('chalk');
const fs = require('fs-extra');
const { getSceStateStore } = require('../state/sce-state-store');
const { resolveOntologySeedProfile, listOntologySeedProfiles } = require('../ontology/seed-profiles');

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

function normalizePositiveInteger(value, fallback = 5, max = 3600) {
  const parsed = Number.parseInt(`${value}`, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function isFreshProjectionCache(cacheRecord, ttlSeconds) {
  const generatedAt = cacheRecord && cacheRecord.generated_at ? Date.parse(cacheRecord.generated_at) : NaN;
  if (!Number.isFinite(generatedAt)) {
    return false;
  }
  const maxAgeMs = normalizePositiveInteger(ttlSeconds, 5, 3600) * 1000;
  return (Date.now() - generatedAt) <= maxAgeMs;
}

async function buildApplicationHome(graph = {}, dependencies = {}) {
  const bundle = graph.bundle || {};
  const runtimeRelease = graph.runtime_release || {};
  const sceneBindings = Array.isArray(graph.scene_bindings) ? graph.scene_bindings : [];
  const metadata = bundle.metadata && typeof bundle.metadata === 'object' ? bundle.metadata : {};
  const installation = metadata.runtime_installation && typeof metadata.runtime_installation === 'object'
    ? metadata.runtime_installation
    : {};
  const serviceCatalog = metadata.service_catalog && typeof metadata.service_catalog === 'object'
    ? metadata.service_catalog
    : {};
  const releases = Array.isArray(serviceCatalog.releases) ? serviceCatalog.releases : [];
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
      runtime_status: runtimeRelease.runtime_status || null,
      install_status: installation.status || 'not-installed',
      release_count: releases.length
    },
    relations: {
      runtime_release_id: bundle.runtime_release_id || null,
      ontology_bundle_id: bundle.ontology_bundle_id || null,
      engineering_project_id: bundle.engineering_project_id || null,
      default_scene_id: bundle.default_scene_id || null
    },
    items: releases,
    view_model: {
      projection: 'application',
      app_id: bundle.app_id || null,
      app_key: bundle.app_key || null,
      app_name: bundle.app_name || null,
      entrypoint: runtimeRelease.entrypoint || null,
      current_release: installation.release_id || runtimeRelease.release_id || null,
      current_environment: bundle.environment || installation.current_environment || null,
      install_root: installation.install_root || null,
      scene_binding_count: sceneBindings.length,
      release_count: releases.length
    },
    mb_status: runtimeRelease.runtime_status || installation.status || bundle.status || 'unknown'
  };
}

async function buildOntologyHome(graph = {}, dependencies = {}) {
  const bundle = graph.bundle || {};
  const ontologyBundle = graph.ontology_bundle || {};
  const store = dependencies.store;
  const triad = store
    ? await store.buildOntologyTriadSummary({ limit: 1000 })
    : {
      ontology_core: { entity_relation: [], business_rules: [], decision_strategy: [] },
      ontology_core_ui: { ready: false, coverage_percent: 0, missing: ['entity_relation', 'business_rules', 'decision_strategy'], triads: {} },
      counts: { entity_relation: 0, business_rules: 0, decision_strategy: 0 }
    };
  const recommendedSeed = resolveOntologySeedProfile(bundle.app_key || '')
    || resolveOntologySeedProfile('customer-order-demo')
    || (listOntologySeedProfiles()[0] ? { profile: listOntologySeedProfiles()[0].profile, label: listOntologySeedProfiles()[0].label } : null);
  const starterSeed = triad.ontology_core_ui.ready === true
    ? null
    : {
      recommended_profile: recommendedSeed ? recommendedSeed.profile : null,
      recommended_label: recommendedSeed ? recommendedSeed.label : null,
      recommended_command: recommendedSeed
        ? `sce ontology seed apply --profile ${recommendedSeed.profile} --json`
        : null
    };
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
      publish_readiness: ontologyBundle.publish_readiness || null,
      triad_ready: triad.ontology_core_ui.ready === true,
      triad_coverage_percent: triad.ontology_core_ui.coverage_percent
    },
    relations: {
      ontology_bundle_id: bundle.ontology_bundle_id || null,
      engineering_project_id: bundle.engineering_project_id || null,
      runtime_release_id: bundle.runtime_release_id || null
    },
    items: [],
    ontology_core: triad.ontology_core,
    ontology_core_ui: triad.ontology_core_ui,
    starter_seed: starterSeed,
    view_model: {
      projection: 'ontology',
      ontology_bundle_id: ontologyBundle.ontology_bundle_id || null,
      triad_status: ontologyBundle.triad_status || null,
      template_source: ontologyBundle.template_source || null,
      capability_count: Array.isArray(ontologyBundle.capability_set) ? ontologyBundle.capability_set.length : 0,
      summary: ontologyBundle.summary || {},
      ontology_counts: triad.counts,
      triad_summary: triad.ontology_core_ui,
      starter_seed: starterSeed
    },
    mb_status: ontologyBundle.publish_readiness || ontologyBundle.triad_status || (triad.ontology_core_ui.ready ? 'ready' : 'partial') || bundle.status || 'unknown'
  };
}

async function buildEngineeringHome(graph = {}, dependencies = {}) {
  const bundle = graph.bundle || {};
  const engineeringProject = graph.engineering_project || {};
  const sceneBindings = Array.isArray(graph.scene_bindings) ? graph.scene_bindings : [];
  const store = dependencies.store;
  const [requirements, tracking, plans, changes, issues, resources, logs, backups, switches] = store
    ? await Promise.all([
      store.listPmRequirements({ limit: 1000 }),
      store.listPmTracking({ limit: 1000 }),
      store.listPmPlans({ limit: 1000 }),
      store.listPmChanges({ limit: 1000 }),
      store.listPmIssues({ limit: 1000 }),
      store.listAssuranceResourceSnapshots({ limit: 1000 }),
      store.listAssuranceLogViews({ limit: 1000 }),
      store.listAssuranceBackupRecords({ limit: 1000 }),
      store.listAssuranceConfigSwitches({ limit: 1000 })
    ])
    : [[], [], [], [], [], [], [], [], []];
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
      scene_count: sceneBindings.length,
      requirement_count: Array.isArray(requirements) ? requirements.length : 0,
      issue_count: Array.isArray(issues) ? issues.length : 0,
      plan_count: Array.isArray(plans) ? plans.length : 0,
      assurance_resource_count: Array.isArray(resources) ? resources.length : 0
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
      default_scene_id: bundle.default_scene_id || null,
      delivery_summary: {
        requirements: Array.isArray(requirements) ? requirements.length : 0,
        tracking: Array.isArray(tracking) ? tracking.length : 0,
        plans: Array.isArray(plans) ? plans.length : 0,
        changes: Array.isArray(changes) ? changes.length : 0,
        issues: Array.isArray(issues) ? issues.length : 0
      },
      assurance_summary: {
        resources: Array.isArray(resources) ? resources.length : 0,
        logs: Array.isArray(logs) ? logs.length : 0,
        backups: Array.isArray(backups) ? backups.length : 0,
        config_switches: Array.isArray(switches) ? switches.length : 0
      }
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
  const useCache = options.cache !== false;
  const cacheTtlSeconds = normalizePositiveInteger(options.cacheTtlSeconds, 5, 3600);

  if (useCache) {
    const cached = await store.getAppBundleProjectionCache(appRef, projection);
    if (cached && isFreshProjectionCache(cached, cacheTtlSeconds)) {
      const payload = cached.payload && typeof cached.payload === 'object' ? { ...cached.payload } : {};
      payload.cache = {
        hit: true,
        generated_at: cached.generated_at,
        ttl_seconds: cacheTtlSeconds
      };
      printPayload(payload, options, `${projection} home`);
      return payload;
    }
  }

  const graph = await store.getAppBundleGraph(appRef);
  if (!graph) {
    throw new Error(`app bundle not found: ${appRef}`);
  }
  let payload;
  if (projection === 'application') {
    payload = await buildApplicationHome(graph, { store });
  } else if (projection === 'ontology') {
    payload = await buildOntologyHome(graph, { store });
  } else {
    payload = await buildEngineeringHome(graph, { store });
  }
  payload.cache = {
    hit: false,
    ttl_seconds: cacheTtlSeconds
  };
  if (useCache && graph.bundle && graph.bundle.app_id) {
    await store.saveAppBundleProjectionCache(
      graph.bundle.app_id,
      projection,
      payload,
      graph.bundle.updated_at || null
    );
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
