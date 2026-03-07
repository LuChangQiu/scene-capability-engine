const { presentGovernanceSessionStats } = require('../../../lib/auto/governance-stats-presenter');

describe('auto governance stats presenter', () => {
  test('presents governance session stats summary', () => {
    const payload = presentGovernanceSessionStats('proj', [
      { id: 'g2', status: 'completed', final_risk: 'low', performed_rounds: 2, execute_advisory: true, advisory_failed_actions: 1, release_gate_available: true, release_gate_latest_gate_passed: false, resumed_from_governance_session_id: 'g1', updated_at: '2026-03-07T00:00:00.000Z', file: 'g2.json' },
      { id: 'g1', status: 'failed', final_risk: 'high', performed_rounds: 3, stop_reason: 'risk-threshold', updated_at: '2026-03-06T00:00:00.000Z', file: 'g1.json' }
    ], {
      days: 7,
      status_filter: ['completed', 'failed'],
      resume_only: false,
      cutoff_ms: null
    }, {
      getGovernanceCloseLoopSessionDir: (value) => value + '/gov',
      buildStatusCounts: () => ({ completed: 1, failed: 1 }),
      parseAutoHandoffGateBoolean: (value) => value === true ? true : (value === false ? false : null)
    });

    expect(payload).toEqual(expect.objectContaining({
      mode: 'auto-governance-session-stats',
      total_sessions: 2,
      resumed_sessions: 1,
      completed_sessions: 1,
      failed_sessions: 1,
      release_gate: expect.objectContaining({ observed_sessions: 1, failed_sessions: 1 })
    }));
    expect(payload.status_counts).toEqual({ completed: 1, failed: 1 });
    expect(payload.latest_sessions).toHaveLength(2);
  });
});
