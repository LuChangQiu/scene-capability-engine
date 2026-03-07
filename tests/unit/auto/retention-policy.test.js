const {
  normalizeKeep,
  normalizeSpecKeep,
  normalizeOlderThanDays,
  normalizeSpecSessionProtectWindowDays,
  normalizeSpecSessionMaxTotal,
  normalizeSpecSessionMaxCreated,
  normalizeSpecSessionMaxCreatedPerGoal,
  normalizeSpecSessionMaxDuplicateGoals
} = require('../../../lib/auto/retention-policy');

describe('auto retention policy helpers', () => {
  test('normalizes keep values with bounds', () => {
    expect(normalizeKeep(undefined)).toBe(20);
    expect(normalizeKeep(0)).toBe(0);
    expect(() => normalizeKeep(1001)).toThrow('--keep must be an integer between 0 and 1000.');
  });

  test('normalizes spec keep and older-than-days', () => {
    expect(normalizeSpecKeep(undefined)).toBe(200);
    expect(normalizeSpecKeep(10)).toBe(10);
    expect(normalizeOlderThanDays(undefined)).toBeNull();
    expect(normalizeOlderThanDays(30)).toBe(30);
    expect(() => normalizeOlderThanDays(-1)).toThrow('--older-than-days must be an integer between 0 and 36500.');
  });

  test('normalizes spec session policy values', () => {
    expect(normalizeSpecSessionProtectWindowDays(undefined)).toBe(7);
    expect(normalizeSpecSessionMaxTotal(10)).toBe(10);
    expect(normalizeSpecSessionMaxCreated(0)).toBe(0);
    expect(normalizeSpecSessionMaxCreatedPerGoal(1.236)).toBe(1.24);
    expect(normalizeSpecSessionMaxDuplicateGoals(5)).toBe(5);
  });
});
