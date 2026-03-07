async function applyProgramGateAutoRemediation(summary, context = {}, dependencies = {}) {
  const {
    collectSpecNamesFromBatchSummary,
    pruneSpecSessions,
    readSpecSessionEntries,
    now = () => new Date().toISOString(),
    cwd = () => process.cwd()
  } = dependencies;

  const projectPath = context && context.projectPath ? context.projectPath : cwd();
  const options = context && context.options && typeof context.options === 'object'
    ? context.options
    : {};
  const gate = summary && summary.program_gate && typeof summary.program_gate === 'object'
    ? summary.program_gate
    : null;
  const policy = gate && gate.policy && typeof gate.policy === 'object' ? gate.policy : {};
  const reasons = Array.isArray(gate && gate.reasons) ? gate.reasons : [];
  const actions = [];
  const nextRunPatch = {};

  const maxAgentBudget = Number(policy.max_agent_budget);
  if (
    reasons.some(reason => `${reason || ''}`.includes('agent_budget')) &&
    Number.isFinite(maxAgentBudget) &&
    maxAgentBudget > 0
  ) {
    const currentAgentBudget = Number(options.batchAgentBudget || (summary && summary.batch_parallel) || 0);
    nextRunPatch.batchAgentBudget = maxAgentBudget;
    nextRunPatch.batchParallel = Math.max(1, Math.min(currentAgentBudget || maxAgentBudget, maxAgentBudget));
    actions.push({
      type: 'reduce-agent-budget',
      applied: true,
      details: `Set batchAgentBudget=${nextRunPatch.batchAgentBudget}, batchParallel=${nextRunPatch.batchParallel}.`
    });
  }

  const maxTotalSubSpecs = Number(policy.max_total_sub_specs);
  if (
    reasons.some(reason => `${reason || ''}`.includes('total_sub_specs')) &&
    Number.isFinite(maxTotalSubSpecs) &&
    maxTotalSubSpecs > 0
  ) {
    const avgSubSpecs = Number(summary && summary.metrics && summary.metrics.average_sub_specs_per_goal) || 1;
    const totalGoals = Number(summary && summary.total_goals) || 2;
    const suggestedProgramGoals = Math.max(2, Math.min(totalGoals, Math.floor(maxTotalSubSpecs / Math.max(1, avgSubSpecs))));
    nextRunPatch.programGoals = suggestedProgramGoals;
    actions.push({
      type: 'shrink-goal-width',
      applied: true,
      details: `Set programGoals=${suggestedProgramGoals} using max_total_sub_specs=${maxTotalSubSpecs}.`
    });
  }

  const maxElapsedMinutes = Number(policy.max_elapsed_minutes);
  if (
    reasons.some(reason => `${reason || ''}`.includes('program_elapsed_minutes')) &&
    Number.isFinite(maxElapsedMinutes) &&
    maxElapsedMinutes > 0
  ) {
    const totalGoals = Number(summary && summary.total_goals) || 2;
    const reducedProgramGoals = Math.max(2, Math.min(totalGoals, Math.ceil(totalGoals * 0.8)));
    nextRunPatch.programGoals = Math.min(
      Number(nextRunPatch.programGoals) || reducedProgramGoals,
      reducedProgramGoals
    );
    nextRunPatch.batchRetryRounds = 0;
    actions.push({
      type: 'time-budget-constrain',
      applied: true,
      details: `Set programGoals=${nextRunPatch.programGoals}, batchRetryRounds=0 for elapsed budget ${maxElapsedMinutes}m.`
    });
  }

  let appliedSpecPrune = null;
  const specBudget = summary && summary.spec_session_budget && summary.spec_session_budget.enabled
    ? summary.spec_session_budget
    : null;
  if (specBudget && specBudget.over_limit_after && Number.isFinite(Number(specBudget.max_total))) {
    try {
      const currentRunSpecNames = collectSpecNamesFromBatchSummary(summary || {});
      appliedSpecPrune = await pruneSpecSessions(projectPath, {
        keep: Number(specBudget.max_total),
        olderThanDays: null,
        dryRun: false,
        protectActive: true,
        protectWindowDays: options.specSessionProtectWindowDays,
        additionalProtectedSpecs: currentRunSpecNames
      });
      summary.spec_session_auto_prune = appliedSpecPrune;
      const specsAfter = await readSpecSessionEntries(projectPath);
      const totalAfter = specsAfter.length;
      const prunedCount = Number(appliedSpecPrune && appliedSpecPrune.deleted_count) || 0;
      summary.spec_session_budget = {
        ...specBudget,
        total_after: totalAfter,
        pruned_count: (Number(specBudget.pruned_count) || 0) + prunedCount,
        estimated_created: Math.max(0, totalAfter + ((Number(specBudget.pruned_count) || 0) + prunedCount) - specBudget.total_before),
        over_limit_after: totalAfter > specBudget.max_total,
        hard_fail_triggered: Boolean(specBudget.hard_fail && totalAfter > specBudget.max_total)
      };
      actions.push({
        type: 'trigger-spec-prune',
        applied: true,
        details: `Pruned specs to enforce max_total=${specBudget.max_total}. deleted=${appliedSpecPrune.deleted_count}`
      });
    } catch (error) {
      actions.push({
        type: 'trigger-spec-prune',
        applied: false,
        error: error.message
      });
    }
  }

  const hasPatch = Object.keys(nextRunPatch).length > 0;
  return {
    enabled: true,
    attempted_at: now(),
    reason_count: reasons.length,
    reasons,
    actions,
    next_run_patch: hasPatch ? nextRunPatch : null,
    applied_spec_prune: appliedSpecPrune
  };
}

module.exports = {
  applyProgramGateAutoRemediation
};
