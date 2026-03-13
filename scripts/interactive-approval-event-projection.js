#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs-extra');
const { getSceStateStore } = require('../lib/state/sce-state-store');

const DEFAULT_INPUT = '.sce/reports/interactive-approval-events.jsonl';

function parseArgs(argv = []) {
  const options = {
    action: null,
    projectPath: process.cwd(),
    input: DEFAULT_INPUT,
    readSource: 'auto',
    actor: null,
    workflowId: null,
    eventType: null,
    approvalAction: null,
    blocked: null,
    limit: 20,
    json: false,
    failOnDrift: false,
    failOnParseError: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--action' && next) {
      options.action = `${next}`.trim().toLowerCase();
      index += 1;
      continue;
    }
    if ((token === '--project-path' || token === '--workspace') && next) {
      options.projectPath = path.resolve(next);
      index += 1;
      continue;
    }
    if ((token === '--input' || token === '--audit-file') && next) {
      options.input = next;
      index += 1;
      continue;
    }
    if (token === '--read-source' && next) {
      options.readSource = `${next}`.trim().toLowerCase();
      index += 1;
      continue;
    }
    if (token === '--actor' && next) {
      options.actor = next;
      index += 1;
      continue;
    }
    if ((token === '--workflow-id' || token === '--workflow') && next) {
      options.workflowId = next;
      index += 1;
      continue;
    }
    if (token === '--event-type' && next) {
      options.eventType = next;
      index += 1;
      continue;
    }
    if ((token === '--approval-action' || token === '--action-filter') && next) {
      options.approvalAction = next;
      index += 1;
      continue;
    }
    if (token === '--blocked') {
      options.blocked = true;
      continue;
    }
    if (token === '--not-blocked') {
      options.blocked = false;
      continue;
    }
    if (token === '--limit' && next) {
      options.limit = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (token === '--json') {
      options.json = true;
      continue;
    }
    if (token === '--fail-on-drift') {
      options.failOnDrift = true;
      continue;
    }
    if (token === '--fail-on-parse-error') {
      options.failOnParseError = true;
    }
  }

  if (!['rebuild', 'doctor', 'query'].includes(options.action)) {
    throw new Error('--action must be one of: rebuild, doctor, query');
  }
  if (!['auto', 'file', 'projection'].includes(options.readSource)) {
    throw new Error('--read-source must be one of: auto, file, projection');
  }
  if (!Number.isFinite(options.limit) || options.limit < 0) {
    throw new Error('--limit must be a non-negative integer');
  }

  return options;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveInputPath(projectPath, input) {
  return path.isAbsolute(input) ? input : path.resolve(projectPath, input);
}

function relativeProjectPath(projectPath, absolutePath) {
  return path.relative(projectPath, absolutePath).replace(/\\/g, '/');
}

async function readApprovalAuditFile(projectPath, input) {
  const auditPath = resolveInputPath(projectPath, input);
  const relativePath = relativeProjectPath(projectPath, auditPath) || path.basename(auditPath);
  if (!await fs.pathExists(auditPath)) {
    return {
      auditPath,
      relativePath,
      exists: false,
      events: [],
      parseErrors: [],
      lineCount: 0
    };
  }

  const content = await fs.readFile(auditPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const events = [];
  const parseErrors = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }
    try {
      const raw = JSON.parse(line);
      events.push({
        ...raw,
        audit_file: relativePath,
        line_no: index + 1
      });
    } catch (error) {
      parseErrors.push({
        line_no: index + 1,
        message: error.message
      });
    }
  }

  return {
    auditPath,
    relativePath,
    exists: true,
    events,
    parseErrors,
    lineCount: lines.filter((line) => line.trim().length > 0).length
  };
}

function filterApprovalEvents(events = [], options = {}) {
  let rows = Array.isArray(events) ? events.slice() : [];
  const actor = normalizeString(options.actor);
  const workflowId = normalizeString(options.workflowId || options.workflow_id);
  const eventType = normalizeString(options.eventType || options.event_type);
  const approvalAction = normalizeString(options.approvalAction || options.approval_action || options.action);
  const blocked = options.blocked;

  if (actor) {
    rows = rows.filter((item) => normalizeString(item.actor) === actor);
  }
  if (workflowId) {
    rows = rows.filter((item) => normalizeString(item.workflow_id) === workflowId);
  }
  if (eventType) {
    rows = rows.filter((item) => normalizeString(item.event_type) === eventType);
  }
  if (approvalAction) {
    rows = rows.filter((item) => normalizeString(item.action) === approvalAction);
  }
  if (blocked === true || blocked === false) {
    rows = rows.filter((item) => Boolean(item.blocked) === blocked);
  }

  rows.sort((left, right) => {
    const leftTs = Date.parse(left.event_timestamp || left.timestamp || '') || 0;
    const rightTs = Date.parse(right.event_timestamp || right.timestamp || '') || 0;
    return rightTs - leftTs;
  });
  return rows;
}

async function rebuildInteractiveApprovalProjection(options = {}, dependencies = {}) {
  const projectPath = path.resolve(options.projectPath || process.cwd());
  const stateStore = dependencies.stateStore || getSceStateStore(projectPath, {
    fileSystem: dependencies.fileSystem || fs,
    env: dependencies.env || process.env
  });
  const audit = await readApprovalAuditFile(projectPath, options.input || DEFAULT_INPUT);

  await stateStore.clearInteractiveApprovalEventProjection({
    auditFile: audit.relativePath
  });
  const writeResult = await stateStore.upsertInteractiveApprovalEventProjection(audit.events, {
    source: 'jsonl.interactive-approval-events',
    auditFile: audit.relativePath
  });
  const projectionRows = await stateStore.listInteractiveApprovalEventProjection({
    auditFile: audit.relativePath,
    limit: 0
  });

  return {
    mode: 'interactive-approval-event-projection',
    action: 'rebuild',
    success: audit.parseErrors.length === 0,
    passed: audit.parseErrors.length === 0,
    project_path: projectPath,
    audit_file: audit.relativePath,
    source_event_count: audit.events.length,
    projection_event_count: Array.isArray(projectionRows) ? projectionRows.length : 0,
    parse_error_count: audit.parseErrors.length,
    parse_errors: audit.parseErrors,
    write_result: writeResult || null
  };
}

async function doctorInteractiveApprovalProjection(options = {}, dependencies = {}) {
  const projectPath = path.resolve(options.projectPath || process.cwd());
  const stateStore = dependencies.stateStore || getSceStateStore(projectPath, {
    fileSystem: dependencies.fileSystem || fs,
    env: dependencies.env || process.env
  });
  const audit = await readApprovalAuditFile(projectPath, options.input || DEFAULT_INPUT);
  const projectionRows = await stateStore.listInteractiveApprovalEventProjection({
    auditFile: audit.relativePath,
    limit: 0
  });
  const projectionCount = Array.isArray(projectionRows) ? projectionRows.length : 0;

  let status = 'aligned';
  if (audit.parseErrors.length > 0) {
    status = 'parse-error';
  } else if (!audit.exists && projectionCount === 0) {
    status = 'empty';
  } else if (!audit.exists && projectionCount > 0) {
    status = 'projection-only';
  } else if (audit.events.length === 0 && projectionCount === 0) {
    status = 'empty';
  } else if (projectionCount === 0 && audit.events.length > 0) {
    status = 'projection-missing';
  } else if (projectionCount < audit.events.length) {
    status = 'pending-projection';
  } else if (projectionCount > audit.events.length) {
    status = 'projection-ahead';
  }

  const latestSourceEvent = audit.events.length > 0 ? filterApprovalEvents(audit.events, { limit: 1 })[0] : null;
  const latestProjectionEvent = projectionCount > 0 ? projectionRows[0] : null;

  const blocking = [];
  const alerts = [];
  if (status === 'parse-error') {
    blocking.push('parse-error');
  }
  if (status === 'projection-ahead') {
    blocking.push('projection-ahead');
  }
  if (status === 'projection-only') {
    blocking.push('projection-only');
  }
  if (status === 'projection-missing' || status === 'pending-projection') {
    alerts.push(status);
  }

  const passed = blocking.length === 0
    && (!options.failOnDrift || alerts.length === 0)
    && (!options.failOnParseError || audit.parseErrors.length === 0);

  return {
    mode: 'interactive-approval-event-projection',
    action: 'doctor',
    success: passed,
    passed,
    project_path: projectPath,
    audit_file: audit.relativePath,
    status,
    source_event_count: audit.events.length,
    projection_event_count: projectionCount,
    parse_error_count: audit.parseErrors.length,
    parse_errors: audit.parseErrors,
    latest_source_event_id: latestSourceEvent ? latestSourceEvent.event_id || null : null,
    latest_projection_event_id: latestProjectionEvent ? latestProjectionEvent.event_id || null : null,
    blocking,
    alerts
  };
}

async function queryInteractiveApprovalProjection(options = {}, dependencies = {}) {
  const projectPath = path.resolve(options.projectPath || process.cwd());
  const stateStore = dependencies.stateStore || getSceStateStore(projectPath, {
    fileSystem: dependencies.fileSystem || fs,
    env: dependencies.env || process.env
  });
  const audit = await readApprovalAuditFile(projectPath, options.input || DEFAULT_INPUT);

  let readSource = options.readSource || 'auto';
  let rows = [];
  if (readSource === 'projection' || readSource === 'auto') {
    const projectionRows = await stateStore.listInteractiveApprovalEventProjection({
      auditFile: audit.relativePath,
      actor: options.actor,
      workflowId: options.workflowId,
      eventType: options.eventType,
      action: options.approvalAction,
      blocked: options.blocked,
      limit: options.limit
    });
    if (readSource === 'projection') {
      rows = Array.isArray(projectionRows) ? projectionRows : [];
    } else if (Array.isArray(projectionRows) && projectionRows.length > 0) {
      readSource = 'projection';
      rows = projectionRows;
    } else {
      readSource = 'file';
    }
  }

  if (readSource === 'file') {
    rows = filterApprovalEvents(audit.events, {
      actor: options.actor,
      workflowId: options.workflowId,
      eventType: options.eventType,
      approvalAction: options.approvalAction,
      blocked: options.blocked
    }).slice(0, options.limit > 0 ? options.limit : undefined);
  }

  return {
    mode: 'interactive-approval-event-projection',
    action: 'query',
    success: true,
    passed: true,
    project_path: projectPath,
    audit_file: audit.relativePath,
    read_source: readSource,
    result_count: rows.length,
    results: rows
  };
}

async function run(options = {}, dependencies = {}) {
  if (options.action === 'rebuild') {
    return rebuildInteractiveApprovalProjection(options, dependencies);
  }
  if (options.action === 'doctor') {
    return doctorInteractiveApprovalProjection(options, dependencies);
  }
  return queryInteractiveApprovalProjection(options, dependencies);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await run(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (options.action === 'query') {
    console.log(`[interactive-approval-event-projection] read_source=${result.read_source} result_count=${result.result_count}`);
  } else {
    console.log(`[interactive-approval-event-projection] action=${options.action} status=${result.passed ? 'passed' : 'failed'}`);
  }
  if (!result.passed) {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : `${error}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_INPUT,
  doctorInteractiveApprovalProjection,
  parseArgs,
  queryInteractiveApprovalProjection,
  readApprovalAuditFile,
  rebuildInteractiveApprovalProjection,
  run
};
