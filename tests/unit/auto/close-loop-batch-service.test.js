const { executeCloseLoopBatch } = require('../../../lib/auto/close-loop-batch-service');

describe('auto close-loop batch service', () => {
  test('builds batch summary and program diagnostics for program mode', async () => {
    const persisted = [];
    const outputs = [];
    const programKpis = [];
    const summary = await executeCloseLoopBatch({
      file: 'goals.lines',
      goals: ['goal-a', 'goal-b'],
      resumedFromSummary: { id: 'summary-1' },
      generatedFromGoal: { goal: 'parent-goal' },
      goal_entries: [{ goal: 'goal-a' }, { goal: 'goal-b' }]
    }, {
      out: 'batch.json',
      programKpiOut: 'program-kpi.json'
    }, 'proj', 'auto-close-loop-program', {
      buildGoalInputGuard: () => ({ over_limit: false, hard_fail_triggered: false, duplicate_goals: 0, max_duplicate_goals: 3 }),
      startSpecSessionBudgetEvaluation: async () => ({ hard_fail: false }),
      resolveBatchAutonomousPolicy: () => ({
        options: {
          continueOnError: true,
          batchParallel: 2,
          batchAgentBudget: 5,
          batchPriority: 'fifo',
          batchAgingFactor: 1,
          batchRetryRounds: 1,
          batchRetryStrategy: 'failed-only',
          batchRetryUntilComplete: false,
          batchRetryMaxRounds: 2
        },
        summary: { enabled: true, profile: 'default' }
      }),
      normalizeBatchParallel: (value) => value,
      runCloseLoopBatchWithRetries: async () => ({
        results: [{ status: 'completed' }, { status: 'failed' }],
        stoppedEarly: false,
        effectiveParallel: 2,
        resourcePlan: { strategy: 'fifo' },
        retry: { enabled: true }
      }),
      buildBatchRunOptions: (input) => ({ mode: 'run', input }),
      buildBatchMetrics: (results, totalGoals) => ({ totalGoals, processed: results.length }),
      collectSpecNamesFromBatchSummary: () => ['spec-a'],
      maybePruneSpecSessionsWithPolicy: async () => ({ pruned: 1 }),
      finalizeSpecSessionBudgetEvaluation: async () => ({ total_after: 4 }),
      buildSpecSessionGrowthGuard: () => ({ ok: true }),
      buildProgramKpiSnapshot: () => ({ coverage: 100 }),
      buildProgramDiagnostics: () => ({ risk: 'medium' }),
      buildProgramCoordinationSnapshot: () => ({ handoff: 'ready' }),
      maybeWriteProgramKpi: async (result, out, projectPath) => { programKpis.push({ result, out, projectPath }); },
      maybePersistCloseLoopBatchSummary: async (result) => { persisted.push(result); },
      maybeWriteOutput: async (result, out, projectPath) => { outputs.push({ result, out, projectPath }); }
    });

    expect(summary).toEqual(expect.objectContaining({
      mode: 'auto-close-loop-program',
      status: 'partial-failed',
      total_goals: 2,
      processed_goals: 2,
      completed_goals: 1,
      failed_goals: 1,
      program_kpi: { coverage: 100 },
      program_diagnostics: { risk: 'medium' },
      program_coordination: { handoff: 'ready' },
      spec_session_prune: { pruned: 1 },
      spec_session_budget: { total_after: 4 },
      spec_session_growth_guard: { ok: true }
    }));
    expect(programKpis).toHaveLength(1);
    expect(persisted).toHaveLength(1);
    expect(outputs).toHaveLength(1);
  });

  test('fails fast when spec session budget is already over hard limit', async () => {
    await expect(executeCloseLoopBatch({ file: 'goals.lines', goals: ['goal-a'] }, {}, 'proj', 'auto-close-loop-batch', {
      buildGoalInputGuard: () => ({ over_limit: false, hard_fail_triggered: false }),
      startSpecSessionBudgetEvaluation: async () => ({ hard_fail: true, over_limit_before: true, total_before: 7, max_total: 5 })
    })).rejects.toThrow('Spec session budget exceeded before run: 7 > 5');
  });
});
