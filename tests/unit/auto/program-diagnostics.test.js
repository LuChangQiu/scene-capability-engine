const {
  buildProgramFailureClusters,
  buildProgramRemediationActions,
  buildProgramDiagnostics
} = require('../../../lib/auto/program-diagnostics');

describe('auto program diagnostics helpers', () => {
  function normalizeFailureSignatureFromError(value) {
    return String(value || 'unknown').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  test('clusters failed results by normalized signature', () => {
    const clusters = buildProgramFailureClusters([
      { status: 'failed', error: 'Timeout while waiting', goal: 'goal a', source_index: 0 },
      { status: 'failed', error: 'Timeout while waiting', goal: 'goal b', source_index: 1 },
      { status: 'completed', error: '', goal: 'goal c', source_index: 2 }
    ], normalizeFailureSignatureFromError);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual(expect.objectContaining({
      signature: 'failed:timeout while waiting',
      count: 2,
      goal_indexes: [1, 2]
    }));
  });

  test('builds remediation actions from retry exhaustion and timeout signatures', () => {
    const actions = buildProgramRemediationActions({
      failed_goals: 2,
      batch_retry: { max_rounds: 3, performed_rounds: 3 }
    }, [
      { signature: 'failed:timeout', example_error: 'timed out', count: 2 }
    ]);

    expect(actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ priority: 'high' }),
      expect.objectContaining({ action: expect.stringContaining('Increase retry ceiling') }),
      expect.objectContaining({ action: expect.stringContaining('Reduce parallel pressure') })
    ]));
  });

  test('builds aggregate diagnostics payload', () => {
    const diagnostics = buildProgramDiagnostics({
      failed_goals: 1,
      results: [
        { status: 'failed', error: 'DoD validation failed', goal: 'goal x', source_index: 0 }
      ]
    }, normalizeFailureSignatureFromError);

    expect(diagnostics.failed_goal_count).toBe(1);
    expect(Array.isArray(diagnostics.failure_clusters)).toBe(true);
    expect(Array.isArray(diagnostics.remediation_actions)).toBe(true);
  });
});
