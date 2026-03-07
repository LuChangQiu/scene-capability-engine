function resolveResultSourceIndex(item, fallbackIndex = 0) {
  if (Number.isInteger(item && item.source_index) && item.source_index >= 0) {
    return item.source_index;
  }
  const fromIndex = Number(item && item.index);
  if (Number.isInteger(fromIndex) && fromIndex > 0) {
    return fromIndex - 1;
  }
  return Math.max(0, fallbackIndex);
}

function getBatchFailureStatusSet() {
  return new Set(['failed', 'error', 'unknown', 'stopped']);
}

function buildProgramCoordinationSnapshot(summary) {
  const results = Array.isArray(summary && summary.results) ? summary.results : [];
  const failedStatuses = getBatchFailureStatusSet();
  const unresolvedIndexes = [];
  const masterSpecs = new Set();
  let totalSubSpecs = 0;
  for (const item of results) {
    const status = `${item && item.status ? item.status : ''}`.trim().toLowerCase();
    if (failedStatuses.has(status)) {
      unresolvedIndexes.push(resolveResultSourceIndex(item) + 1);
    }
    const masterSpec = item && typeof item.master_spec === 'string' ? item.master_spec.trim() : '';
    if (masterSpec) {
      masterSpecs.add(masterSpec);
    }
    totalSubSpecs += Number(item && item.sub_spec_count) || 0;
  }

  return {
    topology: 'master-sub',
    master_spec_count: masterSpecs.size,
    sub_spec_count: totalSubSpecs,
    unresolved_goal_count: unresolvedIndexes.length,
    unresolved_goal_indexes: unresolvedIndexes.slice(0, 50),
    scheduler: {
      batch_parallel: Number(summary && summary.batch_parallel) || 0,
      agent_budget: summary && summary.resource_plan && summary.resource_plan.agent_budget !== undefined
        ? summary.resource_plan.agent_budget
        : null,
      priority: summary && summary.resource_plan ? summary.resource_plan.scheduling_strategy : null,
      aging_factor: summary && summary.resource_plan ? summary.resource_plan.aging_factor : null
    }
  };
}

function mergeProgramRecoveryIntoProgramSummary(initialSummary, recoverySummary, metadata = {}, dependencies = {}) {
  const buildBatchMetrics = dependencies.buildBatchMetrics || (() => ({}));
  const mergeBatchResourcePlans = dependencies.mergeBatchResourcePlans || ((_base, next) => next || null);

  const baseSummary = initialSummary && typeof initialSummary === 'object' ? initialSummary : {};
  const recovery = recoverySummary && typeof recoverySummary === 'object' ? recoverySummary : {};
  const failedStatuses = getBatchFailureStatusSet();
  const mergedBySource = new Map();

  const initialResults = Array.isArray(baseSummary.results) ? baseSummary.results : [];
  for (let index = 0; index < initialResults.length; index += 1) {
    const item = initialResults[index];
    const sourceIndex = resolveResultSourceIndex(item, index);
    mergedBySource.set(sourceIndex, {
      ...item,
      source_index: sourceIndex,
      index: sourceIndex + 1
    });
  }

  const recoveryResults = Array.isArray(recovery.results) ? recovery.results : [];
  for (let index = 0; index < recoveryResults.length; index += 1) {
    const item = recoveryResults[index];
    const sourceIndex = resolveResultSourceIndex(item, index);
    mergedBySource.set(sourceIndex, {
      ...item,
      source_index: sourceIndex,
      index: sourceIndex + 1,
      recovered_by_program: true
    });
  }

  const orderedResults = [...mergedBySource.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);
  const totalGoals = Number(baseSummary.total_goals) || orderedResults.length;
  const failedGoals = orderedResults.filter(item => failedStatuses.has(`${item && item.status ? item.status : ''}`.trim().toLowerCase())).length;
  const completedGoals = orderedResults.length - failedGoals;
  const status = failedGoals === 0
    ? 'completed'
    : completedGoals === 0
      ? 'failed'
      : 'partial-failed';
  const mergedResourcePlan = mergeBatchResourcePlans(baseSummary.resource_plan || null, recovery.resource_plan || null);

  return {
    ...baseSummary,
    status,
    total_goals: totalGoals,
    processed_goals: orderedResults.length,
    completed_goals: completedGoals,
    failed_goals: failedGoals,
    batch_parallel: Math.max(Number(baseSummary.batch_parallel) || 0, Number(recovery.batch_parallel) || 0),
    resource_plan: mergedResourcePlan,
    metrics: buildBatchMetrics(orderedResults, totalGoals),
    results: orderedResults,
    auto_recovery: {
      ...metadata,
      source_status: baseSummary.status || null,
      recovery_status: recovery.status || null,
      converged: recovery.status === 'completed',
      selected_action_index: recovery.recovered_from_summary
        ? recovery.recovered_from_summary.selected_action_index
        : null,
      selection_source: recovery.recovery_plan ? recovery.recovery_plan.selection_source : null,
      recovery_cycle: recovery.recovery_cycle || null,
      recovery_memory: recovery.recovery_memory || null
    }
  };
}

function buildProgramKpiSnapshot(summary, dependencies = {}) {
  const now = dependencies.now || (() => new Date().toISOString());
  const results = Array.isArray(summary && summary.results) ? summary.results : [];
  const totalGoals = Number(summary && summary.total_goals) || results.length || 1;
  const completedGoals = Number(summary && summary.completed_goals) || 0;
  const failedGoals = Number(summary && summary.failed_goals) || 0;
  const processedGoals = Number(summary && summary.processed_goals) || results.length;
  const completionRate = Number(((completedGoals / totalGoals) * 100).toFixed(2));
  const failureRate = Number(((failedGoals / totalGoals) * 100).toFixed(2));
  const averageWaitTicks = Number(
    (
      results.reduce((sum, item) => sum + (Number(item && item.wait_ticks) || 0), 0) /
      (results.length || 1)
    ).toFixed(2)
  );
  const highComplexityGoals = results.filter(item => (Number(item && item.goal_weight) || 0) >= 3).length;
  const highComplexityRatioPercent = Number(((highComplexityGoals / totalGoals) * 100).toFixed(2));
  const retry = summary && summary.batch_retry ? summary.batch_retry : {};
  const retryHistory = Array.isArray(retry.history) ? retry.history : [];
  const firstRoundUnresolved = retryHistory.length > 0
    ? (Number(retryHistory[0].failed_goals) || 0) + (Number(retryHistory[0].unprocessed_goals) || 0)
    : failedGoals;
  const recoveredGoals = Math.max(0, firstRoundUnresolved - failedGoals);
  const retryRecoveryRatePercent = firstRoundUnresolved > 0
    ? Number(((recoveredGoals / firstRoundUnresolved) * 100).toFixed(2))
    : 100;

  let convergenceState = 'converged';
  if (summary && summary.status === 'partial-failed') {
    convergenceState = 'at-risk';
  } else if (summary && summary.status === 'failed') {
    convergenceState = 'blocked';
  }

  let riskLevel = 'low';
  if (failureRate > 20 || convergenceState === 'blocked') {
    riskLevel = 'high';
  } else if (failureRate > 0 || (Number(retry.performed_rounds) || 0) > 0) {
    riskLevel = 'medium';
  }

  return {
    generated_at: now(),
    completion_rate_percent: completionRate,
    failure_rate_percent: failureRate,
    processed_goals: processedGoals,
    high_complexity_goal_ratio_percent: highComplexityRatioPercent,
    average_wait_ticks: averageWaitTicks,
    retry_rounds_performed: Number(retry.performed_rounds) || 0,
    retry_recovery_rate_percent: retryRecoveryRatePercent,
    convergence_state: convergenceState,
    risk_level: riskLevel
  };
}

module.exports = {
  resolveResultSourceIndex,
  getBatchFailureStatusSet,
  buildProgramCoordinationSnapshot,
  mergeProgramRecoveryIntoProgramSummary,
  buildProgramKpiSnapshot
};
