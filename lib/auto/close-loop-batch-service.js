async function executeCloseLoopBatch(goalsResult, options, projectPath, mode = 'auto-close-loop-batch', dependencies = {}) {
  const {
    buildGoalInputGuard,
    startSpecSessionBudgetEvaluation,
    resolveBatchAutonomousPolicy,
    normalizeBatchParallel,
    runCloseLoopBatchWithRetries,
    buildBatchRunOptions,
    buildBatchMetrics,
    collectSpecNamesFromBatchSummary,
    maybePruneSpecSessionsWithPolicy,
    finalizeSpecSessionBudgetEvaluation,
    buildSpecSessionGrowthGuard,
    buildProgramKpiSnapshot,
    buildProgramDiagnostics,
    buildProgramCoordinationSnapshot,
    maybeWriteProgramKpi,
    maybePersistCloseLoopBatchSummary,
    maybeWriteOutput
  } = dependencies;

  const goalInputGuard = buildGoalInputGuard(goalsResult && goalsResult.goals, options);
  if (goalInputGuard.over_limit && goalInputGuard.hard_fail_triggered) {
    throw new Error(
      `Goal input duplicate guard exceeded: ${goalInputGuard.duplicate_goals} > ${goalInputGuard.max_duplicate_goals}. ` +
      'Reduce duplicated goals or raise --spec-session-max-duplicate-goals.'
    );
  }

  const specSessionBudget = await startSpecSessionBudgetEvaluation(projectPath, options);
  if (specSessionBudget && specSessionBudget.hard_fail && specSessionBudget.over_limit_before) {
    throw new Error(
      `Spec session budget exceeded before run: ${specSessionBudget.total_before} > ${specSessionBudget.max_total}. ` +
      'Run "sce auto spec-session prune ..." or raise --spec-session-max-total.'
    );
  }

  const batchAutonomousPolicy = resolveBatchAutonomousPolicy(options, goalsResult.goals.length);
  const effectiveBatchOptions = batchAutonomousPolicy.options;
  const batchParallel = normalizeBatchParallel(effectiveBatchOptions.batchParallel);
  const batchRun = await runCloseLoopBatchWithRetries(goalsResult.goals, {
    projectPath,
    continueOnError: Boolean(effectiveBatchOptions.continueOnError),
    batchParallel,
    batchAgentBudget: effectiveBatchOptions.batchAgentBudget,
    batchPriority: effectiveBatchOptions.batchPriority,
    batchAgingFactor: effectiveBatchOptions.batchAgingFactor,
    batchRetryRounds: effectiveBatchOptions.batchRetryRounds,
    batchRetryStrategy: effectiveBatchOptions.batchRetryStrategy,
    batchRetryUntilComplete: effectiveBatchOptions.batchRetryUntilComplete,
    batchRetryMaxRounds: effectiveBatchOptions.batchRetryMaxRounds,
    goalEntries: Array.isArray(goalsResult.goal_entries) ? goalsResult.goal_entries : null,
    runOptions: buildBatchRunOptions(effectiveBatchOptions)
  });

  const results = batchRun.results;
  const stoppedEarly = batchRun.stoppedEarly;
  const failedStatuses = new Set(['failed', 'error', 'unknown', 'stopped']);
  const failedGoals = results.filter(item => failedStatuses.has(item.status)).length;
  const completedGoals = results.length - failedGoals;
  const status = failedGoals === 0
    ? 'completed'
    : completedGoals === 0
      ? 'failed'
      : 'partial-failed';
  const metrics = buildBatchMetrics(results, goalsResult.goals.length);

  const summary = {
    mode,
    status,
    goals_file: goalsResult.file,
    resumed_from_summary: goalsResult.resumedFromSummary || null,
    generated_from_goal: goalsResult.generatedFromGoal || null,
    total_goals: goalsResult.goals.length,
    processed_goals: results.length,
    completed_goals: completedGoals,
    failed_goals: failedGoals,
    batch_parallel: batchRun.effectiveParallel,
    autonomous_policy: batchAutonomousPolicy.summary,
    resource_plan: batchRun.resourcePlan,
    batch_retry: batchRun.retry,
    stopped_early: stoppedEarly,
    metrics,
    goal_input_guard: goalInputGuard,
    results
  };

  const currentRunSpecNames = collectSpecNamesFromBatchSummary(summary);
  summary.spec_session_prune = await maybePruneSpecSessionsWithPolicy(
    projectPath,
    options,
    currentRunSpecNames
  );
  summary.spec_session_budget = await finalizeSpecSessionBudgetEvaluation(
    projectPath,
    specSessionBudget,
    summary.spec_session_prune
  );
  summary.spec_session_growth_guard = buildSpecSessionGrowthGuard(summary, options);

  if (mode === 'auto-close-loop-program' || mode === 'auto-close-loop-recover') {
    summary.program_kpi = buildProgramKpiSnapshot(summary);
    summary.program_diagnostics = buildProgramDiagnostics(summary);
    summary.program_coordination = buildProgramCoordinationSnapshot(summary);
    await maybeWriteProgramKpi(summary, options.programKpiOut, projectPath);
  }

  await maybePersistCloseLoopBatchSummary(summary, options, projectPath);
  await maybeWriteOutput(summary, options.out, projectPath);

  return summary;
}

module.exports = {
  executeCloseLoopBatch
};
