function printCloseLoopBatchSummary(chalk, summary, options = {}, consoleLike = console) {
  if (options.json) {
    consoleLike.log(JSON.stringify(summary, null, 2));
    return;
  }

  const title = summary.mode === 'auto-close-loop-program'
    ? 'Autonomous close-loop program summary'
    : summary.mode === 'auto-close-loop-recover'
      ? 'Autonomous close-loop recovery summary'
      : 'Autonomous close-loop batch summary';
  consoleLike.log(chalk.blue(title));
  consoleLike.log(chalk.gray(`  Status: ${summary.status}`));
  consoleLike.log(chalk.gray(`  Processed: ${summary.processed_goals}/${summary.total_goals}`));
  consoleLike.log(chalk.gray(`  Completed: ${summary.completed_goals}`));
  consoleLike.log(chalk.gray(`  Failed: ${summary.failed_goals}`));
  consoleLike.log(chalk.gray(`  Batch parallel: ${summary.batch_parallel}`));
  if (summary.autonomous_policy && summary.autonomous_policy.enabled) {
    consoleLike.log(chalk.gray(`  Autonomous policy: ${summary.autonomous_policy.profile}`));
  }
  if (summary.batch_retry && summary.batch_retry.performed_rounds > 0) {
    consoleLike.log(chalk.gray(
      `  Batch retry: ${summary.batch_retry.performed_rounds}/${summary.batch_retry.configured_rounds} extra rounds`
    ));
  }
  if (summary.batch_retry && summary.batch_retry.recovery_recommended) {
    consoleLike.log(chalk.yellow(
      `  Rate-limit recovery recommended: signals=${summary.batch_retry.total_rate_limit_signals || 0}, ` +
      `backoff=${summary.batch_retry.total_rate_limit_backoff_ms || 0}ms`
    ));
    if (summary.batch_retry.recovery_suggested_command) {
      consoleLike.log(chalk.yellow(`  Suggested command: ${summary.batch_retry.recovery_suggested_command}`));
    }
  }
  if (summary.resource_plan.agent_budget !== null) {
    consoleLike.log(chalk.gray(
      `  Agent budget: ${summary.resource_plan.agent_budget} ` +
      `(per-goal maxParallel=${summary.resource_plan.per_goal_max_parallel})`
    ));
  }
  consoleLike.log(chalk.gray(`  Success rate: ${summary.metrics.success_rate_percent}%`));
  if (summary.program_kpi) {
    consoleLike.log(chalk.gray(
      `  Program KPI: ${summary.program_kpi.convergence_state}, ` +
      `risk=${summary.program_kpi.risk_level}, ` +
      `retry-recovery=${summary.program_kpi.retry_recovery_rate_percent}%`
    ));
  }
  if (summary.program_gate) {
    consoleLike.log(chalk.gray(
      `  Program gate: ${summary.program_gate.passed ? 'passed' : 'failed'} ` +
      `(profile=${summary.program_gate.policy.profile || 'default'}, ` +
      `min-success=${summary.program_gate.policy.min_success_rate_percent}%, ` +
      `max-risk=${summary.program_gate.policy.max_risk_level})`
    ));
    const gatePolicy = summary.program_gate.policy || {};
    const gateActual = summary.program_gate.actual || {};
    if (
      gatePolicy.max_elapsed_minutes !== null ||
      gatePolicy.max_agent_budget !== null ||
      gatePolicy.max_total_sub_specs !== null
    ) {
      consoleLike.log(chalk.gray(
        `  Program budget gate: elapsed=${gateActual.elapsed_minutes ?? 'n/a'}/${gatePolicy.max_elapsed_minutes ?? 'n/a'} min, ` +
        `agent=${gateActual.agent_budget ?? 'n/a'}/${gatePolicy.max_agent_budget ?? 'n/a'}, ` +
        `sub-specs=${gateActual.total_sub_specs ?? 'n/a'}/${gatePolicy.max_total_sub_specs ?? 'n/a'}`
      ));
    }
    if (
      summary.program_gate_effective &&
      summary.program_gate_effective.source !== 'primary' &&
      summary.program_gate_effective.fallback_profile
    ) {
      consoleLike.log(chalk.gray(
        `  Program gate fallback accepted: profile=${summary.program_gate_effective.fallback_profile}`
      ));
    }
  }
  if (
    summary.program_diagnostics &&
    Array.isArray(summary.program_diagnostics.remediation_actions) &&
    summary.program_diagnostics.remediation_actions.length > 0
  ) {
    const topAction = summary.program_diagnostics.remediation_actions[0];
    consoleLike.log(chalk.gray(`  Top remediation: ${topAction.action}`));
  }
  if (summary.recovery_cycle && summary.recovery_cycle.enabled) {
    consoleLike.log(chalk.gray(
      `  Recovery rounds: ${summary.recovery_cycle.performed_rounds}/${summary.recovery_cycle.max_rounds}`
    ));
    if (summary.recovery_cycle.budget_exhausted) {
      consoleLike.log(chalk.gray('  Recovery time budget exhausted before convergence.'));
    }
  }
  if (summary.auto_recovery && summary.auto_recovery.triggered) {
    consoleLike.log(chalk.gray(
      `  Program auto-recovery: ${summary.auto_recovery.recovery_status} ` +
      `(action ${summary.auto_recovery.selected_action_index || 'n/a'}, ` +
      `source=${summary.auto_recovery.selection_source || 'default'})`
    ));
  }
  if (summary.program_governance && summary.program_governance.enabled) {
    consoleLike.log(chalk.gray(
      `  Program governance: ${summary.program_governance.performed_rounds}/` +
      `${summary.program_governance.max_rounds} rounds, stop=${summary.program_governance.stop_reason}`
    ));
    if (summary.program_governance.action_selection_enabled) {
      consoleLike.log(chalk.gray(
        `  Governance action selection: ` +
        `${summary.program_governance.auto_action_enabled ? 'auto' : 'manual-only'}, ` +
        `pinned=${summary.program_governance.pinned_action_index || 'none'}`
      ));
    }
    if (Array.isArray(summary.program_governance.history) && summary.program_governance.history.length > 0) {
      const latestRound = summary.program_governance.history[summary.program_governance.history.length - 1];
      if (latestRound && latestRound.selected_action) {
        consoleLike.log(chalk.gray(
          `  Governance selected action: #${latestRound.selected_action_index || 'n/a'} ${latestRound.selected_action}`
        ));
      }
    }
    if (summary.program_governance.exhausted) {
      consoleLike.log(chalk.yellow('  Program governance exhausted before reaching stable state.'));
    }
  }
  if (Array.isArray(summary.program_kpi_anomalies) && summary.program_kpi_anomalies.length > 0) {
    const highCount = summary.program_kpi_anomalies
      .filter(item => `${item && item.severity ? item.severity : ''}`.trim().toLowerCase() === 'high')
      .length;
    consoleLike.log(chalk.gray(
      `  Program KPI anomalies: total=${summary.program_kpi_anomalies.length}, high=${highCount}`
    ));
  }
  if (summary.program_coordination) {
    consoleLike.log(chalk.gray(
      `  Master/Sub sync: masters=${summary.program_coordination.master_spec_count}, ` +
      `sub-specs=${summary.program_coordination.sub_spec_count}, ` +
      `unresolved=${summary.program_coordination.unresolved_goal_count}`
    ));
  }
  if (summary.batch_session && summary.batch_session.file) {
    consoleLike.log(chalk.gray(`  Batch session: ${summary.batch_session.file}`));
  }
  if (summary.goal_input_guard && summary.goal_input_guard.enabled) {
    consoleLike.log(chalk.gray(
      `  Goal duplicate guard: duplicates=${summary.goal_input_guard.duplicate_goals}/` +
      `${summary.goal_input_guard.max_duplicate_goals}`
    ));
    if (summary.goal_input_guard.over_limit) {
      consoleLike.log(chalk.yellow('  Goal duplicate guard exceeded.'));
    }
  }
  if (summary.spec_session_prune && summary.spec_session_prune.enabled) {
    consoleLike.log(chalk.gray(
      `  Spec prune: deleted=${summary.spec_session_prune.deleted_count}, ` +
      `protected=${summary.spec_session_prune.protected_count}`
    ));
  }
  if (summary.spec_session_budget && summary.spec_session_budget.enabled) {
    consoleLike.log(chalk.gray(
      `  Spec budget: ${summary.spec_session_budget.total_after}/${summary.spec_session_budget.max_total} ` +
      `(created~${summary.spec_session_budget.estimated_created}, pruned=${summary.spec_session_budget.pruned_count})`
    ));
    if (summary.spec_session_budget.over_limit_after) {
      consoleLike.log(chalk.yellow(
        `  Spec budget exceeded (${summary.spec_session_budget.total_after} > ${summary.spec_session_budget.max_total})`
      ));
    }
  }
  if (summary.spec_session_growth_guard && summary.spec_session_growth_guard.enabled) {
    consoleLike.log(chalk.gray(
      `  Spec growth guard: created~${summary.spec_session_growth_guard.estimated_created}` +
      ` (per-goal=${summary.spec_session_growth_guard.estimated_created_per_goal})`
    ));
    if (summary.spec_session_growth_guard.over_limit) {
      consoleLike.log(chalk.yellow(`  Spec growth guard exceeded: ${summary.spec_session_growth_guard.reasons.join('; ')}`));
    }
  }
  if (summary.program_gate_auto_remediation && summary.program_gate_auto_remediation.enabled) {
    const autoRemediationActions = Array.isArray(summary.program_gate_auto_remediation.actions)
      ? summary.program_gate_auto_remediation.actions
      : [];
    consoleLike.log(chalk.gray(
      `  Program auto-remediation: actions=${autoRemediationActions.length}, ` +
      `next-patch=${summary.program_gate_auto_remediation.next_run_patch ? 'yes' : 'no'}`
    ));
  }
  if (summary.program_kpi_file) {
    consoleLike.log(chalk.gray(`  Program KPI file: ${summary.program_kpi_file}`));
  }
  if (summary.program_audit_file) {
    consoleLike.log(chalk.gray(`  Program audit file: ${summary.program_audit_file}`));
  }
  if (summary.output_file) {
    consoleLike.log(chalk.gray(`  Output: ${summary.output_file}`));
  }
}

module.exports = {
  printCloseLoopBatchSummary
};
