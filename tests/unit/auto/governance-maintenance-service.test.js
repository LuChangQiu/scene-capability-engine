const { runAutoGovernanceMaintenance } = require('../../../lib/auto/governance-maintenance-service');

describe('auto governance maintenance service', () => {
  test('builds assessment, applies maintenance actions, and summarizes result', async () => {
    const calls = [];
    const buildAutoGovernanceStats = jest.fn()
      .mockResolvedValueOnce({ totals: { failed_sessions: 1 }, throughput: { controller_pending_goals_sum: 0 } })
      .mockResolvedValueOnce({ totals: { failed_sessions: 0 }, throughput: { controller_pending_goals_sum: 0 } });

    const result = await runAutoGovernanceMaintenance('proj', {
      apply: true,
      days: 7
    }, {
      normalizeStatsWindowDays: (value) => value,
      normalizeStatusFilter: () => [],
      normalizeGovernanceKeepOption: (_value, _flag, fallback) => fallback,
      normalizeGovernanceRecoveryOlderThanDays: (_value, fallback) => fallback,
      buildAutoGovernanceStats,
      buildAutoGovernanceMaintenancePlan: () => ([
        { id: 'session-prune', enabled: true, apply_supported: true },
        { id: 'recover-latest', enabled: true, apply_supported: false }
      ]),
      evaluateGovernanceReleaseGateBlockState: () => ({ blocked: false, reasons: [] }),
      pruneCloseLoopSessions: async (_projectPath, options) => {
        calls.push({ id: 'session-prune', options });
        return { ok: true };
      },
      pruneCloseLoopBatchSummarySessionsCli: async () => ({ ok: true }),
      pruneCloseLoopControllerSessionsCli: async () => ({ ok: true }),
      pruneCloseLoopRecoveryMemory: async () => ({ ok: true }),
      summarizeGovernanceMaintenanceExecution: (plan, executedActions) => ({
        planned_actions: plan.length,
        executed_actions: executedActions.length,
        failed_actions: 0
      }),
      now: () => new Date('2026-03-07T00:00:00.000Z')
    });

    expect(buildAutoGovernanceStats).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([
      {
        id: 'session-prune',
        options: { keep: 50, olderThanDays: null, dryRun: false }
      }
    ]);
    expect(result).toEqual(expect.objectContaining({
      mode: 'auto-governance-maintain',
      apply: true,
      dry_run: false,
      summary: expect.objectContaining({
        planned_actions: 2,
        executed_actions: 1,
        failed_actions: 0
      })
    }));
    expect(result.after_assessment).toEqual({ totals: { failed_sessions: 0 }, throughput: { controller_pending_goals_sum: 0 } });
  });
});
