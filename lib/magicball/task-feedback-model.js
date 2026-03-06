const { buildMagicballStatusLanguage } = require('./status-language');

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function buildTaskFeedbackModel(payload = {}) {
  const task = payload && payload.task && typeof payload.task === 'object' ? payload.task : {};
  const handoff = task && typeof task.handoff === 'object' ? task.handoff : {};
  const errors = Array.isArray(task.errors) ? task.errors : [];
  const commands = Array.isArray(task.commands) ? task.commands : [];
  const fileChanges = Array.isArray(task.file_changes) ? task.file_changes : [];
  const evidence = Array.isArray(task.evidence) ? task.evidence : [];
  const acceptance = Array.isArray(task.acceptance_criteria) ? task.acceptance_criteria : [];
  const firstError = errors[0] || {};
  const stage = normalizeString(handoff.stage) || 'task';
  const status = normalizeString(task.status) || 'unknown';
  const problemComponent = normalizeString(handoff.component) || normalizeString(payload.sceneId) || null;
  const expected = normalizeString(acceptance[0]) || ('Complete ' + stage + ' stage successfully');
  const actual = normalizeString(firstError.message) || ('Current status: ' + status);

  let chainCheckpoint = 'task-envelope';
  if (errors.length > 0 && commands.length > 0) {
    chainCheckpoint = 'command-execution';
  } else if (errors.length > 0) {
    chainCheckpoint = 'stage-gate';
  } else if (fileChanges.length > 0) {
    chainCheckpoint = 'patch-applied';
  } else if (evidence.length > 0) {
    chainCheckpoint = 'evidence-collected';
  }

  let confidence = 'low';
  if (errors.length > 0) {
    confidence = 'medium';
  } else if (status === 'completed') {
    confidence = 'high';
  }

  let recommendedAction = '继续当前阶段';
  if (errors.length > 0) {
    recommendedAction = '处理阻断后重试';
  } else if (status === 'completed' && normalizeString(task.next_action) && normalizeString(task.next_action) !== 'complete') {
    recommendedAction = '执行下一阶段';
  } else if (status === 'completed') {
    recommendedAction = '任务完成';
  }

  const model = {
    version: '1.0',
    problem: {
      component: problemComponent,
      action: normalizeString(handoff.action) || stage,
      expected,
      actual
    },
    execution: {
      stage,
      status,
      summary: Array.isArray(task.summary) ? task.summary.slice(0, 3) : [],
      blocking_summary: normalizeString(handoff.blocking_summary) || normalizeString(firstError.message) || null
    },
    diagnosis: {
      hypothesis: normalizeString(firstError.error_bundle) || normalizeString(firstError.message) || normalizeString(handoff.reason) || null,
      chain_checkpoint: chainCheckpoint,
      root_cause_confidence: confidence
    },
    evidence: {
      file_count: fileChanges.length,
      file_paths: fileChanges.slice(0, 5).map((item) => normalizeString(item && item.path)).filter(Boolean),
      command_count: commands.length,
      error_count: errors.length,
      verification_result: status === 'completed' ? 'passed-or-advanced' : (errors.length > 0 ? 'blocked' : 'in-progress'),
      regression_scope: Array.isArray(handoff.regression_scope) ? handoff.regression_scope : []
    },
    next_step: {
      recommended_action: recommendedAction,
      next_action: normalizeString(task.next_action) || null,
      next_command: normalizeString(task.next_action) || null
    }
  };

  model.mb_status = buildMagicballStatusLanguage({
    status: model.execution.status,
    attention_level: model.diagnosis.root_cause_confidence === 'high' ? 'high' : (model.execution.status === 'completed' ? 'low' : 'medium'),
    status_label: model.execution.status,
    blocking_summary: model.execution.blocking_summary,
    recommended_action: model.next_step.recommended_action
  });

  return model;
}

function attachTaskFeedbackModel(payload = {}) {
  if (!payload || typeof payload !== 'object' || !payload.task || typeof payload.task !== 'object') {
    return payload;
  }
  return {
    ...payload,
    task: {
      ...payload.task,
      feedback_model: buildTaskFeedbackModel(payload)
    }
  };
}

module.exports = {
  buildTaskFeedbackModel,
  attachTaskFeedbackModel
};
