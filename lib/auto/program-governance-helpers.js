function normalizeProgramGateFallbackProfile(profileCandidate, dependencies = {}) {
  const PROGRAM_GATE_PROFILE_POLICY = dependencies.PROGRAM_GATE_PROFILE_POLICY || {};
  const normalized = typeof profileCandidate === 'string'
    ? profileCandidate.trim().toLowerCase()
    : 'none';
  if (normalized === 'none') {
    return 'none';
  }
  if (!PROGRAM_GATE_PROFILE_POLICY[normalized]) {
    throw new Error('--program-gate-fallback-profile must be one of: none, default, dev, staging, prod.');
  }
  return normalized;
}

function normalizeProgramGateFallbackChain(chainCandidate, dependencies = {}) {
  const PROGRAM_GATE_PROFILE_POLICY = dependencies.PROGRAM_GATE_PROFILE_POLICY || {};
  if (chainCandidate === undefined || chainCandidate === null) {
    return null;
  }
  const raw = `${chainCandidate}`.trim();
  if (!raw) {
    return [];
  }
  const tokens = raw
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }
  if (tokens.includes('none')) {
    if (tokens.length > 1) {
      throw new Error('--program-gate-fallback-chain cannot mix "none" with other profiles.');
    }
    return [];
  }
  const normalized = [];
  const seen = new Set();
  for (const token of tokens) {
    if (!PROGRAM_GATE_PROFILE_POLICY[token]) {
      throw new Error('--program-gate-fallback-chain must contain only: none, default, dev, staging, prod.');
    }
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    normalized.push(token);
  }
  return normalized;
}

function resolveProgramGateFallbackChain(chainCandidate, fallbackProfileCandidate, dependencies = {}) {
  const parsedChain = normalizeProgramGateFallbackChain(chainCandidate, dependencies);
  if (Array.isArray(parsedChain)) {
    return parsedChain;
  }
  const normalizedSingle = normalizeProgramGateFallbackProfile(fallbackProfileCandidate, dependencies);
  return normalizedSingle === 'none' ? [] : [normalizedSingle];
}

function resolveProgramGatePolicy(policy = {}, dependencies = {}) {
  const normalizeProgramGateProfile = dependencies.normalizeProgramGateProfile;
  const normalizeProgramMinSuccessRate = dependencies.normalizeProgramMinSuccessRate;
  const normalizeProgramRiskLevel = dependencies.normalizeProgramRiskLevel;
  const normalizeProgramMaxElapsedMinutes = dependencies.normalizeProgramMaxElapsedMinutes;
  const normalizeProgramMaxAgentBudget = dependencies.normalizeProgramMaxAgentBudget;
  const normalizeProgramMaxTotalSubSpecs = dependencies.normalizeProgramMaxTotalSubSpecs;
  const PROGRAM_GATE_PROFILE_POLICY = dependencies.PROGRAM_GATE_PROFILE_POLICY || {};

  const profile = normalizeProgramGateProfile(policy.profile);
  const profilePolicy = PROGRAM_GATE_PROFILE_POLICY[profile];
  const minSuccessRate = policy.minSuccessRate === undefined || policy.minSuccessRate === null
    ? normalizeProgramMinSuccessRate(profilePolicy.minSuccessRate)
    : normalizeProgramMinSuccessRate(policy.minSuccessRate);
  const maxRiskLevel = policy.maxRiskLevel === undefined || policy.maxRiskLevel === null
    ? normalizeProgramRiskLevel(profilePolicy.maxRiskLevel)
    : normalizeProgramRiskLevel(policy.maxRiskLevel);
  const maxElapsedMinutes = policy.maxElapsedMinutes === undefined || policy.maxElapsedMinutes === null
    ? normalizeProgramMaxElapsedMinutes(profilePolicy.maxElapsedMinutes)
    : normalizeProgramMaxElapsedMinutes(policy.maxElapsedMinutes);
  const maxAgentBudget = policy.maxAgentBudget === undefined || policy.maxAgentBudget === null
    ? normalizeProgramMaxAgentBudget(profilePolicy.maxAgentBudget)
    : normalizeProgramMaxAgentBudget(policy.maxAgentBudget);
  const maxTotalSubSpecs = policy.maxTotalSubSpecs === undefined || policy.maxTotalSubSpecs === null
    ? normalizeProgramMaxTotalSubSpecs(profilePolicy.maxTotalSubSpecs)
    : normalizeProgramMaxTotalSubSpecs(policy.maxTotalSubSpecs);

  return {
    profile,
    minSuccessRate,
    maxRiskLevel,
    maxElapsedMinutes,
    maxAgentBudget,
    maxTotalSubSpecs
  };
}

function evaluateProgramConvergenceGate(summary, policy = {}, dependencies = {}) {
  const buildProgramKpiSnapshot = dependencies.buildProgramKpiSnapshot;
  const resolveProgramGatePolicyFn = dependencies.resolveProgramGatePolicy;

  const metrics = summary && summary.metrics && typeof summary.metrics === 'object'
    ? summary.metrics
    : {};
  const programKpi = summary && summary.program_kpi && typeof summary.program_kpi === 'object'
    ? summary.program_kpi
    : buildProgramKpiSnapshot(summary || {});
  const resolvedPolicy = resolveProgramGatePolicyFn(policy);
  const minSuccessRate = resolvedPolicy.minSuccessRate;
  const maxRiskLevel = resolvedPolicy.maxRiskLevel;
  const maxElapsedMinutes = resolvedPolicy.maxElapsedMinutes;
  const maxAgentBudget = resolvedPolicy.maxAgentBudget;
  const maxTotalSubSpecs = resolvedPolicy.maxTotalSubSpecs;
  const completionRateFromKpi = Number(programKpi.completion_rate_percent);
  const successRateFromMetrics = Number(metrics.success_rate_percent);
  const successRate = Number.isFinite(completionRateFromKpi)
    ? completionRateFromKpi
    : (Number.isFinite(successRateFromMetrics) ? successRateFromMetrics : null);
  const elapsedMsCandidate = Number(summary && summary.program_elapsed_ms);
  const elapsedMs = Number.isFinite(elapsedMsCandidate) && elapsedMsCandidate >= 0
    ? elapsedMsCandidate
    : null;
  const elapsedMinutes = elapsedMs === null
    ? null
    : Number((elapsedMs / 60000).toFixed(2));
  const resourcePlan = summary && summary.resource_plan && typeof summary.resource_plan === 'object'
    ? summary.resource_plan
    : {};
  const agentBudgetCandidate = Number(resourcePlan.agent_budget);
  const effectiveParallelCandidate = Number(resourcePlan.effective_goal_parallel);
  const batchParallelCandidate = Number(summary && summary.batch_parallel);
  const actualAgentBudget = Number.isFinite(agentBudgetCandidate) && agentBudgetCandidate > 0
    ? agentBudgetCandidate
    : Number.isFinite(effectiveParallelCandidate) && effectiveParallelCandidate > 0
      ? effectiveParallelCandidate
      : Number.isFinite(batchParallelCandidate) && batchParallelCandidate > 0
        ? batchParallelCandidate
        : null;
  const totalSubSpecsFromMetrics = Number(metrics.total_sub_specs);
  const totalSubSpecs = Number.isFinite(totalSubSpecsFromMetrics)
    ? totalSubSpecsFromMetrics
    : (
      Array.isArray(summary && summary.results)
        ? summary.results.reduce((sum, item) => sum + (Number(item && item.sub_spec_count) || 0), 0)
        : null
    );
  const riskLevel = `${programKpi.risk_level || 'high'}`.trim().toLowerCase();
  const riskRank = { low: 1, medium: 2, high: 3 };
  const reasons = [];
  if (!Number.isFinite(successRate)) {
    reasons.push('success_rate_percent unavailable');
  } else if (successRate < minSuccessRate) {
    reasons.push(`success_rate_percent ${successRate} < required ${minSuccessRate}`);
  }
  if ((riskRank[riskLevel] || 3) > (riskRank[maxRiskLevel] || 3)) {
    reasons.push(`risk_level ${riskLevel} exceeds allowed ${maxRiskLevel}`);
  }
  if (maxElapsedMinutes !== null) {
    if (!Number.isFinite(elapsedMinutes)) {
      reasons.push('program_elapsed_minutes unavailable');
    } else if (elapsedMinutes > maxElapsedMinutes) {
      reasons.push(`program_elapsed_minutes ${elapsedMinutes} exceeds allowed ${maxElapsedMinutes}`);
    }
  }
  if (maxAgentBudget !== null) {
    if (!Number.isFinite(actualAgentBudget)) {
      reasons.push('agent_budget unavailable');
    } else if (actualAgentBudget > maxAgentBudget) {
      reasons.push(`agent_budget ${actualAgentBudget} exceeds allowed ${maxAgentBudget}`);
    }
  }
  if (maxTotalSubSpecs !== null) {
    if (!Number.isFinite(totalSubSpecs)) {
      reasons.push('total_sub_specs unavailable');
    } else if (totalSubSpecs > maxTotalSubSpecs) {
      reasons.push(`total_sub_specs ${totalSubSpecs} exceeds allowed ${maxTotalSubSpecs}`);
    }
  }

  return {
    passed: reasons.length === 0,
    policy: {
      profile: resolvedPolicy.profile,
      min_success_rate_percent: minSuccessRate,
      max_risk_level: maxRiskLevel,
      max_elapsed_minutes: maxElapsedMinutes,
      max_agent_budget: maxAgentBudget,
      max_total_sub_specs: maxTotalSubSpecs
    },
    actual: {
      success_rate_percent: Number.isFinite(successRate) ? successRate : null,
      risk_level: riskLevel,
      elapsed_minutes: Number.isFinite(elapsedMinutes) ? elapsedMinutes : null,
      agent_budget: Number.isFinite(actualAgentBudget) ? actualAgentBudget : null,
      total_sub_specs: Number.isFinite(totalSubSpecs) ? totalSubSpecs : null
    },
    reasons
  };
}

function applyAnomalyBatchConcurrencyReductionPatch(summary, patch, reasons, options, anomalyType, dependencies = {}) {
  const normalizeBatchParallel = dependencies.normalizeBatchParallel;
  const normalizeBatchAgentBudget = dependencies.normalizeBatchAgentBudget;

  const currentParallelCandidate = patch.batchParallel !== undefined && patch.batchParallel !== null
    ? patch.batchParallel
    : (
      options.batchParallel !== undefined && options.batchParallel !== null
        ? options.batchParallel
        : (summary && summary.batch_parallel ? summary.batch_parallel : 1)
    );
  const currentParallel = normalizeBatchParallel(currentParallelCandidate);
  if (currentParallel > 1) {
    patch.batchParallel = currentParallel - 1;
    reasons.push(`reduce batch parallel from ${currentParallel} to ${patch.batchParallel} due to ${anomalyType}`);
  }

  const currentAgentBudgetCandidate = patch.batchAgentBudget !== undefined && patch.batchAgentBudget !== null
    ? patch.batchAgentBudget
    : (
      options.batchAgentBudget !== undefined && options.batchAgentBudget !== null
        ? options.batchAgentBudget
        : (summary && summary.resource_plan ? summary.resource_plan.agent_budget : null)
    );
  const currentAgentBudget = normalizeBatchAgentBudget(currentAgentBudgetCandidate);
  if (currentAgentBudget !== null && currentAgentBudget > 1) {
    patch.batchAgentBudget = currentAgentBudget - 1;
    reasons.push(`reduce batch agent budget from ${currentAgentBudget} to ${patch.batchAgentBudget} due to ${anomalyType}`);
  }
}

function buildProgramAnomalyGovernancePatch(summary, anomalies, options = {}, dependencies = {}) {
  const normalizeBatchRetryRounds = dependencies.normalizeBatchRetryRounds;
  const normalizeBatchParallel = dependencies.normalizeBatchParallel;
  const normalizeBatchAgentBudget = dependencies.normalizeBatchAgentBudget;

  const sourceAnomalies = Array.isArray(anomalies) ? anomalies : [];
  const highAnomalies = sourceAnomalies.filter(item => `${item && item.severity ? item.severity : ''}`.trim().toLowerCase() === 'high');
  const patch = {};
  const reasons = [];

  const anomalyTypes = new Set(highAnomalies.map(item => `${item && item.type ? item.type : ''}`.trim().toLowerCase()));
  if (anomalyTypes.has('success-rate-drop')) {
    const currentRetryRounds = normalizeBatchRetryRounds(options.batchRetryRounds);
    patch.batchRetryRounds = Math.min(5, Math.max(1, currentRetryRounds + 1));
    patch.batchRetryUntilComplete = true;
    reasons.push('increase retry rounds due to success-rate-drop anomaly');
  }

  if (anomalyTypes.has('failed-goals-spike')) {
    applyAnomalyBatchConcurrencyReductionPatch(summary, patch, reasons, options, 'failed-goals-spike', {
      normalizeBatchParallel,
      normalizeBatchAgentBudget
    });
  }

  if (anomalyTypes.has('rate-limit-spike')) {
    applyAnomalyBatchConcurrencyReductionPatch(summary, patch, reasons, options, 'rate-limit-spike', {
      normalizeBatchParallel,
      normalizeBatchAgentBudget
    });
  }

  if (anomalyTypes.has('spec-growth-spike')) {
    patch.specSessionBudgetHardFail = true;
    reasons.push('enable spec-session budget hard-fail due to spec-growth-spike');
    if (options.specSessionMaxCreated === undefined || options.specSessionMaxCreated === null) {
      const estimatedCreated = Number(summary && summary.spec_session_budget && summary.spec_session_budget.estimated_created) || 0;
      patch.specSessionMaxCreated = Math.max(1, Math.ceil(estimatedCreated * 0.8));
      reasons.push(`set specSessionMaxCreated=${patch.specSessionMaxCreated} due to spec-growth-spike`);
    }
  }

  return {
    patch,
    reasons,
    anomaly_count: highAnomalies.length,
    anomaly_types: [...anomalyTypes]
  };
}

function normalizeFailureSignatureFromError(errorMessage) {
  if (typeof errorMessage !== 'string' || !errorMessage.trim()) {
    return 'no-error-details';
  }

  return errorMessage
    .toLowerCase()
    .replace(/[0-9]+/g, '#')
    .replace(/[a-z]:\\[^ ]+/gi, '<path>')
    .replace(/\/[^ ]+/g, '<path>')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

module.exports = {
  normalizeProgramGateFallbackProfile,
  normalizeProgramGateFallbackChain,
  resolveProgramGateFallbackChain,
  resolveProgramGatePolicy,
  evaluateProgramConvergenceGate,
  buildProgramAnomalyGovernancePatch,
  normalizeFailureSignatureFromError
};
