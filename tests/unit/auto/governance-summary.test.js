const {
  buildGovernanceConcerns,
  buildGovernanceRecommendations,
  buildAutoGovernanceMaintenancePlan,
  summarizeGovernanceMaintenanceExecution
} = require('../../../lib/auto/governance-summary');

describe('auto governance summary helpers', () => {
  test('builds governance concerns from failed sessions and gate signals', () => {
    const concerns = buildGovernanceConcerns({
      total_sessions: 3,
      failed_sessions: 1,
      pending_goals_sum: 2,
      release_gate: { available: true, latest_gate_passed: false },
      handoff_quality: { available: true, latest_gate_passed: false, latest_status: 'failed' }
    });

    expect(concerns).toEqual(expect.arrayContaining([
      '1 failed session(s) detected across governance archives.',
      '2 pending controller goal(s) remain unresolved.',
      'Latest release gate snapshot is failing.',
      'Latest handoff quality gate is failing.'
    ]));
  });

  test('builds governance recommendations from summary', () => {
    const recommendations = buildGovernanceRecommendations({
      failed_sessions: 1,
      pending_goals_sum: 1,
      release_gate: { available: true, latest_gate_passed: false },
      handoff_quality: { available: true, latest_gate_passed: false, latest_status: 'failed' }
    });

    expect(recommendations).toEqual(expect.arrayContaining([
      'Resume unresolved goals from the latest recoverable summary.',
      'Re-run release evidence and gate checks before the next program execution.',
      'Re-run handoff evidence review and failed-only continuation.'
    ]));
  });

  test('builds maintenance plan and execution summary', () => {
    const plan = buildAutoGovernanceMaintenancePlan({
      totals: { failed_sessions: 1, pending_goals_sum: 2 }
    }, { session_keep: 10 }, false);
    expect(plan.map((item) => item.action)).toEqual(expect.arrayContaining([
      'prune-close-loop-sessions',
      'resume-governance-close-loop',
      'apply-session-retention'
    ]));

    const summary = summarizeGovernanceMaintenanceExecution(plan, [
      { success: true },
      { success: false }
    ]);
    expect(summary).toEqual({
      planned_actions: 3,
      executed_actions: 2,
      failed_actions: 1,
      success: false
    });
  });
});
