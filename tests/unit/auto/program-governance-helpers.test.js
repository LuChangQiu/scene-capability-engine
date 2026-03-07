const {
  normalizeProgramGateFallbackProfile,
  normalizeProgramGateFallbackChain,
  resolveProgramGateFallbackChain,
  resolveProgramGatePolicy,
  evaluateProgramConvergenceGate,
  buildProgramAnomalyGovernancePatch,
  normalizeFailureSignatureFromError
} = require('../../../lib/auto/program-governance-helpers');

describe('auto program governance helpers', () => {
  const PROGRAM_GATE_PROFILE_POLICY = {
    default: { minSuccessRate: 100, maxRiskLevel: 'high', maxElapsedMinutes: null, maxAgentBudget: null, maxTotalSubSpecs: null },
    dev: { minSuccessRate: 80, maxRiskLevel: 'high', maxElapsedMinutes: 120, maxAgentBudget: 8, maxTotalSubSpecs: 100 },
    staging: { minSuccessRate: 95, maxRiskLevel: 'medium', maxElapsedMinutes: 60, maxAgentBudget: 4, maxTotalSubSpecs: 50 },
    prod: { minSuccessRate: 100, maxRiskLevel: 'low', maxElapsedMinutes: 30, maxAgentBudget: 2, maxTotalSubSpecs: 20 }
  };

  test('normalizes fallback profile and chain', () => {
    expect(normalizeProgramGateFallbackProfile('PROD', { PROGRAM_GATE_PROFILE_POLICY })).toBe('prod');
    expect(normalizeProgramGateFallbackChain('prod,staging,prod', { PROGRAM_GATE_PROFILE_POLICY })).toEqual(['prod', 'staging']);
    expect(resolveProgramGateFallbackChain(undefined, 'staging', { PROGRAM_GATE_PROFILE_POLICY })).toEqual(['staging']);
  });

  test('resolves gate policy using profile defaults and explicit overrides', () => {
    const result = resolveProgramGatePolicy({
      profile: 'dev',
      maxRiskLevel: 'medium',
      maxAgentBudget: 3
    }, {
      PROGRAM_GATE_PROFILE_POLICY,
      normalizeProgramGateProfile: (v) => (v || 'default').toLowerCase(),
      normalizeProgramMinSuccessRate: (v) => Number(v),
      normalizeProgramRiskLevel: (v) => String(v).toLowerCase(),
      normalizeProgramMaxElapsedMinutes: (v) => v === null ? null : Number(v),
      normalizeProgramMaxAgentBudget: (v) => v === null ? null : Number(v),
      normalizeProgramMaxTotalSubSpecs: (v) => v === null ? null : Number(v)
    });

    expect(result).toEqual({
      profile: 'dev',
      minSuccessRate: 80,
      maxRiskLevel: 'medium',
      maxElapsedMinutes: 120,
      maxAgentBudget: 3,
      maxTotalSubSpecs: 100
    });
  });

  test('evaluates program convergence gate against summary metrics', () => {
    const result = evaluateProgramConvergenceGate({
      program_elapsed_ms: 31 * 60000,
      batch_parallel: 3,
      resource_plan: { agent_budget: 3 },
      metrics: { total_sub_specs: 25 },
      program_kpi: { completion_rate_percent: 90, risk_level: 'medium' }
    }, {
      profile: 'prod'
    }, {
      buildProgramKpiSnapshot: () => ({ completion_rate_percent: 90, risk_level: 'medium' }),
      resolveProgramGatePolicy: (policy) => resolveProgramGatePolicy(policy, {
        PROGRAM_GATE_PROFILE_POLICY,
        normalizeProgramGateProfile: (v) => (v || 'default').toLowerCase(),
        normalizeProgramMinSuccessRate: (v) => Number(v),
        normalizeProgramRiskLevel: (v) => String(v).toLowerCase(),
        normalizeProgramMaxElapsedMinutes: (v) => v === null ? null : Number(v),
        normalizeProgramMaxAgentBudget: (v) => v === null ? null : Number(v),
        normalizeProgramMaxTotalSubSpecs: (v) => v === null ? null : Number(v)
      })
    });

    expect(result.passed).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('success_rate_percent 90 < required 100'),
      expect.stringContaining('risk_level medium exceeds allowed low'),
      expect.stringContaining('program_elapsed_minutes 31 exceeds allowed 30'),
      expect.stringContaining('agent_budget 3 exceeds allowed 2'),
      expect.stringContaining('total_sub_specs 25 exceeds allowed 20')
    ]));
  });

  test('builds anomaly governance patch from high severity anomalies', () => {
    const result = buildProgramAnomalyGovernancePatch({
      batch_parallel: 3,
      resource_plan: { agent_budget: 4 },
      spec_session_budget: { estimated_created: 10 }
    }, [
      { severity: 'high', type: 'success-rate-drop' },
      { severity: 'high', type: 'rate-limit-spike' },
      { severity: 'high', type: 'spec-growth-spike' }
    ], {
      batchRetryRounds: 1
    }, {
      normalizeBatchRetryRounds: (v) => Number(v || 0),
      normalizeBatchParallel: (v) => Number(v || 1),
      normalizeBatchAgentBudget: (v) => v === null || v === undefined ? null : Number(v)
    });

    expect(result.patch).toEqual(expect.objectContaining({
      batchRetryRounds: 2,
      batchRetryUntilComplete: true,
      batchParallel: 2,
      batchAgentBudget: 3,
      specSessionBudgetHardFail: true,
      specSessionMaxCreated: 8
    }));
    expect(result.anomaly_types.sort()).toEqual(['rate-limit-spike', 'spec-growth-spike', 'success-rate-drop']);
  });

  test('normalizes failure signature safely', () => {
    expect(normalizeFailureSignatureFromError('Timeout at C:\\repo\\file.js line 123')).toContain('<path>');
    expect(normalizeFailureSignatureFromError('')).toBe('no-error-details');
  });
});
