const { executeCloseLoopRecoveryCycle } = require('../../../lib/auto/close-loop-recovery-service');

describe('auto close-loop recovery service', () => {
  test('runs one recovery round and records recovery metadata', async () => {
    const result = await executeCloseLoopRecoveryCycle({
      projectPath: 'proj',
      sourceSummary: { file: 'sum.json', payload: { mode: 'auto-close-loop-batch', status: 'failed' } },
      baseOptions: { batchSessionId: 'batch' },
      recoverAutonomousEnabled: true,
      resumeStrategy: 'pending',
      recoverUntilComplete: false,
      recoverMaxRounds: 3,
      recoverMaxDurationMs: null,
      recoveryMemoryTtlDays: null,
      recoveryMemoryScope: 'scope-a',
      actionCandidate: null
    }, {
      pruneCloseLoopRecoveryMemory: jest.fn(),
      loadCloseLoopRecoveryMemory: async () => ({ payload: {} }),
      normalizeRecoveryMemoryToken: (value) => value,
      buildRecoveryMemorySignature: () => 'sig-1',
      getRecoveryMemoryEntry: () => null,
      resolveRecoveryActionSelection: () => ({
        selectedIndex: 1,
        selectedAction: null,
        availableActions: [],
        appliedPatch: {},
        selectionSource: 'default',
        selectionExplain: null
      }),
      applyRecoveryActionPatch: (options) => options,
      buildCloseLoopBatchGoalsFromSummaryPayload: async () => ({ goals: ['g1'] }),
      executeCloseLoopBatch: async () => ({
        status: 'completed',
        processed_goals: 1,
        completed_goals: 1,
        failed_goals: 0,
        batch_session: { file: 'batch-r1.json' }
      }),
      loadCloseLoopBatchSummaryPayload: async () => ({ file: 'batch-r1.json', payload: {} }),
      updateCloseLoopRecoveryMemory: async () => ({ file: 'mem.json', signature: 'sig-1', scope: 'scope-a', action_key: 'a1', entry: {} }),
      now: (() => { let n = 1000; return () => (n += 10); })()
    });

    expect(result.summary).toEqual(expect.objectContaining({
      status: 'completed',
      recovered_from_summary: expect.objectContaining({ file: 'sum.json', round: 1 }),
      recovery_cycle: expect.objectContaining({ performed_rounds: 1, converged: true })
    }));
    expect(result.pinnedActionSelection).toEqual(expect.objectContaining({ selectedIndex: 1 }));
  });
});
