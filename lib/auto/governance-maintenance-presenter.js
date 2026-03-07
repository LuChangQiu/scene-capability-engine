function buildAutoGovernanceMaintenancePlan(assessment = {}, policy = {}, dryRun = false) {
  const totals = assessment && assessment.totals ? assessment.totals : {};
  const releaseGate = assessment && assessment.release_gate ? assessment.release_gate : {};
  const failedSessions = Number(totals.failed_sessions) || 0;
  const pendingGoals = Number(totals.pending_goals_sum) || 0;
  const sessionTotal = Number(totals.total_sessions) || 0;
  const batchTotal = Number(assessment.archives && assessment.archives.batch_session ? assessment.archives.batch_session.total_sessions : 0) || 0;
  const controllerTotal = Number(assessment.archives && assessment.archives.controller_session ? assessment.archives.controller_session.total_sessions : 0) || 0;
  const recoverySignatureCount = Number(assessment.recovery_memory && assessment.recovery_memory.signature_count) || 0;
  const releaseGateReasons = Array.isArray(releaseGate.blocked_reasons) ? releaseGate.blocked_reasons : [];

  const releaseGateAdvisoryPlan = [];
  if (releaseGate.available === true && releaseGate.latest_gate_passed === false) {
    releaseGateAdvisoryPlan.push({
      id: 'release-gate-review',
      type: 'advisory',
      apply_supported: false,
      enabled: true,
      reason: 'release gate quality is blocking governance loop: ' + releaseGateReasons.join(', '),
      command: 'sce auto handoff evidence --window 5 --json',
      blocked_reasons: releaseGateReasons
    });
  }

  const plan = [
    ...releaseGateAdvisoryPlan,
    {
      id: 'session-prune',
      type: 'maintenance',
      apply_supported: true,
      enabled: sessionTotal > Number(policy.session_keep || 0),
      reason: sessionTotal > Number(policy.session_keep || 0)
        ? 'close-loop session archive ' + sessionTotal + ' exceeds keep policy ' + policy.session_keep
        : 'close-loop session archive is within keep policy'
    },
    {
      id: 'batch-session-prune',
      type: 'maintenance',
      apply_supported: true,
      enabled: batchTotal > Number(policy.batch_session_keep || 0),
      reason: batchTotal > Number(policy.batch_session_keep || 0)
        ? 'batch session archive ' + batchTotal + ' exceeds keep policy ' + policy.batch_session_keep
        : 'batch session archive is within keep policy'
    },
    {
      id: 'controller-session-prune',
      type: 'maintenance',
      apply_supported: true,
      enabled: controllerTotal > Number(policy.controller_session_keep || 0),
      reason: controllerTotal > Number(policy.controller_session_keep || 0)
        ? 'controller session archive ' + controllerTotal + ' exceeds keep policy ' + policy.controller_session_keep
        : 'controller session archive is within keep policy'
    },
    {
      id: 'recovery-memory-prune',
      type: 'maintenance',
      apply_supported: true,
      enabled: recoverySignatureCount > 0,
      reason: recoverySignatureCount > 0
        ? 'recovery memory contains ' + recoverySignatureCount + ' signature(s), prune stale entries'
        : 'recovery memory is empty'
    },
    {
      id: 'recover-latest',
      type: 'advisory',
      apply_supported: false,
      enabled: failedSessions > 0,
      reason: failedSessions > 0
        ? failedSessions + ' failed session(s) detected, run recovery drain'
        : 'no failed sessions detected'
    },
    {
      id: 'controller-resume-latest',
      type: 'advisory',
      apply_supported: false,
      enabled: pendingGoals > 0,
      reason: pendingGoals > 0
        ? pendingGoals + ' pending controller goal(s) detected, resume controller queue'
        : 'no pending controller goals detected'
    }
  ];

  return plan.map((item) => ({ ...item, dry_run: Boolean(dryRun) }));
}

function summarizeGovernanceMaintenanceExecution(plan = [], executedActions = []) {
  const safePlan = Array.isArray(plan) ? plan : [];
  const safeExecuted = Array.isArray(executedActions) ? executedActions : [];
  const plannedActions = safePlan.filter((item) => item && item.enabled).length;
  const applicableActions = safePlan.filter((item) => item && item.enabled && item.apply_supported).length;
  const advisoryActions = safePlan.filter((item) => item && item.enabled && !item.apply_supported).length;
  const appliedActions = safeExecuted.filter((item) => item && item.status === 'applied').length;
  const failedActions = safeExecuted.filter((item) => item && item.status === 'failed').length;
  return {
    planned_actions: plannedActions,
    applicable_actions: applicableActions,
    advisory_actions: advisoryActions,
    applied_actions: appliedActions,
    failed_actions: failedActions
  };
}

module.exports = {
  buildAutoGovernanceMaintenancePlan,
  summarizeGovernanceMaintenanceExecution
};
