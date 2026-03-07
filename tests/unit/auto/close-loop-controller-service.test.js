const { runCloseLoopController } = require('../../../lib/auto/close-loop-controller-service');

describe('auto close-loop controller service', () => {
  test('processes one goal and returns controller summary', async () => {
    const result = await runCloseLoopController(null, {
      maxCycles: 1,
      maxMinutes: 10,
      pollSeconds: 1,
      dequeueLimit: 1
    }, {
      projectPath: 'proj'
    }, {
      loadControllerGoalQueue: async () => ({ file: 'queue.lines', format: 'lines', goals: ['goal-a'], duplicate_count: 0 }),
      normalizeControllerMaxCycles: (value) => value,
      normalizeControllerMaxMinutes: (value) => value,
      normalizeControllerPollSeconds: (value) => value,
      normalizeControllerDequeueLimit: (value) => value,
      writeControllerGoalQueue: async () => {},
      acquireControllerLock: async () => ({ token: 't1' }),
      refreshControllerLock: async () => {},
      releaseControllerLock: async () => {},
      sleepForMs: async () => {},
      executeCloseLoopProgramGoal: async () => ({ exitCode: 0, summary: { status: 'completed', program_gate_effective: { passed: true } } }),
      appendControllerGoalArchive: async () => null,
      maybePersistCloseLoopControllerSummary: async (summary) => { summary.controller_session = { id: 'controller-1' }; },
      maybeWriteOutput: async () => {},
      now: (() => { let t = 1000; return () => (t += 10); })()
    });

    expect(result).toEqual(expect.objectContaining({
      mode: 'auto-close-loop-controller',
      cycles_performed: 1,
      processed_goals: 1,
      completed_goals: 1,
      failed_goals: 0,
      stop_reason: 'cycle-limit-reached'
    }));
  });
});
