const { executeCloseLoopProgramGoal } = require('../../../lib/auto/close-loop-program-service');

describe('auto close-loop program service', () => {
  test('runs program flow with disabled governance and returns zero exit code when gate passes', async () => {
    const outputs = [];
    const printed = [];
    const result = await executeCloseLoopProgramGoal('goal-a', {
      programGoals: 2,
      programQualityGate: true,
      batchAutonomous: true,
      programAutoRecover: false,
      programGovernUntilStable: false,
      programGateAutoRemediate: true
    }, {
      projectPath: 'proj',
      printSummary: true,
      writeOutputs: true
    }, {
      normalizeRecoverMaxRounds: (v) => v ?? 2,
      normalizeRecoverMaxMinutes: (v) => v ?? 15,
      normalizeResumeStrategy: (v) => v ?? 'failed-only',
      normalizeProgramGovernMaxRounds: (v) => v ?? 2,
      normalizeProgramGovernMaxMinutes: (v) => v ?? 30,
      normalizeProgramGovernAnomalyWeeks: (v) => v ?? 6,
      normalizeAutoKpiTrendPeriod: (v) => v ?? 'week',
      normalizeProgramGovernUseAction: (v) => v ?? null,
      resolveProgramGatePolicy: () => ({ profile: 'default' }),
      normalizeProgramGateFallbackProfile: (v) => v ?? 'default',
      resolveProgramGateFallbackChain: () => ['default'],
      resolveRecoveryMemoryScope: async () => 'scene',
      normalizeBatchRetryMaxRounds: (v) => v,
      normalizeBatchSessionKeep: (v) => v,
      normalizeBatchSessionOlderThanDays: (v) => v,
      normalizeSpecKeep: (v) => v,
      normalizeOlderThanDays: (v) => v,
      normalizeSpecSessionProtectWindowDays: (v) => v,
      normalizeSpecSessionMaxTotal: (v) => v,
      normalizeSpecSessionMaxCreated: (v) => v,
      normalizeSpecSessionMaxCreatedPerGoal: (v) => v,
      normalizeSpecSessionMaxDuplicateGoals: (v) => v,
      sanitizeBatchSessionId: (v) => v,
      buildCloseLoopBatchGoalsFromGoal: () => ({ file: 'goals.lines', goals: ['a', 'b'] }),
      executeCloseLoopBatch: async () => ({
        mode: 'auto-close-loop-program',
        status: 'completed',
        results: [{ status: 'completed', index: 1, sub_spec_count: 1, master_spec: 'master-1' }],
        total_goals: 1,
        batch_parallel: 1,
        resource_plan: { agent_budget: 2, scheduling_strategy: 'fifo', aging_factor: 1 },
        program_gate_effective: { passed: true }
      }),
      executeCloseLoopRecoveryCycle: async () => { throw new Error('should not recover'); },
      mergeProgramRecoveryIntoProgramSummary: (a) => a,
      buildProgramKpiSnapshot: () => ({ coverage: 100 }),
      buildProgramDiagnostics: () => ({ risk: 'low' }),
      buildProgramCoordinationSnapshot: () => ({ topology: 'master-sub' }),
      maybeWriteProgramKpi: async (...args) => { outputs.push(['kpi', ...args]); },
      maybeWriteOutput: async (...args) => { outputs.push(['json', ...args]); },
      maybePersistCloseLoopBatchSummary: async () => { outputs.push(['persist']); },
      applyProgramGateOutcome: async (summary) => { summary.program_gate_effective = { passed: true }; },
      runProgramGovernanceLoop: async () => { throw new Error('should not govern'); },
      isSpecSessionBudgetHardFailure: () => false,
      isSpecSessionGrowthGuardHardFailure: () => false,
      maybeWriteProgramAudit: async (...args) => { outputs.push(['audit', ...args]); },
      printCloseLoopBatchSummary: (summary) => { printed.push(summary.status); },
      now: (() => { let t = Date.parse('2026-03-07T00:00:00.000Z'); return () => (t += 1000); })(),
      cwd: () => 'cwd-proj'
    });

    expect(result.exitCode).toBe(0);
    expect(result.summary.program_governance).toEqual(expect.objectContaining({
      enabled: false,
      stop_reason: 'disabled',
      converged: true
    }));
    expect(printed).toEqual(['completed']);
    expect(outputs.map(item => item[0])).toEqual(['kpi', 'json', 'audit']);
  });

  test('recovers failed program summary and returns non-zero exit when gate still fails', async () => {
    const result = await executeCloseLoopProgramGoal('goal-a', {
      programAutoRecover: true,
      programGovernUntilStable: false,
      programRecoverUseAction: 2
    }, {
      projectPath: 'proj',
      printSummary: false,
      writeOutputs: false
    }, {
      normalizeRecoverMaxRounds: () => 2,
      normalizeRecoverMaxMinutes: () => 10,
      normalizeResumeStrategy: () => 'failed-only',
      normalizeProgramGovernMaxRounds: () => 2,
      normalizeProgramGovernMaxMinutes: () => 10,
      normalizeProgramGovernAnomalyWeeks: () => 6,
      normalizeAutoKpiTrendPeriod: () => 'week',
      normalizeProgramGovernUseAction: () => null,
      resolveProgramGatePolicy: () => ({ profile: 'default' }),
      normalizeProgramGateFallbackProfile: () => 'default',
      resolveProgramGateFallbackChain: () => ['default'],
      resolveRecoveryMemoryScope: async () => 'scene',
      normalizeBatchRetryMaxRounds: (v) => v,
      normalizeBatchSessionKeep: (v) => v,
      normalizeBatchSessionOlderThanDays: (v) => v,
      normalizeSpecKeep: (v) => v,
      normalizeOlderThanDays: (v) => v,
      normalizeSpecSessionProtectWindowDays: (v) => v,
      normalizeSpecSessionMaxTotal: (v) => v,
      normalizeSpecSessionMaxCreated: (v) => v,
      normalizeSpecSessionMaxCreatedPerGoal: (v) => v,
      normalizeSpecSessionMaxDuplicateGoals: (v) => v,
      sanitizeBatchSessionId: (v) => v,
      buildCloseLoopBatchGoalsFromGoal: () => ({ file: 'goals.lines', goals: ['a'] }),
      executeCloseLoopBatch: async () => ({ status: 'failed', batch_session: { file: 'batch.json' }, results: [] }),
      executeCloseLoopRecoveryCycle: async () => ({ summary: { status: 'partial-failed', results: [] } }),
      mergeProgramRecoveryIntoProgramSummary: (_initialSummary, _recoverySummary, metadata) => ({ status: 'partial-failed', results: [], batch_parallel: 1, resource_plan: {}, program_gate_effective: { passed: false }, auto_recovery: metadata }),
      buildProgramKpiSnapshot: () => ({ coverage: 50 }),
      buildProgramDiagnostics: () => ({ risk: 'high' }),
      buildProgramCoordinationSnapshot: () => ({ topology: 'master-sub' }),
      maybeWriteProgramKpi: async () => {},
      maybeWriteOutput: async () => {},
      maybePersistCloseLoopBatchSummary: async () => {},
      applyProgramGateOutcome: async (summary) => { summary.program_gate_effective = { passed: false }; },
      runProgramGovernanceLoop: async () => { throw new Error('should not govern'); },
      isSpecSessionBudgetHardFailure: () => false,
      isSpecSessionGrowthGuardHardFailure: () => false,
      maybeWriteProgramAudit: async () => {},
      printCloseLoopBatchSummary: () => {},
      now: (() => { let t = 1000; return () => (t += 1000); })(),
      cwd: () => 'cwd-proj'
    });

    expect(result.exitCode).toBe(1);
    expect(result.summary.auto_recovery).toEqual(expect.objectContaining({
      triggered: true,
      recover_max_rounds: 2,
      recover_max_minutes: 10,
      resume_strategy: 'failed-only'
    }));
  });
});
