const {
  normalizeStatusToken,
  isCompletedStatus,
  isFailedStatus,
  normalizeStatsWindowDays,
  filterEntriesByStatus,
  filterGovernanceEntriesByResumeMode,
  calculatePercent
} = require('../../../lib/auto/archive-summary');

describe('auto archive summary helpers', () => {
  test('normalizes and classifies status tokens', () => {
    expect(normalizeStatusToken(' Completed ')).toBe('completed');
    expect(isCompletedStatus('completed')).toBe(true);
    expect(isFailedStatus('error')).toBe(true);
    expect(isFailedStatus('completed')).toBe(false);
  });

  test('validates stats window days', () => {
    expect(normalizeStatsWindowDays(undefined)).toBeNull();
    expect(normalizeStatsWindowDays(7)).toBe(7);
    expect(() => normalizeStatsWindowDays(-1)).toThrow('--days must be an integer between 0 and 36500.');
  });

  test('filters entries by status and governance resume mode', () => {
    const entries = [
      { status: 'completed' },
      { status: 'failed', resumed_from_governance_session_id: 'g-1' },
      { status: 'failed' }
    ];
    expect(filterEntriesByStatus(entries, ['failed'])).toHaveLength(2);
    expect(filterGovernanceEntriesByResumeMode(entries, true)).toEqual([
      { status: 'failed', resumed_from_governance_session_id: 'g-1' }
    ]);
  });

  test('calculates percentage safely', () => {
    expect(calculatePercent(1, 4)).toBe(25);
    expect(calculatePercent(0, 0)).toBe(0);
  });
});
