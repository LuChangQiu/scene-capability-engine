const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');
const WorkspaceStateManager = require('../workspace/multi/workspace-state-manager');
const { SessionStore } = require('../runtime/session-store');
const { getCurrentDeviceProfile } = require('../device/current-device');

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizePath(value) {
  return normalizeString(value).replace(/\\/g, '/');
}

function buildWorkspaceProjectId(workspaceId) {
  return `workspace:${workspaceId}`;
}

function buildLocalProjectId(projectRoot) {
  const hash = crypto
    .createHash('sha1')
    .update(normalizePath(projectRoot))
    .digest('hex')
    .slice(0, 12);
  return `local:${hash}`;
}

function safeIsoAt(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function collectRecordActivityTimestamps(sceneRecords = []) {
  const timestamps = [];
  for (const record of sceneRecords) {
    const updatedAt = safeIsoAt(record && record.updated_at);
    if (updatedAt) {
      timestamps.push(updatedAt);
    }
    const cycles = Array.isArray(record && record.cycles) ? record.cycles : [];
    for (const cycle of cycles) {
      const startedAt = safeIsoAt(cycle && cycle.started_at);
      const completedAt = safeIsoAt(cycle && cycle.completed_at);
      if (startedAt) {
        timestamps.push(startedAt);
      }
      if (completedAt) {
        timestamps.push(completedAt);
      }
    }
  }
  timestamps.sort((left, right) => right.localeCompare(left));
  return timestamps[0] || null;
}

async function isValidSceProjectRoot(projectRoot, fileSystem = fs) {
  const sceRoot = path.join(projectRoot, '.sce');
  if (!await fileSystem.pathExists(sceRoot)) {
    return false;
  }
  try {
    const stats = await fileSystem.stat(sceRoot);
    return stats.isDirectory();
  } catch (_error) {
    return false;
  }
}

async function countSpecDirectories(projectRoot, fileSystem = fs) {
  const specsRoot = path.join(projectRoot, '.sce', 'specs');
  if (!await fileSystem.pathExists(specsRoot)) {
    return 0;
  }
  const entries = await fileSystem.readdir(specsRoot);
  let count = 0;
  for (const entry of entries) {
    try {
      const stats = await fileSystem.stat(path.join(specsRoot, entry));
      if (stats.isDirectory()) {
        count += 1;
      }
    } catch (_error) {
      // Ignore unreadable spec directories and keep reporting partial state elsewhere.
    }
  }
  return count;
}

function deriveAvailability({ accessible, partial }) {
  if (!accessible) {
    return 'inaccessible';
  }
  if (partial) {
    return 'degraded';
  }
  return 'accessible';
}

function deriveReadiness({ accessible, partial, sceneCount, specCount }) {
  if (!accessible) {
    return 'unknown';
  }
  if (partial) {
    return 'partial';
  }
  if (sceneCount === 0 && specCount === 0) {
    return 'pending';
  }
  return 'ready';
}

function deriveStatus({ accessible, isCurrentProject, activeSessionCount }) {
  if (!accessible) {
    return 'inaccessible';
  }
  if (isCurrentProject) {
    return 'active';
  }
  if (activeSessionCount > 0) {
    return 'background';
  }
  return 'idle';
}

async function readSceneRecords(projectRoot, dependencies = {}) {
  const fileSystem = dependencies.fileSystem || fs;
  const env = dependencies.env || process.env;
  const sqliteModule = dependencies.sqliteModule;
  const sessionStore = new SessionStore(projectRoot, null, {
    fileSystem,
    env,
    sqliteModule
  });
  return sessionStore.listSceneRecords();
}

async function buildRegisteredWorkspaceRecord(workspace, context = {}, dependencies = {}) {
  const fileSystem = dependencies.fileSystem || fs;
  const workspaceId = normalizeString(workspace && workspace.name);
  const projectRoot = normalizePath(workspace && workspace.path);
  const partialReasons = [];
  const projectId = buildWorkspaceProjectId(workspaceId);
  let accessible = false;
  let partial = false;
  let sceneRecords = [];
  let specCount = 0;

  const sceProject = await isValidSceProjectRoot(projectRoot, fileSystem);
  if (!sceProject) {
    partial = true;
    partialReasons.push('workspace_root_unavailable');
  } else {
    accessible = true;
    try {
      sceneRecords = await readSceneRecords(projectRoot, dependencies);
    } catch (_error) {
      partial = true;
      partialReasons.push('scene_records_unavailable');
    }
    try {
      specCount = await countSpecDirectories(projectRoot, fileSystem);
    } catch (_error) {
      partial = true;
      partialReasons.push('spec_inventory_unavailable');
    }
  }

  const sceneCount = Array.isArray(sceneRecords) ? sceneRecords.length : 0;
  const activeSessionCount = Array.isArray(sceneRecords)
    ? sceneRecords.filter((record) => normalizeString(record && record.active_session_id)).length
    : 0;
  const lastActivityAt = collectRecordActivityTimestamps(sceneRecords);
  const uniquePartialReasons = Array.from(new Set(partialReasons));
  const isCurrentProject = context.projectId === projectId;

  return {
    projectId,
    workspaceId,
    projectRoot,
    projectName: path.basename(projectRoot) || workspaceId,
    provenance: 'registered',
    readiness: deriveReadiness({
      accessible,
      partial,
      sceneCount,
      specCount
    }),
    status: deriveStatus({
      accessible,
      isCurrentProject,
      activeSessionCount
    }),
    availability: deriveAvailability({
      accessible,
      partial
    }),
    activeSessionCount,
    ...(lastActivityAt ? { lastActivityAt } : {}),
    summary: {
      sceneCount,
      specCount
    },
    partial,
    partialReasons: uniquePartialReasons
  };
}

async function buildLocalProjectRecord(projectRoot, context = {}, dependencies = {}) {
  const fileSystem = dependencies.fileSystem || fs;
  const normalizedRoot = normalizePath(projectRoot);
  const projectId = buildLocalProjectId(normalizedRoot);
  let sceneRecords = [];
  let specCount = 0;
  const partialReasons = ['unregistered_project'];
  let partial = true;

  try {
    sceneRecords = await readSceneRecords(normalizedRoot, dependencies);
  } catch (_error) {
    partialReasons.push('scene_records_unavailable');
  }
  try {
    specCount = await countSpecDirectories(normalizedRoot, fileSystem);
  } catch (_error) {
    partialReasons.push('spec_inventory_unavailable');
  }

  const sceneCount = Array.isArray(sceneRecords) ? sceneRecords.length : 0;
  const activeSessionCount = Array.isArray(sceneRecords)
    ? sceneRecords.filter((record) => normalizeString(record && record.active_session_id)).length
    : 0;
  const lastActivityAt = collectRecordActivityTimestamps(sceneRecords);
  const uniquePartialReasons = Array.from(new Set(partialReasons));
  const isCurrentProject = context.projectId === projectId;

  return {
    projectId,
    projectRoot: normalizedRoot,
    projectName: path.basename(normalizedRoot) || 'local-project',
    provenance: 'discovered',
    readiness: deriveReadiness({
      accessible: true,
      partial,
      sceneCount,
      specCount
    }),
    status: deriveStatus({
      accessible: true,
      isCurrentProject,
      activeSessionCount
    }),
    availability: deriveAvailability({
      accessible: true,
      partial
    }),
    activeSessionCount,
    ...(lastActivityAt ? { lastActivityAt } : {}),
    summary: {
      sceneCount,
      specCount
    },
    partial,
    partialReasons: uniquePartialReasons
  };
}

async function resolveCurrentProjectContext(options = {}, dependencies = {}) {
  const stateManager = dependencies.stateManager || new WorkspaceStateManager(dependencies.workspaceStatePath);
  const currentDir = normalizePath(dependencies.projectPath || process.cwd());
  const explicitWorkspace = normalizeString(options.workspace);

  if (explicitWorkspace) {
    const workspace = await stateManager.getWorkspace(explicitWorkspace);
    if (!workspace) {
      throw new Error(`workspace not found: ${explicitWorkspace}`);
    }
    return {
      workspaceId: workspace.name,
      projectId: buildWorkspaceProjectId(workspace.name),
      projectRoot: normalizePath(workspace.path),
      source: 'explicit-workspace'
    };
  }

  const matchedWorkspace = await stateManager.findWorkspaceByPath(currentDir);
  if (matchedWorkspace) {
    return {
      workspaceId: matchedWorkspace.name,
      projectId: buildWorkspaceProjectId(matchedWorkspace.name),
      projectRoot: normalizePath(matchedWorkspace.path),
      source: 'current-directory'
    };
  }

  const activeWorkspace = await stateManager.getActiveWorkspace();
  if (activeWorkspace) {
    return {
      workspaceId: activeWorkspace.name,
      projectId: buildWorkspaceProjectId(activeWorkspace.name),
      projectRoot: normalizePath(activeWorkspace.path),
      source: 'active-workspace'
    };
  }

  if (await isValidSceProjectRoot(currentDir, dependencies.fileSystem || fs)) {
    return {
      workspaceId: null,
      projectId: buildLocalProjectId(currentDir),
      projectRoot: currentDir,
      source: 'local-project'
    };
  }

  return {
    workspaceId: null,
    projectId: null,
    projectRoot: null,
    source: 'none'
  };
}

async function buildProjectPortfolioProjection(options = {}, dependencies = {}) {
  const stateManager = dependencies.stateManager || new WorkspaceStateManager(dependencies.workspaceStatePath);
  const fileSystem = dependencies.fileSystem || fs;
  const currentContext = await resolveCurrentProjectContext(options, {
    ...dependencies,
    stateManager
  });
  let currentDevice = null;

  try {
    currentDevice = await getCurrentDeviceProfile(dependencies.projectPath || process.cwd(), {
      fileSystem,
      persistIfMissing: false
    });
  } catch (_error) {
    currentDevice = null;
  }

  const workspaces = await stateManager.listWorkspaces();
  const records = [];
  for (const workspace of workspaces) {
    records.push(await buildRegisteredWorkspaceRecord(workspace, currentContext, dependencies));
  }

  const localRoot = normalizeString(currentContext.projectRoot);
  const currentDirWorkspace = localRoot ? await stateManager.findWorkspaceByPath(localRoot) : null;
  const shouldAddLocalProject = currentContext.source === 'local-project'
    && localRoot
    && !currentDirWorkspace;
  if (shouldAddLocalProject) {
    records.push(await buildLocalProjectRecord(localRoot, currentContext, dependencies));
  }

  records.sort((left, right) => {
    const leftCurrent = left.projectId === currentContext.projectId ? 0 : 1;
    const rightCurrent = right.projectId === currentContext.projectId ? 0 : 1;
    if (leftCurrent !== rightCurrent) {
      return leftCurrent - rightCurrent;
    }
    return `${left.projectName || left.projectId}`.localeCompare(`${right.projectName || right.projectId}`);
  });

  return {
    generatedAt: new Date().toISOString(),
    callerContext: {
      ...(currentContext.workspaceId ? { workspaceId: currentContext.workspaceId } : {}),
      ...(currentContext.projectId ? { projectId: currentContext.projectId } : {}),
      ...(currentDevice && currentDevice.device_id ? { deviceId: currentDevice.device_id } : {})
    },
    ...(currentContext.projectId ? { activeProjectId: currentContext.projectId } : {}),
    projects: records
  };
}

module.exports = {
  buildProjectPortfolioProjection,
  buildWorkspaceProjectId,
  buildLocalProjectId,
  resolveCurrentProjectContext
};
