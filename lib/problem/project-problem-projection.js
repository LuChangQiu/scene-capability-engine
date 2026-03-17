'use strict';

const path = require('path');
const fs = require('fs-extra');

const {
  loadStudioIntakePolicy,
  scanSpecPortfolio
} = require('../studio/spec-intake-governor');

const PROJECT_SHARED_PROBLEM_PROJECTION_API_VERSION = 'sce.project-problem-projection/v0.1';
const DEFAULT_PROBLEM_CLOSURE_POLICY_PATH = '.sce/config/problem-closure-policy.json';
const DEFAULT_PROJECT_SHARED_PROBLEM_FILE = '.sce/knowledge/problem/project-shared-problems.json';
const DEFAULT_PROJECT_SHARED_PROBLEM_SCOPE = 'non_completed';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeProblemProjectionScope(value, fallback = DEFAULT_PROJECT_SHARED_PROBLEM_SCOPE) {
  const normalized = normalizeText(`${value || ''}`).toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (normalized === 'all' || normalized === 'non_completed' || normalized === 'active_only') {
    return normalized;
  }
  throw new Error('project_shared_projection.scope must be one of: all, non_completed, active_only');
}

function normalizeProblemProjectionConfig(payload = {}) {
  const candidate = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};
  return {
    enabled: candidate.enabled !== false,
    file: normalizeText(candidate.file || DEFAULT_PROJECT_SHARED_PROBLEM_FILE) || DEFAULT_PROJECT_SHARED_PROBLEM_FILE,
    scope: normalizeProblemProjectionScope(candidate.scope, DEFAULT_PROJECT_SHARED_PROBLEM_SCOPE)
  };
}

async function readProblemClosurePolicy(projectPath = process.cwd(), fileSystem = fs, configPath = DEFAULT_PROBLEM_CLOSURE_POLICY_PATH) {
  const absolutePath = path.isAbsolute(configPath)
    ? configPath
    : path.join(projectPath, configPath);
  if (!await fileSystem.pathExists(absolutePath)) {
    return {
      exists: false,
      path: absolutePath,
      payload: null,
      project_shared_projection: normalizeProblemProjectionConfig({})
    };
  }

  const payload = await fileSystem.readJson(absolutePath);
  return {
    exists: true,
    path: absolutePath,
    payload,
    project_shared_projection: normalizeProblemProjectionConfig(payload.project_shared_projection)
  };
}

async function readJsonSafe(filePath, fileSystem = fs) {
  if (!await fileSystem.pathExists(filePath)) {
    return null;
  }
  return fileSystem.readJson(filePath).catch(() => null);
}

function pickScopeRecords(records = [], scope = DEFAULT_PROJECT_SHARED_PROBLEM_SCOPE) {
  if (scope === 'all') {
    return records;
  }
  if (scope === 'active_only') {
    return records.filter((item) => item.lifecycle_state === 'active');
  }
  return records.filter((item) => item.lifecycle_state !== 'completed');
}

function toRelativePosix(projectPath, absolutePath) {
  return path.relative(projectPath, absolutePath).replace(/\\/g, '/');
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeysDeep(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const sorted = {};
  Object.keys(value).sort().forEach((key) => {
    sorted[key] = sortKeysDeep(value[key]);
  });
  return sorted;
}

function toComparableProjection(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const clone = {
    ...payload
  };
  delete clone.generated_at;
  return sortKeysDeep(clone);
}

async function buildProjectSharedProblemProjection(projectPath = process.cwd(), options = {}, dependencies = {}) {
  const fileSystem = dependencies.fileSystem || fs;
  const studioIntakePolicy = dependencies.studioIntakePolicy || await loadStudioIntakePolicy(projectPath, fileSystem);
  const staleDays = Number(
    options.staleDays
    || studioIntakePolicy?.governance?.stale_days
    || 14
  );
  const closurePolicy = dependencies.problemClosurePolicyBundle
    || await readProblemClosurePolicy(projectPath, fileSystem, options.policyPath || DEFAULT_PROBLEM_CLOSURE_POLICY_PATH);
  const projectionConfig = normalizeProblemProjectionConfig(
    options.projectSharedProjection || closurePolicy.project_shared_projection
  );
  const scanOptions = {
    staleDays
  };
  const records = dependencies.specPortfolio
    || await scanSpecPortfolio(projectPath, scanOptions, { fileSystem });
  const scopedRecords = pickScopeRecords(records, projectionConfig.scope);
  const entries = [];

  for (const record of scopedRecords) {
    const specRoot = path.join(projectPath, '.sce', 'specs', record.spec_id);
    const contractPath = path.join(specRoot, 'custom', 'problem-contract.json');
    const domainChainPath = path.join(specRoot, 'custom', 'problem-domain-chain.json');
    const contract = await readJsonSafe(contractPath, fileSystem);
    const domainChain = await readJsonSafe(domainChainPath, fileSystem);
    const problemStatement = normalizeText(
      record.problem_statement
      || (contract && contract.issue_statement)
      || (domainChain && domainChain.problem && domainChain.problem.statement)
    );

    if (!problemStatement) {
      continue;
    }

    const summary = domainChain && domainChain.summary && typeof domainChain.summary === 'object'
      ? domainChain.summary
      : {};
    const ontologyCounts = summary.ontology_counts && typeof summary.ontology_counts === 'object'
      ? summary.ontology_counts
      : {};

    entries.push({
      spec_id: record.spec_id,
      scene_id: record.scene_id || null,
      lifecycle_state: record.lifecycle_state || null,
      updated_at: record.updated_at || null,
      age_days: Number.isFinite(Number(record.age_days)) ? Number(record.age_days) : null,
      tasks_total: Number.isFinite(Number(record.tasks_total)) ? Number(record.tasks_total) : 0,
      tasks_done: Number.isFinite(Number(record.tasks_done)) ? Number(record.tasks_done) : 0,
      tasks_progress: Number.isFinite(Number(record.tasks_progress)) ? Number(record.tasks_progress) : 0,
      problem_statement: problemStatement,
      expected_outcome: normalizeText(contract && contract.expected_outcome),
      impact_scope: normalizeText(contract && contract.impact_scope),
      reproduction_steps: Array.isArray(contract && contract.reproduction_steps) ? contract.reproduction_steps : [],
      forbidden_workarounds: Array.isArray(contract && contract.forbidden_workarounds)
        ? contract.forbidden_workarounds
        : [],
      verification_gates: Array.isArray(summary.verification_gates) ? summary.verification_gates : [],
      ontology_counts: {
        entity: Number(ontologyCounts.entity || 0),
        relation: Number(ontologyCounts.relation || 0),
        business_rule: Number(ontologyCounts.business_rule || 0),
        decision_policy: Number(ontologyCounts.decision_policy || 0),
        execution_flow: Number(ontologyCounts.execution_flow || 0)
      },
      evidence_binding_count: Number(summary.evidence_binding_count || 0),
      hypothesis_count: Number(summary.hypothesis_count || 0),
      risk_count: Number(summary.risk_count || 0),
      paths: {
        problem_contract: await fileSystem.pathExists(contractPath) ? toRelativePosix(projectPath, contractPath) : null,
        problem_domain_chain: await fileSystem.pathExists(domainChainPath) ? toRelativePosix(projectPath, domainChainPath) : null
      }
    });
  }

  entries.sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')));
  const activeCount = entries.filter((item) => item.lifecycle_state === 'active').length;
  const staleCount = entries.filter((item) => item.lifecycle_state === 'stale').length;
  const completedCount = entries.filter((item) => item.lifecycle_state === 'completed').length;

  return {
    api_version: PROJECT_SHARED_PROBLEM_PROJECTION_API_VERSION,
    generated_at: new Date().toISOString(),
    source: {
      project: path.basename(projectPath),
      stale_days: staleDays,
      scope: projectionConfig.scope
    },
    summary: {
      total_entries: entries.length,
      active_entries: activeCount,
      stale_entries: staleCount,
      completed_entries: completedCount
    },
    entries
  };
}

async function syncProjectSharedProblemProjection(projectPath = process.cwd(), options = {}, dependencies = {}) {
  const fileSystem = dependencies.fileSystem || fs;
  const closurePolicy = dependencies.problemClosurePolicyBundle
    || await readProblemClosurePolicy(projectPath, fileSystem, options.policyPath || DEFAULT_PROBLEM_CLOSURE_POLICY_PATH);
  const projectionConfig = normalizeProblemProjectionConfig(
    options.projectSharedProjection || closurePolicy.project_shared_projection
  );
  const absolutePath = path.isAbsolute(projectionConfig.file)
    ? projectionConfig.file
    : path.join(projectPath, projectionConfig.file);

  if (projectionConfig.enabled !== true) {
    return {
      mode: 'project-problem-projection-sync',
      enabled: false,
      file: absolutePath,
      scope: projectionConfig.scope,
      total_entries: 0,
      refreshed: false
    };
  }

  const payload = await buildProjectSharedProblemProjection(projectPath, {
    ...options,
    projectSharedProjection: projectionConfig
  }, {
    ...dependencies,
    problemClosurePolicyBundle: closurePolicy
  });
  const existing = await readJsonSafe(absolutePath, fileSystem);
  const existingComparable = toComparableProjection(existing);
  const nextComparable = toComparableProjection(payload);

  if (
    existingComparable
    && nextComparable
    && JSON.stringify(existingComparable) === JSON.stringify(nextComparable)
  ) {
    return {
      mode: 'project-problem-projection-sync',
      enabled: true,
      file: absolutePath,
      scope: projectionConfig.scope,
      total_entries: Number(payload.summary.total_entries || payload.entries.length || 0),
      refreshed: false
    };
  }

  await fileSystem.ensureDir(path.dirname(absolutePath));
  await fileSystem.writeJson(absolutePath, payload, { spaces: 2 });

  return {
    mode: 'project-problem-projection-sync',
    enabled: true,
    file: absolutePath,
    scope: projectionConfig.scope,
    total_entries: Number(payload.summary.total_entries || payload.entries.length || 0),
    refreshed: true
  };
}

module.exports = {
  PROJECT_SHARED_PROBLEM_PROJECTION_API_VERSION,
  DEFAULT_PROBLEM_CLOSURE_POLICY_PATH,
  DEFAULT_PROJECT_SHARED_PROBLEM_FILE,
  DEFAULT_PROJECT_SHARED_PROBLEM_SCOPE,
  normalizeProblemProjectionScope,
  normalizeProblemProjectionConfig,
  readProblemClosurePolicy,
  buildProjectSharedProblemProjection,
  syncProjectSharedProblemProjection
};
