function buildGovernanceConcerns(summary = {}, helpers = {}) {
  const concerns = [];
  const toNumber = (value) => Number(value) || 0;
  const parseGateBoolean = helpers.parseAutoHandoffGateBoolean || ((value) => value === true ? true : (value === false ? false : null));
  const normalizeHandoffText = helpers.normalizeHandoffText || ((value) => typeof value === 'string' ? value.trim() : '');
  const totalSessions = toNumber(summary.total_sessions);
  const failedSessions = toNumber(summary.failed_sessions);
  const pendingGoals = toNumber(summary.pending_goals_sum);
  const releaseGate = summary && typeof summary.release_gate === 'object' ? summary.release_gate : {};
  const handoffQuality = summary && typeof summary.handoff_quality === 'object' ? summary.handoff_quality : {};

  if (totalSessions === 0) {
    concerns.push('No archived sessions found for the selected filter window.');
  }
  if (failedSessions > 0) {
    concerns.push(failedSessions + ' failed session(s) detected across governance archives.');
  }
  if (pendingGoals > 0) {
    concerns.push(pendingGoals + ' pending controller goal(s) remain unresolved.');
  }
  if (releaseGate.available === true && parseGateBoolean(releaseGate.latest_gate_passed, null) === false) {
    concerns.push('Latest release gate snapshot is failing.');
  }
  if (handoffQuality.available === true && parseGateBoolean(handoffQuality.latest_gate_passed, null) === false) {
    concerns.push('Latest handoff quality gate is failing.');
  }
  if (normalizeHandoffText(handoffQuality.latest_status) && !['completed', 'dry-run', 'dry_run'].includes(normalizeHandoffText(handoffQuality.latest_status))) {
    concerns.push('Latest handoff run is not in a completed state.');
  }

  return Array.from(new Set(concerns));
}

function buildGovernanceRecommendations(summary = {}, helpers = {}) {
  const recommendations = [];
  const toNumber = (value) => Number(value) || 0;
  const parseGateBoolean = helpers.parseAutoHandoffGateBoolean || ((value) => value === true ? true : (value === false ? false : null));
  const normalizeHandoffText = helpers.normalizeHandoffText || ((value) => typeof value === 'string' ? value.trim() : '');
  const releaseGate = summary && typeof summary.release_gate === 'object' ? summary.release_gate : {};
  const handoffQuality = summary && typeof summary.handoff_quality === 'object' ? summary.handoff_quality : {};

  if (toNumber(summary.failed_sessions) > 0 || toNumber(summary.pending_goals_sum) > 0) {
    recommendations.push('Resume unresolved goals from the latest recoverable summary.');
  }
  if (releaseGate.available === true && parseGateBoolean(releaseGate.latest_gate_passed, null) === false) {
    recommendations.push('Re-run release evidence and gate checks before the next program execution.');
  }
  if (handoffQuality.available === true && parseGateBoolean(handoffQuality.latest_gate_passed, null) === false) {
    recommendations.push('Re-run handoff evidence review and failed-only continuation.');
  }
  if (normalizeHandoffText(handoffQuality.latest_status) && !['completed', 'dry-run', 'dry_run'].includes(normalizeHandoffText(handoffQuality.latest_status))) {
    recommendations.push('Inspect the latest handoff archive and continue from latest failed state.');
  }

  return Array.from(new Set(recommendations));
}

function buildAutoGovernanceMaintenancePlan(assessment = {}, policy = {}, dryRun = false) {
  const plan = [];
  const totals = assessment && assessment.totals ? assessment.totals : {};
  if ((Number(totals.failed_sessions) || 0) > 0) {
    plan.push({
      id: 'close-loop-session-prune',
      action: 'prune-close-loop-sessions',
      apply: !dryRun,
      reason: 'Failed sessions remain in governance archives.'
    });
  }
  if ((Number(totals.pending_goals_sum) || 0) > 0) {
    plan.push({
      id: 'governance-close-loop',
      action: 'resume-governance-close-loop',
      apply: !dryRun,
      reason: 'Pending controller goals remain unresolved.'
    });
  }
  if ((Number(policy.session_keep) || 0) > 0) {
    plan.push({
      id: 'session-retention',
      action: 'apply-session-retention',
      apply: !dryRun,
      reason: 'Retention policy configured.'
    });
  }
  return plan;
}

function summarizeGovernanceMaintenanceExecution(plan = [], executedActions = []) {
  const planned = Array.isArray(plan) ? plan.length : 0;
  const executed = Array.isArray(executedActions) ? executedActions.length : 0;
  const failed = (Array.isArray(executedActions) ? executedActions : []).filter((item) => item && item.success === false).length;
  return {
    planned_actions: planned,
    executed_actions: executed,
    failed_actions: failed,
    success: failed === 0
  };
}

module.exports = {
  buildGovernanceConcerns,
  buildGovernanceRecommendations,
  buildAutoGovernanceMaintenancePlan,
  summarizeGovernanceMaintenanceExecution
};
