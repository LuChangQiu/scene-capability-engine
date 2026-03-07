const chalk = require('chalk');
const { printCloseLoopBatchSummary } = require('../../../lib/auto/batch-output');

describe('auto batch output helper', () => {
  test('prints close-loop program summary lines', () => {
    const lines = [];
    const consoleLike = { log: (line) => lines.push(line) };

    printCloseLoopBatchSummary(chalk, {
      mode: 'auto-close-loop-program',
      status: 'partial-failed',
      processed_goals: 2,
      total_goals: 3,
      completed_goals: 1,
      failed_goals: 1,
      batch_parallel: 2,
      autonomous_policy: { enabled: true, profile: 'default' },
      batch_retry: { performed_rounds: 1, configured_rounds: 2 },
      resource_plan: { agent_budget: 3, per_goal_max_parallel: 1 },
      metrics: { success_rate_percent: 50 },
      program_kpi: { convergence_state: 'at-risk', risk_level: 'medium', retry_recovery_rate_percent: 50 },
      program_gate: {
        passed: false,
        policy: { profile: 'default', min_success_rate_percent: 100, max_risk_level: 'low', max_elapsed_minutes: 10, max_agent_budget: 2, max_total_sub_specs: 3 },
        actual: { elapsed_minutes: 12, agent_budget: 3, total_sub_specs: 4 }
      },
      program_gate_effective: { source: 'fallback-chain', fallback_profile: 'enterprise' },
      program_diagnostics: { remediation_actions: [{ action: 'Reduce parallel pressure' }] },
      recovery_cycle: { enabled: true, performed_rounds: 1, max_rounds: 2, budget_exhausted: true },
      auto_recovery: { triggered: true, recovery_status: 'partial-failed', selected_action_index: 2, selection_source: 'memory' },
      program_governance: { enabled: true, performed_rounds: 1, max_rounds: 2, stop_reason: 'gate-pass', action_selection_enabled: true, auto_action_enabled: true, pinned_action_index: 2, history: [{ selected_action_index: 2, selected_action: 'retry' }], exhausted: true },
      program_kpi_anomalies: [{ severity: 'high' }, { severity: 'low' }],
      program_coordination: { master_spec_count: 1, sub_spec_count: 4, unresolved_goal_count: 1 },
      batch_session: { file: 'batch.json' },
      goal_input_guard: { enabled: true, duplicate_goals: 1, max_duplicate_goals: 3, over_limit: true },
      spec_session_prune: { enabled: true, deleted_count: 2, protected_count: 1 },
      spec_session_budget: { enabled: true, total_after: 5, max_total: 4, estimated_created: 2, pruned_count: 1, over_limit_after: true },
      spec_session_growth_guard: { enabled: true, estimated_created: 2, estimated_created_per_goal: 1, over_limit: true, reasons: ['too-many'] },
      program_gate_auto_remediation: { enabled: true, actions: [{ type: 'prune' }], next_run_patch: { batchParallel: 1 } },
      program_kpi_file: 'program-kpi.json',
      program_audit_file: 'program-audit.json',
      output_file: 'summary.json'
    }, {}, consoleLike);

    expect(lines.join('\n')).toContain('Autonomous close-loop program summary');
    expect(lines.join('\n')).toContain('Program gate fallback accepted: profile=enterprise');
    expect(lines.join('\n')).toContain('Program governance exhausted before reaching stable state.');
    expect(lines.join('\n')).toContain('Program KPI file: program-kpi.json');
    expect(lines.join('\n')).toContain('Program audit file: program-audit.json');
  });

  test('prints json payload directly when json option is enabled', () => {
    const lines = [];
    const consoleLike = { log: (line) => lines.push(line) };
    printCloseLoopBatchSummary(chalk, { mode: 'auto-close-loop-batch', status: 'completed' }, { json: true }, consoleLike);
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });
});
