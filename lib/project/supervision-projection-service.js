const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');
const TaskClaimer = require('../task/task-claimer');
const { SessionStore } = require('../runtime/session-store');
const { buildProjectPortfolioProjection } = require('./portfolio-projection-service');

const SPEC_GOVERNANCE_SCENE_INDEX = path.join('.sce', 'spec-governance', 'scene-index.json');
const STUDIO_REPORT_DIR = path.join('.sce', 'reports', 'studio');
const HANDOFF_REPORT_DIR = path.join('.sce', 'reports', 'handoff-runs');

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function safeIsoAt(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function listObjectValues(value) {
  if (!value || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return Object.values(value);
}

async function readJsonIfExists(filePath, fileSystem = fs) {
  if (!await fileSystem.pathExists(filePath)) {
    return null;
  }
  try {
    return await fileSystem.readJson(filePath);
  } catch (_error) {
    return null;
  }
}

async function listJsonFiles(dirPath, fileSystem = fs) {
  if (!await fileSystem.pathExists(dirPath)) {
    return [];
  }
  const entries = await fileSystem.readdir(dirPath);
  return entries
    .filter((entry) => entry.toLowerCase().endsWith('.json'))
    .map((entry) => path.join(dirPath, entry))
    .sort((left, right) => left.localeCompare(right));
}

function collectLatestTimestamp(items = []) {
  const timestamps = items
    .map((item) => safeIsoAt(item && item.updatedAt))
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left));
  return timestamps[0] || null;
}

function createCursor(projectId, latestEventAt, itemCount) {
  const hash = crypto
    .createHash('sha1')
    .update(`${projectId}::${latestEventAt || 'none'}::${itemCount}`)
    .digest('hex')
    .slice(0, 12);
  return `${latestEventAt || 'none'}::${itemCount}::${hash}`;
}

function resolveReportSceneId(report = {}) {
  return normalizeString(report.scene_id)
    || normalizeString(report?.domain_chain?.context?.scene_id)
    || normalizeString(report?.domain_chain?.problem_contract?.scene_id);
}

function resolveReportSpecId(report = {}) {
  return normalizeString(report.spec_id)
    || normalizeString(report?.domain_chain?.spec_id);
}

function summarizeTaskCounts(tasks = []) {
  const total = tasks.length;
  const completed = tasks.filter((item) => item.status === 'completed').length;
  const inProgress = tasks.filter((item) => item.status === 'in-progress').length;
  const queued = tasks.filter((item) => item.status === 'queued').length;
  const notStarted = tasks.filter((item) => item.status === 'not-started').length;
  return {
    total,
    completed,
    inProgress,
    queued,
    notStarted,
    active: Math.max(total - completed, 0)
  };
}

async function collectSpecTaskSummary(projectRoot, fileSystem = fs, taskClaimer = new TaskClaimer()) {
  const specsRoot = path.join(projectRoot, '.sce', 'specs');
  if (!await fileSystem.pathExists(specsRoot)) {
    return {
      activeSpecCount: 0,
      activeTaskCount: 0
    };
  }

  const entries = await fileSystem.readdir(specsRoot);
  let activeSpecCount = 0;
  let activeTaskCount = 0;

  for (const entry of entries) {
    const specRoot = path.join(specsRoot, entry);
    try {
      const stats = await fileSystem.stat(specRoot);
      if (!stats.isDirectory()) {
        continue;
      }
      const tasksPath = path.join(specRoot, 'tasks.md');
      if (!await fileSystem.pathExists(tasksPath)) {
        continue;
      }
      const tasks = await taskClaimer.parseTasks(tasksPath, { preferStatusMarkers: true });
      const counts = summarizeTaskCounts(tasks);
      if (counts.active > 0) {
        activeSpecCount += 1;
        activeTaskCount += counts.active;
      }
    } catch (_error) {
      // Keep the projection resilient and skip unreadable spec entries.
    }
  }

  return {
    activeSpecCount,
    activeTaskCount
  };
}

async function buildActiveItems(projectRoot, sceneRecords = []) {
  const items = [];
  for (const record of sceneRecords) {
    const sceneId = normalizeString(record && record.scene_id);
    const sessionId = normalizeString(record && record.active_session_id);
    if (!sceneId || !sessionId) {
      continue;
    }
    const cycles = Array.isArray(record && record.cycles) ? record.cycles : [];
    const activeCycle = cycles.find((item) => normalizeString(item && item.session_id) === sessionId) || {};
    const updatedAt = safeIsoAt(activeCycle.started_at) || safeIsoAt(record.updated_at) || new Date().toISOString();
    items.push({
      id: `active:${sceneId}:${sessionId}`,
      kind: 'active',
      state: 'active',
      sceneId,
      eventId: sessionId,
      updatedAt,
      summary: `Scene ${sceneId} has active session ${sessionId}.`
    });
  }
  return items;
}

async function buildRiskItems(projectRoot, fileSystem = fs) {
  const payload = await readJsonIfExists(path.join(projectRoot, SPEC_GOVERNANCE_SCENE_INDEX), fileSystem);
  const items = [];
  for (const record of listObjectValues(payload && payload.scenes)) {
    const sceneId = normalizeString(record && record.scene_id);
    const staleSpecs = Number(record && record.stale_specs || 0);
    if (!sceneId || staleSpecs <= 0) {
      continue;
    }
    items.push({
      id: `risk:${sceneId}:stale-specs`,
      kind: 'risk',
      state: 'at-risk',
      reasonCode: 'project.stale_specs_present',
      sceneId,
      updatedAt: safeIsoAt(record && record.updated_at) || safeIsoAt(payload && payload.updated_at),
      summary: `Scene ${sceneId} has ${staleSpecs} stale spec(s).`
    });
  }
  return items;
}

async function buildHandoffItems(projectRoot, fileSystem = fs) {
  const files = await listJsonFiles(path.join(projectRoot, HANDOFF_REPORT_DIR), fileSystem);
  const items = [];
  for (const filePath of files) {
    const report = await readJsonIfExists(filePath, fileSystem);
    if (!report || typeof report !== 'object') {
      continue;
    }
    const sceneId = resolveReportSceneId(report) || null;
    const specId = resolveReportSpecId(report) || null;
    const sessionId = normalizeString(report.session_id) || path.basename(filePath, '.json');
    const updatedAt = safeIsoAt(report.generated_at || report.completed_at || report.updated_at) || new Date().toISOString();
    items.push({
      id: `handoff:${sessionId}:${specId || sceneId || 'project'}`,
      kind: 'handoff',
      state: normalizeString(report.status) || 'handoff',
      ...(sceneId ? { sceneId } : {}),
      ...(specId ? { specId } : {}),
      requestId: sessionId,
      updatedAt,
      summary: `Handoff session ${sessionId} is recorded for ${specId || sceneId || 'project scope'}.`
    });
  }
  return items;
}

async function buildBlockedItems(projectRoot, fileSystem = fs) {
  const files = await listJsonFiles(path.join(projectRoot, STUDIO_REPORT_DIR), fileSystem);
  const items = [];
  for (const filePath of files) {
    const report = await readJsonIfExists(filePath, fileSystem);
    if (!report || typeof report !== 'object' || report.passed !== false) {
      continue;
    }
    const sceneId = resolveReportSceneId(report) || null;
    const specId = resolveReportSpecId(report) || null;
    const reportId = path.basename(filePath, '.json');
    const updatedAt = safeIsoAt(report.completed_at || report.updated_at || report.started_at) || new Date().toISOString();
    items.push({
      id: `blocked:${reportId}`,
      kind: 'blocked',
      state: normalizeString(report.mode) || 'blocked',
      ...(sceneId ? { sceneId } : {}),
      ...(specId ? { specId } : {}),
      eventId: reportId,
      updatedAt,
      summary: `Studio report ${reportId} is blocked.`,
      ...(Array.isArray(report.steps) && report.steps.length > 0
        ? {
            reasonCode: normalizeString(report.steps.find((step) => /fail|error|block/i.test(normalizeString(step && step.status)))?.id) || undefined
          }
        : {})
    });
  }
  return items;
}

async function resolveVisibleProject(projectId, dependencies = {}) {
  const portfolio = await buildProjectPortfolioProjection({}, dependencies);
  const record = (portfolio.projects || []).find((item) => item.projectId === projectId) || null;
  return {
    portfolio,
    record
  };
}

async function buildProjectSupervisionProjection(options = {}, dependencies = {}) {
  const projectId = normalizeString(options.project);
  if (!projectId) {
    throw new Error('--project is required');
  }

  const fileSystem = dependencies.fileSystem || fs;
  const taskClaimer = dependencies.taskClaimer || new TaskClaimer();
  const { record } = await resolveVisibleProject(projectId, dependencies);
  if (!record) {
    throw new Error(`project not visible: ${projectId}`);
  }

  if (record.availability === 'inaccessible') {
    const generatedAt = new Date().toISOString();
    return {
      generatedAt,
      projectId,
      cursor: createCursor(projectId, generatedAt, 0),
      summary: {
        blockedCount: 0,
        handoffCount: 0,
        riskCount: 0
      },
      items: [],
      partial: true,
      partialReasons: ['project_inaccessible']
    };
  }

  const projectRoot = record.projectRoot;
  const sessionStore = new SessionStore(projectRoot, null, {
    fileSystem,
    env: dependencies.env || process.env,
    sqliteModule: dependencies.sqliteModule
  });
  const sceneRecords = await sessionStore.listSceneRecords();
  const activeItems = await buildActiveItems(projectRoot, sceneRecords);
  const riskItems = await buildRiskItems(projectRoot, fileSystem);
  const handoffItems = await buildHandoffItems(projectRoot, fileSystem);
  const blockedItems = await buildBlockedItems(projectRoot, fileSystem);
  const taskSummary = await collectSpecTaskSummary(projectRoot, fileSystem, taskClaimer);
  const items = [
    ...blockedItems,
    ...handoffItems,
    ...riskItems,
    ...activeItems
  ].sort((left, right) => `${right.updatedAt || ''}`.localeCompare(`${left.updatedAt || ''}`));
  const latestEventAt = collectLatestTimestamp(items);
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    projectId,
    cursor: createCursor(projectId, latestEventAt || generatedAt, items.length),
    summary: {
      blockedCount: blockedItems.length,
      handoffCount: handoffItems.length,
      riskCount: riskItems.length,
      activeSceneCount: activeItems.length,
      activeSpecCount: taskSummary.activeSpecCount,
      activeTaskCount: taskSummary.activeTaskCount,
      ...(latestEventAt ? { latestEventAt } : {})
    },
    items,
    partial: record.partial === true,
    partialReasons: Array.isArray(record.partialReasons) ? record.partialReasons : []
  };
}

module.exports = {
  buildProjectSupervisionProjection
};
