const {
  presentCloseLoopSessionList,
  presentCloseLoopSessionStats,
  presentControllerSessionList
} = require('../../../lib/auto/session-presenter');

describe('auto session presenter helpers', () => {
  const sessions = [
    { id: 's2', status: 'completed', goal: 'g2', master_spec: '02-00', sub_spec_count: 2, updated_at: '2026-03-07T00:00:00.000Z' },
    { id: 's1', status: 'failed', goal: 'g1', master_spec: '01-00', sub_spec_count: 1, updated_at: '2026-03-06T00:00:00.000Z' }
  ];

  test('presents close-loop session list', () => {
    const payload = presentCloseLoopSessionList('proj', sessions, ['completed'], 1, () => ({ completed: 1 }), (p) => p + '/sessions');
    expect(payload).toEqual(expect.objectContaining({
      mode: 'auto-session-list',
      total: 2,
      status_filter: ['completed']
    }));
    expect(payload.sessions).toHaveLength(1);
  });

  test('presents close-loop session stats', () => {
    const payload = presentCloseLoopSessionStats('proj', sessions, [], null, () => ({ completed: 1, failed: 1 }), () => ({ '02-00': 1, '01-00': 1 }), (status) => status === 'failed');
    expect(payload).toEqual(expect.objectContaining({
      mode: 'auto-session-stats',
      total_sessions: 2,
      completed_sessions: 1,
      failed_sessions: 1
    }));
  });

  test('presents controller session list', () => {
    const payload = presentControllerSessionList('proj', [{ id: 'c1', file: 'x', status: 'completed', queue_file: 'q', queue_format: 'jsonl', processed_goals: 1, pending_goals: 0, updated_at: 'now', parse_error: null }], [], 20, () => ({ completed: 1 }), (p) => p + '/controller');
    expect(payload.mode).toBe('auto-controller-session-list');
    expect(payload.sessions[0]).toEqual(expect.objectContaining({ id: 'c1', queue_format: 'jsonl' }));
  });
});
