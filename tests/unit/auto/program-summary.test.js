const {
  resolveResultSourceIndex,
  getBatchFailureStatusSet,
  buildProgramCoordinationSnapshot,
  mergeProgramRecoveryIntoProgramSummary,
  buildProgramKpiSnapshot
} = require('../../../lib/auto/program-summary');

describe('auto program summary helpers', () => {
  test('resolves source indexes deterministically', () => {
    expect(resolveResultSourceIndex({ source_index: 4 }, 0)).toBe(4);
    expect(resolveResultSourceIndex({ index: 3 }, 0)).toBe(2);
    expect(resolveResultSourceIndex({}, 5)).toBe(5);
  });

  test('returns standard batch failure statuses', () => {
    expect([...getBatchFailureStatusSet()].sort()).toEqual(['error', 'failed', 'stopped', 'unknown']);
  });

  test('builds program coordination snapshot', () => {
    const result = buildProgramCoordinationSnapshot({
      results: [
        { status: 'completed', index: 1, sub_spec_count: 2, master_spec: 'm1' },
        { status: 'failed', index: 2, sub_spec_count: 1, master_spec: 'm1' },
        { status: 'error', source_index: 4, sub_spec_count: 3, master_spec: 'm2' }
      ],
      batch_parallel: 3,
      resource_plan: { agent_budget: 5, scheduling_strategy: 'aging', aging_factor: 1.5 }
    });

    expect(result).toEqual(expect.objectContaining({
      topology: 'master-sub',
      master_spec_count: 2,
      sub_spec_count: 6,
      unresolved_goal_count: 2,
      unresolved_goal_indexes: [2, 5]
    }));
    expect(result.scheduler).toEqual(expect.objectContaining({
      batch_parallel: 3,
      agent_budget: 5,
      priority: 'aging',
      aging_factor: 1.5
    }));
  });

  test('merges recovery summary back into program summary', () => {
    const merged = mergeProgramRecoveryIntoProgramSummary({
      status: 'failed',
      total_goals: 2,
      batch_parallel: 1,
      resource_plan: { agent_budget: 1 },
      results: [
        { index: 1, status: 'failed', goal: 'a' },
        { index: 2, status: 'completed', goal: 'b' }
      ]
    }, {
      status: 'completed',
      batch_parallel: 2,
      resource_plan: { agent_budget: 2 },
      results: [
        { index: 1, status: 'completed', goal: 'a' }
      ],
      recovered_from_summary: { selected_action_index: 2 },
      recovery_plan: { selection_source: 'memory' },
      recovery_cycle: { rounds: 1 },
      recovery_memory: { hit: true }
    }, {
      enabled: true,
      triggered: true
    }, {
      buildBatchMetrics: (results, totalGoals) => ({ processed: results.length, totalGoals }),
      mergeBatchResourcePlans: (_base, next) => next
    });

    expect(merged.status).toBe('completed');
    expect(merged.completed_goals).toBe(2);
    expect(merged.failed_goals).toBe(0);
    expect(merged.batch_parallel).toBe(2);
    expect(merged.results[0]).toEqual(expect.objectContaining({
      goal: 'a',
      status: 'completed',
      recovered_by_program: true
    }));
    expect(merged.auto_recovery).toEqual(expect.objectContaining({
      enabled: true,
      triggered: true,
      selection_source: 'memory',
      selected_action_index: 2
    }));
  });

  test('builds program KPI snapshot', () => {
    const snapshot = buildProgramKpiSnapshot({
      status: 'partial-failed',
      total_goals: 4,
      processed_goals: 4,
      completed_goals: 3,
      failed_goals: 1,
      results: [
        { wait_ticks: 2, goal_weight: 1 },
        { wait_ticks: 4, goal_weight: 3 },
        { wait_ticks: 0, goal_weight: 4 },
        { wait_ticks: 2, goal_weight: 1 }
      ],
      batch_retry: {
        performed_rounds: 1,
        history: [{ failed_goals: 2, unprocessed_goals: 0 }]
      }
    }, {
      now: () => '2026-03-07T00:00:00.000Z'
    });

    expect(snapshot).toEqual(expect.objectContaining({
      generated_at: '2026-03-07T00:00:00.000Z',
      completion_rate_percent: 75,
      failure_rate_percent: 25,
      processed_goals: 4,
      high_complexity_goal_ratio_percent: 50,
      average_wait_ticks: 2,
      retry_rounds_performed: 1,
      retry_recovery_rate_percent: 50,
      convergence_state: 'at-risk',
      risk_level: 'high'
    }));
  });
});
