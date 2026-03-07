const {
  buildAutoGovernanceMaintenancePlan,
  summarizeGovernanceMaintenanceExecution
} = require('../../../lib/auto/governance-maintenance-presenter');

describe('auto governance maintenance presenter', () => {
  test('builds maintenance plan from assessment and policy', () => {
    const plan = buildAutoGovernanceMaintenancePlan({
      totals: { failed_sessions: 1, pending_goals_sum: 2, total_sessions: 120 },
      archives: {
        batch_session: { total_sessions: 60 },
        controller_session: { total_sessions: 70 }
      },
      recovery_memory: { signature_count: 3 },
      release_gate: { available: true, latest_gate_passed: false, blocked_reasons: ['release-gate-failed'] }
    }, {
      session_keep: 50,
      batch_session_keep: 50,
      controller_session_keep: 50
    }, true);

    expect(plan.map((item) => item.id)).toEqual(expect.arrayContaining([
      'release-gate-review',
      'session-prune',
      'batch-session-prune',
      'controller-session-prune',
      'recovery-memory-prune',
      'recover-latest',
      'controller-resume-latest'
    ]));
  });

  test('summarizes maintenance execution', () => {
    const summary = summarizeGovernanceMaintenanceExecution([
      { enabled: true, apply_supported: true },
      { enabled: true, apply_supported: false },
      { enabled: false, apply_supported: true }
    ], [
      { status: 'applied' },
      { status: 'failed' }
    ]);

    expect(summary).toEqual({
      planned_actions: 2,
      applicable_actions: 1,
      advisory_actions: 1,
      applied_actions: 1,
      failed_actions: 1
    });
  });
});
