const { applyProgramGateAutoRemediation } = require('../../../lib/auto/program-auto-remediation-service');

describe('auto program auto-remediation service', () => {
  test('builds next-run patch from budget, sub-spec, and elapsed constraints', async () => {
    const summary = {
      batch_parallel: 5,
      total_goals: 10,
      metrics: { average_sub_specs_per_goal: 2 },
      program_gate: {
        policy: {
          max_agent_budget: 3,
          max_total_sub_specs: 8,
          max_elapsed_minutes: 30
        },
        reasons: [
          'agent_budget 5 exceeds allowed 3',
          'total_sub_specs 20 exceeds allowed 8',
          'program_elapsed_minutes 40 exceeds allowed 30'
        ]
      }
    };

    const result = await applyProgramGateAutoRemediation(summary, {
      projectPath: 'proj',
      options: { batchAgentBudget: 5 }
    }, {
      collectSpecNamesFromBatchSummary: () => [],
      pruneSpecSessions: async () => { throw new Error('should not prune'); },
      readSpecSessionEntries: async () => [],
      now: () => '2026-03-08T00:00:00.000Z',
      cwd: () => 'cwd-proj'
    });

    expect(result).toEqual(expect.objectContaining({
      enabled: true,
      attempted_at: '2026-03-08T00:00:00.000Z',
      reason_count: 3,
      next_run_patch: expect.objectContaining({
        batchAgentBudget: 3,
        batchParallel: 3,
        programGoals: 4,
        batchRetryRounds: 0
      })
    }));
    expect(result.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'reduce-agent-budget', applied: true }),
      expect.objectContaining({ type: 'shrink-goal-width', applied: true }),
      expect.objectContaining({ type: 'time-budget-constrain', applied: true })
    ]));
  });

  test('triggers spec prune and rewrites spec budget snapshot', async () => {
    const summary = {
      program_gate: { policy: {}, reasons: [] },
      spec_session_budget: {
        enabled: true,
        over_limit_after: true,
        max_total: 3,
        pruned_count: 1,
        total_before: 5,
        hard_fail: true
      }
    };

    const result = await applyProgramGateAutoRemediation(summary, {
      projectPath: 'proj',
      options: { specSessionProtectWindowDays: 7 }
    }, {
      collectSpecNamesFromBatchSummary: () => ['spec-a'],
      pruneSpecSessions: async () => ({ deleted_count: 2 }),
      readSpecSessionEntries: async () => ([{ id: 1 }, { id: 2 }, { id: 3 }]),
      now: () => '2026-03-08T00:00:00.000Z',
      cwd: () => 'cwd-proj'
    });

    expect(result.applied_spec_prune).toEqual({ deleted_count: 2 });
    expect(result.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'trigger-spec-prune', applied: true })
    ]));
    expect(summary.spec_session_auto_prune).toEqual({ deleted_count: 2 });
    expect(summary.spec_session_budget).toEqual(expect.objectContaining({
      total_after: 3,
      pruned_count: 3,
      estimated_created: 1,
      over_limit_after: false,
      hard_fail_triggered: false
    }));
  });

  test('records prune failure without throwing', async () => {
    const summary = {
      program_gate: { policy: {}, reasons: [] },
      spec_session_budget: {
        enabled: true,
        over_limit_after: true,
        max_total: 2,
        pruned_count: 0,
        total_before: 4,
        hard_fail: false
      }
    };

    const result = await applyProgramGateAutoRemediation(summary, {}, {
      collectSpecNamesFromBatchSummary: () => [],
      pruneSpecSessions: async () => { throw new Error('boom'); },
      readSpecSessionEntries: async () => [],
      now: () => '2026-03-08T00:00:00.000Z',
      cwd: () => 'cwd-proj'
    });

    expect(result.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'trigger-spec-prune', applied: false, error: 'boom' })
    ]));
  });
});
