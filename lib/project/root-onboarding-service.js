const path = require('path');
const fs = require('fs-extra');
const WorkspaceStateManager = require('../workspace/multi/workspace-state-manager');
const SmartOrchestrator = require('../adoption/smart-orchestrator');
const { applyTakeoverBaseline } = require('../workspace/takeover-baseline');
const {
  PROJECT_CANDIDATE_REASON_CODES,
  inspectProjectCandidate
} = require('./candidate-inspection-service');
const {
  buildWorkspaceProjectId
} = require('./portfolio-projection-service');

const PROJECT_ONBOARDING_REASON_CODES = {
  MISSING_ROOT: 'project.onboarding.blocked.missing_root',
  BLOCKED_BY_CANDIDATE: 'project.onboarding.blocked.candidate_state',
  ROOT_ACCEPTED: 'project.onboarding.root_accepted',
  IMPORT_NO_ACTIVATE: 'project.onboarding.import_no_activate',
  REGISTERED: 'project.onboarding.registered',
  PUBLISHED: 'project.onboarding.published',
  ADOPTED: 'project.onboarding.adopted',
  SCAFFOLD_REUSED: 'project.onboarding.scaffold_reused',
  ADOPTION_FAILED: 'project.onboarding.adoption_failed'
};

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function buildStep(key, status, detail, reasonCode) {
  return {
    key,
    status,
    ...(reasonCode ? { reasonCode } : {}),
    ...(detail ? { detail } : {})
  };
}

function buildPublication(preview = {}, options = {}) {
  const status = normalizeString(options.status) || 'not_published';
  const publishedAt = normalizeString(options.publishedAt);
  return {
    status,
    visibleInPortfolio: options.visibleInPortfolio === true,
    rootDir: preview.rootDir || null,
    projectId: preview.projectId || null,
    workspaceId: preview.workspaceId || null,
    ...(publishedAt ? { publishedAt } : {})
  };
}

function buildWorkspaceNameCandidate(rootDir) {
  const base = path.basename(rootDir).trim().toLowerCase();
  const normalized = base.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'project';
}

async function allocateWorkspaceId(rootDir, stateManager) {
  const base = buildWorkspaceNameCandidate(rootDir);
  if (!await stateManager.hasWorkspace(base)) {
    return base;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!await stateManager.hasWorkspace(candidate)) {
      return candidate;
    }
  }

  throw new Error(`unable to allocate workspace id for root: ${rootDir}`);
}

function buildFailureEnvelope(rootInspection, steps, detail, reasonCode) {
  return {
    mode: 'import',
    generated_at: new Date().toISOString(),
    success: false,
    preview: rootInspection,
    summary: rootInspection,
    publication: buildPublication(rootInspection, {
      status: 'not_published',
      visibleInPortfolio: false
    }),
    steps,
    error: {
      reasonCode,
      detail
    }
  };
}

async function runWithSuppressedConsole(callback, enabled) {
  if (!enabled) {
    return callback();
  }

  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  try {
    return await callback();
  } finally {
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
  }
}

async function runProjectRootOnboardingImport(options = {}, dependencies = {}) {
  const fileSystem = dependencies.fileSystem || fs;
  const stateManager = dependencies.stateManager || new WorkspaceStateManager(dependencies.workspaceStatePath);
  const root = normalizeString(options.root || options.rootDir);
  if (!root) {
    throw new Error('--root is required');
  }

  const rootInspection = await inspectProjectCandidate({ root }, {
    ...dependencies,
    fileSystem,
    stateManager
  });
  const steps = [];

  if (rootInspection.kind === 'invalid') {
    steps.push(buildStep(
      'register',
      'failed',
      'Root directory cannot be onboarded.',
      PROJECT_ONBOARDING_REASON_CODES.BLOCKED_BY_CANDIDATE
    ));
    steps.push(buildStep(
      'attach',
      'failed',
      'Local root is not accessible as a project directory.',
      PROJECT_CANDIDATE_REASON_CODES.ROOT_INACCESSIBLE
    ));
    steps.push(buildStep(
      'hydrate',
      'failed',
      'Onboarding cannot continue until the root is valid.',
      PROJECT_ONBOARDING_REASON_CODES.BLOCKED_BY_CANDIDATE
    ));
    steps.push(buildStep(
      'publish',
      'skipped',
      'Canonical portfolio publication is blocked until the root is valid.',
      PROJECT_ONBOARDING_REASON_CODES.BLOCKED_BY_CANDIDATE
    ));
    steps.push(buildStep(
      'activate',
      'skipped',
      'Import does not activate invalid roots.',
      PROJECT_ONBOARDING_REASON_CODES.IMPORT_NO_ACTIVATE
    ));
    steps.push(buildStep(
      'scaffold',
      'skipped',
      'Scaffold is blocked until the root becomes valid.',
      PROJECT_ONBOARDING_REASON_CODES.BLOCKED_BY_CANDIDATE
    ));
    return buildFailureEnvelope(
      rootInspection,
      steps,
      'Root inspection reported an invalid candidate state.',
      PROJECT_ONBOARDING_REASON_CODES.BLOCKED_BY_CANDIDATE
    );
  }

  if (rootInspection.reasonCodes.includes(PROJECT_CANDIDATE_REASON_CODES.INVALID_PROJECT_METADATA)) {
    steps.push(buildStep(
      'register',
      'failed',
      'Root contains invalid SCE metadata and cannot be imported safely.',
      PROJECT_CANDIDATE_REASON_CODES.INVALID_PROJECT_METADATA
    ));
    steps.push(buildStep(
      'attach',
      'done',
      'Local root is reachable.',
      PROJECT_ONBOARDING_REASON_CODES.ROOT_ACCEPTED
    ));
    steps.push(buildStep(
      'hydrate',
      'failed',
      'Existing project metadata must be repaired before import.',
      PROJECT_CANDIDATE_REASON_CODES.INVALID_PROJECT_METADATA
    ));
    steps.push(buildStep(
      'publish',
      'skipped',
      'Canonical portfolio publication is blocked by invalid project metadata.',
      PROJECT_CANDIDATE_REASON_CODES.INVALID_PROJECT_METADATA
    ));
    steps.push(buildStep(
      'activate',
      'skipped',
      'Import does not activate blocked projects.',
      PROJECT_ONBOARDING_REASON_CODES.IMPORT_NO_ACTIVATE
    ));
    steps.push(buildStep(
      'scaffold',
      'skipped',
      'Scaffold is blocked by invalid project metadata.',
      PROJECT_CANDIDATE_REASON_CODES.INVALID_PROJECT_METADATA
    ));
    return buildFailureEnvelope(
      rootInspection,
      steps,
      'Existing project metadata is invalid.',
      PROJECT_CANDIDATE_REASON_CODES.INVALID_PROJECT_METADATA
    );
  }

  let onboardingPreview = { ...rootInspection };
  let importResult = null;
  let takeoverBaseline = null;

  if (rootInspection.kind === 'directory-candidate') {
    const orchestrator = dependencies.smartOrchestrator || new SmartOrchestrator();
    importResult = await runWithSuppressedConsole(() => orchestrator.orchestrate(rootInspection.rootDir, {
      dryRun: false,
      verbose: false,
      skipBackup: false,
      skipUpdate: false
    }), options.json === true);

    if (!importResult.success) {
      steps.push(buildStep(
        'register',
        'failed',
        'Workspace registration was not attempted because adoption failed.',
        PROJECT_ONBOARDING_REASON_CODES.ADOPTION_FAILED
      ));
      steps.push(buildStep(
        'attach',
        'done',
        'Local root is reachable.',
        PROJECT_ONBOARDING_REASON_CODES.ROOT_ACCEPTED
      ));
      steps.push(buildStep(
        'hydrate',
        'failed',
        (importResult.errors || []).join('; ') || 'Adoption failed.',
        PROJECT_ONBOARDING_REASON_CODES.ADOPTION_FAILED
      ));
      steps.push(buildStep(
        'publish',
        'skipped',
        'Canonical portfolio publication was not attempted because onboarding failed.',
        PROJECT_ONBOARDING_REASON_CODES.ADOPTION_FAILED
      ));
      steps.push(buildStep(
        'activate',
        'skipped',
        'Import does not activate failed onboarding results.',
        PROJECT_ONBOARDING_REASON_CODES.IMPORT_NO_ACTIVATE
      ));
      steps.push(buildStep(
        'scaffold',
        'failed',
        'SCE baseline could not be applied to the root directory.',
        PROJECT_ONBOARDING_REASON_CODES.ADOPTION_FAILED
      ));
      return buildFailureEnvelope(
        rootInspection,
        steps,
        (importResult.errors || []).join('; ') || 'Adoption failed.',
        PROJECT_ONBOARDING_REASON_CODES.ADOPTION_FAILED
      );
    }

    const packageJson = require('../../package.json');
    takeoverBaseline = await applyTakeoverBaseline(rootInspection.rootDir, {
      apply: true,
      writeReport: true,
      sceVersion: packageJson.version
    });
    onboardingPreview = await inspectProjectCandidate({ root: rootInspection.rootDir }, {
      ...dependencies,
      fileSystem,
      stateManager
    });
  }

  let workspaceId = rootInspection.workspaceId || null;
  if (!workspaceId) {
    workspaceId = await allocateWorkspaceId(rootInspection.rootDir, stateManager);
    await stateManager.createWorkspace(workspaceId, rootInspection.rootDir);
    onboardingPreview = {
      ...onboardingPreview,
      kind: 'workspace-backed',
      projectId: buildWorkspaceProjectId(workspaceId),
      workspaceId,
      readiness: onboardingPreview.kind === 'directory-candidate' ? 'ready' : onboardingPreview.readiness,
      availability: 'accessible',
      localCandidate: false,
      reasonCodes: Array.from(new Set([
        PROJECT_CANDIDATE_REASON_CODES.WORKSPACE_REGISTERED,
        ...onboardingPreview.reasonCodes
      ]))
    };
  }

  steps.push(buildStep(
    'register',
    'done',
    rootInspection.workspaceId
      ? 'Workspace was already registered.'
      : `Workspace registered as ${workspaceId}.`,
    rootInspection.workspaceId
      ? PROJECT_CANDIDATE_REASON_CODES.WORKSPACE_REGISTERED
      : PROJECT_ONBOARDING_REASON_CODES.REGISTERED
  ));
  steps.push(buildStep(
    'attach',
    'done',
    'Local root is accepted as the canonical onboarding source.',
    PROJECT_ONBOARDING_REASON_CODES.ROOT_ACCEPTED
  ));
  steps.push(buildStep(
    'hydrate',
    'done',
    rootInspection.kind === 'directory-candidate'
      ? 'SCE baseline and project hydration were applied to the root directory.'
      : 'Existing SCE project root is ready for portfolio import.',
    rootInspection.kind === 'directory-candidate'
      ? PROJECT_ONBOARDING_REASON_CODES.ADOPTED
      : PROJECT_CANDIDATE_REASON_CODES.SCE_PRESENT
  ));
  const publishedAt = new Date().toISOString();
  steps.push(buildStep(
    'publish',
    'done',
    `Project is visible in the canonical portfolio as ${onboardingPreview.projectId}.`,
    PROJECT_ONBOARDING_REASON_CODES.PUBLISHED
  ));
  steps.push(buildStep(
    'activate',
    'skipped',
    'Import keeps active workspace selection unchanged in phase-1.',
    PROJECT_ONBOARDING_REASON_CODES.IMPORT_NO_ACTIVATE
  ));
  steps.push(buildStep(
    'scaffold',
    rootInspection.kind === 'directory-candidate' ? 'done' : 'skipped',
    rootInspection.kind === 'directory-candidate'
      ? 'Applied SCE baseline files to the project root.'
      : 'Existing SCE baseline is reused; no scaffold rewrite was required.',
    rootInspection.kind === 'directory-candidate'
      ? PROJECT_ONBOARDING_REASON_CODES.ADOPTED
      : PROJECT_ONBOARDING_REASON_CODES.SCAFFOLD_REUSED
  ));

  return {
    mode: 'import',
    generated_at: publishedAt,
    success: true,
    preview: onboardingPreview,
    summary: onboardingPreview,
    publication: buildPublication(onboardingPreview, {
      status: 'published',
      visibleInPortfolio: true,
      publishedAt
    }),
    steps,
    result: {
      rootDir: onboardingPreview.rootDir,
      projectId: onboardingPreview.projectId || null,
      workspaceId: onboardingPreview.workspaceId || null,
      ...(importResult ? {
        adoption: {
          mode: importResult.mode || null,
          backupId: importResult.backup ? importResult.backup.id : null,
          changes: importResult.changes || { created: [], updated: [], deleted: [], preserved: [] },
          warnings: importResult.warnings || []
        }
      } : {}),
      ...(takeoverBaseline ? {
        takeoverBaseline: {
          reportFile: takeoverBaseline.report_file || null,
          summary: takeoverBaseline.summary || {}
        }
      } : {})
    }
  };
}

module.exports = {
  PROJECT_ONBOARDING_REASON_CODES,
  runProjectRootOnboardingImport
};
