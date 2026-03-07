const {
  hasRecoverableProgramGoals,
  applyProgramGovernancePatch,
  buildProgramGovernanceReplayGoalsResult,
  runProgramGovernanceLoop
} = require('../../../lib/auto/program-governance-loop-service');

describe('auto program governance loop service', () => {
  test('reports disabled governance state without executing rounds', async () => {
    const result = await runProgramGovernanceLoop({
      enabled: false,
      summary: { program_gate_effective: { passed: true } },
      maxRounds: 2,
      maxMinutes: 10,
      anomalyWeeks: 4,
      anomalyPeriod: 'week'
    }, {
      normalizeProgramGovernMaxRounds: (v) => v,
      normalizeProgramGovernMaxMinutes: (v) => v,
      normalizeProgramGovernAnomalyWeeks: (v) => v,
      normalizeAutoKpiTrendPeriod: (v) => v,
      normalizeProgramGovernUseAction: (v) => v ?? null,
      resolveProgramGatePolicy: (v) => v,
      normalizeRecoveryMemoryToken: (v) => v,
      normalizeResumeStrategy: (v) => v,
      normalizeRecoverMaxRounds: (v) => v,
      normalizeRecoverMaxMinutes: (v) => v,
      isSpecSessionBudgetHardFailure: () => false,
      isSpecSessionGrowthGuardHardFailure: () => false,
      getBatchFailureStatusSet: () => new Set(['failed'])
    });

    expect(result.governance).toEqual(expect.objectContaining({
      enabled: false,
      stop_reason: 'disabled',
      performed_rounds: 0,
      converged: true
    }));
  });

  test('replays program batch and converges after one governance round', async () => {
    const result = await runProgramGovernanceLoop({
      enabled: true,
      summary: {
        status: 'failed',
        failed_goals: 1,
        program_gate_effective: { passed: false },
        program_gate_auto_remediation: { next_run_patch: { batchParallel: 1 }, reasons: ['gate'] },
        results: []
      },
      projectPath: 'proj',
      programOptions: { batchParallel: 2 },
      baseGoalsResult: { file: 'goals.lines', goals: ['a'] },
      maxRounds: 2,
      maxMinutes: 10,
      anomalyEnabled: false,
      anomalyWeeks: 4,
      anomalyPeriod: 'week',
      governAutoActionEnabled: false,
      programGatePolicy: { profile: 'default' },
      gateFallbackChain: [],
      recoverResumeStrategy: 'pending',
      recoverMaxRounds: 2,
      recoverMaxMinutes: 10,
      programGateAutoRemediate: true
    }, {
      normalizeProgramGovernMaxRounds: (v) => v,
      normalizeProgramGovernMaxMinutes: (v) => v,
      normalizeProgramGovernAnomalyWeeks: (v) => v,
      normalizeAutoKpiTrendPeriod: (v) => v,
      normalizeProgramGovernUseAction: (v) => v ?? null,
      resolveProgramGatePolicy: (v) => v,
      normalizeRecoveryMemoryToken: (v) => v,
      normalizeResumeStrategy: (v) => v,
      normalizeRecoverMaxRounds: (v) => v,
      normalizeRecoverMaxMinutes: (v) => v,
      isSpecSessionBudgetHardFailure: () => false,
      isSpecSessionGrowthGuardHardFailure: () => false,
      buildAutoKpiTrend: async () => ({ anomalies: [] }),
      buildProgramAnomalyGovernancePatch: () => ({ patch: {}, reasons: [] }),
      loadCloseLoopRecoveryMemory: async () => ({ payload: {} }),
      buildRecoveryMemorySignature: () => 'sig',
      getRecoveryMemoryEntry: () => null,
      resolveRecoveryActionSelection: () => null,
      loadCloseLoopBatchSummaryPayload: async () => ({ file: 'summary.json', payload: {} }),
      executeCloseLoopRecoveryCycle: async () => { throw new Error('should not recover'); },
      mergeProgramRecoveryIntoProgramSummary: (a) => a,
      executeCloseLoopBatch: async () => ({ status: 'completed', failed_goals: 0, batch_parallel: 1, results: [], resource_plan: {} }),
      buildProgramKpiSnapshot: () => ({ completion_rate_percent: 100, risk_level: 'low' }),
      buildProgramDiagnostics: () => ({ failed_goal_count: 0 }),
      buildProgramCoordinationSnapshot: () => ({ topology: 'master-sub' }),
      applyProgramGateOutcome: async (summary) => { summary.program_gate_effective = { passed: true }; },
      getBatchFailureStatusSet: () => new Set(['failed']),
      now: (() => { let t = 1000; return () => (t += 1000); })(),
      cwd: () => 'cwd-proj'
    });

    expect(result.governance).toEqual(expect.objectContaining({
      enabled: true,
      stop_reason: 'gate-stable',
      performed_rounds: 1,
      converged: true
    }));
    expect(result.governance.history[0]).toEqual(expect.objectContaining({
      execution_mode: 'program-replay'
    }));
  });

  test('uses recover cycle when failed goals remain recoverable', async () => {
    const result = await runProgramGovernanceLoop({
      enabled: true,
      summary: {
        status: 'partial-failed',
        failed_goals: 1,
        program_gate_effective: { passed: false },
        program_gate_auto_remediation: { next_run_patch: { batchParallel: 1 }, reasons: ['gate'] },
        batch_session: { file: 'batch.json' },
        results: [{ status: 'failed' }]
      },
      projectPath: 'proj',
      programOptions: {},
      baseGoalsResult: { file: 'goals.lines', goals: ['a'] },
      maxRounds: 2,
      maxMinutes: 10,
      anomalyEnabled: false,
      anomalyWeeks: 4,
      anomalyPeriod: 'week',
      governAutoActionEnabled: true,
      programGatePolicy: { profile: 'default' },
      gateFallbackChain: [],
      recoverResumeStrategy: 'failed-only',
      recoverMaxRounds: 2,
      recoverMaxMinutes: 10,
      programRecoverUseAction: 2,
      programGateAutoRemediate: true
    }, {
      normalizeProgramGovernMaxRounds: (v) => v,
      normalizeProgramGovernMaxMinutes: (v) => v,
      normalizeProgramGovernAnomalyWeeks: (v) => v,
      normalizeAutoKpiTrendPeriod: (v) => v,
      normalizeProgramGovernUseAction: (v) => v ?? null,
      resolveProgramGatePolicy: (v) => v,
      normalizeRecoveryMemoryToken: (v) => v,
      normalizeResumeStrategy: (v) => v,
      normalizeRecoverMaxRounds: (v) => v,
      normalizeRecoverMaxMinutes: (v) => v,
      isSpecSessionBudgetHardFailure: () => false,
      isSpecSessionGrowthGuardHardFailure: () => false,
      buildAutoKpiTrend: async () => ({ anomalies: [] }),
      buildProgramAnomalyGovernancePatch: () => ({ patch: {}, reasons: [] }),
      loadCloseLoopRecoveryMemory: async () => ({ payload: {} }),
      buildRecoveryMemorySignature: () => 'sig',
      getRecoveryMemoryEntry: () => ({ id: 'mem' }),
      resolveRecoveryActionSelection: () => ({ selectedIndex: 2, selectionSource: 'memory', selectedAction: { action: 'retry', priority: 'high' }, selectionExplain: { reason: 'memory-hit' }, appliedPatch: { batchParallel: 1 } }),
      loadCloseLoopBatchSummaryPayload: async () => ({ file: 'batch.json', payload: {} }),
      executeCloseLoopRecoveryCycle: async () => ({ summary: { status: 'completed', failed_goals: 0, batch_parallel: 1, resource_plan: {} } }),
      mergeProgramRecoveryIntoProgramSummary: (_summary, recoverySummary) => ({ ...recoverySummary, results: [], program_gate_effective: { passed: false } }),
      executeCloseLoopBatch: async () => { throw new Error('should not replay batch'); },
      buildProgramKpiSnapshot: () => ({ completion_rate_percent: 100, risk_level: 'low' }),
      buildProgramDiagnostics: () => ({ failed_goal_count: 0 }),
      buildProgramCoordinationSnapshot: () => ({ topology: 'master-sub' }),
      applyProgramGateOutcome: async (summary) => { summary.program_gate_effective = { passed: true }; },
      getBatchFailureStatusSet: () => new Set(['failed']),
      now: (() => { let t = 1000; return () => (t += 1000); })(),
      cwd: () => 'cwd-proj'
    });

    expect(result.governance.history[0]).toEqual(expect.objectContaining({
      execution_mode: 'recover-cycle',
      selected_action_index: 2,
      action_selection_source: 'memory'
    }));
    expect(result.governance.stop_reason).toBe('gate-stable');
  });

  test('applies governance patch and replay-goal builder helpers', () => {
    expect(applyProgramGovernancePatch({ a: 1 }, { b: 2, c: undefined })).toEqual({ a: 1, b: 2 });
    expect(buildProgramGovernanceReplayGoalsResult({ file: 'goals.lines', goals: ['a'] }, 3, {
      batch_session: { file: 'batch.json' },
      status: 'failed',
      total_goals: 5,
      processed_goals: 2
    })).toEqual(expect.objectContaining({
      file: 'goals.lines',
      resumedFromSummary: expect.objectContaining({
        file: 'batch.json',
        round: 3,
        previous_status: 'failed'
      })
    }));
    expect(hasRecoverableProgramGoals({ results: [{ status: 'failed' }] }, { getBatchFailureStatusSet: () => new Set(['failed']) })).toBe(true);
  });
});
