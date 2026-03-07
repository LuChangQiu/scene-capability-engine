async function runAutoGovernanceMaintenance(projectPath, options = {}, dependencies = {}) {
  const {
    normalizeStatsWindowDays,
    normalizeStatusFilter,
    normalizeGovernanceKeepOption,
    normalizeGovernanceRecoveryOlderThanDays,
    buildAutoGovernanceStats,
    buildAutoGovernanceMaintenancePlan,
    evaluateGovernanceReleaseGateBlockState,
    pruneCloseLoopSessions,
    pruneCloseLoopBatchSummarySessionsCli,
    pruneCloseLoopControllerSessionsCli,
    pruneCloseLoopRecoveryMemory,
    summarizeGovernanceMaintenanceExecution,
    now = () => new Date()
  } = dependencies;

  const days = normalizeStatsWindowDays(options.days);
  const statusFilter = normalizeStatusFilter(options.status);
  const assessmentOptions = {
    days,
    status: statusFilter.length > 0 ? statusFilter.join(',') : undefined
  };
  const policy = {
    session_keep: normalizeGovernanceKeepOption(options.sessionKeep, '--session-keep', 50),
    batch_session_keep: normalizeGovernanceKeepOption(options.batchSessionKeep, '--batch-session-keep', 50),
    controller_session_keep: normalizeGovernanceKeepOption(options.controllerSessionKeep, '--controller-session-keep', 50),
    recovery_memory_older_than_days: normalizeGovernanceRecoveryOlderThanDays(options.recoveryMemoryOlderThanDays, 90)
  };
  const apply = Boolean(options.apply);
  const dryRun = Boolean(options.dryRun);
  const assessment = await buildAutoGovernanceStats(projectPath, assessmentOptions);
  const plan = buildAutoGovernanceMaintenancePlan(assessment, policy, dryRun, {
    evaluateGovernanceReleaseGateBlockState
  });
  const executedActions = [];

  if (apply) {
    for (const action of plan) {
      if (!action.enabled || !action.apply_supported) {
        continue;
      }
      try {
        let result = null;
        if (action.id === 'session-prune') {
          result = await pruneCloseLoopSessions(projectPath, {
            keep: policy.session_keep,
            olderThanDays: null,
            dryRun
          });
        } else if (action.id === 'batch-session-prune') {
          result = await pruneCloseLoopBatchSummarySessionsCli(projectPath, {
            keep: policy.batch_session_keep,
            olderThanDays: null,
            dryRun
          });
        } else if (action.id === 'controller-session-prune') {
          result = await pruneCloseLoopControllerSessionsCli(projectPath, {
            keep: policy.controller_session_keep,
            olderThanDays: null,
            dryRun
          });
        } else if (action.id === 'recovery-memory-prune') {
          result = await pruneCloseLoopRecoveryMemory(projectPath, {
            olderThanDays: policy.recovery_memory_older_than_days,
            dryRun
          });
        }
        executedActions.push({
          id: action.id,
          status: 'applied',
          result
        });
      } catch (error) {
        executedActions.push({
          id: action.id,
          status: 'failed',
          error: error.message
        });
      }
    }
  }

  const afterAssessment = apply && !dryRun
    ? await buildAutoGovernanceStats(projectPath, assessmentOptions)
    : null;

  const nowValue = now();
  return {
    mode: 'auto-governance-maintain',
    generated_at: nowValue instanceof Date ? nowValue.toISOString() : new Date(nowValue).toISOString(),
    apply,
    dry_run: dryRun,
    criteria: {
      days,
      status_filter: statusFilter,
      since: days === null
        ? null
        : new Date((nowValue instanceof Date ? nowValue.getTime() : new Date(nowValue).getTime()) - (days * 24 * 60 * 60 * 1000)).toISOString()
    },
    policy,
    assessment,
    plan,
    executed_actions: executedActions,
    summary: summarizeGovernanceMaintenanceExecution(plan, executedActions),
    after_assessment: afterAssessment
  };
}

module.exports = {
  runAutoGovernanceMaintenance
};
