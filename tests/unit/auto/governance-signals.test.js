const {
  normalizeHandoffText,
  parseAutoHandoffGateBoolean,
  normalizeAutoHandoffGateRiskLevel,
  toGovernanceReleaseGateNumber,
  normalizeGovernanceReleaseGateSnapshot,
  normalizeGovernanceWeeklyOpsStopDetail
} = require('../../../lib/auto/governance-signals');

describe('auto governance signal helpers', () => {
  test('normalizes handoff text and booleans', () => {
    expect(normalizeHandoffText('  done  ')).toBe('done');
    expect(parseAutoHandoffGateBoolean('passed')).toBe(true);
    expect(parseAutoHandoffGateBoolean('blocked')).toBe(false);
  });

  test('normalizes risk levels and numbers', () => {
    expect(normalizeAutoHandoffGateRiskLevel('HIGH')).toBe('high');
    expect(toGovernanceReleaseGateNumber('12.5')).toBe(12.5);
    expect(toGovernanceReleaseGateNumber('')).toBeNull();
  });

  test('normalizes release gate snapshot and weekly ops stop detail', () => {
    const snapshot = normalizeGovernanceReleaseGateSnapshot({
      available: true,
      latest_gate_passed: 'true',
      pass_rate_percent: '80'
    });
    expect(snapshot).toEqual(expect.objectContaining({
      available: true,
      latest_gate_passed: true,
      pass_rate_percent: 80
    }));

    const weeklyOps = normalizeGovernanceWeeklyOpsStopDetail({
      latest: { blocked: 'false', risk_level: 'medium', runtime_block_rate_percent: '10' },
      pressure: { high: 'true' }
    });
    expect(weeklyOps).toEqual(expect.objectContaining({
      latest: expect.objectContaining({ blocked: false, risk_level: 'medium', runtime_block_rate_percent: 10 }),
      pressure: expect.objectContaining({ high: true })
    }));
  });
});
