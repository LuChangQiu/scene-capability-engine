function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function buildManifestSummary(sceneManifest) {
  const metadata = sceneManifest.metadata || {};
  const spec = sceneManifest.spec || {};
  const capability = spec.capability_contract || {};
  const governance = spec.governance_contract || {};
  const approval = governance.approval || {};
  const bindings = Array.isArray(capability.bindings) ? capability.bindings : [];
  const sideEffectBindings = bindings.filter((binding) => binding && binding.side_effect === true).length;

  return {
    valid: true,
    scene_ref: metadata.obj_id || null,
    scene_version: metadata.obj_version || null,
    title: metadata.title || null,
    domain: spec.domain || 'erp',
    risk_level: governance.risk_level || 'medium',
    approval_required: approval.required === true,
    binding_count: bindings.length,
    side_effect_binding_count: sideEffectBindings
  };
}

function normalizeBindingPluginReport(bindingPluginLoad) {
  if (!bindingPluginLoad || typeof bindingPluginLoad !== 'object') {
    return null;
  }

  return {
    handlers_loaded: Number.isFinite(bindingPluginLoad.handlers_loaded) ? Number(bindingPluginLoad.handlers_loaded) : 0,
    plugin_dirs: Array.isArray(bindingPluginLoad.plugin_dirs)
      ? bindingPluginLoad.plugin_dirs.filter((item) => typeof item === 'string')
      : [],
    plugin_files: Array.isArray(bindingPluginLoad.plugin_files)
      ? bindingPluginLoad.plugin_files.filter((item) => typeof item === 'string')
      : [],
    manifest_path: typeof bindingPluginLoad.manifest_path === 'string' && bindingPluginLoad.manifest_path.trim().length > 0
      ? bindingPluginLoad.manifest_path
      : null,
    manifest_loaded: bindingPluginLoad.manifest_loaded === true,
    warnings: Array.isArray(bindingPluginLoad.warnings)
      ? bindingPluginLoad.warnings.map((warning) => String(warning))
      : []
  };
}

function buildDoctorSummary(sceneManifest, diagnostics) {
  const manifestSummary = buildManifestSummary(sceneManifest);
  const blockers = [];

  if (diagnostics.planError) {
    blockers.push(`plan validation failed: ${diagnostics.planError}`);
  }

  if (diagnostics.policy && diagnostics.policy.allowed === false) {
    for (const reason of diagnostics.policy.reasons || []) {
      blockers.push(`policy blocked: ${reason}`);
    }
  }

  if (diagnostics.adapterReadiness && diagnostics.adapterReadiness.ready === false) {
    if (diagnostics.adapterReadiness.error) {
      blockers.push(`adapter readiness failed: ${diagnostics.adapterReadiness.error}`);
    }

    const failedChecks = (diagnostics.adapterReadiness.checks || [])
      .filter((item) => item && item.passed === false)
      .map((item) => item.name);

    if (failedChecks.length > 0) {
      blockers.push(`adapter checks failed: ${failedChecks.join(', ')}`);
    }
  }

  return {
    status: blockers.length === 0 ? 'healthy' : 'blocked',
    trace_id: diagnostics.traceId || null,
    scene_ref: manifestSummary.scene_ref,
    scene_version: manifestSummary.scene_version,
    domain: manifestSummary.domain,
    risk_level: manifestSummary.risk_level,
    mode: diagnostics.mode,
    plan: {
      valid: !diagnostics.planError,
      node_count: diagnostics.plan ? diagnostics.plan.nodes.length : 0,
      error: diagnostics.planError || null
    },
    policy: diagnostics.policy,
    adapter_readiness: diagnostics.adapterReadiness || null,
    binding_plugins: normalizeBindingPluginReport(diagnostics.bindingPlugins),
    blockers
  };
}


function createDoctorSuggestion(code, title, action, priority = 'medium') {
  return { code, title, action, priority };
}

function dedupeDoctorSuggestions(suggestions) {
  const seen = new Set();
  return suggestions.filter((suggestion) => {
    const key = `${suggestion.code}:${suggestion.action}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildDoctorSuggestions(report, sceneManifest) {
  const suggestions = [];
  const domain = ((sceneManifest.spec || {}).domain || report.domain || 'erp').toLowerCase();
  const policyReasons = report.policy && Array.isArray(report.policy.reasons)
    ? report.policy.reasons
    : [];

  if (report.plan && !report.plan.valid) {
    suggestions.push(createDoctorSuggestion(
      'plan-invalid',
      'Fix scene bindings and idempotency fields',
      'Run `sce scene validate` and ensure side-effect bindings have idempotency key.',
      'high'
    ));
  }

  for (const reason of policyReasons) {
    const normalizedReason = String(reason || '').toLowerCase();

    if (normalizedReason.includes('approval is required for commit')) {
      suggestions.push(createDoctorSuggestion(
        'approval-required',
        'Collect approval before commit',
        'After approval workflow completes, rerun with `--approved`.',
        'high'
      ));
      continue;
    }

    if (normalizedReason.includes('high-risk commit requires approval')) {
      suggestions.push(createDoctorSuggestion(
        'high-risk-approval',
        'Escalate high-risk approval gate',
        'Keep run mode in dry_run until explicit approval evidence is recorded.',
        'high'
      ));
      continue;
    }

    if (normalizedReason.includes('hybrid commit is disabled in runtime pilot')) {
      suggestions.push(createDoctorSuggestion(
        'hybrid-commit-disabled',
        'Use hybrid dry_run in current pilot',
        'Run hybrid scene with `--mode dry_run` and collect readiness evidence only.',
        'high'
      ));
      continue;
    }

    if (normalizedReason.includes('robot safety preflight check failed')) {
      suggestions.push(createDoctorSuggestion(
        'robot-preflight',
        'Repair robot preflight checks',
        'Verify robot adapter preflight pipeline and rerun with `--safety-preflight` when available.',
        'critical'
      ));
      continue;
    }

    if (normalizedReason.includes('robot stop channel is unavailable')) {
      suggestions.push(createDoctorSuggestion(
        'robot-stop-channel',
        'Restore emergency stop channel',
        'Validate stop-channel connectivity before any robot or hybrid commit.',
        'critical'
      ));
      continue;
    }

    if (normalizedReason.includes('critical robot commit requires dual approval')) {
      suggestions.push(createDoctorSuggestion(
        'dual-approval-required',
        'Collect dual approval for critical robot change',
        'Set dual-approval context only after two approvers sign off.',
        'critical'
      ));
      continue;
    }

    suggestions.push(createDoctorSuggestion(
      'policy-blocked',
      'Resolve policy blocker',
      `Review policy reason: ${reason}`,
      'high'
    ));
  }

  if (report.adapter_readiness && report.adapter_readiness.ready === false) {
    const checks = Array.isArray(report.adapter_readiness.checks)
      ? report.adapter_readiness.checks
      : [];

    for (const check of checks) {
      if (check && check.passed === false) {
        suggestions.push(createDoctorSuggestion(
          'adapter-readiness',
          'Fix adapter readiness checks',
          `Repair adapter check "${check.name}" and rerun \`sce scene doctor --check-adapter\`.`,
          domain === 'erp' ? 'medium' : 'high'
        ));
      }
    }

    if (report.adapter_readiness.error) {
      suggestions.push(createDoctorSuggestion(
        'adapter-runtime-error',
        'Stabilize adapter readiness probe',
        `Handle adapter probe error: ${report.adapter_readiness.error}`,
        'high'
      ));
    }
  }

  const pluginWarnings = report.binding_plugins && Array.isArray(report.binding_plugins.warnings)
    ? report.binding_plugins.warnings
    : [];

  if (pluginWarnings.some((warning) => String(warning || '').toLowerCase().includes('manifest not found'))) {
    suggestions.push(createDoctorSuggestion(
      'binding-plugin-manifest-missing',
      'Provide binding plugin manifest or disable manifest load',
      'Create manifest via `.sce/config/scene-binding-plugins.json` or rerun doctor with `--no-binding-plugin-manifest-load`.',
      'medium'
    ));
  }

  if (pluginWarnings.some((warning) => {
    const normalized = String(warning || '').toLowerCase();
    return normalized.includes('failed to load binding plugin') || normalized.includes('invalid binding handler in plugin');
  })) {
    suggestions.push(createDoctorSuggestion(
      'binding-plugin-load-failed',
      'Repair failed binding plugin modules',
      'Inspect plugin warnings and fix plugin exports/handlers before commit execution.',
      'high'
    ));
  }

  if (suggestions.length === 0) {
    suggestions.push(createDoctorSuggestion(
      'ready-to-run',
      'Scene is healthy for next execution step',
      report.mode === 'commit'
        ? 'Proceed with `sce scene run --mode commit` under normal approval flow.'
        : 'Proceed with `sce scene run --mode dry_run` to capture execution evidence.',
      'low'
    ));
  }

  return dedupeDoctorSuggestions(suggestions);
}

function buildDoctorTodoMarkdown(report, suggestions) {
  const lines = [
    '# Scene Doctor Remediation Checklist',
    '',
    `- Scene: ${report.scene_ref}@${report.scene_version}`,
    `- Domain: ${report.domain}`,
    `- Mode: ${report.mode}`,
    `- Status: ${report.status}`,
    `- Generated At: ${new Date().toISOString()}`,
    ''
  ];

  if (report.blockers.length > 0) {
    lines.push('## Blockers');
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker}`);
    }
    lines.push('');
  }

  lines.push('## Suggested Actions');
  for (const suggestion of suggestions) {
    lines.push(`- [ ] [${suggestion.priority}] ${suggestion.title}`);
    lines.push(`  - ${suggestion.action}`);
  }
  lines.push('');

  return lines.join('\n');
}

async function writeDoctorTodo(options, report, projectRoot, fileSystem = fs) {
  if (!options.todoOut) {
    return null;
  }

  const todoPath = resolvePath(projectRoot, options.todoOut);
  const markdown = buildDoctorTodoMarkdown(report, report.suggestions || []);

  await fileSystem.ensureDir(path.dirname(todoPath));
  await fileSystem.writeFile(todoPath, markdown, 'utf8');

  return todoPath;
}

function buildDoctorTaskDraft(report, suggestions) {
  const ordered = [...suggestions].sort((left, right) => {
    const weights = { critical: 0, high: 1, medium: 2, low: 3 };
    const leftWeight = Object.prototype.hasOwnProperty.call(weights, left.priority) ? weights[left.priority] : 99;
    const rightWeight = Object.prototype.hasOwnProperty.call(weights, right.priority) ? weights[right.priority] : 99;

    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }

    return left.title.localeCompare(right.title);
  });

  const lines = [
    '# Doctor Task Draft',
    '',
    `Scene: ${report.scene_ref}@${report.scene_version}`,
    `Domain: ${report.domain}`,
    `Mode: ${report.mode}`,
    `Status: ${report.status}`,
    `Trace: ${report.trace_id || 'n/a'}`,
    '',
    '## Suggested Tasks',
    ''
  ];

  ordered.forEach((suggestion, index) => {
    const taskId = index + 1;
    const code = suggestion.code || 'unknown';
    lines.push(`- [ ] ${taskId} [${suggestion.priority}] [${code}] ${suggestion.title}`);
    lines.push(`  - ${suggestion.action}`);
  });

  lines.push('');
  return lines.join('\n');
}

async function writeDoctorTaskDraft(options, report, projectRoot, fileSystem = fs) {
  if (!options.taskOut) {
    return null;
  }

  const taskPath = resolvePath(projectRoot, options.taskOut);
  const markdown = buildDoctorTaskDraft(report, report.suggestions || []);

  await fileSystem.ensureDir(path.dirname(taskPath));
  await fileSystem.writeFile(taskPath, markdown, 'utf8');

  return taskPath;
}

function buildDoctorFeedbackTemplate(report) {
  const lines = [
    '# Doctor Execution Feedback Template',
    '',
    `Scene: ${report.scene_ref}@${report.scene_version}`,
    `Domain: ${report.domain}`,
    `Mode: ${report.mode}`,
    `Status: ${report.status}`,
    `Trace: ${report.trace_id || 'n/a'}`,
    '',
    '## Task Feedback Records',
    ''
  ];

  const suggestions = Array.isArray(report.suggestions) ? report.suggestions : [];
  const suggestionByCode = new Map();
  for (const suggestion of suggestions) {
    if (suggestion && suggestion.code && !suggestionByCode.has(suggestion.code)) {
      suggestionByCode.set(suggestion.code, suggestion);
    }
  }

  const taskSync = report.task_sync || null;
  const addedTasks = taskSync && Array.isArray(taskSync.added_tasks) ? taskSync.added_tasks : [];

  if (addedTasks.length === 0) {
    lines.push('- No synced actionable tasks in this doctor run.');
    lines.push('');
    return lines.join('\n');
  }

  for (const task of addedTasks) {
    const suggestionCode = task.suggestion_code || 'unknown';
    const suggestion = suggestionByCode.get(suggestionCode) || null;

    lines.push(`### Task ${task.task_id}: ${task.title}`);
    lines.push(`- Priority: ${task.priority}`);
    lines.push(`- Suggestion Code: ${suggestionCode}`);
    lines.push(`- Trace ID: ${task.trace_id || report.trace_id || 'n/a'}`);
    lines.push(`- Scene Ref: ${report.scene_ref}`);
    if (suggestion && suggestion.action) {
      lines.push(`- Planned Action: ${suggestion.action}`);
    }
    lines.push('');
    lines.push('- [ ] Status: pending | in_progress | done | blocked');
    lines.push('- [ ] Owner:');
    lines.push('- [ ] Evidence Paths:');
    lines.push('- [ ] Completion Notes:');
    lines.push('- [ ] Eval Update:');
    lines.push('  - cycle_time_ms:');
    lines.push('  - policy_violation_count:');
    lines.push('  - node_failure_count:');
    lines.push('  - manual_takeover_rate:');
    lines.push('');
  }

  return lines.join('\n');
}

async function writeDoctorFeedbackTemplate(options, report, projectRoot, fileSystem = fs) {
  if (!options.feedbackOut) {
    return null;
  }

  const feedbackPath = resolvePath(projectRoot, options.feedbackOut);
  const markdown = buildDoctorFeedbackTemplate(report);

  await fileSystem.ensureDir(path.dirname(feedbackPath));
  await fileSystem.writeFile(feedbackPath, markdown, 'utf8');

  return feedbackPath;
}

function parseSceneDescriptor(rawValue) {
  const value = String(rawValue || '').trim();
  const atIndex = value.lastIndexOf('@');

  if (atIndex <= 0 || atIndex === value.length - 1) {
    return {
      scene_ref: value || null,
      scene_version: null
    };
  }

  return {
    scene_ref: value.slice(0, atIndex).trim() || null,
    scene_version: value.slice(atIndex + 1).trim() || null
  };
}

function normalizeFeedbackStatus(rawStatus) {
  const status = String(rawStatus || '').trim().toLowerCase();

  if (!status || status.includes('|')) {
    return null;
  }

  if (status.startsWith('done')) {
    return 'done';
  }

  if (status.startsWith('in_progress') || status.startsWith('in-progress')) {
    return 'in_progress';
  }

  if (status.startsWith('blocked')) {
    return 'blocked';
  }

  if (status.startsWith('pending')) {
    return 'pending';
  }

  return status;
}

function parseFeedbackNumber(rawValue) {
  const match = String(rawValue || '').match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : null;
}

function parseDoctorFeedbackTemplate(markdown = '') {
  const lines = String(markdown || '').split(/\r?\n/);
  const feedback = {
    scene_ref: null,
    scene_version: null,
    domain: null,
    mode: null,
    status: null,
    trace_id: null,
    tasks: []
  };

  let currentTask = null;

  const pushTask = () => {
    if (!currentTask) {
      return;
    }

    feedback.tasks.push(currentTask);
    currentTask = null;
  };

  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();

    if (!line) {
      continue;
    }

    if (line.startsWith('Scene:')) {
      const parsed = parseSceneDescriptor(line.slice('Scene:'.length));
      feedback.scene_ref = parsed.scene_ref;
      feedback.scene_version = parsed.scene_version;
      continue;
    }

    if (line.startsWith('Domain:')) {
      feedback.domain = line.slice('Domain:'.length).trim() || null;
      continue;
    }

    if (line.startsWith('Mode:')) {
      feedback.mode = line.slice('Mode:'.length).trim() || null;
      continue;
    }

    if (line.startsWith('Status:')) {
      feedback.status = line.slice('Status:'.length).trim() || null;
      continue;
    }

    if (line.startsWith('Trace:')) {
      const traceId = line.slice('Trace:'.length).trim();
      feedback.trace_id = traceId && traceId !== 'n/a' ? traceId : null;
      continue;
    }

    const taskHeadingMatch = line.match(/^###\s+Task\s+(\d+)\s*:\s*(.+)$/i);
    if (taskHeadingMatch) {
      pushTask();

      const taskId = Number.parseInt(taskHeadingMatch[1], 10);
      currentTask = {
        task_id: Number.isFinite(taskId) ? taskId : null,
        title: taskHeadingMatch[2].trim(),
        priority: null,
        suggestion_code: null,
        trace_id: feedback.trace_id,
        scene_ref: feedback.scene_ref,
        planned_action: null,
        status: null,
        owner: null,
        evidence_paths: null,
        completion_notes: null,
        eval_update: {
          cycle_time_ms: null,
          policy_violation_count: null,
          node_failure_count: null,
          manual_takeover_rate: null
        }
      };
      continue;
    }

    if (!currentTask) {
      continue;
    }

    if (line.startsWith('- Priority:')) {
      currentTask.priority = line.slice('- Priority:'.length).trim() || null;
      continue;
    }

    if (line.startsWith('- Suggestion Code:')) {
      currentTask.suggestion_code = line.slice('- Suggestion Code:'.length).trim() || null;
      continue;
    }

    if (line.startsWith('- Trace ID:')) {
      const traceId = line.slice('- Trace ID:'.length).trim();
      currentTask.trace_id = traceId && traceId !== 'n/a' ? traceId : null;
      continue;
    }

    if (line.startsWith('- Scene Ref:')) {
      currentTask.scene_ref = line.slice('- Scene Ref:'.length).trim() || null;
      continue;
    }

    if (line.startsWith('- Planned Action:')) {
      currentTask.planned_action = line.slice('- Planned Action:'.length).trim() || null;
      continue;
    }

    const normalizedChecklistLine = line.replace(/^-\s*\[[ xX~-]\]\s*/, '- ');

    if (normalizedChecklistLine.startsWith('- Status:')) {
      const statusValue = normalizedChecklistLine.slice('- Status:'.length).trim();
      currentTask.status = normalizeFeedbackStatus(statusValue);
      continue;
    }

    if (normalizedChecklistLine.startsWith('- Owner:')) {
      const ownerValue = normalizedChecklistLine.slice('- Owner:'.length).trim();
      currentTask.owner = ownerValue || null;
      continue;
    }

    if (normalizedChecklistLine.startsWith('- Evidence Paths:')) {
      const evidencePathsValue = normalizedChecklistLine.slice('- Evidence Paths:'.length).trim();
      currentTask.evidence_paths = evidencePathsValue || null;
      continue;
    }

    if (normalizedChecklistLine.startsWith('- Completion Notes:')) {
      const completionNotesValue = normalizedChecklistLine.slice('- Completion Notes:'.length).trim();
      currentTask.completion_notes = completionNotesValue || null;
      continue;
    }

    const cycleMatch = line.match(/^[-*]\s*cycle_time_ms:\s*(.*)$/i);
    if (cycleMatch) {
      currentTask.eval_update.cycle_time_ms = parseFeedbackNumber(cycleMatch[1]);
      continue;
    }

    const policyMatch = line.match(/^[-*]\s*policy_violation_count:\s*(.*)$/i);
    if (policyMatch) {
      currentTask.eval_update.policy_violation_count = parseFeedbackNumber(policyMatch[1]);
      continue;
    }

    const nodeFailureMatch = line.match(/^[-*]\s*node_failure_count:\s*(.*)$/i);
    if (nodeFailureMatch) {
      currentTask.eval_update.node_failure_count = parseFeedbackNumber(nodeFailureMatch[1]);
      continue;
    }

    const manualTakeoverMatch = line.match(/^[-*]\s*manual_takeover_rate:\s*(.*)$/i);
    if (manualTakeoverMatch) {
      currentTask.eval_update.manual_takeover_rate = parseFeedbackNumber(manualTakeoverMatch[1]);
    }
  }

  pushTask();
  return feedback;
}

function averageOrNull(values) {
  const numericValues = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (numericValues.length === 0) {
    return null;
  }

  const sum = numericValues.reduce((acc, current) => acc + current, 0);
  return Number((sum / numericValues.length).toFixed(3));
}

function buildFeedbackTaskSummary(tasks = []) {
  const summary = {
    total: tasks.length,
    done: 0,
    in_progress: 0,
    pending: 0,
    blocked: 0,
    unknown: 0,
    completion_rate: 0,
    blocked_rate: 0,
    evidence_coverage_rate: 0
  };

  if (tasks.length === 0) {
    return summary;
  }

  let evidenceCount = 0;

  for (const task of tasks) {
    const status = task && task.status ? task.status : 'unknown';

    if (Object.prototype.hasOwnProperty.call(summary, status)) {
      summary[status] += 1;
    } else {
      summary.unknown += 1;
    }

    if (task && task.evidence_paths) {
      evidenceCount += 1;
    }
  }

  summary.completion_rate = Number((summary.done / tasks.length).toFixed(3));
  summary.blocked_rate = Number((summary.blocked / tasks.length).toFixed(3));
  summary.evidence_coverage_rate = Number((evidenceCount / tasks.length).toFixed(3));

  return summary;
}

function buildFeedbackMetricSummary(tasks = []) {
  const cycleTimes = [];
  const policyViolations = [];
  const nodeFailures = [];
  const manualTakeoverRates = [];

  for (const task of tasks) {
    if (!task || !task.eval_update) {
      continue;
    }

    cycleTimes.push(task.eval_update.cycle_time_ms);
    policyViolations.push(task.eval_update.policy_violation_count);
    nodeFailures.push(task.eval_update.node_failure_count);
    manualTakeoverRates.push(task.eval_update.manual_takeover_rate);
  }

  return {
    avg_cycle_time_ms: averageOrNull(cycleTimes),
    avg_policy_violation_count: averageOrNull(policyViolations),
    avg_node_failure_count: averageOrNull(nodeFailures),
    avg_manual_takeover_rate: averageOrNull(manualTakeoverRates)
  };
}

function evaluateFeedbackScore(taskSummary, metricSummary, target = {}) {
  if (!taskSummary || taskSummary.total === 0) {
    return {
      score: null,
      recommendations: ['No feedback tasks found. Sync doctor tasks and fill feedback template before evaluation.']
    };
  }

  let score = 1;
  const recommendations = [];

  const minCompletionRate = typeof target.min_completion_rate === 'number' ? target.min_completion_rate : 0.8;
  const maxBlockedRate = typeof target.max_blocked_rate === 'number' ? target.max_blocked_rate : 0;
  const maxPolicyViolationCount = typeof target.max_policy_violation_count === 'number' ? target.max_policy_violation_count : 0;
  const maxNodeFailureCount = typeof target.max_node_failure_count === 'number' ? target.max_node_failure_count : 0;
  const maxManualTakeoverRate = typeof target.max_manual_takeover_rate === 'number' ? target.max_manual_takeover_rate : 0.2;
  const maxCycleTimeMs = typeof target.max_cycle_time_ms === 'number' ? target.max_cycle_time_ms : null;

  if (taskSummary.completion_rate < minCompletionRate) {
    score -= 0.2;
    recommendations.push(`Increase completion rate to at least ${minCompletionRate}.`);
  }

  if (taskSummary.blocked_rate > maxBlockedRate) {
    score -= 0.2;
    recommendations.push(`Reduce blocked task rate to ${maxBlockedRate} or lower.`);
  }

  if (
    typeof metricSummary.avg_policy_violation_count === 'number'
    && metricSummary.avg_policy_violation_count > maxPolicyViolationCount
  ) {
    score -= 0.2;
    recommendations.push('Lower average policy_violation_count in feedback records.');
  }

  if (
    typeof metricSummary.avg_node_failure_count === 'number'
    && metricSummary.avg_node_failure_count > maxNodeFailureCount
  ) {
    score -= 0.2;
    recommendations.push('Lower average node_failure_count in feedback records.');
  }

  if (
    typeof metricSummary.avg_manual_takeover_rate === 'number'
    && metricSummary.avg_manual_takeover_rate > maxManualTakeoverRate
  ) {
    score -= 0.1;
    recommendations.push(`Reduce manual_takeover_rate to ${maxManualTakeoverRate} or lower.`);
  }

  if (
    typeof maxCycleTimeMs === 'number'
    && typeof metricSummary.avg_cycle_time_ms === 'number'
    && metricSummary.avg_cycle_time_ms > maxCycleTimeMs
  ) {
    score -= 0.1;
    recommendations.push(`Reduce cycle_time_ms to ${maxCycleTimeMs} or lower.`);
  }

  return {
    score: Math.max(0, Number(score.toFixed(2))),
    recommendations
  };
}

function classifyEvalGrade(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return 'insufficient_data';
  }

  if (score >= 0.85) {
    return 'good';
  }

  if (score >= 0.7) {
    return 'watch';
  }

  if (score >= 0.5) {
    return 'at_risk';
  }

  return 'critical';
}

function normalizeTaskPriority(priority, fallback = 'medium') {
  const normalized = String(priority || '').trim().toLowerCase();
  if (TASK_PRIORITIES.has(normalized)) {
    return normalized;
  }

  return fallback;
}

function cloneDefaultEvalTaskSyncPolicy() {
  return JSON.parse(JSON.stringify(DEFAULT_EVAL_TASK_SYNC_POLICY));
}

function cloneDefaultEvalProfileInferenceRules() {
  return JSON.parse(JSON.stringify(DEFAULT_EVAL_PROFILE_INFERENCE_RULES));
}

function cloneDefaultSceneRoutePolicy() {
  return JSON.parse(JSON.stringify(DEFAULT_SCENE_ROUTE_POLICY));
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function mergePlainObject(base = {}, override = {}) {
  const next = { ...(isPlainObject(base) ? base : {}) };

  if (!isPlainObject(override)) {
    return next;
  }

  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(next[key])) {
      next[key] = mergePlainObject(next[key], value);
      continue;
    }

    next[key] = value;
  }

  return next;
}

function normalizeRoutePolicyNumber(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return fallback;
}

function normalizeSceneRoutePolicy(policy = {}) {
  const merged = cloneDefaultSceneRoutePolicy();

  if (!isPlainObject(policy)) {
    return merged;
  }

  if (isPlainObject(policy.weights)) {
    for (const [key, fallback] of Object.entries(merged.weights)) {
      if (Object.prototype.hasOwnProperty.call(policy.weights, key)) {
        merged.weights[key] = normalizeRoutePolicyNumber(policy.weights[key], fallback);
      }
    }
  }

  if (isPlainObject(policy.mode_bias) && isPlainObject(policy.mode_bias.commit)) {
    const commitBias = policy.mode_bias.commit;
    for (const [riskLevel, fallback] of Object.entries(merged.mode_bias.commit)) {
      if (Object.prototype.hasOwnProperty.call(commitBias, riskLevel)) {
        merged.mode_bias.commit[riskLevel] = normalizeRoutePolicyNumber(commitBias[riskLevel], fallback);
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(policy, 'max_alternatives')) {
    const normalizedMaxAlternatives = Math.max(0, Math.trunc(normalizeRoutePolicyNumber(policy.max_alternatives, merged.max_alternatives)));
    merged.max_alternatives = normalizedMaxAlternatives;
  }

  return merged;
}

function createSceneRoutePolicyTemplateByProfile(profile = 'default') {
  const normalizedProfile = String(profile || '').trim().toLowerCase();
  const base = cloneDefaultSceneRoutePolicy();

  const profilePatches = {
    erp: {
      weights: {
        query_token_match: 7
      },
      max_alternatives: 5
    },
    hybrid: {
      weights: {
        query_token_match: 10
      },
      mode_bias: {
        commit: {
          high: -8,
          critical: -10
        }
      },
      max_alternatives: 6
    },
    robot: {
      weights: {
        query_token_match: 10
      },
      mode_bias: {
        commit: {
          medium: -2,
          high: -10,
          critical: -12
        }
      },
      max_alternatives: 6
    }
  };

  if (!Object.prototype.hasOwnProperty.call(profilePatches, normalizedProfile)) {
    return base;
  }

  return normalizeSceneRoutePolicy(mergePlainObject(base, profilePatches[normalizedProfile]));
}

async function loadSceneRoutePolicy(options = {}, projectRoot, fileSystem = fs) {
  const defaultPolicy = cloneDefaultSceneRoutePolicy();

  if (!options.routePolicy) {
    return {
      policy: defaultPolicy,
      source: 'default'
    };
  }

  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);

  const routePolicyPath = resolvePath(projectRoot, options.routePolicy);
  const routePolicyRaw = await readJson(routePolicyPath);

  if (!isPlainObject(routePolicyRaw)) {
    throw new Error('route policy file must contain a JSON object');
  }

  return {
    policy: normalizeSceneRoutePolicy(mergePlainObject(defaultPolicy, routePolicyRaw)),
    source: options.routePolicy
  };
}

function incrementCounter(counter, key) {
  if (!counter || typeof counter !== 'object') {
    return;
  }

  counter[key] = (counter[key] || 0) + 1;
}

function normalizeRoutePolicySuggestGrade(rawGrade) {
  const normalized = String(rawGrade || '').trim().toLowerCase();
  switch (normalized) {
    case 'good':
    case 'watch':
    case 'at_risk':
    case 'critical':
    case 'insufficient_data':
      return normalized;
    default:
      return 'unknown';
  }
}

function normalizeRoutePolicySuggestRunStatus(rawStatus) {
  const normalized = String(rawStatus || '').trim().toLowerCase();
  switch (normalized) {
    case 'success':
    case 'denied':
    case 'failed':
    case 'blocked':
      return normalized;
    default:
      return 'unknown';
  }
}

function normalizeRoutePolicySuggestProfileName(rawProfile) {
  const normalized = String(rawProfile || '').trim().toLowerCase();

  if (ROUTE_POLICY_TEMPLATE_PROFILES.has(normalized)) {
    return normalized;
  }

  if (normalized === 'ops') {
    return 'hybrid';
  }

  return null;
}

function inferRoutePolicySuggestProfile(report = {}) {
  const inputProfile = normalizeRoutePolicySuggestProfileName(report && report.inputs ? report.inputs.profile : null);
  if (inputProfile) {
    return inputProfile;
  }

  const sceneRef = String(report.scene_ref || '').trim().toLowerCase();
  if (!sceneRef) {
    return 'default';
  }

  const firstDomain = sceneRef.split(/[.]/).slice(1, 2)[0];
  const inferredFromSceneRef = normalizeRoutePolicySuggestProfileName(firstDomain);
  if (inferredFromSceneRef) {
    return inferredFromSceneRef;
  }

  if (sceneRef.includes('.hybrid.') || sceneRef.includes('.robot.')) {
    return 'hybrid';
  }

  if (sceneRef.includes('.erp.')) {
    return 'erp';
  }

  return 'default';
}

function resolveDominantRoutePolicySuggestProfile(profileCounts = {}) {
  const profileOrder = ['erp', 'hybrid', 'robot', 'default'];
  let selected = 'default';
  let selectedCount = 0;

  for (const profile of profileOrder) {
    const count = Number(profileCounts[profile] || 0);
    if (count > selectedCount) {
      selected = profile;
      selectedCount = count;
    }
  }

  return selected;
}

function summarizeSceneRoutePolicySuggestReports(evalReports = []) {
  const gradeCounts = {
    good: 0,
    watch: 0,
    at_risk: 0,
    critical: 0,
    insufficient_data: 0,
    unknown: 0
  };
  const runStatusCounts = {
    success: 0,
    denied: 0,
    failed: 0,
    blocked: 0,
    unknown: 0
  };
  const profileCounts = {
    default: 0,
    erp: 0,
    hybrid: 0,
    robot: 0
  };
  const recommendationSignals = {
    policy_denial: 0,
    runtime_failure: 0,
    manual_takeover: 0
  };

  for (const item of evalReports) {
    const report = item && item.report && typeof item.report === 'object'
      ? item.report
      : {};

    const grade = normalizeRoutePolicySuggestGrade(report && report.overall ? report.overall.grade : null);
    incrementCounter(gradeCounts, grade);

    const runStatus = normalizeRoutePolicySuggestRunStatus(report && report.run_evaluation ? report.run_evaluation.status : null);
    incrementCounter(runStatusCounts, runStatus);

    const profile = inferRoutePolicySuggestProfile(report);
    incrementCounter(profileCounts, profile);

    const recommendations = report && report.overall && Array.isArray(report.overall.recommendations)
      ? report.overall.recommendations
      : [];

    for (const recommendation of recommendations) {
      const normalized = String(recommendation || '').toLowerCase();
      if (!normalized) {
        continue;
      }

      if (/policy denial|denied/.test(normalized)) {
        recommendationSignals.policy_denial += 1;
      }

      if (/failed runtime|node failure|compensation/.test(normalized)) {
        recommendationSignals.runtime_failure += 1;
      }

      if (/manual takeover|manual_takeover/.test(normalized)) {
        recommendationSignals.manual_takeover += 1;
      }
    }
  }

  const totalReports = evalReports.length;
  const safeDivisor = totalReports > 0 ? totalReports : 1;
  const severeCount = gradeCounts.critical + gradeCounts.at_risk;
  const unstableCount = runStatusCounts.failed + runStatusCounts.denied;

  return {
    total_reports: totalReports,
    grade_counts: gradeCounts,
    run_status_counts: runStatusCounts,
    profile_counts: profileCounts,
    dominant_profile: resolveDominantRoutePolicySuggestProfile(profileCounts),
    recommendation_signals: recommendationSignals,
    rates: {
      severe_rate: Number((severeCount / safeDivisor).toFixed(2)),
      unstable_rate: Number((unstableCount / safeDivisor).toFixed(2)),
      insufficient_rate: Number((gradeCounts.insufficient_data / safeDivisor).toFixed(2)),
      good_rate: Number((gradeCounts.good / safeDivisor).toFixed(2)),
      denied_rate: Number((runStatusCounts.denied / safeDivisor).toFixed(2)),
      failed_rate: Number((runStatusCounts.failed / safeDivisor).toFixed(2))
    }
  };
}

function clampRoutePolicyValue(value, minimum, maximum) {
  let nextValue = value;

  if (Number.isFinite(minimum)) {
    nextValue = Math.max(minimum, nextValue);
  }

  if (Number.isFinite(maximum)) {
    nextValue = Math.min(maximum, nextValue);
  }

  return nextValue;
}

function getObjectValueByPath(target, pathKey) {
  if (!target || typeof target !== 'object' || typeof pathKey !== 'string') {
    return undefined;
  }

  const parts = pathKey.split('.');
  let cursor = target;

  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || !Object.prototype.hasOwnProperty.call(cursor, part)) {
      return undefined;
    }

    cursor = cursor[part];
  }

  return cursor;
}

function setObjectValueByPath(target, pathKey, value) {
  if (!target || typeof target !== 'object' || typeof pathKey !== 'string') {
    return;
  }

  const parts = pathKey.split('.');
  let cursor = target;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!cursor[part] || typeof cursor[part] !== 'object') {
      cursor[part] = {};
    }

    cursor = cursor[part];
  }

  cursor[parts[parts.length - 1]] = value;
}

function applyRoutePolicyDelta(policy, pathKey, delta, metadata = {}) {
  if (!Number.isFinite(delta) || delta === 0) {
    return null;
  }

  const fallback = Object.prototype.hasOwnProperty.call(metadata, 'fallback') ? metadata.fallback : 0;
  const currentValue = normalizeRoutePolicyNumber(getObjectValueByPath(policy, pathKey), fallback);
  let nextValue = currentValue + delta;

  if (metadata.integer === true) {
    nextValue = Math.trunc(nextValue);
  }

  nextValue = clampRoutePolicyValue(nextValue, metadata.min, metadata.max);

  if (nextValue === currentValue) {
    return null;
  }

  setObjectValueByPath(policy, pathKey, nextValue);

  return {
    path: pathKey,
    from: currentValue,
    to: nextValue,
    delta: Number((nextValue - currentValue).toFixed(2)),
    rationale: metadata.rationale || null
  };
}

function buildSceneRoutePolicySuggestion(basePolicy, reportSummary, options = {}) {
  const suggestedPolicy = normalizeSceneRoutePolicy(basePolicy);
  const maxAdjustment = Math.max(0, Math.trunc(normalizeRoutePolicyNumber(
    options.maxAdjustment,
    ROUTE_POLICY_SUGGEST_MAX_ADJUSTMENT_DEFAULT
  )));

  const summary = reportSummary && typeof reportSummary === 'object'
    ? reportSummary
    : summarizeSceneRoutePolicySuggestReports([]);

  const rates = summary.rates || {};
  const recommendationSignals = summary.recommendation_signals || {};
  const totalReports = Number(summary.total_reports || 0);

  const deltaByPath = new Map();
  const reasonsByPath = new Map();

  const queueDelta = (pathKey, delta, reason) => {
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }

    deltaByPath.set(pathKey, (deltaByPath.get(pathKey) || 0) + delta);

    if (reason) {
      const reasons = reasonsByPath.get(pathKey) || [];
      reasons.push(reason);
      reasonsByPath.set(pathKey, reasons);
    }
  };

  const stepFromRate = (rate, multiplier = 1) => {
    if (maxAdjustment <= 0) {
      return 0;
    }

    const normalizedRate = Math.max(0, normalizeRoutePolicyNumber(rate, 0));
    if (normalizedRate <= 0) {
      return 0;
    }

    return Math.max(1, Math.min(maxAdjustment, Math.ceil(normalizedRate * maxAdjustment * multiplier)));
  };

  const severeRate = Math.max(0, normalizeRoutePolicyNumber(rates.severe_rate, 0));
  const unstableRate = Math.max(0, normalizeRoutePolicyNumber(rates.unstable_rate, 0));
  const insufficientRate = Math.max(0, normalizeRoutePolicyNumber(rates.insufficient_rate, 0));
  const goodRate = Math.max(0, normalizeRoutePolicyNumber(rates.good_rate, 0));

  const stressRate = Math.max(severeRate, unstableRate);
  if (stressRate >= 0.2) {
    const stressStep = stepFromRate(stressRate, 1);
    if (stressStep > 0) {
      const rationale = `stress_rate=${stressRate}`;
      queueDelta('mode_bias.commit.high', -stressStep, rationale);
      queueDelta('mode_bias.commit.critical', -Math.min(maxAdjustment, stressStep + 1), rationale);
      queueDelta('weights.scene_ref_mismatch', -Math.max(1, Math.ceil(stressStep / 2)), rationale);
      queueDelta('weights.invalid_manifest', -Math.max(1, Math.ceil(stressStep / 2)), rationale);
    }
  }

  if (insufficientRate >= 0.3) {
    const discoveryStep = stepFromRate(insufficientRate, 0.8);
    if (discoveryStep > 0) {
      const rationale = `insufficient_rate=${insufficientRate}`;
      queueDelta('weights.query_token_match', discoveryStep, rationale);
      queueDelta('max_alternatives', Math.max(1, Math.ceil(discoveryStep / 2)), rationale);
    }
  }

  if (goodRate >= 0.65 && stressRate <= 0.2 && insufficientRate <= 0.25) {
    const precisionStep = stepFromRate(goodRate, 0.6);
    if (precisionStep > 0) {
      const rationale = `good_rate=${goodRate}`;
      queueDelta('weights.scene_ref_exact', precisionStep, rationale);
      queueDelta('weights.scene_ref_contains', Math.max(1, Math.ceil(precisionStep / 2)), rationale);
      queueDelta('max_alternatives', -1, rationale);
    }
  }

  const policyDenialRate = totalReports > 0
    ? Number((recommendationSignals.policy_denial / totalReports).toFixed(2))
    : 0;
  if (policyDenialRate >= 0.15) {
    const denialStep = stepFromRate(policyDenialRate, 0.8);
    if (denialStep > 0) {
      queueDelta('mode_bias.commit.medium', -denialStep, `policy_denial_rate=${policyDenialRate}`);
    }
  }

  const runtimeFailureSignalRate = totalReports > 0
    ? Number((recommendationSignals.runtime_failure / totalReports).toFixed(2))
    : 0;
  if (runtimeFailureSignalRate >= 0.15) {
    const failureStep = stepFromRate(runtimeFailureSignalRate, 0.7);
    if (failureStep > 0) {
      queueDelta('weights.scene_ref_mismatch', -Math.max(1, Math.ceil(failureStep / 2)), `runtime_failure_signal_rate=${runtimeFailureSignalRate}`);
    }
  }

  const boundsByPath = {
    'weights.valid_manifest': { min: -200, max: 200, fallback: 5 },
    'weights.invalid_manifest': { min: -200, max: 200, fallback: -10 },
    'weights.scene_ref_exact': { min: -200, max: 200, fallback: 100 },
    'weights.scene_ref_contains': { min: -200, max: 200, fallback: 45 },
    'weights.scene_ref_mismatch': { min: -200, max: 200, fallback: -20 },
    'weights.query_token_match': { min: -200, max: 200, fallback: 8 },
    'mode_bias.commit.low': { min: -50, max: 50, fallback: 2 },
    'mode_bias.commit.medium': { min: -50, max: 50, fallback: 0 },
    'mode_bias.commit.high': { min: -50, max: 50, fallback: -5 },
    'mode_bias.commit.critical': { min: -50, max: 50, fallback: -5 },
    max_alternatives: { min: 0, max: 12, fallback: 4, integer: true }
  };

  const adjustments = [];
  for (const [pathKey, delta] of deltaByPath.entries()) {
    const reasons = Array.from(new Set(reasonsByPath.get(pathKey) || []));
    const adjustment = applyRoutePolicyDelta(suggestedPolicy, pathKey, delta, {
      ...(boundsByPath[pathKey] || {}),
      rationale: reasons.join('; ') || null
    });

    if (adjustment) {
      adjustments.push(adjustment);
    }
  }

  return {
    max_adjustment: maxAdjustment,
    adjustments,
    suggested_policy: normalizeSceneRoutePolicy(suggestedPolicy)
  };
}

function formatSceneRoutePolicySuggestSourcePath(projectRoot, absolutePath) {
  const normalizedRelative = normalizeRelativePath(path.relative(projectRoot, absolutePath));
  if (normalizedRelative && !normalizedRelative.startsWith('..')) {
    return normalizedRelative;
  }

  return normalizeRelativePath(absolutePath);
}

async function resolveSceneRoutePolicySuggestEvalPaths(options, projectRoot, fileSystem = fs) {
  const readdir = typeof fileSystem.readdir === 'function'
    ? fileSystem.readdir.bind(fileSystem)
    : fs.readdir.bind(fs);

  const collected = [];

  for (const evalPath of options.eval || []) {
    collected.push(resolvePath(projectRoot, evalPath));
  }

  if (options.evalDir) {
    const evalDirPath = resolvePath(projectRoot, options.evalDir);
    let entries = [];

    try {
      entries = await readdir(evalDirPath, { withFileTypes: true });
    } catch (error) {
      throw new Error(`failed to read eval directory: ${evalDirPath} (${error.message})`);
    }

    for (const entry of entries) {
      const entryName = typeof entry === 'string' ? entry : entry && entry.name ? entry.name : null;
      if (!entryName || !entryName.toLowerCase().endsWith('.json')) {
        continue;
      }

      const isFileEntry = typeof entry === 'string'
        ? true
        : (typeof entry.isFile === 'function' ? entry.isFile() : true);

      if (!isFileEntry) {
        continue;
      }

      collected.push(path.join(evalDirPath, entryName));
    }
  }

  const deduped = [];
  const seen = new Set();

  for (const candidate of collected) {
    const normalizedCandidate = normalizeRelativePath(candidate);
    const dedupeKey = process.platform === 'win32'
      ? normalizedCandidate.toLowerCase()
      : normalizedCandidate;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    deduped.push(candidate);
  }

  if (deduped.length === 0) {
    throw new Error('no eval report JSON files resolved from current options');
  }

  return deduped;
}

async function loadSceneRoutePolicySuggestReports(reportPaths, fileSystem = fs) {
  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);

  const reports = [];

  for (const reportPath of reportPaths) {
    const reportPayload = await readJson(reportPath);

    if (!isPlainObject(reportPayload)) {
      throw new Error(`eval report must contain a JSON object: ${reportPath}`);
    }

    reports.push({
      sourcePath: reportPath,
      report: reportPayload
    });
  }

  return reports;
}

async function loadSceneRoutePolicySuggestBaseline(options = {}, projectRoot, reportSummary, fileSystem = fs) {
  if (!options.routePolicy) {
    let resolvedProfile = options.profile || 'default';
    let source = `profile:${resolvedProfile}`;

    if (resolvedProfile === 'default') {
      const dominantProfile = reportSummary && reportSummary.dominant_profile
        ? String(reportSummary.dominant_profile).trim().toLowerCase()
        : 'default';

      if (ROUTE_POLICY_TEMPLATE_PROFILES.has(dominantProfile) && dominantProfile !== 'default') {
        resolvedProfile = dominantProfile;
        source = `profile:auto:${resolvedProfile}`;
      }
    }

    return {
      policy: createSceneRoutePolicyTemplateByProfile(resolvedProfile),
      source,
      profile: resolvedProfile
    };
  }

  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);

  const routePolicyPath = resolvePath(projectRoot, options.routePolicy);
  const routePolicyRaw = await readJson(routePolicyPath);

  if (!isPlainObject(routePolicyRaw)) {
    throw new Error('route policy file must contain a JSON object');
  }

  return {
    policy: normalizeSceneRoutePolicy(mergePlainObject(cloneDefaultSceneRoutePolicy(), routePolicyRaw)),
    source: options.routePolicy,
    profile: options.profile || 'default'
  };
}

function sanitizeSceneRoutePolicyRolloutName(rawName = '') {
  return String(rawName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveSceneRoutePolicyRolloutName(explicitName, generatedAt = new Date().toISOString()) {
  const normalizedExplicit = sanitizeSceneRoutePolicyRolloutName(explicitName || '');
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  const timestamp = String(generatedAt || '')
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);

  const fallbackTimestamp = timestamp || `${Date.now()}`;
  return `route-policy-${fallbackTimestamp}`;
}

function collectSceneRoutePolicyDiff(baselinePolicy = {}, candidatePolicy = {}) {
  const normalizedBaseline = normalizeSceneRoutePolicy(mergePlainObject(cloneDefaultSceneRoutePolicy(), baselinePolicy));
  const normalizedCandidate = normalizeSceneRoutePolicy(mergePlainObject(cloneDefaultSceneRoutePolicy(), candidatePolicy));

  const changes = [];

  for (const pathKey of SCENE_ROUTE_POLICY_DIFF_KEYS) {
    const baselineValueRaw = getObjectValueByPath(normalizedBaseline, pathKey);
    const candidateValueRaw = getObjectValueByPath(normalizedCandidate, pathKey);

    const fallback = 0;
    const baselineValue = pathKey === 'max_alternatives'
      ? Math.trunc(normalizeRoutePolicyNumber(baselineValueRaw, fallback))
      : normalizeRoutePolicyNumber(baselineValueRaw, fallback);
    const candidateValue = pathKey === 'max_alternatives'
      ? Math.trunc(normalizeRoutePolicyNumber(candidateValueRaw, fallback))
      : normalizeRoutePolicyNumber(candidateValueRaw, fallback);

    if (baselineValue === candidateValue) {
      continue;
    }

    const deltaValue = candidateValue - baselineValue;

    changes.push({
      path: pathKey,
      from: baselineValue,
      to: candidateValue,
      delta: pathKey === 'max_alternatives'
        ? deltaValue
        : Number(deltaValue.toFixed(2))
    });
  }

  return changes;
}

function buildSceneRoutePolicyRolloutCommands(targetPolicyPath, candidatePolicyPath, rollbackPolicyPath) {
  return {
    verify_candidate_route: `sce scene route --query routing --mode dry_run --route-policy ${candidatePolicyPath}`,
    verify_target_route: `sce scene route --query routing --mode dry_run --route-policy ${targetPolicyPath}`,
    apply: `Replace ${targetPolicyPath} with ${candidatePolicyPath} after verification.`,
    rollback: `Replace ${targetPolicyPath} with ${rollbackPolicyPath} if regression appears.`
  };
}

function buildSceneRoutePolicyRolloutRunbook(payload) {
  const lines = [
    '# Scene Route Policy Rollout Runbook',
    '',
    `- Rollout: ${payload.rollout_name}`,
    `- Generated: ${payload.generated_at}`,
    `- Suggestion Source: ${payload.source_suggestion}`,
    `- Target Policy: ${payload.target_policy_path}`,
    `- Changed Fields: ${payload.summary.changed_fields}`,
    '',
    '## Verification Commands',
    '',
    `1. ${payload.commands.verify_target_route}`,
    `2. ${payload.commands.verify_candidate_route}`,
    '',
    '## Apply and Rollback',
    '',
    `- Apply: ${payload.commands.apply}`,
    `- Rollback: ${payload.commands.rollback}`,
    ''
  ];

  if (Array.isArray(payload.changed_fields) && payload.changed_fields.length > 0) {
    lines.push('## Changed Fields', '');

    for (const item of payload.changed_fields) {
      lines.push(`- ${item.path}: ${item.from} -> ${item.to} (delta=${item.delta})`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

function sanitizeScenePackageName(rawValue = '') {
  return String(rawValue || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deriveScenePackageName(options = {}) {
  if (options.name) {
    return sanitizeScenePackageName(options.name);
  }

  if (options.spec) {
    return sanitizeScenePackageName(String(options.spec).replace(/^\d{2}-\d{2}-/, ''));
  }

  if (options.out) {
    const parsed = path.parse(options.out);
    if (parsed.name) {
      return sanitizeScenePackageName(parsed.name.replace(/^scene-package$/, 'scene-template'));
    }
  }

  return 'scene-template';
}

function buildScenePackageCoordinate(contract = {}) {
  const metadata = isPlainObject(contract.metadata) ? contract.metadata : {};
  const group = String(metadata.group || '').trim();
  const name = String(metadata.name || '').trim();
  const version = String(metadata.version || '').trim();

  if (!group || !name || !version) {
    return null;
  }

  return `${group}/${name}@${version}`;
}

function buildScenePackagePublishTemplateManifest(packageContract = {}, context = {}) {
  const artifacts = isPlainObject(packageContract.artifacts) ? packageContract.artifacts : {};
  const compatibility = isPlainObject(packageContract.compatibility) ? packageContract.compatibility : {};
  const minSceVersion = String(compatibility.min_sce_version || '').trim();

  return {
    apiVersion: SCENE_PACKAGE_TEMPLATE_API_VERSION,
    kind: 'scene-package-template',
    metadata: {
      template_id: context.templateId || null,
      source_spec: context.spec || null,
      package_coordinate: buildScenePackageCoordinate(packageContract),
      package_kind: packageContract.kind || null,
      published_at: context.publishedAt || new Date().toISOString()
    },
    compatibility: {
      min_sce_version: minSceVersion || '>=1.24.0',
      scene_api_version: String(compatibility.scene_api_version || '').trim() || 'sce.scene/v0.2'
    },
    parameters: Array.isArray(packageContract.parameters)
      ? JSON.parse(JSON.stringify(packageContract.parameters))
      : [],
    template: {
      package_contract: 'scene-package.json',
      scene_manifest: 'scene.template.yaml'
    },
    artifacts: {
      entry_scene: String(artifacts.entry_scene || 'custom/scene.yaml') || 'custom/scene.yaml',
      generates: Array.isArray(artifacts.generates)
        ? artifacts.generates.filter((item) => typeof item === 'string' && item.trim().length > 0)
        : []
    }
  };
}

function createScenePackageTemplate(options = {}) {
  const packageName = deriveScenePackageName(options);
  const kind = SCENE_PACKAGE_KINDS.has(options.kind) ? options.kind : 'scene-template';
  const group = options.group || 'sce.scene';
  const version = options.version || '0.1.0';

  return {
    apiVersion: SCENE_PACKAGE_API_VERSION,
    kind,
    metadata: {
      group,
      name: packageName || 'scene-template',
      version,
      summary: `Template contract for ${packageName || 'scene-template'}`
    },
    compatibility: {
      min_sce_version: '>=1.24.0',
      scene_api_version: 'sce.scene/v0.2',
      moqui_model_version: '3.x',
      adapter_api_version: 'v1'
    },
    capabilities: {
      provides: [
        `scene.${kind}.core`
      ],
      requires: [
        'binding:http',
        'profile:erp'
      ]
    },
    parameters: [
      {
        id: 'entity_name',
        type: 'string',
        required: true,
        description: 'Primary entity name for generated scene flow'
      },
      {
        id: 'service_name',
        type: 'string',
        required: false,
        default: 'queryService',
        description: 'Optional service binding reference'
      }
    ],
    artifacts: {
      entry_scene: 'custom/scene.yaml',
      generates: [
        'requirements.md',
        'design.md',
        'tasks.md',
        'custom/scene.yaml'
      ]
    },
    governance: {
      risk_level: 'low',
      approval_required: false,
      rollback_supported: true
    }
  };
}

function resolveScenePackageTemplateOutputPath(options = {}, projectRoot = process.cwd()) {
  if (options.spec) {
    return path.join(projectRoot, '.sce', 'specs', options.spec, options.out);
  }

  return resolvePath(projectRoot, options.out);
}

function resolveScenePackageValidateInputPath(options = {}, projectRoot = process.cwd()) {
  if (options.spec) {
    return path.join(projectRoot, '.sce', 'specs', options.spec, options.specPackage);
  }

  return resolvePath(projectRoot, options.packagePath);
}

function deriveScenePackagePublishSourceFromManifestEntry(entry = {}) {
  const extractSpecRelative = (rawPath) => {
    const normalized = normalizeRelativePath(rawPath);
    if (!normalized) {
      return null;
    }
    const marker = '.sce/specs/';
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex < 0) {
      return null;
    }
    const suffix = normalized.slice(markerIndex + marker.length);
    const firstSlash = suffix.indexOf('/');
    if (firstSlash < 0) {
      return null;
    }

    const spec = suffix.slice(0, firstSlash).trim();
    const relativePath = suffix.slice(firstSlash + 1).trim();
    if (!spec || !relativePath) {
      return null;
    }

    return {
      spec,
      relativePath: normalizeRelativePath(relativePath) || relativePath
    };
  };

  const explicitSpec = String(entry.id || entry.spec || '').trim();
  const packageSource = extractSpecRelative(entry.scene_package);
  const manifestSource = extractSpecRelative(entry.scene_manifest);
  const spec = explicitSpec || (packageSource ? packageSource.spec : '') || (manifestSource ? manifestSource.spec : '');

  let specPackage = packageSource ? packageSource.relativePath : null;
  let sceneManifest = manifestSource ? manifestSource.relativePath : null;

  if (spec && packageSource && packageSource.spec !== spec) {
    specPackage = null;
  }
  if (spec && manifestSource && manifestSource.spec !== spec) {
    sceneManifest = null;
  }

  return {
    spec: spec || null,
    specPackage,
    sceneManifest
  };
}

function resolveManifestSpecEntries(manifest = {}, rawSpecPath = 'specs') {
  const specPath = typeof rawSpecPath === 'string' ? rawSpecPath.trim() : '';
  if (!specPath) {
    return null;
  }

  const pathSegments = specPath
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (pathSegments.length === 0) {
    return null;
  }

  let cursor = manifest;
  for (const segment of pathSegments) {
    if (!cursor || typeof cursor !== 'object' || !Object.prototype.hasOwnProperty.call(cursor, segment)) {
      return null;
    }
    cursor = cursor[segment];
  }

  if (!Array.isArray(cursor)) {
    return null;
  }

  return cursor;
}

function resolveScenePackageTemplateLibraryPath(options = {}, projectRoot = process.cwd()) {
  return resolvePath(projectRoot, options.outDir);
}

function resolveScenePackageTemplateManifestPath(options = {}, projectRoot = process.cwd()) {
  return resolvePath(projectRoot, options.template);
}

function resolveScenePackageInstantiateValuesPath(options = {}, projectRoot = process.cwd()) {
  if (!options.values) {
    return null;
  }

  return resolvePath(projectRoot, options.values);
}

function formatScenePackagePath(projectRoot, absolutePath) {
  const normalizedRelative = normalizeRelativePath(path.relative(projectRoot, absolutePath));
  if (normalizedRelative && !normalizedRelative.startsWith('..')) {
    return normalizedRelative;
  }

  return normalizeRelativePath(absolutePath);
}

function validateScenePackageTemplateManifest(templateManifest = {}) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(templateManifest)) {
    return {
      valid: false,
      errors: ['template manifest must be a JSON object'],
      warnings
    };
  }

  if (templateManifest.apiVersion !== SCENE_PACKAGE_TEMPLATE_API_VERSION) {
    errors.push(`apiVersion must be ${SCENE_PACKAGE_TEMPLATE_API_VERSION}`);
  }

  if (String(templateManifest.kind || '').trim() !== 'scene-package-template') {
    errors.push('kind must be scene-package-template');
  }

  const metadata = isPlainObject(templateManifest.metadata) ? templateManifest.metadata : null;
  if (!metadata) {
    errors.push('metadata object is required');
  } else if (!String(metadata.template_id || '').trim()) {
    errors.push('metadata.template_id is required');
  }

  if (!isPlainObject(templateManifest.template)) {
    errors.push('template object is required');
  } else {
    if (!String(templateManifest.template.package_contract || '').trim()) {
      errors.push('template.package_contract is required');
    }

    if (!String(templateManifest.template.scene_manifest || '').trim()) {
      errors.push('template.scene_manifest is required');
    }
  }

  if (!Array.isArray(templateManifest.parameters)) {
    warnings.push('parameters should be an array');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function classifyScenePackageLayer(kind) {
  const normalizedKind = String(kind || '').trim().toLowerCase();
  return SCENE_PACKAGE_KIND_LAYER_MAP[normalizedKind] || 'unknown';
}

function createScenePackageGatePolicyTemplate(profile = 'baseline') {
  const normalizedProfile = String(profile || '').trim().toLowerCase();

  const templates = {
    baseline: {
      apiVersion: SCENE_PACKAGE_GATE_API_VERSION,
      profile: 'baseline',
      rules: {
        max_invalid_templates: 0,
        min_valid_templates: 1,
        required_layers: [],
        forbid_unknown_layer: false
      }
    },
    'three-layer': {
      apiVersion: SCENE_PACKAGE_GATE_API_VERSION,
      profile: 'three-layer',
      rules: {
        max_invalid_templates: 0,
        min_valid_templates: 3,
        required_layers: ['l1-capability', 'l2-domain', 'l3-instance'],
        forbid_unknown_layer: true
      }
    }
  };

  return JSON.parse(JSON.stringify(templates[normalizedProfile] || templates.baseline));
}

function normalizeScenePackageGatePolicy(policy = {}) {
  const baseline = createScenePackageGatePolicyTemplate('baseline');

  const nextPolicy = isPlainObject(policy) ? JSON.parse(JSON.stringify(policy)) : {};
  if (!String(nextPolicy.apiVersion || '').trim()) {
    nextPolicy.apiVersion = baseline.apiVersion;
  }

  if (!String(nextPolicy.profile || '').trim()) {
    nextPolicy.profile = baseline.profile;
  }

  const rules = isPlainObject(nextPolicy.rules) ? nextPolicy.rules : {};

  const maxInvalidTemplates = Number(rules.max_invalid_templates);
  const minValidTemplates = Number(rules.min_valid_templates);

  nextPolicy.rules = {
    max_invalid_templates: Number.isFinite(maxInvalidTemplates) && maxInvalidTemplates >= 0
      ? Math.floor(maxInvalidTemplates)
      : baseline.rules.max_invalid_templates,
    min_valid_templates: Number.isFinite(minValidTemplates) && minValidTemplates >= 0
      ? Math.floor(minValidTemplates)
      : baseline.rules.min_valid_templates,
    required_layers: Array.isArray(rules.required_layers)
      ? rules.required_layers
        .map((item) => String(item || '').trim())
        .filter((item) => item.length > 0)
      : [],
    forbid_unknown_layer: rules.forbid_unknown_layer === true
  };

  return nextPolicy;
}

function evaluateScenePackageGate(registryPayload = {}, policy = {}) {
  const summary = isPlainObject(registryPayload.summary) ? registryPayload.summary : {};
  const layerCounts = isPlainObject(summary.layer_counts) ? summary.layer_counts : {};
  const normalizedPolicy = normalizeScenePackageGatePolicy(policy);

  const metrics = {
    total_templates: Number(summary.total_templates || 0),
    valid_templates: Number(summary.valid_templates || 0),
    invalid_templates: Number(summary.invalid_templates || 0),
    layer_counts: {
      l1_capability: Number(layerCounts.l1_capability || 0),
      l2_domain: Number(layerCounts.l2_domain || 0),
      l3_instance: Number(layerCounts.l3_instance || 0),
      unknown: Number(layerCounts.unknown || 0)
    }
  };

  const checks = [];

  checks.push({
    id: 'max-invalid-templates',
    expected: `<= ${normalizedPolicy.rules.max_invalid_templates}`,
    actual: metrics.invalid_templates,
    passed: metrics.invalid_templates <= normalizedPolicy.rules.max_invalid_templates
  });

  checks.push({
    id: 'min-valid-templates',
    expected: `>= ${normalizedPolicy.rules.min_valid_templates}`,
    actual: metrics.valid_templates,
    passed: metrics.valid_templates >= normalizedPolicy.rules.min_valid_templates
  });

  for (const layer of normalizedPolicy.rules.required_layers) {
    const key = layer.replace(/-/g, '_');
    const count = Number(metrics.layer_counts[key] || 0);

    checks.push({
      id: `required-layer:${layer}`,
      expected: '>= 1',
      actual: count,
      passed: count >= 1
    });
  }

  if (normalizedPolicy.rules.forbid_unknown_layer) {
    checks.push({
      id: 'unknown-layer-forbidden',
      expected: 0,
      actual: metrics.layer_counts.unknown,
      passed: metrics.layer_counts.unknown === 0
    });
  }

  const failedChecks = checks.filter((item) => item.passed === false);

  return {
    policy: normalizedPolicy,
    metrics,
    checks,
    summary: {
      passed: failedChecks.length === 0,
      total_checks: checks.length,
      failed_checks: failedChecks.length
    }
  };
}

function parseScenePackageGateExpectedInteger(expected, fallback = 0) {
  const match = String(expected || '').match(/-?\d+/);
  if (!match) {
    return fallback;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildScenePackageGateRemediationPlan(evaluation = {}) {
  const failedChecks = Array.isArray(evaluation.checks)
    ? evaluation.checks.filter((item) => item && item.passed === false)
    : [];

  const actions = [];
  const seen = new Map();

  const pushAction = (action, sourceCheckId = null) => {
    if (!isPlainObject(action) || !String(action.id || '').trim()) {
      return;
    }

    const actionId = String(action.id).trim();
    const sourceIds = Array.isArray(action.source_check_ids)
      ? action.source_check_ids
        .map((checkId) => String(checkId || '').trim())
        .filter((checkId) => checkId.length > 0)
      : [];

    if (sourceCheckId && !sourceIds.includes(sourceCheckId)) {
      sourceIds.push(sourceCheckId);
    }

    if (seen.has(actionId)) {
      const index = seen.get(actionId);
      const existing = actions[index];
      const mergedIds = new Set([
        ...(Array.isArray(existing.source_check_ids) ? existing.source_check_ids : []),
        ...sourceIds
      ]);
      existing.source_check_ids = Array.from(mergedIds);
      return;
    }

    seen.set(actionId, actions.length);
    actions.push({
      ...action,
      source_check_ids: sourceIds
    });
  };

  for (const check of failedChecks) {
    const checkId = String(check.id || '').trim();

    if (checkId.startsWith('required-layer:')) {
      const layer = checkId.slice('required-layer:'.length);
      const layerKindMap = {
        'l1-capability': 'scene-capability',
        'l2-domain': 'scene-domain-profile',
        'l3-instance': 'scene-template'
      };
      const kind = layerKindMap[layer] || 'scene-template';

      pushAction({
        id: `cover-${layer}`,
        priority: 'medium',
        title: `Add at least one ${layer} template package`,
        recommendation: `Create and publish a ${kind} package to satisfy ${layer} coverage.`,
        command_hint: `sce scene package-template --kind ${kind} --spec <spec-name> && sce scene package-publish --spec <spec-name>`
      }, checkId);
      continue;
    }

    if (checkId === 'min-valid-templates') {
      const expectedCount = parseScenePackageGateExpectedInteger(check.expected, 0);
      const actualCount = Number(check.actual || 0);
      const gap = Math.max(0, expectedCount - actualCount);

      pushAction({
        id: 'increase-valid-templates',
        priority: 'high',
        title: `Increase valid template count by at least ${gap || 1}`,
        recommendation: 'Promote additional template packages via package-publish until gate threshold is met.',
        command_hint: 'sce scene package-registry --template-dir .sce/templates/scene-packages --json'
      }, checkId);
      continue;
    }

    if (checkId === 'max-invalid-templates') {
      pushAction({
        id: 'reduce-invalid-templates',
        priority: 'high',
        title: 'Reduce invalid template count to gate threshold',
        recommendation: 'Repair or deprecate invalid templates and rerun registry validation.',
        command_hint: 'sce scene package-registry --template-dir .sce/templates/scene-packages --strict --json'
      }, checkId);
      continue;
    }

    if (checkId === 'unknown-layer-forbidden') {
      pushAction({
        id: 'remove-unknown-layer-templates',
        priority: 'high',
        title: 'Eliminate unknown-layer template classifications',
        recommendation: 'Align package kind declarations with supported scene layers and republish.',
        command_hint: 'sce scene package-template --kind <scene-capability|scene-domain-profile|scene-template> --spec <spec-name>'
      }, checkId);
      continue;
    }

    pushAction({
      id: `resolve-${sanitizeScenePackageName(checkId) || 'gate-check'}`,
      priority: 'medium',
      title: `Resolve gate check ${checkId || 'unknown'}`,
      recommendation: 'Inspect gate details and apply corrective template actions.',
      command_hint: 'sce scene package-gate --registry <path> --policy <path> --json'
    }, checkId);
  }

  return {
    action_count: actions.length,
    actions
  };
}

function validateScenePackageContract(contract = {}) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(contract)) {
    return {
      valid: false,
      errors: ['scene package contract must be a JSON object'],
      warnings: [],
      summary: {
        coordinate: null,
        kind: null,
        parameter_count: 0,
        provides_count: 0,
        requires_count: 0
      }
    };
  }

  if (contract.apiVersion !== SCENE_PACKAGE_API_VERSION) {
    errors.push(`apiVersion must be ${SCENE_PACKAGE_API_VERSION}`);
  }

  if (!SCENE_PACKAGE_KINDS.has(contract.kind)) {
    errors.push(`kind must be one of ${Array.from(SCENE_PACKAGE_KINDS).join(', ')}`);
  }

  const metadata = isPlainObject(contract.metadata) ? contract.metadata : null;
  if (!metadata) {
    errors.push('metadata object is required');
  }

  const group = metadata ? String(metadata.group || '').trim() : '';
  const name = metadata ? String(metadata.name || '').trim() : '';
  const version = metadata ? String(metadata.version || '').trim() : '';

  if (!group) {
    errors.push('metadata.group is required');
  }

  if (!name) {
    errors.push('metadata.name is required');
  }

  if (!version) {
    errors.push('metadata.version is required');
  } else if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    errors.push('metadata.version must be semantic version (x.y.z)');
  }

  const compatibility = isPlainObject(contract.compatibility) ? contract.compatibility : null;
  if (!compatibility) {
    errors.push('compatibility object is required');
  } else {
    const minSceVersion = String(compatibility.min_sce_version || '').trim();

    if (!minSceVersion) {
      errors.push('compatibility.min_sce_version is required');
    }

    if (!String(compatibility.scene_api_version || '').trim()) {
      errors.push('compatibility.scene_api_version is required');
    }
  }

  const capabilities = isPlainObject(contract.capabilities) ? contract.capabilities : null;
  if (!capabilities) {
    errors.push('capabilities object is required');
  }

  const provides = capabilities && Array.isArray(capabilities.provides) ? capabilities.provides : [];
  const requires = capabilities && Array.isArray(capabilities.requires) ? capabilities.requires : [];

  if (provides.length === 0) {
    warnings.push('capabilities.provides is empty');
  }

  if (provides.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    errors.push('capabilities.provides must contain non-empty strings');
  }

  if (requires.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    errors.push('capabilities.requires must contain non-empty strings');
  }

  const parameters = Array.isArray(contract.parameters) ? contract.parameters : [];
  for (const [index, parameter] of parameters.entries()) {
    if (!isPlainObject(parameter)) {
      errors.push(`parameters[${index}] must be an object`);
      continue;
    }

    if (!String(parameter.id || '').trim()) {
      errors.push(`parameters[${index}].id is required`);
    }

    if (!String(parameter.type || '').trim()) {
      errors.push(`parameters[${index}].type is required`);
    }

    if (Object.prototype.hasOwnProperty.call(parameter, 'required') && typeof parameter.required !== 'boolean') {
      errors.push(`parameters[${index}].required must be boolean when provided`);
    }
  }

  const artifacts = isPlainObject(contract.artifacts) ? contract.artifacts : null;
  if (!artifacts) {
    errors.push('artifacts object is required');
  } else {
    if (!String(artifacts.entry_scene || '').trim()) {
      errors.push('artifacts.entry_scene is required');
    }

    if (!Array.isArray(artifacts.generates) || artifacts.generates.length === 0) {
      errors.push('artifacts.generates must contain at least one output path');
    } else if (artifacts.generates.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
      errors.push('artifacts.generates must contain non-empty strings');
    }
  }

  const governance = isPlainObject(contract.governance) ? contract.governance : null;
  if (!governance) {
    errors.push('governance object is required');
  } else {
    const riskLevel = String(governance.risk_level || '').trim().toLowerCase();
    if (!SCENE_PACKAGE_RISK_LEVELS.has(riskLevel)) {
      errors.push(`governance.risk_level must be one of ${Array.from(SCENE_PACKAGE_RISK_LEVELS).join(', ')}`);
    }

    if (typeof governance.approval_required !== 'boolean') {
      errors.push('governance.approval_required must be boolean');
    }

    if (typeof governance.rollback_supported !== 'boolean') {
      errors.push('governance.rollback_supported must be boolean');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      coordinate: buildScenePackageCoordinate(contract),
      kind: SCENE_PACKAGE_KINDS.has(contract.kind) ? contract.kind : null,
      parameter_count: parameters.length,
      provides_count: provides.length,
      requires_count: requires.length
    }
  };
}

function buildScenePackageTemplateId(packageContract = {}, explicitTemplateId) {
  const explicit = sanitizeScenePackageName(explicitTemplateId || '');
  if (explicit) {
    return explicit;
  }

  const metadata = isPlainObject(packageContract.metadata) ? packageContract.metadata : {};
  const group = sanitizeScenePackageName(metadata.group || 'sce.scene') || 'sce.scene';
  const name = sanitizeScenePackageName(metadata.name || 'scene-template') || 'scene-template';
  const version = sanitizeScenePackageName(metadata.version || '0.1.0') || '0.1.0';

  return `${group}--${name}--${version}`;
}

function normalizeScenePackageTemplateValueMap(values) {
  if (!isPlainObject(values)) {
    return {};
  }

  const normalized = {};
  for (const [key, value] of Object.entries(values)) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
      continue;
    }

    normalized[normalizedKey] = value === null || value === undefined
      ? ''
      : String(value);
  }

  return normalized;
}

function renderScenePackageTemplateContent(content, valueMap = {}) {
  let rendered = String(content || '');

  for (const [key, value] of Object.entries(valueMap)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rendered = rendered
      .replace(new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g'), String(value))
      .replace(new RegExp(`\\$\\{${escapedKey}\\}`, 'g'), String(value));
  }

  return rendered;
}

function resolveScenePackageTemplateParameterValues(packageContract = {}, rawValues = {}) {
  const valueMap = normalizeScenePackageTemplateValueMap(rawValues);
  const parameters = Array.isArray(packageContract.parameters) ? packageContract.parameters : [];
  const resolved = {};
  const missing = [];

  for (const parameter of parameters) {
    if (!isPlainObject(parameter)) {
      continue;
    }

    const parameterId = String(parameter.id || '').trim();
    if (!parameterId) {
      continue;
    }

    const hasInput = Object.prototype.hasOwnProperty.call(valueMap, parameterId);
    if (hasInput) {
      resolved[parameterId] = valueMap[parameterId];
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(parameter, 'default')) {
      resolved[parameterId] = parameter.default === null || parameter.default === undefined
        ? ''
        : String(parameter.default);
      continue;
    }

    if (parameter.required === true) {
      missing.push(parameterId);
      continue;
    }

    resolved[parameterId] = '';
  }

  return {
    values: resolved,
    missing
  };
}

function buildScenePackageInstantiateContract(packageContract = {}, targetSpec) {
  const contractCopy = JSON.parse(JSON.stringify(packageContract || {}));

  if (!isPlainObject(contractCopy.metadata)) {
    contractCopy.metadata = {};
  }

  const targetName = sanitizeScenePackageName(String(targetSpec || '').replace(/^\d{2}-\d{2}-/, '')) || 'scene-instance';
  contractCopy.metadata.name = targetName;

  return contractCopy;
}

function buildScenePackageInstantiateManifest(manifestContent, valueMap, targetSpec) {
  if (!manifestContent) {
    const fallbackRef = sanitizeScenePackageName(String(targetSpec || '').replace(/^\d{2}-\d{2}-/, '')) || 'scene-instance';
    return [
      'apiVersion: sce.scene/v0.2',
      'kind: scene',
      'metadata:',
      `  obj_id: scene.erp.${fallbackRef}`,
      '  obj_version: 0.2.0',
      `  title: ${fallbackRef}`,
      'spec:',
      '  domain: erp',
      '  intent:',
      '    goal: Generated from scene package template',
      '  capability_contract:',
      '    bindings:',
      '      - type: query',
      '        ref: spec.erp.generated.query',
      '  governance_contract:',
      '    risk_level: low',
      '    approval:',
      '      required: false',
      '    idempotency:',
      '      required: true',
      '      key: requestId',
      ''
    ].join('\n');
  }

  return renderScenePackageTemplateContent(manifestContent, valueMap);
}

function normalizeProfileName(profile) {
  const normalized = String(profile || '').trim().toLowerCase();
  if (EVAL_CONFIG_TEMPLATE_PROFILES.has(normalized)) {
    return normalized;
  }

  return null;
}

function normalizeEvalProfileInferenceRules(rules = {}) {
  const merged = cloneDefaultEvalProfileInferenceRules();

  if (!isPlainObject(rules)) {
    return merged;
  }

  if (isPlainObject(rules.domain_aliases)) {
    const nextAliases = { ...merged.domain_aliases };

    for (const [rawDomain, rawProfile] of Object.entries(rules.domain_aliases)) {
      const domainKey = String(rawDomain || '').trim().toLowerCase();
      const profileName = normalizeProfileName(rawProfile);

      if (!domainKey || !profileName) {
        continue;
      }

      nextAliases[domainKey] = profileName;
    }

    merged.domain_aliases = nextAliases;
  }

  if (Array.isArray(rules.scene_ref_rules)) {
    const normalizedRules = [];

    for (const item of rules.scene_ref_rules) {
      if (!isPlainObject(item)) {
        continue;
      }

      const pattern = String(item.pattern || '').trim();
      const profileName = normalizeProfileName(item.profile);

      if (!pattern || !profileName) {
        continue;
      }

      try {
        new RegExp(pattern, 'i');
      } catch (error) {
        continue;
      }

      normalizedRules.push({
        pattern,
        profile: profileName
      });
    }

    merged.scene_ref_rules = normalizedRules;
  }

  return merged;
}

function createDefaultSceneEvalProfileRulesTemplate() {
  return cloneDefaultEvalProfileInferenceRules();
}

async function loadSceneEvalProfileRules(options = {}, projectRoot, fileSystem = fs) {
  const pathExists = typeof fileSystem.pathExists === 'function'
    ? fileSystem.pathExists.bind(fileSystem)
    : fs.pathExists.bind(fs);
  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);

  const warnings = [];
  const defaultRules = createDefaultSceneEvalProfileRulesTemplate();

  const explicitRulesPath = options.profileRules ? resolvePath(projectRoot, options.profileRules) : null;
  const implicitRulesPath = path.join(projectRoot, '.sce', 'config', 'scene-eval-profile-rules.json');
  const hasExplicitRulesPath = !!explicitRulesPath;

  let rulesPath = null;
  let rulesSource = 'default';

  if (hasExplicitRulesPath) {
    rulesPath = explicitRulesPath;
    rulesSource = options.profileRules;
  } else {
    try {
      if (await pathExists(implicitRulesPath)) {
        rulesPath = implicitRulesPath;
        rulesSource = '.sce/config/scene-eval-profile-rules.json';
      }
    } catch (error) {
      warnings.push(`profile rules path check failed: ${error.message}`);
    }
  }

  if (!rulesPath) {
    return {
      rules: defaultRules,
      source: rulesSource,
      warnings
    };
  }

  let rawRules = null;

  try {
    rawRules = await readJson(rulesPath);
  } catch (error) {
    if (hasExplicitRulesPath) {
      throw new Error(`failed to load profile rules file: ${rulesPath} (${error.message})`);
    }

    warnings.push(`failed to load implicit profile rules file: ${rulesSource}`);
    return {
      rules: defaultRules,
      source: 'default',
      warnings
    };
  }

  if (!isPlainObject(rawRules)) {
    if (hasExplicitRulesPath) {
      throw new Error(`profile rules file must contain a JSON object: ${rulesPath}`);
    }

    warnings.push(`invalid implicit profile rules file: ${rulesSource}`);
    return {
      rules: defaultRules,
      source: 'default',
      warnings
    };
  }

  return {
    rules: normalizeEvalProfileInferenceRules(rawRules),
    source: rulesSource,
    warnings
  };
}

function resolveSceneEvalConfigProfile(config = {}, envName = null) {
  if (!isPlainObject(config)) {
    throw new Error('eval config must be a JSON object');
  }

  let targetConfig = isPlainObject(config.target) ? mergePlainObject({}, config.target) : {};
  let taskSyncPolicy = isPlainObject(config.task_sync_policy) ? mergePlainObject({}, config.task_sync_policy) : {};

  if (envName) {
    const envs = isPlainObject(config.envs) ? config.envs : {};
    const envConfig = envs[envName];

    if (!isPlainObject(envConfig)) {
      throw new Error(`eval config env profile not found: ${envName}`);
    }

    if (isPlainObject(envConfig.target)) {
      targetConfig = mergePlainObject(targetConfig, envConfig.target);
    }

    if (isPlainObject(envConfig.task_sync_policy)) {
      taskSyncPolicy = mergePlainObject(taskSyncPolicy, envConfig.task_sync_policy);
    }
  }

  return {
    targetConfig,
    taskSyncPolicy
  };
}

function createDefaultSceneEvalConfigTemplate() {
  return {
    target: {
      max_cycle_time_ms: 2500,
      max_manual_takeover_rate: 0.25,
      max_policy_violation_count: 0,
      max_node_failure_count: 0,
      min_completion_rate: 0.8,
      max_blocked_rate: 0.1
    },
    task_sync_policy: cloneDefaultEvalTaskSyncPolicy(),
    envs: {
      dev: {
        target: {
          max_cycle_time_ms: 4000,
          max_manual_takeover_rate: 0.5,
          min_completion_rate: 0.6,
          max_blocked_rate: 0.4
        },
        task_sync_policy: {
          default_priority: 'medium'
        }
      },
      staging: {
        target: {
          max_cycle_time_ms: 2800,
          max_manual_takeover_rate: 0.3,
          min_completion_rate: 0.75,
          max_blocked_rate: 0.2
        },
        task_sync_policy: {
          default_priority: 'medium'
        }
      },
      prod: {
        target: {
          max_cycle_time_ms: 1800,
          max_manual_takeover_rate: 0.15,
          min_completion_rate: 0.9,
          max_blocked_rate: 0.05
        },
        task_sync_policy: {
          default_priority: 'high',
          priority_by_grade: {
            good: 'medium',
            watch: 'high',
            at_risk: 'high',
            critical: 'critical'
          }
        }
      }
    }
  };
}

function createSceneEvalConfigTemplateByProfile(profile = 'default') {
  const normalizedProfile = String(profile || 'default').trim().toLowerCase();
  const base = createDefaultSceneEvalConfigTemplate();

  const profilePatches = {
    erp: {
      target: {
        max_cycle_time_ms: 2000,
        max_manual_takeover_rate: 0.2,
        min_completion_rate: 0.85,
        max_blocked_rate: 0.08
      },
      task_sync_policy: {
        default_priority: 'medium',
        keyword_priority_overrides: [
          {
            pattern: 'invoice|payment|tax|ledger|cost|inventory|order',
            priority: 'high'
          }
        ]
      },
      envs: {
        prod: {
          target: {
            max_cycle_time_ms: 1500,
            max_manual_takeover_rate: 0.12,
            min_completion_rate: 0.92,
            max_blocked_rate: 0.04
          }
        }
      }
    },
    ops: {
      target: {
        max_cycle_time_ms: 1800,
        max_manual_takeover_rate: 0.12,
        max_policy_violation_count: 0,
        max_node_failure_count: 0,
        min_completion_rate: 0.9,
        max_blocked_rate: 0.06
      },
      task_sync_policy: {
        default_priority: 'high',
        priority_by_grade: {
          good: 'medium',
          watch: 'high',
          at_risk: 'high',
          critical: 'critical'
        },
        keyword_priority_overrides: [
          {
            pattern: 'incident|outage|rollback|security|credential|breach|degrade',
            priority: 'critical'
          }
        ]
      },
      envs: {
        prod: {
          target: {
            max_cycle_time_ms: 1200,
            max_manual_takeover_rate: 0.08,
            min_completion_rate: 0.95,
            max_blocked_rate: 0.03
          }
        }
      }
    },
    robot: {
      target: {
        max_cycle_time_ms: 2200,
        max_manual_takeover_rate: 0.1,
        max_policy_violation_count: 0,
        max_node_failure_count: 0,
        min_completion_rate: 0.9,
        max_blocked_rate: 0.05
      },
      task_sync_policy: {
        default_priority: 'high',
        priority_by_grade: {
          good: 'medium',
          watch: 'high',
          at_risk: 'critical',
          critical: 'critical'
        },
        keyword_priority_overrides: [
          {
            pattern: 'safety|collision|emergency|hardware|robot|stop channel|preflight',
            priority: 'critical'
          }
        ]
      },
      envs: {
        prod: {
          target: {
            max_cycle_time_ms: 1500,
            max_manual_takeover_rate: 0.06,
            min_completion_rate: 0.96,
            max_blocked_rate: 0.02
          }
        }
      }
    }
  };

  if (!Object.prototype.hasOwnProperty.call(profilePatches, normalizedProfile)) {
    return base;
  }

  return mergePlainObject(base, profilePatches[normalizedProfile]);
}

function normalizeRelativePath(targetPath = '') {
  return String(targetPath || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
}

function collectManifestDiscoveryCandidates(preferredPath = 'custom/scene.yaml') {
  const ordered = [];
  const seen = new Set();

  const appendCandidate = (candidate) => {
    const normalized = normalizeRelativePath(candidate || '').trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    ordered.push(normalized);
  };

  appendCandidate(preferredPath);

  for (const candidate of SCENE_MANIFEST_DISCOVERY_CANDIDATES) {
    appendCandidate(candidate);
  }

  return ordered;
}

async function discoverSpecSceneManifestPath(projectRoot, specName, preferredPath = 'custom/scene.yaml', fileSystem = fs) {
  const specRoot = path.join(projectRoot, '.sce', 'specs', specName);
  const pathExists = typeof fileSystem.pathExists === 'function'
    ? fileSystem.pathExists.bind(fileSystem)
    : fs.pathExists.bind(fs);

  const candidates = collectManifestDiscoveryCandidates(preferredPath);

  for (const candidate of candidates) {
    const absolutePath = path.join(specRoot, candidate);

    try {
      if (await pathExists(absolutePath)) {
        return candidate;
      }
    } catch (error) {
      // Ignore path check failures and continue discovery.
    }
  }

  const readDirectory = typeof fileSystem.readdir === 'function'
    ? fileSystem.readdir.bind(fileSystem)
    : fs.readdir.bind(fs);

  const queue = [{ absolutePath: specRoot, relativePath: '', depth: 0 }];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || current.depth > SCENE_MANIFEST_DISCOVERY_MAX_DEPTH) {
      continue;
    }

    if (visited.has(current.absolutePath)) {
      continue;
    }

    visited.add(current.absolutePath);

    let entries = [];

    try {
      entries = await readDirectory(current.absolutePath, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    for (const entry of entries) {
      if (!entry || !entry.name) {
        continue;
      }

      const nextRelativePath = current.relativePath
        ? `${current.relativePath}/${entry.name}`
        : entry.name;

      if (typeof entry.isFile === 'function' && entry.isFile() && /^scene\.(yaml|yml|json)$/i.test(entry.name)) {
        return normalizeRelativePath(nextRelativePath);
      }

      if (typeof entry.isDirectory === 'function' && entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') {
          continue;
        }

        queue.push({
          absolutePath: path.join(current.absolutePath, entry.name),
          relativePath: nextRelativePath,
          depth: current.depth + 1
        });
      }
    }
  }

  return null;
}

async function loadSceneManifestForEvalProfile(options = {}, sceneLoader, projectRoot, fileSystem = fs) {
  if (!options.spec || options.profile) {
    return {
      sceneManifest: null,
      manifestPath: null,
      manifestSource: null,
      warnings: []
    };
  }

  const requestedManifestPath = normalizeRelativePath(options.specManifest || 'custom/scene.yaml');
  const warnings = [];

  try {
    const sceneManifest = await sceneLoader.loadFromSpec(options.spec, requestedManifestPath);

    return {
      sceneManifest,
      manifestPath: requestedManifestPath,
      manifestSource: 'requested',
      warnings
    };
  } catch (error) {
    warnings.push(`requested manifest unavailable: ${requestedManifestPath}`);

    if (options.profileManifestAutoDiscovery === false) {
      return {
        sceneManifest: null,
        manifestPath: null,
        manifestSource: null,
        warnings
      };
    }
  }

  const discoveredManifestPath = await discoverSpecSceneManifestPath(
    projectRoot,
    options.spec,
    requestedManifestPath,
    fileSystem
  );

  if (!discoveredManifestPath || discoveredManifestPath === requestedManifestPath) {
    warnings.push('profile manifest auto-discovery did not find an alternative manifest');

    return {
      sceneManifest: null,
      manifestPath: null,
      manifestSource: null,
      warnings
    };
  }

  try {
    const sceneManifest = await sceneLoader.loadFromSpec(options.spec, discoveredManifestPath);
    warnings.push(`profile manifest auto-discovery selected: ${discoveredManifestPath}`);

    return {
      sceneManifest,
      manifestPath: discoveredManifestPath,
      manifestSource: 'auto-discovered',
      warnings
    };
  } catch (error) {
    warnings.push(`auto-discovered manifest unavailable: ${discoveredManifestPath}`);

    return {
      sceneManifest: null,
      manifestPath: null,
      manifestSource: null,
      warnings
    };
  }
}

function buildSceneCatalogEntry(specName, manifestPath, sceneManifest, errors = []) {
  const metadata = sceneManifest && typeof sceneManifest === 'object' ? sceneManifest.metadata || {} : {};
  const spec = sceneManifest && typeof sceneManifest === 'object' ? sceneManifest.spec || {} : {};
  const governanceContract = spec && typeof spec === 'object' ? spec.governance_contract || {} : {};
  const capabilityContract = spec && typeof spec === 'object' ? spec.capability_contract || {} : {};
  const bindings = Array.isArray(capabilityContract.bindings) ? capabilityContract.bindings : [];

  const entry = {
    spec: specName,
    manifest_path: manifestPath,
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : [],
    kind: typeof sceneManifest.kind === 'string' ? sceneManifest.kind : null,
    api_version: typeof sceneManifest.apiVersion === 'string' ? sceneManifest.apiVersion : null,
    scene_ref: typeof metadata.obj_id === 'string' ? metadata.obj_id : null,
    scene_version: typeof metadata.obj_version === 'string' ? metadata.obj_version : null,
    title: typeof metadata.title === 'string' ? metadata.title : null,
    domain: typeof spec.domain === 'string' ? spec.domain : null,
    risk_level: typeof governanceContract.risk_level === 'string' ? governanceContract.risk_level : null,
    binding_count: bindings.length
  };

  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0).map((tag) => tag.trim())
    : [];

  if (tags.length > 0) {
    entry.tags = tags;
  }

  return entry;
}

function matchesSceneCatalogFilters(entry, options) {
  if (options.domain) {
    const entryDomain = typeof entry.domain === 'string' ? entry.domain.toLowerCase() : '';
    if (entryDomain !== options.domain) {
      return false;
    }
  }

  if (options.kind) {
    const entryKind = typeof entry.kind === 'string' ? entry.kind.toLowerCase() : '';
    if (entryKind !== options.kind) {
      return false;
    }
  }

  return true;
}

async function listSpecDirectoryNames(projectRoot, fileSystem = fs) {
  const specsPath = path.join(projectRoot, '.sce', 'specs');
  const readDirectory = typeof fileSystem.readdir === 'function'
    ? fileSystem.readdir.bind(fileSystem)
    : fs.readdir.bind(fs);

  const entries = await readDirectory(specsPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry && typeof entry.isDirectory === 'function' && entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function buildSceneCatalog(options = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const sceneLoader = dependencies.sceneLoader || new SceneLoader({ projectPath: projectRoot });

  const readFile = typeof fileSystem.readFile === 'function'
    ? fileSystem.readFile.bind(fileSystem)
    : fs.readFile.bind(fs);

  const pathExists = typeof fileSystem.pathExists === 'function'
    ? fileSystem.pathExists.bind(fileSystem)
    : fs.pathExists.bind(fs);

  const specNames = options.spec
    ? [options.spec]
    : await listSpecDirectoryNames(projectRoot, fileSystem);

  if (options.spec) {
    const specPath = path.join(projectRoot, '.sce', 'specs', options.spec);
    if (!await pathExists(specPath)) {
      throw new Error(`target spec not found: ${options.spec}`);
    }
  }

  const entries = [];
  const summary = {
    specs_scanned: specNames.length,
    manifests_discovered: 0,
    skipped_no_manifest: 0,
    filtered_out: 0,
    entries_returned: 0,
    valid_entries: 0,
    invalid_entries: 0
  };

  for (const specName of specNames) {
    const manifestPath = await discoverSpecSceneManifestPath(projectRoot, specName, options.specManifest, fileSystem);

    if (!manifestPath) {
      summary.skipped_no_manifest += 1;

      if (options.includeInvalid) {
        const missingEntry = buildSceneCatalogEntry(specName, null, {}, ['scene manifest not found']);
        if (matchesSceneCatalogFilters(missingEntry, options)) {
          entries.push(missingEntry);
        } else {
          summary.filtered_out += 1;
        }
      }

      continue;
    }

    summary.manifests_discovered += 1;

    const manifestAbsolutePath = path.join(projectRoot, '.sce', 'specs', specName, manifestPath);
    let sceneManifest = {};
    let validationErrors = [];

    try {
      const rawContent = await readFile(manifestAbsolutePath, 'utf8');
      sceneManifest = sceneLoader.parseManifest(rawContent, manifestAbsolutePath);

      const manifestValidation = sceneLoader.validateManifest(sceneManifest);
      if (!manifestValidation.valid) {
        validationErrors = Array.isArray(manifestValidation.errors) ? manifestValidation.errors : ['invalid scene manifest'];
      }
    } catch (error) {
      validationErrors = [error.message || 'failed to parse scene manifest'];
    }

    const catalogEntry = buildSceneCatalogEntry(specName, manifestPath, sceneManifest, validationErrors);

    if (!catalogEntry.valid && !options.includeInvalid) {
      summary.filtered_out += 1;
      continue;
    }

    if (!matchesSceneCatalogFilters(catalogEntry, options)) {
      summary.filtered_out += 1;
      continue;
    }

    entries.push(catalogEntry);
  }

  entries.sort((left, right) => {
    const refCompare = String(left.scene_ref || '').localeCompare(String(right.scene_ref || ''));
    if (refCompare !== 0) {
      return refCompare;
    }

    const specCompare = String(left.spec || '').localeCompare(String(right.spec || ''));
    if (specCompare !== 0) {
      return specCompare;
    }

    return String(left.manifest_path || '').localeCompare(String(right.manifest_path || ''));
  });

  summary.entries_returned = entries.length;
  summary.valid_entries = entries.filter((entry) => entry.valid).length;
  summary.invalid_entries = entries.length - summary.valid_entries;

  return {
    generated_at: new Date().toISOString(),
    filters: {
      spec: options.spec || null,
      spec_manifest: options.specManifest,
      domain: options.domain || null,
      kind: options.kind || null,
      include_invalid: options.includeInvalid === true
    },
    summary,
    entries
  };
}

function tokenizeRouteQuery(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function buildSceneRouteCommands(entry, options) {
  if (!entry || !entry.spec || !entry.manifest_path) {
    return null;
  }

  const runMode = options.mode || 'dry_run';

  return {
    validate: `sce scene validate --spec ${entry.spec} --spec-manifest ${entry.manifest_path}`,
    doctor: `sce scene doctor --spec ${entry.spec} --spec-manifest ${entry.manifest_path} --mode ${runMode}`,
    run: `sce scene run --spec ${entry.spec} --spec-manifest ${entry.manifest_path} --mode ${runMode}`
  };
}

function scoreSceneRouteEntry(entry, options = {}, routePolicy = DEFAULT_SCENE_ROUTE_POLICY) {
  const normalizedPolicy = normalizeSceneRoutePolicy(routePolicy);
  const weights = normalizedPolicy.weights || {};
  const modeBias = normalizedPolicy.mode_bias && normalizedPolicy.mode_bias.commit
    ? normalizedPolicy.mode_bias.commit
    : {};

  let score = 0;
  const reasons = [];
  const sceneRef = String(entry.scene_ref || '').toLowerCase();
  const title = String(entry.title || '').toLowerCase();
  const spec = String(entry.spec || '').toLowerCase();

  if (entry.valid) {
    score += weights.valid_manifest;
    reasons.push('valid_manifest');
  } else {
    score += weights.invalid_manifest;
    reasons.push('invalid_manifest');
  }

  if (options.sceneRef) {
    const targetSceneRef = String(options.sceneRef).toLowerCase();

    if (sceneRef === targetSceneRef) {
      score += weights.scene_ref_exact;
      reasons.push('scene_ref_exact');
    } else if (sceneRef.includes(targetSceneRef)) {
      score += weights.scene_ref_contains;
      reasons.push('scene_ref_contains');
    } else {
      score += weights.scene_ref_mismatch;
      reasons.push('scene_ref_mismatch');
    }
  }

  if (options.query) {
    const tokens = tokenizeRouteQuery(options.query);
    const searchIndex = `${sceneRef} ${title} ${spec}`;

    let matchedTokens = 0;
    for (const token of tokens) {
      if (searchIndex.includes(token)) {
        matchedTokens += 1;
      }
    }

    if (tokens.length > 0) {
      score += matchedTokens * weights.query_token_match;

      if (matchedTokens > 0) {
        reasons.push(`query_tokens:${matchedTokens}/${tokens.length}`);
      } else {
        reasons.push('query_tokens:0');
      }
    }
  }

  if (options.mode === 'commit') {
    const riskLevel = String(entry.risk_level || '').toLowerCase();
    const riskBias = normalizeRoutePolicyNumber(modeBias[riskLevel], 0);

    if (riskBias !== 0) {
      score += riskBias;

      if (riskLevel === 'low' && riskBias > 0) {
        reasons.push('commit_low_risk');
      } else if ((riskLevel === 'high' || riskLevel === 'critical') && riskBias < 0) {
        reasons.push('commit_high_risk');
      } else {
        reasons.push(`commit_risk_bias:${riskLevel}`);
      }
    }
  }

  return { score, reasons };
}

function buildSceneRouteDecision(catalog, options = {}, routePolicy = DEFAULT_SCENE_ROUTE_POLICY) {
  const normalizedPolicy = normalizeSceneRoutePolicy(routePolicy);
  const maxAlternatives = Math.max(0, Math.trunc(normalizeRoutePolicyNumber(normalizedPolicy.max_alternatives, 4)));

  const candidates = Array.isArray(catalog.entries) ? catalog.entries : [];
  const ranked = candidates
    .map((entry) => {
      const scoring = scoreSceneRouteEntry(entry, options, normalizedPolicy);
      return {
        ...entry,
        score: scoring.score,
        route_reasons: scoring.reasons,
        commands: buildSceneRouteCommands(entry, options)
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return String(left.scene_ref || '').localeCompare(String(right.scene_ref || ''));
    });

  const selected = ranked.length > 0 ? ranked[0] : null;
  const second = ranked.length > 1 ? ranked[1] : null;
  const hasTie = Boolean(
    options.requireUnique
    && selected
    && second
    && selected.score === second.score
  );

  return {
    selected,
    alternatives: selected ? ranked.slice(1, 1 + maxAlternatives) : ranked.slice(0, maxAlternatives),
    hasTie,
    tie_with: hasTie ? second.scene_ref : null,
    candidates_scored: ranked.length
  };
}

function inferProfileFromDomain(domain, profileRules = null) {
  const normalizedDomain = String(domain || '').trim().toLowerCase();

  if (!normalizedDomain) {
    return 'default';
  }

  const domainAliases = isPlainObject(profileRules) && isPlainObject(profileRules.domain_aliases)
    ? profileRules.domain_aliases
    : DEFAULT_EVAL_PROFILE_INFERENCE_RULES.domain_aliases;

  const mappedProfile = normalizeProfileName(domainAliases[normalizedDomain]);
  if (mappedProfile) {
    return mappedProfile;
  }

  return 'default';
}

function inferProfileFromSceneRef(sceneRef, profileRules = null) {
  const normalizedSceneRef = String(sceneRef || '').trim().toLowerCase();

  if (!normalizedSceneRef) {
    return 'default';
  }

  const tokens = normalizedSceneRef.split(/[.:/_-]+/).filter(Boolean);

  if (tokens.length >= 2 && tokens[0] === 'scene') {
    const domainToken = tokens[1];
    const domainProfile = inferProfileFromDomain(domainToken, profileRules);

    if (domainProfile !== 'default') {
      return domainProfile;
    }
  }

  const sceneRefRules = isPlainObject(profileRules) && Array.isArray(profileRules.scene_ref_rules)
    ? profileRules.scene_ref_rules
    : DEFAULT_EVAL_PROFILE_INFERENCE_RULES.scene_ref_rules;

  for (const rule of sceneRefRules) {
    if (!isPlainObject(rule)) {
      continue;
    }

    const pattern = String(rule.pattern || '').trim();
    const profile = normalizeProfileName(rule.profile);

    if (!pattern || !profile) {
      continue;
    }

    try {
      if (new RegExp(pattern, 'i').test(normalizedSceneRef)) {
        return profile;
      }
    } catch (error) {
      continue;
    }
  }

  return 'default';
}

function resolveSceneEvalProfile(options = {}, sceneManifest = null, feedbackPayload = null, resultPayload = null, profileRules = null) {
  if (options.profile && EVAL_CONFIG_TEMPLATE_PROFILES.has(options.profile)) {
    return {
      profile: options.profile ? String(options.profile).trim().toLowerCase() : undefined,
      source: 'explicit'
    };
  }

  const sceneDomain = sceneManifest
    && sceneManifest.spec
    && typeof sceneManifest.spec.domain === 'string'
    ? sceneManifest.spec.domain
    : null;

  const sceneProfile = inferProfileFromDomain(sceneDomain, profileRules);
  if (sceneProfile !== 'default') {
    return {
      profile: sceneProfile,
      source: options.spec ? `spec:${options.spec}` : 'spec'
    };
  }

  const feedbackDomain = feedbackPayload && typeof feedbackPayload.domain === 'string'
    ? feedbackPayload.domain
    : null;
  const feedbackProfile = inferProfileFromDomain(feedbackDomain, profileRules);

  if (feedbackProfile !== 'default') {
    return {
      profile: feedbackProfile,
      source: 'feedback'
    };
  }

  const resultDomain = resultPayload && typeof resultPayload.domain === 'string'
    ? resultPayload.domain
    : (resultPayload
      && resultPayload.eval_payload
      && typeof resultPayload.eval_payload.domain === 'string'
        ? resultPayload.eval_payload.domain
        : null);

  const resultDomainProfile = inferProfileFromDomain(resultDomain, profileRules);
  if (resultDomainProfile !== 'default') {
    return {
      profile: resultDomainProfile,
      source: 'result:domain'
    };
  }

  const resultSceneRef = resultPayload && typeof resultPayload.scene_ref === 'string'
    ? resultPayload.scene_ref
    : (resultPayload
      && resultPayload.eval_payload
      && typeof resultPayload.eval_payload.scene_ref === 'string'
        ? resultPayload.eval_payload.scene_ref
        : null);

  const resultSceneRefProfile = inferProfileFromSceneRef(resultSceneRef, profileRules);
  if (resultSceneRefProfile !== 'default') {
    return {
      profile: resultSceneRefProfile,
      source: 'result:scene_ref'
    };
  }

  const feedbackSceneRef = feedbackPayload && typeof feedbackPayload.scene_ref === 'string'
    ? feedbackPayload.scene_ref
    : null;

  const feedbackSceneRefProfile = inferProfileFromSceneRef(feedbackSceneRef, profileRules);
  if (feedbackSceneRefProfile !== 'default') {
    return {
      profile: feedbackSceneRefProfile,
      source: 'feedback:scene_ref'
    };
  }

  return {
    profile: 'default',
    source: 'default'
  };
}

function normalizeEvalTaskSyncPolicy(policy = {}) {
  const merged = cloneDefaultEvalTaskSyncPolicy();

  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return merged;
  }

  merged.default_priority = normalizeTaskPriority(policy.default_priority, merged.default_priority);

  if (policy.priority_by_grade && typeof policy.priority_by_grade === 'object' && !Array.isArray(policy.priority_by_grade)) {
    const nextGradeMap = { ...merged.priority_by_grade };

    for (const [grade, priority] of Object.entries(policy.priority_by_grade)) {
      nextGradeMap[grade] = normalizeTaskPriority(priority, nextGradeMap[grade] || merged.default_priority);
    }

    merged.priority_by_grade = nextGradeMap;
  }

  if (Array.isArray(policy.keyword_priority_overrides)) {
    const overrides = [];

    for (const item of policy.keyword_priority_overrides) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const pattern = String(item.pattern || '').trim();
      if (!pattern) {
        continue;
      }

      overrides.push({
        pattern,
        priority: normalizeTaskPriority(item.priority, merged.default_priority)
      });
    }

    merged.keyword_priority_overrides = overrides;
  }

  return merged;
}


module.exports = {
  buildManifestSummary,
  normalizeBindingPluginReport,
  buildDoctorSummary,
  createDoctorSuggestion,
  dedupeDoctorSuggestions,
  buildDoctorSuggestions,
  buildDoctorTodoMarkdown,
  buildDoctorTaskDraft,
  buildDoctorFeedbackTemplate,
  parseSceneDescriptor,
  normalizeFeedbackStatus,
  parseFeedbackNumber,
  parseDoctorFeedbackTemplate,
  averageOrNull,
  buildFeedbackTaskSummary,
  buildFeedbackMetricSummary,
  evaluateFeedbackScore
};
