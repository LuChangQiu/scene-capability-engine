const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const TaskClaimer = require('../task/task-claimer');

const SPEC_GOVERNANCE_SCENE_INDEX = path.join('.sce', 'spec-governance', 'scene-index.json');
const SESSION_GOVERNANCE_SCENE_INDEX = path.join('.sce', 'session-governance', 'scene-index.json');
const HANDOFF_REPORT_DIR = path.join('.sce', 'reports', 'handoff-runs');
const STUDIO_REPORT_DIR = path.join('.sce', 'reports', 'studio');
const SPEC_DOCUMENTS = [
  { kind: 'requirements', relativePath: 'requirements.md', title: 'Requirements' },
  { kind: 'design', relativePath: 'design.md', title: 'Design' },
  { kind: 'tasks', relativePath: 'tasks.md', title: 'Tasks' },
  { kind: 'problem-contract', relativePath: path.join('custom', 'problem-contract.json'), title: 'Problem Contract' },
  { kind: 'scene-spec', relativePath: path.join('custom', 'scene-spec.md'), title: 'Scene Spec' },
  { kind: 'problem-domain-chain', relativePath: path.join('custom', 'problem-domain-chain.json'), title: 'Problem Domain Chain' }
];

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toRelativePosix(projectRoot, absolutePath) {
  return path.relative(projectRoot, absolutePath).replace(/\\/g, '/');
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

async function statIfExists(filePath, fileSystem = fs) {
  if (!await fileSystem.pathExists(filePath)) {
    return null;
  }
  try {
    return await fileSystem.stat(filePath);
  } catch (_error) {
    return null;
  }
}

function pickSceneRecord(payload, sceneId) {
  if (!isObject(payload)) {
    return null;
  }
  const scenes = payload.scenes;
  if (Array.isArray(scenes)) {
    return scenes.find((item) => normalizeString(item && item.scene_id) === sceneId) || null;
  }
  if (isObject(scenes)) {
    if (isObject(scenes[sceneId])) {
      return scenes[sceneId];
    }
    return Object.values(scenes).find((item) => normalizeString(item && item.scene_id) === sceneId) || null;
  }
  return null;
}

async function loadSceneGovernanceRecord(projectRoot, sceneId, fileSystem = fs) {
  const payload = await readJsonIfExists(path.join(projectRoot, SPEC_GOVERNANCE_SCENE_INDEX), fileSystem);
  return pickSceneRecord(payload, sceneId);
}

async function loadSceneSessionRecord(projectRoot, sceneId, fileSystem = fs) {
  const payload = await readJsonIfExists(path.join(projectRoot, SESSION_GOVERNANCE_SCENE_INDEX), fileSystem);
  return pickSceneRecord(payload, sceneId);
}

async function listSpecDirectoryNames(projectRoot, fileSystem = fs) {
  const specsRoot = path.join(projectRoot, '.sce', 'specs');
  if (!await fileSystem.pathExists(specsRoot)) {
    return [];
  }
  const entries = await fileSystem.readdir(specsRoot);
  const results = [];
  for (const entry of entries) {
    const absolutePath = path.join(specsRoot, entry);
    try {
      const stat = await fileSystem.stat(absolutePath);
      if (stat && stat.isDirectory()) {
        results.push(entry);
      }
    } catch (_error) {
      // Ignore unreadable entries.
    }
  }
  results.sort((left, right) => left.localeCompare(right));
  return results;
}

async function readSpecDomainChain(projectRoot, specId, fileSystem = fs) {
  return readJsonIfExists(
    path.join(projectRoot, '.sce', 'specs', specId, 'custom', 'problem-domain-chain.json'),
    fileSystem
  );
}

async function resolveSceneSpecIds(projectRoot, sceneId, explicitSpecId = '', fileSystem = fs) {
  if (explicitSpecId) {
    return [explicitSpecId];
  }

  const governanceRecord = await loadSceneGovernanceRecord(projectRoot, sceneId, fileSystem);
  const governedSpecIds = toArray(governanceRecord && governanceRecord.spec_ids)
    .map((item) => normalizeString(item))
    .filter(Boolean);
  if (governedSpecIds.length > 0) {
    return governedSpecIds;
  }

  const specNames = await listSpecDirectoryNames(projectRoot, fileSystem);
  const matched = [];
  for (const specId of specNames) {
    const chain = await readSpecDomainChain(projectRoot, specId, fileSystem);
    if (normalizeString(chain && chain.scene_id) === sceneId) {
      matched.push(specId);
    }
  }
  return matched;
}

async function loadSpecContext(projectRoot, specId, sceneIdHint = '', fileSystem = fs, taskClaimer = new TaskClaimer()) {
  const specRoot = path.join(projectRoot, '.sce', 'specs', specId);
  if (!await fileSystem.pathExists(specRoot)) {
    return null;
  }

  const domainChain = await readSpecDomainChain(projectRoot, specId, fileSystem);
  const sceneId = normalizeString(domainChain && domainChain.scene_id) || sceneIdHint || null;
  const files = [];
  for (const item of SPEC_DOCUMENTS) {
    const absolutePath = path.join(specRoot, item.relativePath);
    const stat = await statIfExists(absolutePath, fileSystem);
    if (!stat) {
      continue;
    }
    files.push({
      kind: item.kind,
      title: item.title,
      absolutePath,
      relativePath: toRelativePosix(projectRoot, absolutePath),
      updatedAt: stat.mtime ? stat.mtime.toISOString() : null
    });
  }

  let tasks = [];
  const tasksPath = path.join(specRoot, 'tasks.md');
  if (await fileSystem.pathExists(tasksPath)) {
    tasks = await taskClaimer.parseTasks(tasksPath, { preferStatusMarkers: true });
  }

  const taskCounts = {
    total: tasks.length,
    completed: tasks.filter((item) => item.status === 'completed').length,
    inProgress: tasks.filter((item) => item.status === 'in-progress').length,
    queued: tasks.filter((item) => item.status === 'queued').length,
    notStarted: tasks.filter((item) => item.status === 'not-started').length,
    claimed: tasks.filter((item) => normalizeString(item.claimedBy)).length
  };
  const completionPercent = taskCounts.total > 0
    ? Math.round((taskCounts.completed / taskCounts.total) * 100)
    : 0;

  return {
    specId,
    sceneId,
    domainChain,
    files,
    taskCounts,
    completionPercent
  };
}

function buildRecordBase({
  id,
  objectType,
  provenance,
  provisional = false,
  sceneId = null,
  specId = null,
  taskRef = null,
  requestId = null,
  eventId = null
}) {
  return {
    id,
    objectType,
    provenance,
    provisional,
    bound: Boolean(sceneId || specId || taskRef || requestId || eventId),
    ...(sceneId ? { sceneId } : {}),
    ...(specId ? { specId } : {}),
    ...(taskRef ? { taskRef } : {}),
    ...(requestId ? { requestId } : {}),
    ...(eventId ? { eventId } : {})
  };
}

function deriveSpecChecklistStatus(taskCounts = {}) {
  if (taskCounts.total === 0) {
    return 'not_started';
  }
  if (taskCounts.completed === taskCounts.total) {
    return 'completed';
  }
  if (taskCounts.inProgress > 0) {
    return 'in_progress';
  }
  if (taskCounts.queued > 0) {
    return 'queued';
  }
  return 'not_started';
}

function deriveSceneOverviewStatus(sceneRecord = {}, taskCounts = {}) {
  if (Number(sceneRecord.stale_specs || 0) > 0) {
    return 'at_risk';
  }
  if ((taskCounts.total || 0) > 0 && taskCounts.completed === taskCounts.total) {
    return 'completed';
  }
  if ((taskCounts.inProgress || 0) > 0) {
    return 'in_progress';
  }
  return 'observed';
}

function buildOverviewRecords(sceneId, specContexts = [], sceneRecord = null, sessionRecord = null, verifyRecords = [], releaseRecords = []) {
  const taskTotals = specContexts.reduce((acc, item) => ({
    total: acc.total + Number(item.taskCounts.total || 0),
    completed: acc.completed + Number(item.taskCounts.completed || 0),
    inProgress: acc.inProgress + Number(item.taskCounts.inProgress || 0),
    queued: acc.queued + Number(item.taskCounts.queued || 0),
    notStarted: acc.notStarted + Number(item.taskCounts.notStarted || 0)
  }), {
    total: 0,
    completed: 0,
    inProgress: 0,
    queued: 0,
    notStarted: 0
  });

  const latestVerifyAt = verifyRecords
    .map((item) => normalizeString(item.completedAt || item.generatedAt))
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;
  const latestReleaseAt = releaseRecords
    .map((item) => normalizeString(item.completedAt || item.generatedAt))
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;

  const records = [
    {
      ...buildRecordBase({
        id: `overview:scene:${sceneId}`,
        objectType: 'overview',
        provenance: 'derived',
        sceneId
      }),
      status: deriveSceneOverviewStatus(sceneRecord || {}, taskTotals),
      summary: {
        totalSpecs: Number(sceneRecord && sceneRecord.total_specs != null ? sceneRecord.total_specs : specContexts.length),
        activeSpecs: Number(sceneRecord && sceneRecord.active_specs != null
          ? sceneRecord.active_specs
          : specContexts.filter((item) => deriveSpecChecklistStatus(item.taskCounts) !== 'completed').length),
        completedSpecs: Number(sceneRecord && sceneRecord.completed_specs != null
          ? sceneRecord.completed_specs
          : specContexts.filter((item) => deriveSpecChecklistStatus(item.taskCounts) === 'completed').length),
        staleSpecs: Number(sceneRecord && sceneRecord.stale_specs != null ? sceneRecord.stale_specs : 0),
        totalTasks: taskTotals.total,
        completedTasks: taskTotals.completed,
        inProgressTasks: taskTotals.inProgress,
        queuedTasks: taskTotals.queued,
        pendingTasks: taskTotals.notStarted,
        latestVerifyAt,
        latestReleaseAt
      },
      session: sessionRecord
        ? {
            activeSessionId: normalizeString(sessionRecord.active_session_id) || null,
            activeCycle: Number(sessionRecord.active_cycle || 0) || null,
            latestCompletedSessionId: normalizeString(sessionRecord.latest_completed_session_id) || null
          }
        : null
    }
  ];

  for (const item of specContexts) {
    records.push({
      ...buildRecordBase({
        id: `overview:spec:${item.specId}`,
        objectType: 'overview',
        provenance: 'derived',
        sceneId: item.sceneId || sceneId,
        specId: item.specId
      }),
      status: deriveSpecChecklistStatus(item.taskCounts),
      summary: {
        documentCount: item.files.length,
        totalTasks: item.taskCounts.total,
        completedTasks: item.taskCounts.completed,
        inProgressTasks: item.taskCounts.inProgress,
        queuedTasks: item.taskCounts.queued,
        pendingTasks: item.taskCounts.notStarted,
        completionPercent: item.completionPercent
      }
    });
  }

  return records;
}

function buildDocumentRecords(specContexts = []) {
  return specContexts.flatMap((item) => item.files.map((file) => ({
    ...buildRecordBase({
      id: `document:${item.specId}:${file.kind}`,
      objectType: 'document',
      provenance: 'engine',
      sceneId: item.sceneId,
      specId: item.specId
    }),
    documentType: file.kind,
    title: file.title,
    path: file.relativePath,
    updatedAt: file.updatedAt
  })));
}

function buildChecklistRecords(specContexts = []) {
  return specContexts.map((item) => ({
    ...buildRecordBase({
      id: `checklist:${item.specId}:tasks`,
      objectType: 'checklist',
      provenance: 'engine',
      sceneId: item.sceneId,
      specId: item.specId
    }),
    checklistType: 'tasks',
    status: deriveSpecChecklistStatus(item.taskCounts),
    counts: item.taskCounts,
    completionPercent: item.completionPercent
  }));
}

function resolveReportSceneId(report = {}) {
  return normalizeString(report.scene_id)
    || normalizeString(report?.domain_chain?.context?.scene_id)
    || normalizeString(report?.domain_chain?.problem_contract?.scene_id)
    || '';
}

function resolveReportSpecId(report = {}) {
  return normalizeString(report.spec_id)
    || normalizeString(report?.domain_chain?.spec_id)
    || '';
}

function extractHandoffSpecIds(report = {}) {
  const specs = toArray(report && report.handoff && report.handoff.specs);
  return Array.from(new Set(specs
    .map((item) => {
      if (typeof item === 'string') {
        return normalizeString(item);
      }
      return normalizeString(item && (item.spec_id || item.id || item.spec || item.spec_name));
    })
    .filter(Boolean)));
}

function summarizeStepStates(steps = []) {
  const failedSteps = steps
    .filter((item) => /fail|error|block/i.test(normalizeString(item && item.status)))
    .map((item) => normalizeString(item && (item.id || item.key || item.name)))
    .filter(Boolean);
  return {
    total: steps.length,
    failed: failedSteps.length,
    failedStepIds: failedSteps
  };
}

async function listJsonFiles(dirPath, fileSystem = fs) {
  if (!await fileSystem.pathExists(dirPath)) {
    return [];
  }
  const entries = await fileSystem.readdir(dirPath);
  return entries
    .filter((entry) => entry.toLowerCase().endsWith('.json'))
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => path.join(dirPath, entry));
}

async function buildHandoffRecords(projectRoot, targetSceneId, targetSpecIds = [], explicitSpecId = '', fileSystem = fs) {
  const files = await listJsonFiles(path.join(projectRoot, HANDOFF_REPORT_DIR), fileSystem);
  const targetSpecSet = new Set(targetSpecIds);
  const records = [];

  for (const filePath of files) {
    const report = await readJsonIfExists(filePath, fileSystem);
    if (!isObject(report)) {
      continue;
    }

    const reportSceneId = resolveReportSceneId(report);
    if (reportSceneId && reportSceneId !== targetSceneId) {
      continue;
    }

    const reportSpecIds = extractHandoffSpecIds(report);
    const matchedSpecIds = reportSpecIds.filter((specId) => targetSpecSet.has(specId));
    if (reportSpecIds.length > 0 && matchedSpecIds.length === 0) {
      continue;
    }
    if (explicitSpecId && reportSpecIds.length > 0 && !matchedSpecIds.includes(explicitSpecId)) {
      continue;
    }
    if (!reportSceneId && matchedSpecIds.length === 0) {
      continue;
    }

    const targets = matchedSpecIds.length > 0 ? matchedSpecIds : [null];
    for (const specId of targets) {
      records.push({
        ...buildRecordBase({
          id: `handoff:${normalizeString(report.session_id) || path.basename(filePath, '.json')}:${specId || 'scene'}`,
          objectType: 'handoff',
          provenance: 'linked-evidence',
          sceneId: reportSceneId || targetSceneId,
          specId
        }),
        sessionId: normalizeString(report.session_id) || path.basename(filePath, '.json'),
        status: normalizeString(report.status) || 'observed',
        manifestPath: normalizeString(report.manifest_path) || null,
        reportFile: toRelativePosix(projectRoot, filePath),
        generatedAt: normalizeString(report.generated_at || report.completed_at || report.updated_at) || null,
        gatePassed: report?.gates?.passed === true,
        reasons: toArray(report?.gates?.reasons).map((item) => `${item}`)
      });
    }
  }

  records.sort((left, right) => `${right.generatedAt || ''}`.localeCompare(`${left.generatedAt || ''}`));
  return records;
}

async function buildStudioEvidenceRecords(projectRoot, targetSceneId, targetSpecIds = [], explicitSpecId = '', reportPrefix = '', objectType = '', fileSystem = fs) {
  const files = await listJsonFiles(path.join(projectRoot, STUDIO_REPORT_DIR), fileSystem);
  const targetSpecSet = new Set(targetSpecIds);
  const records = [];

  for (const filePath of files) {
    const baseName = path.basename(filePath).toLowerCase();
    if (!baseName.startsWith(`${reportPrefix.toLowerCase()}-`)) {
      continue;
    }
    const report = await readJsonIfExists(filePath, fileSystem);
    if (!isObject(report)) {
      continue;
    }

    const reportSceneId = resolveReportSceneId(report);
    const reportSpecId = resolveReportSpecId(report);

    if (reportSceneId && reportSceneId !== targetSceneId) {
      continue;
    }
    if (reportSpecId && !targetSpecSet.has(reportSpecId)) {
      continue;
    }
    if (explicitSpecId && reportSpecId && reportSpecId !== explicitSpecId) {
      continue;
    }
    if (!reportSceneId && !reportSpecId) {
      continue;
    }

    const steps = toArray(report.steps);
    const stepSummary = summarizeStepStates(steps);
    const resolvedSceneId = reportSceneId || targetSceneId;
    const resolvedSpecId = reportSpecId || null;
    const recordIdSuffix = resolvedSpecId || 'scene';
    const base = buildRecordBase({
      id: `${objectType}:${path.basename(filePath, '.json')}:${recordIdSuffix}`,
      objectType,
      provenance: 'linked-evidence',
      sceneId: resolvedSceneId,
      specId: resolvedSpecId
    });

    if (objectType === 'acceptance') {
      records.push({
        ...base,
        acceptanceType: 'studio-verify',
        profile: normalizeString(report.profile) || null,
        reportFile: toRelativePosix(projectRoot, filePath),
        startedAt: normalizeString(report.started_at) || null,
        completedAt: normalizeString(report.completed_at) || null,
        passed: report.passed === true,
        status: report.passed === true ? 'accepted' : 'rejected',
        stepSummary
      });
      continue;
    }

    if (objectType === 'release') {
      records.push({
        ...base,
        releaseType: 'studio-release',
        channel: normalizeString(report.channel) || null,
        profile: normalizeString(report.profile) || null,
        releaseRef: normalizeString(report.release_ref) || null,
        reportFile: toRelativePosix(projectRoot, filePath),
        startedAt: normalizeString(report.started_at) || null,
        completedAt: normalizeString(report.completed_at) || null,
        passed: report.passed === true,
        status: report.passed === true ? 'released' : 'blocked',
        stepSummary
      });
    }
  }

  records.sort((left, right) => `${right.completedAt || right.startedAt || ''}`.localeCompare(`${left.completedAt || left.startedAt || ''}`));
  return records;
}

function buildSourceSummary(specContexts = [], handoffs = [], releases = [], acceptance = []) {
  return {
    specCount: specContexts.length,
    documentCount: specContexts.reduce((sum, item) => sum + item.files.length, 0),
    handoffCount: handoffs.length,
    releaseCount: releases.length,
    acceptanceCount: acceptance.length
  };
}

async function runSceneDeliveryShowCommand(rawOptions = {}, dependencies = {}) {
  const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
  const sceneId = normalizeString(options.scene);
  const explicitSpecId = normalizeString(options.spec);
  if (!sceneId) {
    throw new Error('--scene is required');
  }

  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const taskClaimer = dependencies.taskClaimer || new TaskClaimer();
  const specRoot = explicitSpecId
    ? path.join(projectRoot, '.sce', 'specs', explicitSpecId)
    : null;
  if (specRoot && !await fileSystem.pathExists(specRoot)) {
    throw new Error(`spec not found: ${explicitSpecId}`);
  }

  const governanceRecord = await loadSceneGovernanceRecord(projectRoot, sceneId, fileSystem);
  const sessionRecord = await loadSceneSessionRecord(projectRoot, sceneId, fileSystem);
  const specIds = await resolveSceneSpecIds(projectRoot, sceneId, explicitSpecId, fileSystem);
  const specContexts = [];
  for (const specId of specIds) {
    const context = await loadSpecContext(projectRoot, specId, sceneId, fileSystem, taskClaimer);
    if (!context) {
      continue;
    }
    if (explicitSpecId && context.sceneId && context.sceneId !== sceneId) {
      throw new Error(`spec ${explicitSpecId} is bound to scene ${context.sceneId}, not ${sceneId}`);
    }
    if (!explicitSpecId && context.sceneId && context.sceneId !== sceneId) {
      continue;
    }
    specContexts.push(context);
  }

  if (explicitSpecId && specContexts.length === 0) {
    throw new Error(`spec ${explicitSpecId} is unavailable for scene ${sceneId}`);
  }

  const targetSpecIds = specContexts.map((item) => item.specId);
  const handoffs = await buildHandoffRecords(projectRoot, sceneId, targetSpecIds, explicitSpecId, fileSystem);
  const acceptance = await buildStudioEvidenceRecords(
    projectRoot,
    sceneId,
    targetSpecIds,
    explicitSpecId,
    'verify',
    'acceptance',
    fileSystem
  );
  const releases = await buildStudioEvidenceRecords(
    projectRoot,
    sceneId,
    targetSpecIds,
    explicitSpecId,
    'release',
    'release',
    fileSystem
  );
  const overview = buildOverviewRecords(sceneId, specContexts, governanceRecord, sessionRecord, acceptance, releases);
  const documents = buildDocumentRecords(specContexts);
  const checklists = buildChecklistRecords(specContexts);

  const payload = {
    mode: 'scene-delivery-show',
    generated_at: new Date().toISOString(),
    query: {
      scene_id: sceneId,
      spec_id: explicitSpecId || null
    },
    summary: buildSourceSummary(specContexts, handoffs, releases, acceptance),
    overview,
    documents,
    checklists,
    handoffs,
    releases,
    acceptance
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(chalk.blue('Scene Delivery Show'));
    console.log(`  Scene: ${sceneId}`);
    console.log(`  Spec: ${explicitSpecId || 'all'}`);
    console.log(`  Specs: ${payload.summary.specCount}`);
    console.log(`  Documents: ${payload.summary.documentCount}`);
    console.log(`  Handoffs: ${payload.summary.handoffCount}`);
    console.log(`  Releases: ${payload.summary.releaseCount}`);
    console.log(`  Acceptance: ${payload.summary.acceptanceCount}`);
  }
  return payload;
}

module.exports = {
  runSceneDeliveryShowCommand
};
