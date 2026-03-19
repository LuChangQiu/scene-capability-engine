const path = require('path');
const chalk = require('chalk');
const fs = require('fs-extra');
const { ensureWriteAuthorization } = require('../security/write-authorization');
const { getSceStateStore } = require('../state/sce-state-store');
const { listAppCollections, getAppCollection } = require('../app/collection-store');
const { buildCollectionApplyPlan } = require('../app/install-plan-service');
const { executeInstallPlan } = require('../app/install-apply-runner');
const { getCurrentDeviceProfile } = require('../device/current-device');
const { loadDeviceOverride } = require('../device/device-override-store');
const { loadAppRegistryConfig, saveAppRegistryConfig } = require('../app/registry-config');
const { syncBundleRegistry, syncServiceCatalog } = require('../app/registry-sync-service');
const { scaffoldEngineeringWorkspace } = require('../app/engineering-scaffold-service');

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

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = normalizeString(`${value || ''}`).toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
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
  if (options.silent === true) {
    return;
  }
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

function getRuntimeProjectionState(graph = {}) {
  const bundle = graph.bundle || {};
  const runtimeRelease = graph.runtime_release || {};
  const metadata = bundle.metadata && typeof bundle.metadata === 'object' ? bundle.metadata : {};
  const installation = metadata.runtime_installation && typeof metadata.runtime_installation === 'object'
    ? metadata.runtime_installation
    : {};
  const runtimeActivation = metadata.runtime_activation && typeof metadata.runtime_activation === 'object'
    ? metadata.runtime_activation
    : {};
  const serviceCatalog = metadata.service_catalog && typeof metadata.service_catalog === 'object'
    ? metadata.service_catalog
    : {};
  const releases = Array.isArray(serviceCatalog.releases) ? serviceCatalog.releases : [];
  const installStatus = normalizeString(installation.status) || 'not-installed';
  const installedReleaseId = installStatus === 'installed'
    ? (normalizeString(installation.release_id) || null)
    : null;
  const activeReleaseId = normalizeString(
    bundle.runtime_release_id
    || runtimeRelease.release_id
    || runtimeActivation.active_release_id
  ) || null;

  return {
    metadata,
    installation,
    runtimeActivation,
    serviceCatalog,
    releases,
    installStatus,
    installedReleaseId,
    activeReleaseId
  };
}

function buildRuntimeReleaseItems(graph = {}) {
  const state = getRuntimeProjectionState(graph);
  return state.releases.map((item) => {
    const releaseId = normalizeString(item && item.release_id) || null;
    const installed = Boolean(releaseId && state.installedReleaseId && releaseId === state.installedReleaseId);
    const active = Boolean(releaseId && state.activeReleaseId && releaseId === state.activeReleaseId);
    const availableActions = [];

    if (!installed) {
      availableActions.push('install');
    }
    if (!active) {
      availableActions.push('activate');
    }
    if (installed && !active) {
      availableActions.push('uninstall');
    }

    return {
      ...item,
      installed,
      active,
      installation_status: installed ? state.installStatus : 'not-installed',
      can_install: !installed,
      can_activate: !active,
      can_uninstall: installed && !active,
      available_actions: availableActions
    };
  });
}

function buildRuntimeSummary(graph = {}) {
  const bundle = graph.bundle || {};
  const runtimeRelease = graph.runtime_release || {};
  const state = getRuntimeProjectionState(graph);
  return {
    app_id: bundle.app_id || null,
    app_name: bundle.app_name || null,
    runtime_release_id: bundle.runtime_release_id || runtimeRelease.release_id || null,
    runtime_version: runtimeRelease.runtime_version || null,
    release_status: runtimeRelease.release_status || null,
    runtime_status: runtimeRelease.runtime_status || null,
    install_status: state.installStatus,
    install_root: state.installation.install_root || null,
    release_count: state.releases.length,
    installed_release_id: state.installedReleaseId,
    active_release_id: state.activeReleaseId
  };
}

function buildAppInstallStateItem(bundle = {}, currentDevice = null) {
  const state = getRuntimeProjectionState({ bundle });
  const installation = state.installation && typeof state.installation === 'object'
    ? state.installation
    : {};
  const installationMachineId = normalizeString(installation.machine_id) || null;
  let machineScope = 'unspecified';

  if (installationMachineId && currentDevice && currentDevice.device_id) {
    machineScope = installationMachineId === currentDevice.device_id ? 'current-device' : 'other-device';
  }

  return {
    app_id: bundle.app_id || null,
    app_key: bundle.app_key || null,
    app_name: bundle.app_name || null,
    environment: bundle.environment || null,
    bundle_status: bundle.status || null,
    install_status: state.installStatus,
    installed_release_id: state.installedReleaseId,
    active_release_id: state.activeReleaseId,
    install_root: installation.install_root || null,
    machine_id: installationMachineId,
    device_hostname: normalizeString(installation.hostname) || null,
    machine_scope: machineScope,
    release_count: state.releases.length,
    status: state.installStatus
  };
}

const ENGINEERING_PREVIEW_REASON_CODES = Object.freeze({
  SOURCE_MISSING: 'engineering.source_missing',
  PROJECTION_MISSING: 'engineering.projection_missing',
  WORKSPACE_UNAVAILABLE: 'engineering.workspace_unavailable',
  HYDRATE_REQUIRED: 'engineering.hydrate_required',
  ACTIVATE_REQUIRED: 'engineering.activate_required',
  UPSTREAM_CONTRACT_MISSING: 'engineering.upstream_contract_missing'
});

function buildEngineeringReadinessReasonCodes(graph = {}) {
  const bundle = graph.bundle || {};
  const engineeringProject = graph.engineering_project || {};
  const metadata = engineeringProject.metadata && typeof engineeringProject.metadata === 'object'
    ? engineeringProject.metadata
    : {};
  const attached = Boolean(
    engineeringProject.engineering_project_id
    || engineeringProject.repo_url
    || engineeringProject.project_key
    || engineeringProject.project_name
  );
  const sourceKnown = Boolean(normalizeString(engineeringProject.repo_url));
  const workspacePath = normalizeString(engineeringProject.workspace_path) || null;
  const hydrated = Boolean(metadata.hydration && metadata.hydration.status === 'ready');
  const active = Boolean(metadata.activation && metadata.activation.active === true);
  const reasonCodes = [];

  if (!attached || !sourceKnown) {
    reasonCodes.push(ENGINEERING_PREVIEW_REASON_CODES.SOURCE_MISSING);
  }
  if (!workspacePath) {
    reasonCodes.push(ENGINEERING_PREVIEW_REASON_CODES.PROJECTION_MISSING);
    reasonCodes.push(ENGINEERING_PREVIEW_REASON_CODES.WORKSPACE_UNAVAILABLE);
  } else if (!hydrated) {
    reasonCodes.push(ENGINEERING_PREVIEW_REASON_CODES.HYDRATE_REQUIRED);
  } else if (!active) {
    reasonCodes.push(ENGINEERING_PREVIEW_REASON_CODES.ACTIVATE_REQUIRED);
  }

  return Array.from(new Set(reasonCodes));
}

function buildEngineeringPreviewNextActions(graph = {}) {
  const engineeringProject = graph.engineering_project || {};
  const metadata = engineeringProject.metadata && typeof engineeringProject.metadata === 'object'
    ? engineeringProject.metadata
    : {};
  const attached = Boolean(
    engineeringProject.engineering_project_id
    || engineeringProject.repo_url
    || engineeringProject.project_key
    || engineeringProject.project_name
  );
  const sourceKnown = Boolean(normalizeString(engineeringProject.repo_url));
  const workspacePath = normalizeString(engineeringProject.workspace_path) || null;
  const hydrated = Boolean(metadata.hydration && metadata.hydration.status === 'ready');
  const active = Boolean(metadata.activation && metadata.activation.active === true);
  const nextActions = [];

  if (!attached || !sourceKnown) {
    nextActions.push('attach');
  }
  if (!workspacePath || !hydrated) {
    nextActions.push('hydrate');
  }
  if (workspacePath && hydrated && !active) {
    nextActions.push('activate');
  }
  if (engineeringProject.dirty_state === true) {
    nextActions.push('review_local_changes');
  }

  return Array.from(new Set(nextActions));
}

function buildEngineeringPreviewSummary(graph = {}) {
  const bundle = graph.bundle || {};
  const engineeringProject = graph.engineering_project || {};
  const metadata = engineeringProject.metadata && typeof engineeringProject.metadata === 'object'
    ? engineeringProject.metadata
    : {};
  const attached = Boolean(
    engineeringProject.engineering_project_id
    || engineeringProject.repo_url
    || engineeringProject.project_key
    || engineeringProject.project_name
  );
  const sourceKnown = Boolean(normalizeString(engineeringProject.repo_url));
  const workspacePath = normalizeString(engineeringProject.workspace_path) || null;
  const hydrated = Boolean(metadata.hydration && metadata.hydration.status === 'ready');
  const active = Boolean(metadata.activation && metadata.activation.active === true);
  const readinessReasonCodes = buildEngineeringReadinessReasonCodes(graph);

  return {
    app_id: bundle.app_id || null,
    appKey: bundle.app_key || null,
    appName: bundle.app_name || null,
    engineeringProjectId: engineeringProject.engineering_project_id || null,
    projectName: engineeringProject.project_name || null,
    projectKey: engineeringProject.project_key || null,
    repoUrl: engineeringProject.repo_url || null,
    provider: engineeringProject.repo_provider || null,
    branch: engineeringProject.current_branch || engineeringProject.default_branch || null,
    codeVersion: engineeringProject.code_version || null,
    workspacePath,
    dirtyState: engineeringProject.dirty_state === true,
    attached,
    hydrated,
    active,
    sourceKnown,
    projectionReady: Boolean(workspacePath),
    readinessReasonCodes,
    nextActions: buildEngineeringPreviewNextActions(graph)
  };
}

function buildEngineeringSummary(graph = {}) {
  const preview = buildEngineeringPreviewSummary(graph);
  return {
    app_id: preview.app_id,
    app_name: preview.appName,
    engineering_project_id: preview.engineeringProjectId,
    project_name: preview.projectName,
    repo_url: preview.repoUrl,
    current_branch: preview.branch,
    workspace_path: preview.workspacePath,
    code_version: preview.codeVersion,
    dirty_state: preview.dirtyState,
    hydrated: preview.hydrated,
    active: preview.active,
    sourceKnown: preview.sourceKnown,
    projectionReady: preview.projectionReady,
    readinessReasonCodes: preview.readinessReasonCodes,
    nextActions: preview.nextActions
  };
}

function buildEngineeringOwnershipRelation(graph = {}, currentDevice = null) {
  const bundle = graph.bundle || {};
  const engineeringProject = graph.engineering_project || {};
  const metadata = engineeringProject.metadata && typeof engineeringProject.metadata === 'object'
    ? engineeringProject.metadata
    : {};
  const ownership = metadata.ownership && typeof metadata.ownership === 'object'
    ? metadata.ownership
    : {};
  const sharedPolicy = normalizeString(ownership.shared_policy || ownership.sharedPolicy) || null;
  const explicitOwnershipType = normalizeString(ownership.ownership_type || ownership.ownershipType).toLowerCase();
  const workspacePath = normalizeString(engineeringProject.workspace_path) || null;
  let ownershipType = 'unresolved';

  if (['local', 'shared', 'unresolved'].includes(explicitOwnershipType)) {
    ownershipType = explicitOwnershipType;
  } else if (sharedPolicy) {
    ownershipType = 'shared';
  } else if (workspacePath) {
    ownershipType = 'local';
  }

  return {
    appKey: bundle.app_key || null,
    workspaceId: normalizeString(bundle.workspace_id || ownership.workspace_id || ownership.workspaceId) || null,
    userId: normalizeString(ownership.user_id || ownership.userId) || null,
    deviceId: normalizeString(ownership.device_id || ownership.deviceId) || (ownershipType === 'local' && currentDevice ? currentDevice.device_id : null),
    ownershipType,
    sharedPolicy
  };
}

function buildEngineeringActionSteps(actionMode, graph = {}) {
  const preview = buildEngineeringPreviewSummary(graph);
  const attachReady = preview.attached && preview.sourceKnown;
  const hydrateReady = preview.projectionReady && preview.hydrated;
  const activateReady = preview.active;
  const steps = [{
    key: 'register',
    status: 'done',
    detail: 'App bundle is registered in SCE.'
  }];

  if (attachReady) {
    steps.push({
      key: 'attach',
      status: 'done',
      detail: 'Engineering source metadata is attached.'
    });
  } else {
    steps.push({
      key: 'attach',
      status: 'pending',
      reasonCode: ENGINEERING_PREVIEW_REASON_CODES.SOURCE_MISSING,
      detail: 'Attach engineering source metadata before continuing.'
    });
  }

  if (!attachReady) {
    steps.push({
      key: 'hydrate',
      status: 'skipped',
      reasonCode: ENGINEERING_PREVIEW_REASON_CODES.SOURCE_MISSING,
      detail: 'Hydration is blocked until engineering source metadata is attached.'
    });
  } else if (!preview.projectionReady) {
    steps.push({
      key: 'hydrate',
      status: 'pending',
      reasonCode: ENGINEERING_PREVIEW_REASON_CODES.PROJECTION_MISSING,
      detail: 'Create or bind a local engineering workspace before hydration.'
    });
  } else if (!preview.hydrated) {
    steps.push({
      key: 'hydrate',
      status: 'pending',
      reasonCode: ENGINEERING_PREVIEW_REASON_CODES.HYDRATE_REQUIRED,
      detail: 'Engineering workspace exists but is not hydrated yet.'
    });
  } else {
    steps.push({
      key: 'hydrate',
      status: 'done',
      detail: 'Engineering workspace is hydrated.'
    });
  }

  if (actionMode === 'import' && hydrateReady && !activateReady) {
    steps.push({
      key: 'activate',
      status: 'skipped',
      detail: 'Import completes without activation in phase-1.'
    });
    return steps;
  }

  if (!attachReady) {
    steps.push({
      key: 'activate',
      status: 'skipped',
      reasonCode: ENGINEERING_PREVIEW_REASON_CODES.SOURCE_MISSING,
      detail: 'Activation is blocked until engineering source metadata is attached.'
    });
  } else if (!preview.projectionReady) {
    steps.push({
      key: 'activate',
      status: 'skipped',
      reasonCode: ENGINEERING_PREVIEW_REASON_CODES.PROJECTION_MISSING,
      detail: 'Activation is blocked until a local engineering workspace is available.'
    });
  } else if (!preview.hydrated) {
    steps.push({
      key: 'activate',
      status: 'skipped',
      reasonCode: ENGINEERING_PREVIEW_REASON_CODES.HYDRATE_REQUIRED,
      detail: 'Activation is blocked until hydration completes.'
    });
  } else if (!preview.active) {
    steps.push({
      key: 'activate',
      status: 'pending',
      reasonCode: ENGINEERING_PREVIEW_REASON_CODES.ACTIVATE_REQUIRED,
      detail: 'Engineering workspace is ready but not active.'
    });
  } else {
    steps.push({
      key: 'activate',
      status: 'done',
      detail: 'Engineering workspace is active.'
    });
  }

  return steps;
}

function buildEngineeringActionSuccess(actionMode, steps = []) {
  if (actionMode === 'import') {
    return ['register', 'attach', 'hydrate'].every((key) => steps.some((step) => step.key === key && step.status === 'done'));
  }
  return ['register', 'attach', 'hydrate', 'activate'].every((key) => steps.some((step) => step.key === key && step.status === 'done'));
}

async function runAppEngineeringActionEnvelopeCommand(actionMode, options = {}, dependencies = {}) {
  const appRef = normalizeString(options.app);
  if (!appRef) {
    throw new Error('--app is required');
  }
  const { graph } = await requireAppGraph(appRef, dependencies);
  const preview = buildEngineeringPreviewSummary(graph);
  const steps = buildEngineeringActionSteps(actionMode, graph);
  const payload = {
    mode: actionMode,
    generated_at: new Date().toISOString(),
    query: {
      app: appRef
    },
    success: buildEngineeringActionSuccess(actionMode, steps),
    summary: preview,
    preview,
    steps,
    bundle: graph.bundle,
    engineering_project: graph.engineering_project,
    scene_bindings: graph.scene_bindings || []
  };
  printPayload(payload, options, `App Engineering ${actionMode === 'open' ? 'Open' : 'Import'}`);
  return payload;
}

function deriveEngineeringProjectId(bundle = {}) {
  const appKey = normalizeString(bundle.app_key);
  if (appKey) {
    return `eng.${appKey.replace(/[^a-zA-Z0-9._-]+/g, '-')}`;
  }
  const appId = normalizeString(bundle.app_id).replace(/^app\./, '');
  return appId ? `eng.${appId.replace(/[^a-zA-Z0-9._-]+/g, '-')}` : null;
}

function graphToRegisterPayload(graph = {}) {
  const bundle = graph.bundle || {};
  const runtimeRelease = graph.runtime_release || {};
  const ontologyBundle = graph.ontology_bundle || {};
  const engineeringProject = graph.engineering_project || {};
  return {
    app_id: bundle.app_id,
    app_key: bundle.app_key,
    app_name: bundle.app_name,
    app_slug: bundle.app_slug || undefined,
    workspace_id: bundle.workspace_id || undefined,
    runtime_release_id: bundle.runtime_release_id || undefined,
    ontology_bundle_id: bundle.ontology_bundle_id || undefined,
    engineering_project_id: bundle.engineering_project_id || undefined,
    default_scene_id: bundle.default_scene_id || undefined,
    environment: bundle.environment || undefined,
    status: bundle.status || undefined,
    source_origin: bundle.source_origin || undefined,
    tags: Array.isArray(bundle.tags) ? bundle.tags : [],
    metadata: bundle.metadata && typeof bundle.metadata === 'object' ? bundle.metadata : {},
    runtime: runtimeRelease && runtimeRelease.release_id ? {
      release_id: runtimeRelease.release_id,
      runtime_version: runtimeRelease.runtime_version,
      release_channel: runtimeRelease.release_channel,
      release_status: runtimeRelease.release_status,
      entrypoint: runtimeRelease.entrypoint,
      runtime_status: runtimeRelease.runtime_status,
      release_notes_file: runtimeRelease.release_notes_file,
      release_evidence_file: runtimeRelease.release_evidence_file,
      published_at: runtimeRelease.published_at,
      source_updated_at: runtimeRelease.source_updated_at,
      metadata: runtimeRelease.metadata || {}
    } : undefined,
    ontology: ontologyBundle && ontologyBundle.ontology_bundle_id ? {
      ontology_bundle_id: ontologyBundle.ontology_bundle_id,
      ontology_version: ontologyBundle.ontology_version,
      template_version: ontologyBundle.template_version,
      capability_catalog_version: ontologyBundle.capability_catalog_version,
      triad_revision: ontologyBundle.triad_revision,
      triad_status: ontologyBundle.triad_status,
      publish_readiness: ontologyBundle.publish_readiness,
      template_source: ontologyBundle.template_source,
      capability_set: Array.isArray(ontologyBundle.capability_set) ? ontologyBundle.capability_set : [],
      summary: ontologyBundle.summary || {},
      metadata: ontologyBundle.metadata || {}
    } : undefined,
    engineering: engineeringProject && engineeringProject.engineering_project_id ? {
      engineering_project_id: engineeringProject.engineering_project_id,
      project_key: engineeringProject.project_key,
      project_name: engineeringProject.project_name,
      repo_url: engineeringProject.repo_url,
      repo_provider: engineeringProject.repo_provider,
      default_branch: engineeringProject.default_branch,
      current_branch: engineeringProject.current_branch,
      commit_sha: engineeringProject.commit_sha,
      workspace_path: engineeringProject.workspace_path,
      code_version: engineeringProject.code_version,
      synced_runtime_release_id: engineeringProject.synced_runtime_release_id,
      dirty_state: engineeringProject.dirty_state === true,
      auth_policy: engineeringProject.auth_policy || {},
      metadata: engineeringProject.metadata || {}
    } : undefined,
    scene_bindings: Array.isArray(graph.scene_bindings) ? graph.scene_bindings.map((item) => ({
      scene_id: item.scene_id,
      binding_role: item.binding_role,
      source: item.source,
      metadata: item.metadata || {}
    })) : []
  };
}

async function requireAppGraph(appRef, dependencies = {}) {
  const store = createStore(dependencies);
  const graph = await store.getAppBundleGraph(appRef);
  if (!graph) {
    throw new Error(`app bundle not found: ${appRef}`);
  }
  return { store, graph };
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
  const { graph } = await requireAppGraph(appRef, dependencies);
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
  await ensureAuthorized('app:bundle:register', options, dependencies);
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const env = dependencies.env || process.env;
  const resolvedInput = path.isAbsolute(inputFile)
    ? inputFile
    : path.join(projectPath, inputFile);
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

async function runAppCollectionListCommand(options = {}, dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const collections = await listAppCollections(projectPath, {
    fileSystem,
    query: options.query,
    status: options.status
  });
  const limit = normalizePositiveInteger(options.limit, 100, 1000);
  const items = collections.slice(0, limit).map((item) => ({
    collection_id: item.collection_id,
    name: item.name,
    description: item.description,
    status: item.status,
    item_count: item.item_count,
    tags: item.tags,
    source_file: item.source_file
  }));

  const payload = {
    mode: 'app-collection-list',
    generated_at: new Date().toISOString(),
    query: {
      limit,
      status: normalizeString(options.status) || null,
      query: normalizeString(options.query) || null
    },
    summary: {
      total: items.length
    },
    items,
    view_model: {
      type: 'table',
      columns: ['collection_id', 'name', 'status', 'item_count', 'source_file']
    }
  };
  printPayload(payload, options, 'App Collection List');
  return payload;
}

async function runAppCollectionShowCommand(options = {}, dependencies = {}) {
  const collectionRef = normalizeString(options.collection);
  if (!collectionRef) {
    throw new Error('--collection is required');
  }
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const collection = await getAppCollection(projectPath, collectionRef, {
    fileSystem
  });
  if (!collection) {
    throw new Error(`app collection not found: ${collectionRef}`);
  }

  const payload = {
    mode: 'app-collection-show',
    generated_at: new Date().toISOString(),
    query: {
      collection: collectionRef
    },
    summary: {
      collection_id: collection.collection_id,
      name: collection.name,
      status: collection.status,
      item_count: collection.item_count
    },
    collection
  };
  printPayload(payload, options, 'App Collection Show');
  return payload;
}

async function runAppCollectionApplyCommand(options = {}, dependencies = {}) {
  const collectionRef = normalizeString(options.collection);
  if (!collectionRef) {
    throw new Error('--collection is required');
  }
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const store = createStore(dependencies);
  const currentDevice = await getCurrentDeviceProfile(projectPath, {
    fileSystem,
    persistIfMissing: false
  });
  const deviceOverride = await loadDeviceOverride(projectPath, { fileSystem });
  const plan = await buildCollectionApplyPlan(projectPath, {
    fileSystem,
    store,
    collectionRef,
    currentDevice,
    deviceOverride
  });
  const execution = options.execute
    ? await executeInstallPlan(plan, {
      store,
      executeInstall: runAppRuntimeInstallCommand,
      executeActivate: runAppRuntimeActivateCommand,
      executeUninstall: runAppRuntimeUninstallCommand,
      dependencies,
      commandOptions: options
    })
    : {
      execute_supported: true,
      executed: false,
      blocked_reason: null,
      results: []
    };
  const payload = {
    mode: 'app-collection-apply',
    generated_at: new Date().toISOString(),
    execute_supported: execution.execute_supported,
    executed: execution.executed,
    execution_blocked_reason: execution.blocked_reason,
    execution: {
      results: execution.results,
      preflight_failures: execution.preflight_failures || []
    },
    current_device: currentDevice,
    device_override: deviceOverride,
    summary: {
      source_type: plan.source.type,
      source_id: plan.source.id,
      desired_app_count: plan.desired_apps.length,
      install_count: plan.counts.install,
      activate_count: plan.counts.activate,
      uninstall_count: plan.counts.uninstall,
      keep_count: plan.counts.keep,
      skip_count: plan.counts.skip
    },
    plan
  };
  printPayload(payload, options, 'App Collection Apply');
  return payload;
}

async function runAppEngineeringShowCommand(options = {}, dependencies = {}) {
  const appRef = normalizeString(options.app);
  if (!appRef) {
    throw new Error('--app is required');
  }
  const { graph } = await requireAppGraph(appRef, dependencies);
  const preview = buildEngineeringPreviewSummary(graph);
  const payload = {
    mode: 'app-engineering-show',
    generated_at: new Date().toISOString(),
    query: {
      app: appRef
    },
    summary: preview,
    preview,
    bundle: graph.bundle,
    engineering_project: graph.engineering_project,
    scene_bindings: graph.scene_bindings || []
  };
  printPayload(payload, options, 'App Engineering Show');
  return payload;
}

async function runAppEngineeringPreviewCommand(options = {}, dependencies = {}) {
  const appRef = normalizeString(options.app);
  if (!appRef) {
    throw new Error('--app is required');
  }
  const { graph } = await requireAppGraph(appRef, dependencies);
  const preview = buildEngineeringPreviewSummary(graph);
  const payload = {
    mode: 'app-engineering-preview',
    generated_at: new Date().toISOString(),
    query: {
      app: appRef
    },
    summary: preview,
    preview,
    bundle: graph.bundle,
    engineering_project: graph.engineering_project,
    scene_bindings: graph.scene_bindings || []
  };
  printPayload(payload, options, 'App Engineering Preview');
  return payload;
}

async function runAppEngineeringOwnershipCommand(options = {}, dependencies = {}) {
  const appRef = normalizeString(options.app);
  if (!appRef) {
    throw new Error('--app is required');
  }
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const { graph } = await requireAppGraph(appRef, dependencies);
  const currentDevice = await getCurrentDeviceProfile(projectPath, {
    fileSystem,
    persistIfMissing: false
  });
  const ownership = buildEngineeringOwnershipRelation(graph, currentDevice);
  const payload = {
    mode: 'app-engineering-ownership',
    generated_at: new Date().toISOString(),
    query: {
      app: appRef
    },
    summary: ownership,
    ownership,
    current_device: currentDevice,
    bundle: graph.bundle,
    engineering_project: graph.engineering_project,
    scene_bindings: graph.scene_bindings || []
  };
  printPayload(payload, options, 'App Engineering Ownership');
  return payload;
}

async function runAppEngineeringOpenCommand(options = {}, dependencies = {}) {
  return runAppEngineeringActionEnvelopeCommand('open', options, dependencies);
}

async function runAppEngineeringImportCommand(options = {}, dependencies = {}) {
  return runAppEngineeringActionEnvelopeCommand('import', options, dependencies);
}

async function runAppEngineeringAttachCommand(options = {}, dependencies = {}) {
  const appRef = normalizeString(options.app);
  if (!appRef) {
    throw new Error('--app is required');
  }
  const repoUrl = normalizeString(options.repo);
  if (!repoUrl) {
    throw new Error('--repo is required');
  }
  await ensureAuthorized('app:engineering:attach', options, dependencies);
  const { store, graph } = await requireAppGraph(appRef, dependencies);
  const nextPayload = graphToRegisterPayload(graph);
  const bundle = graph.bundle || {};
  const currentEngineering = nextPayload.engineering && typeof nextPayload.engineering === 'object'
    ? nextPayload.engineering
    : {};
  const engineeringProjectId = currentEngineering.engineering_project_id || deriveEngineeringProjectId(bundle);
  const nowIso = new Date().toISOString();
  nextPayload.engineering_project_id = engineeringProjectId;
  nextPayload.engineering = {
    ...currentEngineering,
    engineering_project_id: engineeringProjectId,
    project_name: normalizeString(options.projectName) || currentEngineering.project_name || bundle.app_name || null,
    project_key: normalizeString(options.projectKey) || currentEngineering.project_key || bundle.app_key || null,
    repo_url: repoUrl,
    repo_provider: normalizeString(options.provider) || currentEngineering.repo_provider || null,
    default_branch: normalizeString(options.branch) || currentEngineering.default_branch || null,
    current_branch: normalizeString(options.branch) || currentEngineering.current_branch || null,
    workspace_path: normalizeString(options.workspacePath) || currentEngineering.workspace_path || null,
    code_version: normalizeString(options.codeVersion) || currentEngineering.code_version || null,
    dirty_state: currentEngineering.dirty_state === true,
    metadata: {
      ...(currentEngineering.metadata || {}),
      attachment: {
        attached_at: nowIso,
        source: 'sce app engineering attach',
        repo_url: repoUrl
      }
    }
  };
  const updated = await store.registerAppBundle(nextPayload);
  const payload = {
    mode: 'app-engineering-attach',
    success: true,
    summary: buildEngineeringSummary(updated),
    bundle: updated.bundle,
    engineering_project: updated.engineering_project,
    scene_bindings: updated.scene_bindings || []
  };
  printPayload(payload, options, 'App Engineering Attach');
  return payload;
}

async function runAppEngineeringHydrateCommand(options = {}, dependencies = {}) {
  const appRef = normalizeString(options.app);
  if (!appRef) {
    throw new Error('--app is required');
  }
  await ensureAuthorized('app:engineering:hydrate', options, dependencies);
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const { store, graph } = await requireAppGraph(appRef, { ...dependencies, projectPath, fileSystem });
  const bundle = graph.bundle || {};
  const nextPayload = graphToRegisterPayload(graph);
  const currentEngineering = nextPayload.engineering && typeof nextPayload.engineering === 'object'
    ? nextPayload.engineering
    : {};
  const engineeringProjectId = currentEngineering.engineering_project_id || deriveEngineeringProjectId(bundle);
  const workspacePath = normalizeString(options.workspacePath)
    || normalizeString(currentEngineering.workspace_path)
    || path.join(projectPath, '.sce', 'apps', bundle.app_key || bundle.app_id || engineeringProjectId, 'engineering');
  await fileSystem.ensureDir(workspacePath);
  const nowIso = new Date().toISOString();
  nextPayload.engineering_project_id = engineeringProjectId;
  nextPayload.engineering = {
    ...currentEngineering,
    engineering_project_id: engineeringProjectId,
    workspace_path: workspacePath,
    metadata: {
      ...(currentEngineering.metadata || {}),
      hydration: {
        status: 'ready',
        hydrated_at: nowIso,
        source: 'sce app engineering hydrate'
      }
    }
  };
  const updated = await store.registerAppBundle(nextPayload);
  const payload = {
    mode: 'app-engineering-hydrate',
    success: true,
    summary: buildEngineeringSummary(updated),
    bundle: updated.bundle,
    engineering_project: updated.engineering_project,
    hydrated_workspace_path: workspacePath
  };
  printPayload(payload, options, 'App Engineering Hydrate');
  return payload;
}

async function runAppEngineeringScaffoldCommand(options = {}, dependencies = {}) {
  const appRef = normalizeString(options.app);
  if (!appRef) {
    throw new Error('--app is required');
  }
  await ensureAuthorized('app:engineering:scaffold', options, dependencies);
  const { graph } = await requireAppGraph(appRef, dependencies);
  const engineeringProject = graph.engineering_project || {};
  const workspacePath = normalizeString(options.workspacePath) || normalizeString(engineeringProject.workspace_path);
  if (!workspacePath) {
    throw new Error('engineering workspace_path is not set; run app engineering hydrate first or pass --workspace-path');
  }

  const result = await scaffoldEngineeringWorkspace({
    workspacePath,
    overwritePolicy: options.overwritePolicy,
    fileSystem: dependencies.fileSystem || fs,
    templateRoot: dependencies.templateRoot
  });
  const payload = {
    mode: 'app-engineering-scaffold',
    generated_at: new Date().toISOString(),
    query: {
      app: appRef
    },
    success: result.failedDirectoryCount === 0 && result.failedFileCount === 0,
    summary: result,
    result,
    bundle: graph.bundle,
    engineering_project: graph.engineering_project,
    scene_bindings: graph.scene_bindings || []
  };
  printPayload(payload, options, 'App Engineering Scaffold');
  return payload;
}

async function runAppEngineeringActivateCommand(options = {}, dependencies = {}) {
  const appRef = normalizeString(options.app);
  if (!appRef) {
    throw new Error('--app is required');
  }
  await ensureAuthorized('app:engineering:activate', options, dependencies);
  const { store, graph } = await requireAppGraph(appRef, dependencies);
  const nextPayload = graphToRegisterPayload(graph);
  const bundle = graph.bundle || {};
  const currentEngineering = nextPayload.engineering && typeof nextPayload.engineering === 'object'
    ? nextPayload.engineering
    : {};
  const engineeringProjectId = currentEngineering.engineering_project_id || deriveEngineeringProjectId(bundle);
  const workspacePath = normalizeString(options.workspacePath) || normalizeString(currentEngineering.workspace_path);
  if (!workspacePath) {
    throw new Error('engineering workspace_path is not set; run app engineering attach/hydrate first or pass --workspace-path');
  }
  const nowIso = new Date().toISOString();
  nextPayload.engineering_project_id = engineeringProjectId;
  nextPayload.engineering = {
    ...currentEngineering,
    engineering_project_id: engineeringProjectId,
    workspace_path: workspacePath,
    metadata: {
      ...(currentEngineering.metadata || {}),
      activation: {
        active: true,
        activated_at: nowIso,
        source: 'sce app engineering activate'
      }
    }
  };
  const updated = await store.registerAppBundle(nextPayload);
  const payload = {
    mode: 'app-engineering-activate',
    success: true,
    summary: buildEngineeringSummary(updated),
    bundle: updated.bundle,
    engineering_project: updated.engineering_project,
    activated_workspace_path: workspacePath
  };
  printPayload(payload, options, 'App Engineering Activate');
  return payload;
}

async function runAppRegistryStatusCommand(options = {}, dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const loaded = await loadAppRegistryConfig(projectPath, fileSystem);
  const payload = {
    mode: 'app-registry-status',
    generated_at: new Date().toISOString(),
    config_path: loaded.config_path,
    config: loaded.config
  };
  printPayload(payload, options, 'App Registry Status');
  return payload;
}

async function runAppRegistryConfigureCommand(options = {}, dependencies = {}) {
  await ensureAuthorized('app:registry:configure', options, dependencies);
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const saved = await saveAppRegistryConfig({
    bundle_registry: {
      repo_url: normalizeString(options.bundleRepoUrl) || undefined,
      branch: normalizeString(options.bundleBranch) || undefined,
      index_url: normalizeString(options.bundleIndexUrl) || undefined
    },
    service_catalog: {
      repo_url: normalizeString(options.serviceRepoUrl) || undefined,
      branch: normalizeString(options.serviceBranch) || undefined,
      index_url: normalizeString(options.serviceIndexUrl) || undefined
    }
  }, projectPath, fileSystem);
  const payload = {
    mode: 'app-registry-configure',
    success: true,
    config_path: saved.config_path,
    config: saved.config
  };
  printPayload(payload, options, 'App Registry Configure');
  return payload;
}

async function runAppRegistrySyncBundlesCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const payload = await syncBundleRegistry(options, { ...dependencies, stateStore: store });
  printPayload(payload, options, 'App Registry Sync Bundles');
  return payload;
}

async function runAppRegistrySyncCatalogCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const payload = await syncServiceCatalog(options, { ...dependencies, stateStore: store });
  printPayload(payload, options, 'App Registry Sync Catalog');
  return payload;
}

async function runAppRegistrySyncAllCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const bundle = await syncBundleRegistry(options, { ...dependencies, stateStore: store });
  const catalog = await syncServiceCatalog(options, { ...dependencies, stateStore: store });
  const payload = {
    mode: 'app-registry-sync',
    generated_at: new Date().toISOString(),
    bundle_registry: bundle,
    service_catalog: catalog,
    summary: {
      bundle_synced_count: bundle.synced_count,
      catalog_synced_count: catalog.synced_count
    }
  };
  printPayload(payload, options, 'App Registry Sync');
  return payload;
}

async function runAppRuntimeShowCommand(options = {}, dependencies = {}) {
  const appRef = normalizeString(options.app);
  if (!appRef) {
    throw new Error('--app is required');
  }
  const { graph } = await requireAppGraph(appRef, dependencies);
  const state = getRuntimeProjectionState(graph);
  const payload = {
    mode: 'app-runtime-show',
    generated_at: new Date().toISOString(),
    query: {
      app: appRef
    },
    summary: buildRuntimeSummary(graph),
    bundle: graph.bundle,
    runtime_release: graph.runtime_release,
    runtime_installation: Object.keys(state.installation).length > 0 ? state.installation : null,
    runtime_activation: Object.keys(state.runtimeActivation).length > 0 ? state.runtimeActivation : null,
    service_catalog: {
      default_release_id: state.serviceCatalog.default_release_id || null,
      release_count: state.releases.length,
      source: state.serviceCatalog.source || null
    },
    releases: buildRuntimeReleaseItems(graph)
  };
  printPayload(payload, options, 'App Runtime Show');
  return payload;
}

async function runAppRuntimeReleasesCommand(options = {}, dependencies = {}) {
  const appRef = normalizeString(options.app);
  if (!appRef) {
    throw new Error('--app is required');
  }
  const { graph } = await requireAppGraph(appRef, dependencies);
  const state = getRuntimeProjectionState(graph);
  const releases = buildRuntimeReleaseItems(graph);
  const payload = {
    mode: 'app-runtime-releases',
    generated_at: new Date().toISOString(),
    query: {
      app: appRef
    },
    summary: {
      total: releases.length,
      default_release_id: state.serviceCatalog.default_release_id || null,
      installed_release_id: state.installedReleaseId,
      active_release_id: state.activeReleaseId
    },
    items: releases,
    view_model: {
      type: 'table',
      columns: ['release_id', 'runtime_version', 'release_channel', 'release_status', 'runtime_status', 'installed', 'active', 'published_at']
    },
    mb_status: graph.runtime_release && graph.runtime_release.runtime_status ? graph.runtime_release.runtime_status : (graph.bundle && graph.bundle.status ? graph.bundle.status : 'unknown')
  };
  printPayload(payload, options, 'App Runtime Releases');
  return payload;
}

async function runAppRuntimeInstallCommand(options = {}, dependencies = {}) {
  const appRef = normalizeString(options.app);
  if (!appRef) {
    throw new Error('--app is required');
  }
  await ensureAuthorized('app:runtime:install', options, dependencies);
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const currentDevice = await getCurrentDeviceProfile(projectPath, {
    fileSystem,
    persistIfMissing: true
  });
  const { store, graph } = await requireAppGraph(appRef, dependencies);
  const nextPayload = graphToRegisterPayload(graph);
  const serviceCatalog = nextPayload.metadata && nextPayload.metadata.service_catalog && typeof nextPayload.metadata.service_catalog === 'object'
    ? nextPayload.metadata.service_catalog
    : {};
  const releases = Array.isArray(serviceCatalog.releases) ? serviceCatalog.releases : [];
  const releaseId = normalizeString(options.release) || normalizeString(serviceCatalog.default_release_id) || normalizeString(releases[0] && releases[0].release_id);
  const selectedRelease = releases.find((item) => normalizeString(item && item.release_id) == releaseId) || null;
  if (!selectedRelease) {
    throw new Error('runtime release not found; sync service catalog first or pass --release with a valid release id');
  }
  const installRoot = normalizeString(options.installRoot) || path.join(projectPath, '.sce', 'apps', nextPayload.app_key || nextPayload.app_id, 'runtime', releaseId);
  await fileSystem.ensureDir(installRoot);
  nextPayload.metadata = nextPayload.metadata || {};
  nextPayload.metadata.runtime_installation = {
    status: 'installed',
    install_root: installRoot,
    release_id: releaseId,
    machine_id: currentDevice.device_id,
    hostname: currentDevice.hostname,
    installed_at: new Date().toISOString(),
    source: 'sce app runtime install'
  };
  const updated = await store.registerAppBundle(nextPayload);
  const payload = {
    mode: 'app-runtime-install',
    success: true,
    summary: buildRuntimeSummary(updated),
    runtime_installation: updated.bundle && updated.bundle.metadata ? updated.bundle.metadata.runtime_installation : null
  };
  printPayload(payload, options, 'App Runtime Install');
  return payload;
}

async function runAppRuntimeActivateCommand(options = {}, dependencies = {}) {
  const appRef = normalizeString(options.app);
  if (!appRef) {
    throw new Error('--app is required');
  }
  await ensureAuthorized('app:runtime:activate', options, dependencies);
  const { store, graph } = await requireAppGraph(appRef, dependencies);
  const nextPayload = graphToRegisterPayload(graph);
  const serviceCatalog = nextPayload.metadata && nextPayload.metadata.service_catalog && typeof nextPayload.metadata.service_catalog === 'object'
    ? nextPayload.metadata.service_catalog
    : {};
  const releases = Array.isArray(serviceCatalog.releases) ? serviceCatalog.releases : [];
  const releaseId = normalizeString(options.release) || normalizeString(serviceCatalog.default_release_id) || normalizeString(releases[0] && releases[0].release_id);
  const selectedRelease = releases.find((item) => normalizeString(item && item.release_id) == releaseId) || null;
  if (!selectedRelease) {
    throw new Error('runtime release not found; sync service catalog first or pass --release with a valid release id');
  }
  nextPayload.runtime_release_id = releaseId;
  nextPayload.runtime = {
    release_id: releaseId,
    runtime_version: normalizeString(selectedRelease.runtime_version),
    release_channel: normalizeString(selectedRelease.release_channel) || null,
    release_status: normalizeString(selectedRelease.release_status) || 'published',
    entrypoint: normalizeString(selectedRelease.entrypoint) || null,
    runtime_status: normalizeString(selectedRelease.runtime_status) || 'ready',
    release_notes_file: normalizeString(selectedRelease.release_notes_file) || null,
    release_evidence_file: normalizeString(selectedRelease.release_evidence_file) || null,
    published_at: normalizeString(selectedRelease.published_at) || null,
    metadata: selectedRelease.metadata && typeof selectedRelease.metadata === 'object' ? selectedRelease.metadata : {}
  };
  nextPayload.metadata = nextPayload.metadata || {};
  nextPayload.metadata.runtime_activation = {
    active_release_id: releaseId,
    activated_at: new Date().toISOString(),
    source: 'sce app runtime activate'
  };
  const updated = await store.registerAppBundle(nextPayload);
  const payload = {
    mode: 'app-runtime-activate',
    success: true,
    summary: buildRuntimeSummary(updated),
    runtime_release: updated.runtime_release,
    runtime_activation: updated.bundle && updated.bundle.metadata ? updated.bundle.metadata.runtime_activation : null
  };
  printPayload(payload, options, 'App Runtime Activate');
  return payload;
}

async function runAppRuntimeUninstallCommand(options = {}, dependencies = {}) {
  const appRef = normalizeString(options.app);
  if (!appRef) {
    throw new Error('--app is required');
  }
  await ensureAuthorized('app:runtime:uninstall', options, dependencies);
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const currentDevice = await getCurrentDeviceProfile(projectPath, {
    fileSystem,
    persistIfMissing: true
  });
  const { store, graph } = await requireAppGraph(appRef, dependencies);
  const nextPayload = graphToRegisterPayload(graph);
  const state = getRuntimeProjectionState(graph);
  const installedReleaseId = state.installedReleaseId;
  const targetReleaseId = normalizeString(options.release) || installedReleaseId;

  if (!installedReleaseId) {
    throw new Error('no installed runtime release found for this app');
  }
  if (!targetReleaseId || targetReleaseId !== installedReleaseId) {
    throw new Error(`runtime release is not installed: ${targetReleaseId || '<unknown>'}`);
  }
  if (state.activeReleaseId && targetReleaseId === state.activeReleaseId) {
    throw new Error(`cannot uninstall active runtime release ${targetReleaseId}; activate another release first`);
  }

  const installRoot = normalizeString(state.installation.install_root);
  if (installRoot) {
    await fileSystem.remove(installRoot);
  }

  nextPayload.metadata = nextPayload.metadata || {};
  nextPayload.metadata.runtime_installation = {
    status: 'not-installed',
    release_id: null,
    install_root: null,
    machine_id: currentDevice.device_id,
    hostname: currentDevice.hostname,
    uninstalled_at: new Date().toISOString(),
    source: 'sce app runtime uninstall',
    previous_release_id: targetReleaseId
  };

  const updated = await store.registerAppBundle(nextPayload);
  const updatedState = getRuntimeProjectionState(updated);
  const payload = {
    mode: 'app-runtime-uninstall',
    success: true,
    summary: buildRuntimeSummary(updated),
    uninstalled_release_id: targetReleaseId,
    removed_install_root: installRoot || null,
    runtime_installation: updatedState.installation
  };
  printPayload(payload, options, 'App Runtime Uninstall');
  return payload;
}

async function runAppInstallStateListCommand(options = {}, dependencies = {}) {
  const store = createStore(dependencies);
  const currentDevice = await getCurrentDeviceProfile(dependencies.projectPath || process.cwd(), {
    fileSystem: dependencies.fileSystem || fs,
    persistIfMissing: false
  });
  const bundles = await store.listAppBundles({
    limit: normalizePositiveInteger(options.limit, 100, 1000),
    status: options.status,
    environment: options.environment,
    workspaceId: options.workspaceId,
    query: options.query
  });
  const installStatusFilter = normalizeString(options.installStatus);
  const items = (Array.isArray(bundles) ? bundles : [])
    .map((bundle) => buildAppInstallStateItem(bundle, currentDevice))
    .filter((item) => !installStatusFilter || item.install_status === installStatusFilter);

  const payload = {
    mode: 'app-install-state-list',
    generated_at: new Date().toISOString(),
    query: {
      limit: normalizePositiveInteger(options.limit, 100, 1000),
      status: normalizeString(options.status) || null,
      environment: normalizeString(options.environment) || null,
      workspace_id: normalizeString(options.workspaceId) || null,
      query: normalizeString(options.query) || null,
      install_status: installStatusFilter || null
    },
    current_device: currentDevice,
    summary: {
      total: items.length,
      installed_count: items.filter((item) => item.install_status === 'installed').length,
      not_installed_count: items.filter((item) => item.install_status !== 'installed').length,
      active_count: items.filter((item) => Boolean(item.active_release_id)).length,
      current_device_id: currentDevice.device_id
    },
    items,
    view_model: {
      type: 'table',
      columns: ['app_id', 'app_key', 'app_name', 'install_status', 'installed_release_id', 'active_release_id', 'machine_scope', 'environment']
    }
  };
  printPayload(payload, options, 'App Install State');
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

  const collection = app
    .command('collection')
    .description('Inspect file-backed app collection intent definitions');

  collection
    .command('list')
    .description('List app collection definitions from .sce/app/collections')
    .option('--limit <n>', 'Maximum rows', '100')
    .option('--status <status>', 'Filter by collection status')
    .option('--query <text>', 'Free-text query against id/name/description/tags')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppCollectionListCommand, options, 'app collection list'));

  collection
    .command('show')
    .description('Show one app collection definition')
    .requiredOption('--collection <id>', 'Collection id or file basename')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppCollectionShowCommand, options, 'app collection show'));

  collection
    .command('apply')
    .description('Build a plan-first apply diff for one app collection')
    .requiredOption('--collection <id>', 'Collection id or file basename')
    .option('--execute', 'Reserved for future explicit execution; currently returns a blocked plan')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppCollectionApplyCommand, options, 'app collection apply'));

  const registry = app
    .command('registry')
    .description('Manage remote app bundle and service catalog registry configuration');

  registry
    .command('status')
    .description('Show current registry configuration')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppRegistryStatusCommand, options, 'app registry status'));

  registry
    .command('configure')
    .description('Configure bundle registry and service catalog sources')
    .option('--bundle-repo-url <url>', 'Bundle registry repository URL')
    .option('--bundle-branch <branch>', 'Bundle registry branch')
    .option('--bundle-index-url <url>', 'Bundle registry index URL')
    .option('--service-repo-url <url>', 'Service catalog repository URL')
    .option('--service-branch <branch>', 'Service catalog branch')
    .option('--service-index-url <url>', 'Service catalog index URL')
    .option('--auth-lease <lease-id>', 'Write authorization lease id')
    .option('--auth-password <password>', 'Inline auth password if policy allows')
    .option('--actor <actor>', 'Audit actor override')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppRegistryConfigureCommand, options, 'app registry configure'));

  registry
    .command('sync-bundles')
    .description('Sync remote app bundle registry into local SCE app bundle state')
    .option('--index-url <url-or-path>', 'Override bundle index URL/path')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppRegistrySyncBundlesCommand, options, 'app registry sync bundles'));

  registry
    .command('sync-catalog')
    .description('Sync remote app service catalog into local app bundle runtime metadata')
    .option('--index-url <url-or-path>', 'Override service catalog index URL/path')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppRegistrySyncCatalogCommand, options, 'app registry sync catalog'));

  registry
    .command('sync')
    .description('Sync both app bundle registry and app service catalog')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppRegistrySyncAllCommand, options, 'app registry sync'));

  const runtime = app
    .command('runtime')
    .description('Manage runtime projection for one app bundle');

  runtime
    .command('show')
    .description('Show runtime projection for one app bundle')
    .requiredOption('--app <app-id-or-key>', 'App id or app key')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppRuntimeShowCommand, options, 'app runtime show'));

  runtime
    .command('releases')
    .description('List runtime releases known for one app bundle')
    .requiredOption('--app <app-id-or-key>', 'App id or app key')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppRuntimeReleasesCommand, options, 'app runtime releases'));

  runtime
    .command('install')
    .description('Install runtime release for one app bundle')
    .requiredOption('--app <app-id-or-key>', 'App id or app key')
    .option('--release <release-id>', 'Runtime release id')
    .option('--install-root <path>', 'Install root path')
    .option('--auth-lease <lease-id>', 'Write authorization lease id')
    .option('--auth-password <password>', 'Inline auth password if policy allows')
    .option('--actor <actor>', 'Audit actor override')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppRuntimeInstallCommand, options, 'app runtime install'));

  runtime
    .command('activate')
    .description('Activate runtime release for one app bundle')
    .requiredOption('--app <app-id-or-key>', 'App id or app key')
    .option('--release <release-id>', 'Runtime release id')
    .option('--auth-lease <lease-id>', 'Write authorization lease id')
    .option('--auth-password <password>', 'Inline auth password if policy allows')
    .option('--actor <actor>', 'Audit actor override')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppRuntimeActivateCommand, options, 'app runtime activate'));

  runtime
    .command('uninstall')
    .description('Uninstall runtime release for one app bundle')
    .requiredOption('--app <app-id-or-key>', 'App id or app key')
    .option('--release <release-id>', 'Installed runtime release id')
    .option('--auth-lease <lease-id>', 'Write authorization lease id')
    .option('--auth-password <password>', 'Inline auth password if policy allows')
    .option('--actor <actor>', 'Audit actor override')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppRuntimeUninstallCommand, options, 'app runtime uninstall'));

  const installState = app
    .command('install-state')
    .description('Inspect current device install state across app bundles');

  installState
    .command('list')
    .description('List current device install state across app bundles')
    .option('--limit <n>', 'Maximum rows', '100')
    .option('--status <status>', 'Filter by app bundle status')
    .option('--environment <env>', 'Filter by environment')
    .option('--workspace-id <id>', 'Filter by workspace id')
    .option('--query <text>', 'Free-text query against id/key/name')
    .option('--install-status <status>', 'Filter by install status')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppInstallStateListCommand, options, 'app install-state list'));

  const engineering = app
    .command('engineering')
    .description('Manage engineering project projection for one app bundle');

  engineering
    .command('preview')
    .description('Preview engineering readiness for one app bundle')
    .requiredOption('--app <app-id-or-key>', 'App id or app key')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppEngineeringPreviewCommand, options, 'app engineering preview'));

  engineering
    .command('ownership')
    .description('Show the read-only engineering ownership relation for one app bundle')
    .requiredOption('--app <app-id-or-key>', 'App id or app key')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppEngineeringOwnershipCommand, options, 'app engineering ownership'));

  engineering
    .command('open')
    .description('Return the canonical engineering open result envelope')
    .requiredOption('--app <app-id-or-key>', 'App id or app key')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppEngineeringOpenCommand, options, 'app engineering open'));

  engineering
    .command('import')
    .description('Return the canonical engineering import result envelope')
    .requiredOption('--app <app-id-or-key>', 'App id or app key')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppEngineeringImportCommand, options, 'app engineering import'));

  engineering
    .command('show')
    .description('Show engineering projection for one app bundle (compatibility alias of preview)')
    .requiredOption('--app <app-id-or-key>', 'App id or app key')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppEngineeringShowCommand, options, 'app engineering show'));

  engineering
    .command('attach')
    .description('Attach engineering project metadata to one app bundle')
    .requiredOption('--app <app-id-or-key>', 'App id or app key')
    .requiredOption('--repo <repo-url>', 'Repository url')
    .option('--provider <provider>', 'Repository provider')
    .option('--branch <branch>', 'Default/current branch')
    .option('--workspace-path <path>', 'Workspace path to bind')
    .option('--project-name <name>', 'Project display name override')
    .option('--project-key <key>', 'Project key override')
    .option('--code-version <version>', 'Code version summary')
    .option('--auth-lease <lease-id>', 'Write authorization lease id')
    .option('--auth-password <password>', 'Inline auth password if policy allows')
    .option('--actor <actor>', 'Audit actor override')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppEngineeringAttachCommand, options, 'app engineering attach'));

  engineering
    .command('hydrate')
    .description('Prepare local engineering workspace for one app bundle')
    .requiredOption('--app <app-id-or-key>', 'App id or app key')
    .option('--workspace-path <path>', 'Explicit workspace path')
    .option('--auth-lease <lease-id>', 'Write authorization lease id')
    .option('--auth-password <password>', 'Inline auth password if policy allows')
    .option('--actor <actor>', 'Audit actor override')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppEngineeringHydrateCommand, options, 'app engineering hydrate'));

  engineering
    .command('scaffold')
    .description('Scaffold SCE baseline files into the engineering workspace')
    .requiredOption('--app <app-id-or-key>', 'App id or app key')
    .option('--workspace-path <path>', 'Override workspace path for scaffold')
    .option('--overwrite-policy <policy>', 'Overwrite policy: never, missing-only, explicit', 'missing-only')
    .option('--auth-lease <lease-id>', 'Write authorization lease id')
    .option('--auth-password <password>', 'Inline auth password if policy allows')
    .option('--actor <actor>', 'Audit actor override')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppEngineeringScaffoldCommand, options, 'app engineering scaffold'));

  engineering
    .command('activate')
    .description('Activate engineering workspace for one app bundle')
    .requiredOption('--app <app-id-or-key>', 'App id or app key')
    .option('--workspace-path <path>', 'Override workspace path for activation')
    .option('--auth-lease <lease-id>', 'Write authorization lease id')
    .option('--auth-password <password>', 'Inline auth password if policy allows')
    .option('--actor <actor>', 'Audit actor override')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runAppEngineeringActivateCommand, options, 'app engineering activate'));
}

module.exports = {
  runAppBundleListCommand,
  runAppBundleShowCommand,
  runAppBundleRegisterCommand,
  runAppCollectionListCommand,
  runAppCollectionShowCommand,
  runAppCollectionApplyCommand,
  runAppRegistryStatusCommand,
  runAppRegistryConfigureCommand,
  runAppRegistrySyncBundlesCommand,
  runAppRegistrySyncCatalogCommand,
  runAppRegistrySyncAllCommand,
  runAppRuntimeShowCommand,
  runAppRuntimeReleasesCommand,
  runAppRuntimeInstallCommand,
  runAppRuntimeActivateCommand,
  runAppRuntimeUninstallCommand,
  runAppInstallStateListCommand,
  runAppEngineeringPreviewCommand,
  runAppEngineeringOwnershipCommand,
  runAppEngineeringOpenCommand,
  runAppEngineeringImportCommand,
  runAppEngineeringShowCommand,
  runAppEngineeringAttachCommand,
  runAppEngineeringHydrateCommand,
  runAppEngineeringScaffoldCommand,
  runAppEngineeringActivateCommand,
  registerAppCommands
};
