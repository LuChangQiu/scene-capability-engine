const { presentGovernanceSessionList } = require('../../../lib/auto/governance-session-presenter');

describe('auto governance session presenter', () => {
  test('presents governance session list summary', () => {
    const payload = presentGovernanceSessionList(
      'proj',
      [
        { id: 'g1', status: 'completed', resumed_from_governance_session_id: 'base', updated_at: 'now' },
        { id: 'g2', status: 'failed', resumed_from_governance_session_id: null, updated_at: 'now' }
      ],
      ['completed'],
      true,
      () => ({ completed: 1, failed: 1 }),
      (value) => value + '/gov'
    );

    expect(payload).toEqual(expect.objectContaining({
      mode: 'auto-governance-session-list',
      total: 2,
      resume_only: true,
      resumed_sessions: 1,
      fresh_sessions: 1
    }));
    expect(payload.sessions).toHaveLength(2);
  });
});
