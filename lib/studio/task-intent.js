function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function truncateTaskText(value = '', maxLength = 96) {
  const normalized = normalizeString(value).replace(/\s+/g, ' ');
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, Math.max(0, maxLength - 3)).trim() + '...';
}

function dedupeTaskList(items = [], limit = 3) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const normalized = truncateTaskText(item, 120);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function splitTaskRawRequest(rawRequest = '') {
  const normalized = normalizeString(rawRequest).replace(/\s+/g, ' ');
  if (!normalized) {
    return [];
  }
  const chunks = normalized
    .split(/(?:\r?\n|[;；。!?！？]|(?:\s+\band\b\s+)|(?:\s+\bthen\b\s+)|(?:\s+\balso\b\s+)|(?:\s*并且\s*)|(?:\s*同时\s*)|(?:\s*以及\s*)|(?:\s*然后\s*))/gi)
    .map((item) => normalizeString(item).replace(/^(?:and|then|also)\s+/i, ''))
    .filter(Boolean);
  return dedupeTaskList(chunks, 3);
}

function deriveTaskIntentShape(rawRequest = '', stageName = '') {
  const normalizedRaw = normalizeString(rawRequest).replace(/\s+/g, ' ');
  const clauses = splitTaskRawRequest(normalizedRaw);
  const hasRaw = normalizedRaw.length > 0;
  const inferredSubGoals = clauses.length > 1 ? clauses.slice(0, 3) : [];
  const needsSplit = inferredSubGoals.length > 1;
  const titleSource = clauses.length > 0
    ? clauses[0]
    : (hasRaw ? normalizedRaw : 'Studio ' + (stageName || 'task') + ' execution');

  let confidence = hasRaw ? 0.9 : 0.6;
  if (needsSplit) {
    confidence = 0.72;
  }
  if (normalizeString(stageName) && normalizeString(stageName) !== 'plan') {
    confidence = Math.min(0.95, confidence + 0.03);
  }

  return {
    title_norm: truncateTaskText(titleSource, 96) || ('Studio ' + (stageName || 'task') + ' execution'),
    raw_request: hasRaw ? normalizedRaw : null,
    sub_goals: inferredSubGoals,
    needs_split: needsSplit,
    confidence: Number(confidence.toFixed(2))
  };
}

function buildTaskSummaryLines(job = {}, stageName = '', taskStatus = '', nextAction = '', taskRef = '', buildProgress) {
  const sceneId = normalizeString(job && job.scene && job.scene.id) || 'scene.n/a';
  const specId = normalizeString(job && job.scene && job.scene.spec_id) || normalizeString(job && job.source && job.source.spec_id) || 'spec.n/a';
  const progress = typeof buildProgress === 'function' ? buildProgress(job) : { completed: 0, total: 0 };
  return [
    'Stage: ' + (stageName || 'plan') + ' | Status: ' + (taskStatus || 'unknown') + (taskRef ? (' | Ref: ' + taskRef) : ''),
    'Scene: ' + sceneId + ' | Spec: ' + specId + ' | Progress: ' + progress.completed + '/' + progress.total,
    'Next: ' + (nextAction || 'n/a')
  ];
}

function buildTaskAcceptanceCriteria(stageName = '', job = {}, nextAction = '') {
  const normalizedStage = normalizeString(stageName) || 'task';
  const artifacts = job && job.artifacts ? job.artifacts : {};
  const criteriaByStage = {
    plan: [
      'Scene/spec binding is resolved and persisted in studio job metadata.',
      'Plan stage problem evaluation passes with no blockers.',
      'Next action is executable (' + (nextAction || 'sce studio generate --job <job-id>') + ').'
    ],
    generate: [
      'Patch bundle id is produced for downstream apply stage.',
      'Generate stage report is written to artifacts.',
      'Next action is executable (' + (nextAction || 'sce studio apply --patch-bundle <id> --job <job-id>') + ').'
    ],
    apply: [
      'Authorization requirements are satisfied for apply stage.',
      'Apply stage completes without policy blockers.',
      'Next action is executable (' + (nextAction || 'sce studio verify --job <job-id>') + ').'
    ],
    verify: [
      'Verification gates finish with no required-step failures.',
      'Verify report is available (' + (normalizeString(artifacts.verify_report) || 'artifact pending') + ').',
      'Next action is executable (' + (nextAction || 'sce studio release --job <job-id>') + ').'
    ],
    release: [
      'Release gates pass under configured release profile.',
      'Release reference is emitted (' + (normalizeString(artifacts.release_ref) || 'artifact pending') + ').',
      'Next action is executable (' + (nextAction || 'complete') + ').'
    ],
    rollback: [
      'Rollback stage transitions job status to rolled_back.',
      'Rollback evidence is appended to studio event stream.',
      'Recovery next action is executable (' + (nextAction || 'sce studio plan --scene <scene-id> --from-chat <session>') + ').'
    ],
    events: [
      'Events stream payload is available for task-level audit.',
      'Task envelope preserves normalized IDs and handoff fields.',
      'Next action is explicit (' + (nextAction || 'n/a') + ').'
    ],
    resume: [
      'Current job status and stage progress are restored deterministically.',
      'Task envelope remains schema-compatible for downstream UI.',
      'Next action is explicit (' + (nextAction || 'n/a') + ').'
    ]
  };
  return criteriaByStage[normalizedStage] || [
    'Task envelope contains normalized identifiers and task contract fields.',
    'Task output preserves evidence, command logs, and error bundles.',
    'Next action is explicit (' + (nextAction || 'n/a') + ').'
  ];
}

module.exports = {
  deriveTaskIntentShape,
  buildTaskSummaryLines,
  buildTaskAcceptanceCriteria,
  truncateTaskText,
  dedupeTaskList,
  splitTaskRawRequest
};
