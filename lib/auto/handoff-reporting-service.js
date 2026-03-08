function buildAutoHandoffRegressionSnapshot(report, dependencies = {}) {
  const { normalizeHandoffText, normalizeRiskRank } = dependencies;
  const payload = report && report.payload ? report.payload : report;
  const specStatus = payload && payload.spec_status ? payload.spec_status : {};
  const gates = payload && payload.gates ? payload.gates : {};
  const gateActual = gates && gates.actual ? gates.actual : {};
  const batchSummary = payload && payload.batch_summary ? payload.batch_summary : {};
  const ontology = payload && payload.ontology_validation ? payload.ontology_validation : {};
  const ontologyMetrics = ontology && ontology.metrics ? ontology.metrics : {};
  const scenePackageBatch = payload && payload.scene_package_batch ? payload.scene_package_batch : {};
  const scenePackageBatchSummary = scenePackageBatch && scenePackageBatch.summary
    ? scenePackageBatch.summary
    : {};

  const riskLevel = gateActual.risk_level
    || (payload && payload.observability_snapshot && payload.observability_snapshot.highlights
      ? payload.observability_snapshot.highlights.governance_risk_level
      : 'high');
  const successRate = Number(specStatus.success_rate_percent);
  const failedGoals = Number(batchSummary.failed_goals);
  const elapsedMs = Number(payload && payload.elapsed_ms);
  const ontologyQualityScore = Number(
    gateActual.ontology_quality_score !== undefined
      ? gateActual.ontology_quality_score
      : ontology.quality_score
  );
  const ontologyUnmappedRules = Number(
    gateActual.ontology_business_rule_unmapped !== undefined
      ? gateActual.ontology_business_rule_unmapped
      : ontologyMetrics.business_rule_unmapped
  );
  const ontologyUndecidedDecisions = Number(
    gateActual.ontology_decision_undecided !== undefined
      ? gateActual.ontology_decision_undecided
      : ontologyMetrics.decision_undecided
  );
  const businessRulePassRate = Number(
    gateActual.ontology_business_rule_pass_rate_percent !== undefined
      ? gateActual.ontology_business_rule_pass_rate_percent
      : ontologyMetrics.business_rule_pass_rate_percent
  );
  const decisionResolvedRate = Number(
    gateActual.ontology_decision_resolved_rate_percent !== undefined
      ? gateActual.ontology_decision_resolved_rate_percent
      : ontologyMetrics.decision_resolved_rate_percent
  );
  const sceneBatchFailureCount = Number(
    scenePackageBatchSummary.batch_gate_failure_count !== undefined
      ? scenePackageBatchSummary.batch_gate_failure_count
      : scenePackageBatchSummary.failed
  );
  const sceneBatchStatus = normalizeHandoffText(
    scenePackageBatch.status !== undefined
      ? scenePackageBatch.status
      : gateActual.scene_package_batch_status
  );
  const moquiBaseline = payload && payload.moqui_baseline ? payload.moqui_baseline : {};
  const moquiCompare = moquiBaseline && moquiBaseline.compare ? moquiBaseline.compare : {};
  const moquiMatrixRegressionCount = Number(
    gateActual.moqui_matrix_regression_count !== undefined
      ? gateActual.moqui_matrix_regression_count
      : buildAutoHandoffMoquiCoverageRegressions(moquiCompare, { normalizeHandoffText }).length
  );
  let sceneBatchPassed = null;
  if (sceneBatchStatus && sceneBatchStatus !== 'skipped') {
    sceneBatchPassed = sceneBatchStatus === 'passed';
  }
  if (gateActual.scene_package_batch_passed === true) {
    sceneBatchPassed = true;
  } else if (gateActual.scene_package_batch_passed === false) {
    sceneBatchPassed = false;
  }

  return {
    session_id: payload && payload.session_id ? payload.session_id : null,
    status: payload && payload.status ? payload.status : null,
    spec_success_rate_percent: Number.isFinite(successRate) ? successRate : null,
    risk_level: `${riskLevel || 'high'}`.trim().toLowerCase(),
    risk_level_rank: normalizeRiskRank(riskLevel),
    failed_goals: Number.isFinite(failedGoals) ? failedGoals : null,
    elapsed_ms: Number.isFinite(elapsedMs) ? elapsedMs : null,
    ontology_quality_score: Number.isFinite(ontologyQualityScore) ? ontologyQualityScore : null,
    ontology_unmapped_rules: Number.isFinite(ontologyUnmappedRules) ? ontologyUnmappedRules : null,
    ontology_undecided_decisions: Number.isFinite(ontologyUndecidedDecisions) ? ontologyUndecidedDecisions : null,
    ontology_business_rule_pass_rate_percent: Number.isFinite(businessRulePassRate) ? businessRulePassRate : null,
    ontology_decision_resolved_rate_percent: Number.isFinite(decisionResolvedRate) ? decisionResolvedRate : null,
    moqui_matrix_regression_count: Number.isFinite(moquiMatrixRegressionCount) ? moquiMatrixRegressionCount : null,
    scene_package_batch_status: sceneBatchStatus || null,
    scene_package_batch_passed: typeof sceneBatchPassed === 'boolean' ? sceneBatchPassed : null,
    scene_package_batch_failure_count: Number.isFinite(sceneBatchFailureCount) ? sceneBatchFailureCount : null,
    generated_at: payload && payload.generated_at ? payload.generated_at : null
  };
}

function buildAutoHandoffRegressionComparison(currentSnapshot, previousSnapshot) {
  const deltaSuccess = (
    Number.isFinite(currentSnapshot.spec_success_rate_percent) &&
    Number.isFinite(previousSnapshot.spec_success_rate_percent)
  )
    ? Number((currentSnapshot.spec_success_rate_percent - previousSnapshot.spec_success_rate_percent).toFixed(2))
    : null;
  const deltaRiskRank = (
    Number.isFinite(currentSnapshot.risk_level_rank) &&
    Number.isFinite(previousSnapshot.risk_level_rank)
  )
    ? currentSnapshot.risk_level_rank - previousSnapshot.risk_level_rank
    : null;
  const deltaFailedGoals = (
    Number.isFinite(currentSnapshot.failed_goals) &&
    Number.isFinite(previousSnapshot.failed_goals)
  )
    ? currentSnapshot.failed_goals - previousSnapshot.failed_goals
    : null;
  const deltaElapsedMs = (
    Number.isFinite(currentSnapshot.elapsed_ms) &&
    Number.isFinite(previousSnapshot.elapsed_ms)
  )
    ? currentSnapshot.elapsed_ms - previousSnapshot.elapsed_ms
    : null;
  const deltaOntologyQualityScore = (
    Number.isFinite(currentSnapshot.ontology_quality_score) &&
    Number.isFinite(previousSnapshot.ontology_quality_score)
  )
    ? Number((currentSnapshot.ontology_quality_score - previousSnapshot.ontology_quality_score).toFixed(2))
    : null;
  const deltaOntologyUnmappedRules = (
    Number.isFinite(currentSnapshot.ontology_unmapped_rules) &&
    Number.isFinite(previousSnapshot.ontology_unmapped_rules)
  )
    ? currentSnapshot.ontology_unmapped_rules - previousSnapshot.ontology_unmapped_rules
    : null;
  const deltaOntologyUndecidedDecisions = (
    Number.isFinite(currentSnapshot.ontology_undecided_decisions) &&
    Number.isFinite(previousSnapshot.ontology_undecided_decisions)
  )
    ? currentSnapshot.ontology_undecided_decisions - previousSnapshot.ontology_undecided_decisions
    : null;
  const deltaBusinessRulePassRate = (
    Number.isFinite(currentSnapshot.ontology_business_rule_pass_rate_percent) &&
    Number.isFinite(previousSnapshot.ontology_business_rule_pass_rate_percent)
  )
    ? Number((
      currentSnapshot.ontology_business_rule_pass_rate_percent -
      previousSnapshot.ontology_business_rule_pass_rate_percent
    ).toFixed(2))
    : null;
  const deltaDecisionResolvedRate = (
    Number.isFinite(currentSnapshot.ontology_decision_resolved_rate_percent) &&
    Number.isFinite(previousSnapshot.ontology_decision_resolved_rate_percent)
  )
    ? Number((
      currentSnapshot.ontology_decision_resolved_rate_percent -
      previousSnapshot.ontology_decision_resolved_rate_percent
    ).toFixed(2))
    : null;
  const deltaSceneBatchFailureCount = (
    Number.isFinite(currentSnapshot.scene_package_batch_failure_count) &&
    Number.isFinite(previousSnapshot.scene_package_batch_failure_count)
  )
    ? currentSnapshot.scene_package_batch_failure_count - previousSnapshot.scene_package_batch_failure_count
    : null;
  const deltaMoquiMatrixRegressionCount = (
    Number.isFinite(currentSnapshot.moqui_matrix_regression_count) &&
    Number.isFinite(previousSnapshot.moqui_matrix_regression_count)
  )
    ? currentSnapshot.moqui_matrix_regression_count - previousSnapshot.moqui_matrix_regression_count
    : null;

  let trend = 'stable';
  if (
    (Number.isFinite(deltaSuccess) && deltaSuccess > 0) &&
    (deltaRiskRank === null || deltaRiskRank <= 0) &&
    (deltaFailedGoals === null || deltaFailedGoals <= 0) &&
    (deltaOntologyQualityScore === null || deltaOntologyQualityScore >= 0) &&
    (deltaOntologyUnmappedRules === null || deltaOntologyUnmappedRules <= 0) &&
    (deltaOntologyUndecidedDecisions === null || deltaOntologyUndecidedDecisions <= 0) &&
    (deltaSceneBatchFailureCount === null || deltaSceneBatchFailureCount <= 0)
  ) {
    trend = 'improved';
  } else if (
    (Number.isFinite(deltaSuccess) && deltaSuccess < 0) ||
    (deltaRiskRank !== null && deltaRiskRank > 0) ||
    (deltaFailedGoals !== null && deltaFailedGoals > 0) ||
    (deltaOntologyQualityScore !== null && deltaOntologyQualityScore < 0) ||
    (deltaOntologyUnmappedRules !== null && deltaOntologyUnmappedRules > 0) ||
    (deltaOntologyUndecidedDecisions !== null && deltaOntologyUndecidedDecisions > 0) ||
    (deltaSceneBatchFailureCount !== null && deltaSceneBatchFailureCount > 0) ||
    (deltaMoquiMatrixRegressionCount !== null && deltaMoquiMatrixRegressionCount > 0)
  ) {
    trend = 'degraded';
  }

  return {
    trend,
    delta: {
      spec_success_rate_percent: deltaSuccess,
      risk_level_rank: deltaRiskRank,
      failed_goals: deltaFailedGoals,
      elapsed_ms: deltaElapsedMs,
      ontology_quality_score: deltaOntologyQualityScore,
      ontology_unmapped_rules: deltaOntologyUnmappedRules,
      ontology_undecided_decisions: deltaOntologyUndecidedDecisions,
      ontology_business_rule_pass_rate_percent: deltaBusinessRulePassRate,
      ontology_decision_resolved_rate_percent: deltaDecisionResolvedRate,
      moqui_matrix_regression_count: deltaMoquiMatrixRegressionCount,
      scene_package_batch_failure_count: deltaSceneBatchFailureCount
    }
  };
}

function buildAutoHandoffRegressionWindowTrend(series = []) {
  const normalized = Array.isArray(series) ? series.filter(Boolean) : [];
  if (normalized.length < 2) {
    return {
      trend: 'baseline',
      delta: {
        spec_success_rate_percent: null,
        risk_level_rank: null,
        failed_goals: null,
        elapsed_ms: null,
        ontology_quality_score: null,
        ontology_unmapped_rules: null,
        ontology_undecided_decisions: null,
        ontology_business_rule_pass_rate_percent: null,
        ontology_decision_resolved_rate_percent: null,
        moqui_matrix_regression_count: null,
        scene_package_batch_failure_count: null
      },
      has_baseline: false
    };
  }
  const latest = normalized[0];
  const oldest = normalized[normalized.length - 1];
  const comparison = buildAutoHandoffRegressionComparison(latest, oldest);
  return {
    trend: comparison.trend,
    delta: comparison.delta,
    has_baseline: true
  };
}

function buildAutoHandoffRegressionAggregates(series = []) {
  const snapshots = Array.isArray(series) ? series.filter(Boolean) : [];
  const successRates = snapshots
    .map(item => Number(item.spec_success_rate_percent))
    .filter(value => Number.isFinite(value));
  const failedGoals = snapshots
    .map(item => Number(item.failed_goals))
    .filter(value => Number.isFinite(value));
  const ontologyScores = snapshots
    .map(item => Number(item.ontology_quality_score))
    .filter(value => Number.isFinite(value));
  const ontologyUnmappedRules = snapshots
    .map(item => Number(item.ontology_unmapped_rules))
    .filter(value => Number.isFinite(value));
  const ontologyUndecidedDecisions = snapshots
    .map(item => Number(item.ontology_undecided_decisions))
    .filter(value => Number.isFinite(value));
  const rulePassRates = snapshots
    .map(item => Number(item.ontology_business_rule_pass_rate_percent))
    .filter(value => Number.isFinite(value));
  const decisionResolvedRates = snapshots
    .map(item => Number(item.ontology_decision_resolved_rate_percent))
    .filter(value => Number.isFinite(value));
  const sceneBatchFailures = snapshots
    .map(item => Number(item.scene_package_batch_failure_count))
    .filter(value => Number.isFinite(value));
  const moquiMatrixRegressions = snapshots
    .map(item => Number(item.moqui_matrix_regression_count))
    .filter(value => Number.isFinite(value));
  const sceneBatchApplicables = snapshots.filter(item => typeof item.scene_package_batch_passed === 'boolean');
  const sceneBatchPassedCount = sceneBatchApplicables.filter(item => item.scene_package_batch_passed === true).length;
  const sceneBatchFailedCount = sceneBatchApplicables.filter(item => item.scene_package_batch_passed === false).length;
  const riskLevels = {
    low: 0,
    medium: 0,
    high: 0,
    unknown: 0
  };
  snapshots.forEach(item => {
    const risk = `${item && item.risk_level ? item.risk_level : 'unknown'}`.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(riskLevels, risk)) {
      riskLevels[risk] += 1;
    } else {
      riskLevels.unknown += 1;
    }
  });

  const averageSuccessRate = successRates.length > 0
    ? Number((successRates.reduce((sum, value) => sum + value, 0) / successRates.length).toFixed(2))
    : null;
  const averageFailedGoals = failedGoals.length > 0
    ? Number((failedGoals.reduce((sum, value) => sum + value, 0) / failedGoals.length).toFixed(2))
    : null;
  const averageOntologyScore = ontologyScores.length > 0
    ? Number((ontologyScores.reduce((sum, value) => sum + value, 0) / ontologyScores.length).toFixed(2))
    : null;
  const averageOntologyUnmappedRules = ontologyUnmappedRules.length > 0
    ? Number((ontologyUnmappedRules.reduce((sum, value) => sum + value, 0) / ontologyUnmappedRules.length).toFixed(2))
    : null;
  const averageOntologyUndecidedDecisions = ontologyUndecidedDecisions.length > 0
    ? Number((ontologyUndecidedDecisions.reduce((sum, value) => sum + value, 0) / ontologyUndecidedDecisions.length).toFixed(2))
    : null;
  const averageRulePassRate = rulePassRates.length > 0
    ? Number((rulePassRates.reduce((sum, value) => sum + value, 0) / rulePassRates.length).toFixed(2))
    : null;
  const averageDecisionResolvedRate = decisionResolvedRates.length > 0
    ? Number((decisionResolvedRates.reduce((sum, value) => sum + value, 0) / decisionResolvedRates.length).toFixed(2))
    : null;
  const averageSceneBatchFailures = sceneBatchFailures.length > 0
    ? Number((sceneBatchFailures.reduce((sum, value) => sum + value, 0) / sceneBatchFailures.length).toFixed(2))
    : null;
  const averageMoquiMatrixRegressions = moquiMatrixRegressions.length > 0
    ? Number((moquiMatrixRegressions.reduce((sum, value) => sum + value, 0) / moquiMatrixRegressions.length).toFixed(2))
    : null;
  const sceneBatchPassRate = sceneBatchApplicables.length > 0
    ? Number(((sceneBatchPassedCount / sceneBatchApplicables.length) * 100).toFixed(2))
    : null;

  return {
    avg_spec_success_rate_percent: averageSuccessRate,
    min_spec_success_rate_percent: successRates.length > 0 ? Math.min(...successRates) : null,
    max_spec_success_rate_percent: successRates.length > 0 ? Math.max(...successRates) : null,
    avg_failed_goals: averageFailedGoals,
    avg_ontology_quality_score: averageOntologyScore,
    min_ontology_quality_score: ontologyScores.length > 0 ? Math.min(...ontologyScores) : null,
    max_ontology_quality_score: ontologyScores.length > 0 ? Math.max(...ontologyScores) : null,
    avg_ontology_unmapped_rules: averageOntologyUnmappedRules,
    max_ontology_unmapped_rules: ontologyUnmappedRules.length > 0 ? Math.max(...ontologyUnmappedRules) : null,
    avg_ontology_undecided_decisions: averageOntologyUndecidedDecisions,
    max_ontology_undecided_decisions: ontologyUndecidedDecisions.length > 0 ? Math.max(...ontologyUndecidedDecisions) : null,
    avg_ontology_business_rule_pass_rate_percent: averageRulePassRate,
    avg_ontology_decision_resolved_rate_percent: averageDecisionResolvedRate,
    scene_package_batch_applicable_count: sceneBatchApplicables.length,
    scene_package_batch_passed_count: sceneBatchPassedCount,
    scene_package_batch_failed_count: sceneBatchFailedCount,
    scene_package_batch_pass_rate_percent: sceneBatchPassRate,
    avg_scene_package_batch_failure_count: averageSceneBatchFailures,
    max_scene_package_batch_failure_count: sceneBatchFailures.length > 0 ? Math.max(...sceneBatchFailures) : null,
    avg_moqui_matrix_regression_count: averageMoquiMatrixRegressions,
    max_moqui_matrix_regression_count: moquiMatrixRegressions.length > 0 ? Math.max(...moquiMatrixRegressions) : null,
    risk_levels: riskLevels
  };
}

function buildAutoHandoffRegressionRiskLayers(series = []) {
  const snapshots = Array.isArray(series) ? series.filter(Boolean) : [];
  const levels = ['low', 'medium', 'high', 'unknown'];
  const result = {};

  levels.forEach(level => {
    const scoped = snapshots.filter(item => {
      const risk = `${item && item.risk_level ? item.risk_level : 'unknown'}`.trim().toLowerCase();
      return risk === level;
    });
    const successRates = scoped
      .map(item => Number(item.spec_success_rate_percent))
      .filter(value => Number.isFinite(value));
    const failedGoals = scoped
      .map(item => Number(item.failed_goals))
      .filter(value => Number.isFinite(value));
    const ontologyScores = scoped
      .map(item => Number(item.ontology_quality_score))
      .filter(value => Number.isFinite(value));
    const sceneBatchFailures = scoped
      .map(item => Number(item.scene_package_batch_failure_count))
      .filter(value => Number.isFinite(value));
    const moquiMatrixRegressions = scoped
      .map(item => Number(item.moqui_matrix_regression_count))
      .filter(value => Number.isFinite(value));
    const sceneBatchApplicable = scoped.filter(item => typeof item.scene_package_batch_passed === 'boolean');
    const sceneBatchPassed = sceneBatchApplicable.filter(item => item.scene_package_batch_passed === true).length;

    const avg = values => (
      values.length > 0
        ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
        : null
    );

    result[level] = {
      count: scoped.length,
      sessions: scoped.map(item => item.session_id).filter(Boolean),
      avg_spec_success_rate_percent: avg(successRates),
      max_spec_success_rate_percent: successRates.length > 0 ? Math.max(...successRates) : null,
      min_spec_success_rate_percent: successRates.length > 0 ? Math.min(...successRates) : null,
      avg_failed_goals: avg(failedGoals),
      avg_ontology_quality_score: avg(ontologyScores),
      avg_scene_package_batch_failure_count: avg(sceneBatchFailures),
      avg_moqui_matrix_regression_count: avg(moquiMatrixRegressions),
      max_moqui_matrix_regression_count: moquiMatrixRegressions.length > 0 ? Math.max(...moquiMatrixRegressions) : null,
      scene_package_batch_pass_rate_percent: sceneBatchApplicable.length > 0
        ? Number(((sceneBatchPassed / sceneBatchApplicable.length) * 100).toFixed(2))
        : null
    };
  });

  return result;
}

function buildAutoHandoffRegressionRecommendations(payload = {}) {
  const recommendations = [];
  const seen = new Set();
  const push = value => {
    const text = `${value || ''}`.trim();
    if (!text || seen.has(text)) {
      return;
    }
    seen.add(text);
    recommendations.push(text);
  };

  const current = payload.current || {};
  const trend = `${payload.trend || 'stable'}`.trim().toLowerCase();
  const windowTrend = payload.window_trend && payload.window_trend.trend
    ? `${payload.window_trend.trend}`.trim().toLowerCase()
    : trend;
  const currentFailed = Number(current.failed_goals);
  const currentRisk = `${current.risk_level || 'unknown'}`.trim().toLowerCase();
  const ontologyQuality = Number(current.ontology_quality_score);
  const ontologyUnmappedRules = Number(current.ontology_unmapped_rules);
  const ontologyUndecidedDecisions = Number(current.ontology_undecided_decisions);
  const sceneBatchFailureCount = Number(current.scene_package_batch_failure_count);
  const moquiMatrixRegressionCount = Number(current.moqui_matrix_regression_count);
  const sceneBatchPassed = current.scene_package_batch_passed;

  if (trend === 'degraded' || windowTrend === 'degraded') {
    push(
      `sce auto handoff run --manifest <path> --continue-from ${quoteCliArg(current.session_id || 'latest')} ` +
      '--continue-strategy pending --json'
    );
  } else if (Number.isFinite(currentFailed) && currentFailed > 0) {
    push(
      `sce auto handoff run --manifest <path> --continue-from ${quoteCliArg(current.session_id || 'latest')} ` +
      '--continue-strategy failed-only --json'
    );
  }

  if (currentRisk === 'high') {
    push('sce auto governance stats --days 14 --json');
  }

  if (Number.isFinite(ontologyQuality) && ontologyQuality < 80) {
    push('Strengthen ontology quality gate before next run: `--min-ontology-score 80`.');
  }
  if (Number.isFinite(ontologyUnmappedRules) && ontologyUnmappedRules > 0) {
    push('Drive business-rule closure to zero unmapped rules (`--max-unmapped-rules 0`).');
  }
  if (Number.isFinite(ontologyUndecidedDecisions) && ontologyUndecidedDecisions > 0) {
    push('Resolve pending decision logic entries (`--max-undecided-decisions 0`).');
  }
  if (sceneBatchPassed === false || (Number.isFinite(sceneBatchFailureCount) && sceneBatchFailureCount > 0)) {
    push(
      'Resolve scene package publish-batch gate failures and rerun: ' +
      '`sce scene package-publish-batch --manifest docs/handoffs/handoff-manifest.json --dry-run --json`.'
    );
  }
  if (Number.isFinite(moquiMatrixRegressionCount) && moquiMatrixRegressionCount > 0) {
    push(
      'Recover Moqui matrix regressions and rerun baseline gate: ' +
      '`sce scene moqui-baseline --include-all --compare-with .sce/reports/release-evidence/moqui-template-baseline.json --json`.'
    );
    for (const line of buildMoquiRegressionRecoverySequenceLines({
      wrapCommands: true,
      withPeriod: true
    })) {
      push(line);
    }
  }

  if ((payload.window && Number(payload.window.actual) > 0) && (payload.window.requested !== payload.window.actual)) {
    push('Increase regression coverage with `sce auto handoff regression --window 10 --json`.');
  }

  return recommendations;
}

function formatAutoHandoffRegressionValue(value, fallback = 'n/a') {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return fallback;
  }
  return `${value}`;
}

function getAutoHandoffMoquiCoverageMatrix(summary = {}) {
  if (!summary || typeof summary !== 'object') {
    return {};
  }
  return summary.coverage_matrix && typeof summary.coverage_matrix === 'object'
    ? summary.coverage_matrix
    : {};
}

function getAutoHandoffMoquiCoverageMetric(summary = {}, metricName = '', field = 'rate_percent') {
  const matrix = getAutoHandoffMoquiCoverageMatrix(summary);
  const metric = matrix && matrix[metricName] && typeof matrix[metricName] === 'object'
    ? matrix[metricName]
    : {};
  const value = Number(metric[field]);
  return Number.isFinite(value) ? value : null;
}

function formatAutoHandoffMoquiCoverageMetric(summary = {}, metricName = '', field = 'rate_percent', suffix = '') {
  const value = getAutoHandoffMoquiCoverageMetric(summary, metricName, field);
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `${value}${suffix}`;
}

function getAutoHandoffMoquiCoverageDeltaMatrix(compare = {}) {
  if (!compare || typeof compare !== 'object') {
    return {};
  }
  return compare.coverage_matrix_deltas && typeof compare.coverage_matrix_deltas === 'object'
    ? compare.coverage_matrix_deltas
    : {};
}

function getAutoHandoffMoquiCoverageDeltaMetric(compare = {}, metricName = '', field = 'rate_percent') {
  const matrix = getAutoHandoffMoquiCoverageDeltaMatrix(compare);
  const metric = matrix && matrix[metricName] && typeof matrix[metricName] === 'object'
    ? matrix[metricName]
    : {};
  const value = Number(metric[field]);
  return Number.isFinite(value) ? value : null;
}

function formatAutoHandoffMoquiCoverageDeltaMetric(compare = {}, metricName = '', field = 'rate_percent', suffix = '') {
  const value = getAutoHandoffMoquiCoverageDeltaMetric(compare, metricName, field);
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `${value}${suffix}`;
}

function getAutoHandoffMoquiCoverageMetricLabel(metricName = '') {
  const labels = {
    graph_valid: 'graph-valid',
    score_passed: 'score-passed',
    entity_coverage: 'entity-coverage',
    relation_coverage: 'relation-coverage',
    business_rule_coverage: 'business-rule-coverage',
    business_rule_closed: 'business-rule-closed',
    decision_coverage: 'decision-coverage',
    decision_closed: 'decision-closed',
    baseline_passed: 'baseline-passed'
  };
  return labels[metricName] || metricName;
}

function buildAutoHandoffMoquiCoverageRegressions(compare = {}, dependencies = {}) {
  const { normalizeHandoffText } = dependencies;
  const source = compare && typeof compare === 'object' ? compare : {};
  const predefined = Array.isArray(source.coverage_matrix_regressions)
    ? source.coverage_matrix_regressions
    : null;
  if (predefined) {
    const normalized = predefined
      .map(item => {
        const metric = normalizeHandoffText(item && item.metric);
        const deltaRate = Number(item && item.delta_rate_percent);
        if (!metric || !Number.isFinite(deltaRate) || deltaRate >= 0) {
          return null;
        }
        return {
          metric,
          label: normalizeHandoffText(item && item.label) || getAutoHandoffMoquiCoverageMetricLabel(metric),
          delta_rate_percent: Number(deltaRate.toFixed(2))
        };
      })
      .filter(Boolean);
    if (normalized.length > 0) {
      return normalized.sort((a, b) => {
        if (a.delta_rate_percent !== b.delta_rate_percent) {
          return a.delta_rate_percent - b.delta_rate_percent;
        }
        return `${a.metric}`.localeCompare(`${b.metric}`);
      });
    }
  }

  const deltaMatrix = getAutoHandoffMoquiCoverageDeltaMatrix(source);
  return Object.entries(deltaMatrix)
    .map(([metric, value]) => {
      const deltaRate = Number(value && value.rate_percent);
      if (!Number.isFinite(deltaRate) || deltaRate >= 0) {
        return null;
      }
      return {
        metric,
        label: getAutoHandoffMoquiCoverageMetricLabel(metric),
        delta_rate_percent: Number(deltaRate.toFixed(2))
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.delta_rate_percent !== b.delta_rate_percent) {
        return a.delta_rate_percent - b.delta_rate_percent;
      }
      return `${a.metric}`.localeCompare(`${b.metric}`);
    });
}

function formatAutoHandoffMoquiCoverageRegressions(compare = {}, limit = 3) {
  const regressions = buildAutoHandoffMoquiCoverageRegressions(compare);
  if (regressions.length === 0) {
    return 'none';
  }
  const maxItems = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : regressions.length;
  return regressions
    .slice(0, maxItems)
    .map(item => `${item.label}:${item.delta_rate_percent}%`)
    .join(' | ');
}

function renderAutoHandoffRegressionAsciiBar(value, max = 100, width = 20) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return `${'.'.repeat(width)} n/a`;
  }
  const bounded = Math.max(0, Math.min(max, parsed));
  const ratio = max > 0 ? bounded / max : 0;
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
  return `${'#'.repeat(filled)}${'.'.repeat(Math.max(0, width - filled))} ${Number(bounded.toFixed(2))}`;
}

function renderAutoHandoffRegressionMarkdown(payload = {}) {
  const current = payload.current || {};
  const previous = payload.previous || null;
  const window = payload.window || { requested: 2, actual: 0 };
  const delta = payload.delta || {};
  const windowTrend = payload.window_trend || { trend: 'baseline', delta: {} };
  const aggregates = payload.aggregates || {};
  const riskLevels = aggregates.risk_levels || {};
  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  const series = Array.isArray(payload.series) ? payload.series : [];
  const riskLayers = payload.risk_layers && typeof payload.risk_layers === 'object'
    ? payload.risk_layers
    : {};
  const trendSeriesLines = series.length > 0
    ? series.map(item => {
      const sessionId = formatAutoHandoffRegressionValue(item.session_id);
      const generatedAt = formatAutoHandoffRegressionValue(item.generated_at);
      const riskLevel = formatAutoHandoffRegressionValue(item.risk_level);
      const failedGoals = formatAutoHandoffRegressionValue(item.failed_goals);
      const sceneBatch = item.scene_package_batch_passed === null || item.scene_package_batch_passed === undefined
        ? 'n/a'
        : (item.scene_package_batch_passed ? 'pass' : 'fail');
      const successBar = renderAutoHandoffRegressionAsciiBar(item.spec_success_rate_percent, 100, 20);
      const ontologyBar = renderAutoHandoffRegressionAsciiBar(item.ontology_quality_score, 100, 20);
      return `- ${sessionId} | ${generatedAt} | risk=${riskLevel} | failed=${failedGoals} | scene-batch=${sceneBatch} | success=${successBar} | ontology=${ontologyBar}`;
    })
    : ['- None'];
  const riskLayerLines = ['low', 'medium', 'high', 'unknown'].map(level => {
    const scoped = riskLayers[level] && typeof riskLayers[level] === 'object'
      ? riskLayers[level]
      : {};
    return (
      `- ${level}: count=${formatAutoHandoffRegressionValue(scoped.count, '0')}, ` +
      `avg_success=${formatAutoHandoffRegressionValue(scoped.avg_spec_success_rate_percent)}, ` +
      `avg_failed_goals=${formatAutoHandoffRegressionValue(scoped.avg_failed_goals)}, ` +
      `avg_ontology_quality=${formatAutoHandoffRegressionValue(scoped.avg_ontology_quality_score)}, ` +
      `scene_batch_pass_rate=${formatAutoHandoffRegressionValue(scoped.scene_package_batch_pass_rate_percent)}%, ` +
      `avg_moqui_matrix_regressions=${formatAutoHandoffRegressionValue(scoped.avg_moqui_matrix_regression_count, '0')}`
    );
  });

  const lines = [
    '# Auto Handoff Regression Report',
    '',
    `- Session: ${formatAutoHandoffRegressionValue(current.session_id)}`,
    `- Compared to: ${previous ? formatAutoHandoffRegressionValue(previous.session_id) : 'none'}`,
    `- Trend: ${formatAutoHandoffRegressionValue(payload.trend)}`,
    `- Window: ${formatAutoHandoffRegressionValue(window.actual)}/${formatAutoHandoffRegressionValue(window.requested)}`,
    '',
    '## Point Delta',
    '',
    `- Spec success rate delta: ${formatAutoHandoffRegressionValue(delta.spec_success_rate_percent)}`,
    `- Risk level rank delta: ${formatAutoHandoffRegressionValue(delta.risk_level_rank)}`,
    `- Failed goals delta: ${formatAutoHandoffRegressionValue(delta.failed_goals)}`,
    `- Elapsed ms delta: ${formatAutoHandoffRegressionValue(delta.elapsed_ms)}`,
    `- Ontology quality delta: ${formatAutoHandoffRegressionValue(delta.ontology_quality_score)}`,
    `- Ontology unmapped rules delta: ${formatAutoHandoffRegressionValue(delta.ontology_unmapped_rules)}`,
    `- Ontology undecided decisions delta: ${formatAutoHandoffRegressionValue(delta.ontology_undecided_decisions)}`,
    `- Moqui matrix regression count delta: ${formatAutoHandoffRegressionValue(delta.moqui_matrix_regression_count)}`,
    `- Scene package batch failure count delta: ${formatAutoHandoffRegressionValue(delta.scene_package_batch_failure_count)}`,
    '',
    '## Window Trend',
    '',
    `- Trend: ${formatAutoHandoffRegressionValue(windowTrend.trend)}`,
    `- Success rate delta: ${formatAutoHandoffRegressionValue(windowTrend.delta && windowTrend.delta.spec_success_rate_percent)}`,
    `- Risk level rank delta: ${formatAutoHandoffRegressionValue(windowTrend.delta && windowTrend.delta.risk_level_rank)}`,
    `- Failed goals delta: ${formatAutoHandoffRegressionValue(windowTrend.delta && windowTrend.delta.failed_goals)}`,
    `- Moqui matrix regression count delta: ${formatAutoHandoffRegressionValue(windowTrend.delta && windowTrend.delta.moqui_matrix_regression_count)}`,
    '',
    '## Aggregates',
    '',
    `- Avg spec success rate: ${formatAutoHandoffRegressionValue(aggregates.avg_spec_success_rate_percent)}`,
    `- Min spec success rate: ${formatAutoHandoffRegressionValue(aggregates.min_spec_success_rate_percent)}`,
    `- Max spec success rate: ${formatAutoHandoffRegressionValue(aggregates.max_spec_success_rate_percent)}`,
    `- Avg failed goals: ${formatAutoHandoffRegressionValue(aggregates.avg_failed_goals)}`,
    `- Avg ontology quality score: ${formatAutoHandoffRegressionValue(aggregates.avg_ontology_quality_score)}`,
    `- Min ontology quality score: ${formatAutoHandoffRegressionValue(aggregates.min_ontology_quality_score)}`,
    `- Max ontology quality score: ${formatAutoHandoffRegressionValue(aggregates.max_ontology_quality_score)}`,
    `- Avg ontology unmapped rules: ${formatAutoHandoffRegressionValue(aggregates.avg_ontology_unmapped_rules)}`,
    `- Max ontology unmapped rules: ${formatAutoHandoffRegressionValue(aggregates.max_ontology_unmapped_rules)}`,
    `- Avg ontology undecided decisions: ${formatAutoHandoffRegressionValue(aggregates.avg_ontology_undecided_decisions)}`,
    `- Max ontology undecided decisions: ${formatAutoHandoffRegressionValue(aggregates.max_ontology_undecided_decisions)}`,
    `- Avg business rule pass rate: ${formatAutoHandoffRegressionValue(aggregates.avg_ontology_business_rule_pass_rate_percent)}`,
    `- Avg decision resolved rate: ${formatAutoHandoffRegressionValue(aggregates.avg_ontology_decision_resolved_rate_percent)}`,
    `- Scene package batch pass rate: ${formatAutoHandoffRegressionValue(aggregates.scene_package_batch_pass_rate_percent)}%`,
    `- Scene package batch failed sessions: ${formatAutoHandoffRegressionValue(aggregates.scene_package_batch_failed_count, '0')}`,
    `- Avg scene package batch failure count: ${formatAutoHandoffRegressionValue(aggregates.avg_scene_package_batch_failure_count)}`,
    `- Avg Moqui matrix regression count: ${formatAutoHandoffRegressionValue(aggregates.avg_moqui_matrix_regression_count)}`,
    `- Max Moqui matrix regression count: ${formatAutoHandoffRegressionValue(aggregates.max_moqui_matrix_regression_count)}`,
    `- Risk levels: low=${formatAutoHandoffRegressionValue(riskLevels.low, '0')}, medium=${formatAutoHandoffRegressionValue(riskLevels.medium, '0')}, high=${formatAutoHandoffRegressionValue(riskLevels.high, '0')}, unknown=${formatAutoHandoffRegressionValue(riskLevels.unknown, '0')}`,
    '',
    '## Trend Series',
    '',
    ...trendSeriesLines,
    '',
    '## Risk Layer View',
    '',
    ...riskLayerLines,
    '',
    '## Recommendations'
  ];

  if (recommendations.length === 0) {
    lines.push('', '- None');
  } else {
    recommendations.forEach(item => {
      lines.push('', `- ${item}`);
    });
  }

  return `${lines.join('\n')}\n`;
}


function renderAutoHandoffEvidenceReviewMarkdown(payload = {}) {
  const current = payload.current || {};
  const currentOverview = payload.current_overview || {};
  const gate = currentOverview.gate && typeof currentOverview.gate === 'object'
    ? currentOverview.gate
    : {};
  const gateActual = gate && gate.actual && typeof gate.actual === 'object'
    ? gate.actual
    : {};
  const releaseGatePreflight = currentOverview.release_gate_preflight && typeof currentOverview.release_gate_preflight === 'object'
    ? currentOverview.release_gate_preflight
    : {};
  const failureSummary = currentOverview.failure_summary && typeof currentOverview.failure_summary === 'object'
    ? currentOverview.failure_summary
    : {};
  const currentPolicy = currentOverview.policy && typeof currentOverview.policy === 'object'
    ? currentOverview.policy
    : {};
  const ontology = currentOverview.ontology_validation && typeof currentOverview.ontology_validation === 'object'
    ? currentOverview.ontology_validation
    : {};
  const ontologyMetrics = ontology && ontology.metrics && typeof ontology.metrics === 'object'
    ? ontology.metrics
    : {};
  const regression = currentOverview.regression && typeof currentOverview.regression === 'object'
    ? currentOverview.regression
    : {};
  const moquiBaseline = currentOverview.moqui_baseline && typeof currentOverview.moqui_baseline === 'object'
    ? currentOverview.moqui_baseline
    : {};
  const moquiSummary = moquiBaseline && moquiBaseline.summary && typeof moquiBaseline.summary === 'object'
    ? moquiBaseline.summary
    : {};
  const moquiScopeBreakdown = moquiSummary && moquiSummary.scope_breakdown && typeof moquiSummary.scope_breakdown === 'object'
    ? moquiSummary.scope_breakdown
    : {};
  const moquiGapFrequency = Array.isArray(moquiSummary && moquiSummary.gap_frequency)
    ? moquiSummary.gap_frequency
    : [];
  const moquiCompare = moquiBaseline && moquiBaseline.compare && typeof moquiBaseline.compare === 'object'
    ? moquiBaseline.compare
    : {};
  const moquiMatrixRegressions = buildAutoHandoffMoquiCoverageRegressions(moquiCompare);
  const moquiDeltas = moquiCompare && moquiCompare.deltas && typeof moquiCompare.deltas === 'object'
    ? moquiCompare.deltas
    : {};
  const moquiFailedTemplates = moquiCompare && moquiCompare.failed_templates && typeof moquiCompare.failed_templates === 'object'
    ? moquiCompare.failed_templates
    : {};
  const scenePackageBatch = currentOverview.scene_package_batch && typeof currentOverview.scene_package_batch === 'object'
    ? currentOverview.scene_package_batch
    : {};
  const scenePackageBatchSummary = scenePackageBatch && scenePackageBatch.summary && typeof scenePackageBatch.summary === 'object'
    ? scenePackageBatch.summary
    : {};
  const scenePackageBatchGate = scenePackageBatch && scenePackageBatch.batch_ontology_gate && typeof scenePackageBatch.batch_ontology_gate === 'object'
    ? scenePackageBatch.batch_ontology_gate
    : {};
  const scenePackageBatchFailures = Array.isArray(scenePackageBatchGate.failures)
    ? scenePackageBatchGate.failures
    : [];
  const capabilityCoverage = currentOverview.capability_coverage && typeof currentOverview.capability_coverage === 'object'
    ? currentOverview.capability_coverage
    : {};
  const capabilitySummary = capabilityCoverage && capabilityCoverage.summary && typeof capabilityCoverage.summary === 'object'
    ? capabilityCoverage.summary
    : {};
  const capabilityCompare = capabilityCoverage && capabilityCoverage.compare && typeof capabilityCoverage.compare === 'object'
    ? capabilityCoverage.compare
    : {};
  const capabilityGaps = Array.isArray(capabilityCoverage && capabilityCoverage.gaps)
    ? capabilityCoverage.gaps
    : [];
  const capabilityNormalization = capabilityCoverage && capabilityCoverage.normalization && typeof capabilityCoverage.normalization === 'object'
    ? capabilityCoverage.normalization
    : {};
  const capabilityWarnings = Array.isArray(capabilityCoverage && capabilityCoverage.warnings)
    ? capabilityCoverage.warnings
    : [];
  const window = payload.window || { requested: 5, actual: 0 };
  const series = Array.isArray(payload.series) ? payload.series : [];
  const riskLayers = payload.risk_layers && typeof payload.risk_layers === 'object'
    ? payload.risk_layers
    : {};
  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  const governanceSnapshot = payload.governance_snapshot && typeof payload.governance_snapshot === 'object'
    ? payload.governance_snapshot
    : null;
  const governanceHealth = governanceSnapshot && governanceSnapshot.health &&
    typeof governanceSnapshot.health === 'object'
    ? governanceSnapshot.health
    : {};
  const governanceReleaseGate = governanceHealth.release_gate && typeof governanceHealth.release_gate === 'object'
    ? governanceHealth.release_gate
    : {};
  const governanceHandoffQuality = governanceHealth.handoff_quality && typeof governanceHealth.handoff_quality === 'object'
    ? governanceHealth.handoff_quality
    : {};
  const trendSeriesLines = series.length > 0
    ? series.map(item => {
      const sessionId = formatAutoHandoffRegressionValue(item.session_id);
      const mergedAt = formatAutoHandoffRegressionValue(item.merged_at || item.generated_at);
      const riskLevel = formatAutoHandoffRegressionValue(item.risk_level);
      const failedGoals = formatAutoHandoffRegressionValue(item.failed_goals);
      const sceneBatch = item.scene_package_batch_passed === null || item.scene_package_batch_passed === undefined
        ? 'n/a'
        : (item.scene_package_batch_passed ? 'pass' : 'fail');
      const successBar = renderAutoHandoffRegressionAsciiBar(item.spec_success_rate_percent, 100, 20);
      const ontologyBar = renderAutoHandoffRegressionAsciiBar(item.ontology_quality_score, 100, 20);
      const capabilityBar = renderAutoHandoffRegressionAsciiBar(item.capability_coverage_percent, 100, 20);
      return (
        `- ${sessionId} | ${mergedAt} | risk=${riskLevel} | failed=${failedGoals} | scene-batch=${sceneBatch} | ` +
        `success=${successBar} | ontology=${ontologyBar} | capability=${capabilityBar}`
      );
    })
    : ['- None'];
  const riskLayerLines = ['low', 'medium', 'high', 'unknown'].map(level => {
    const scoped = riskLayers[level] && typeof riskLayers[level] === 'object'
      ? riskLayers[level]
      : {};
    return (
      `- ${level}: count=${formatAutoHandoffRegressionValue(scoped.count, '0')}, ` +
      `avg_success=${formatAutoHandoffRegressionValue(scoped.avg_spec_success_rate_percent)}, ` +
      `avg_failed_goals=${formatAutoHandoffRegressionValue(scoped.avg_failed_goals)}, ` +
      `avg_ontology_quality=${formatAutoHandoffRegressionValue(scoped.avg_ontology_quality_score)}, ` +
      `scene_batch_pass_rate=${formatAutoHandoffRegressionValue(scoped.scene_package_batch_pass_rate_percent)}%, ` +
      `avg_moqui_matrix_regressions=${formatAutoHandoffRegressionValue(scoped.avg_moqui_matrix_regression_count, '0')}`
    );
  });

  const lines = [
    '# Auto Handoff Release Evidence Review',
    '',
    `- Evidence file: ${formatAutoHandoffRegressionValue(payload.evidence_file)}`,
    `- Session: ${formatAutoHandoffRegressionValue(current.session_id)}`,
    `- Status: ${formatAutoHandoffRegressionValue(current.status)}`,
    `- Trend: ${formatAutoHandoffRegressionValue(payload.trend)}`,
    `- Window: ${formatAutoHandoffRegressionValue(window.actual)}/${formatAutoHandoffRegressionValue(window.requested)}`,
    '',
    '## Current Gate',
    '',
    `- Passed: ${gate.passed === true ? 'yes' : 'no'}`,
    `- Spec success rate: ${formatAutoHandoffRegressionValue(gateActual.spec_success_rate_percent)}`,
    `- Risk level: ${formatAutoHandoffRegressionValue(gateActual.risk_level)}`,
    `- Ontology quality score: ${formatAutoHandoffRegressionValue(gateActual.ontology_quality_score)}`,
    `- Unmapped business rules: ${formatAutoHandoffRegressionValue(gateActual.ontology_business_rule_unmapped)}`,
    `- Undecided decisions: ${formatAutoHandoffRegressionValue(gateActual.ontology_decision_undecided)}`,
    '',
    '## Current Release Gate Preflight',
    '',
    `- Available: ${releaseGatePreflight.available === true ? 'yes' : 'no'}`,
    `- Blocked: ${releaseGatePreflight.blocked === true ? 'yes' : 'no'}`,
    `- Latest tag: ${formatAutoHandoffRegressionValue(releaseGatePreflight.latest_tag)}`,
    `- Latest gate passed: ${releaseGatePreflight.latest_gate_passed === true ? 'yes' : (releaseGatePreflight.latest_gate_passed === false ? 'no' : 'n/a')}`,
    `- Pass rate: ${formatAutoHandoffRegressionValue(releaseGatePreflight.pass_rate_percent)}%`,
    `- Scene batch pass rate: ${formatAutoHandoffRegressionValue(releaseGatePreflight.scene_package_batch_pass_rate_percent)}%`,
    `- Drift alert rate: ${formatAutoHandoffRegressionValue(releaseGatePreflight.drift_alert_rate_percent)}%`,
    `- Drift blocked runs: ${formatAutoHandoffRegressionValue(releaseGatePreflight.drift_blocked_runs)}`,
    `- Runtime block rate (latest/max): ${formatAutoHandoffRegressionValue(releaseGatePreflight.latest_weekly_ops_runtime_block_rate_percent)}/${formatAutoHandoffRegressionValue(releaseGatePreflight.weekly_ops_runtime_block_rate_max_percent)}%`,
    `- Runtime ui-mode violations (latest/total): ${formatAutoHandoffRegressionValue(releaseGatePreflight.latest_weekly_ops_runtime_ui_mode_violation_total, '0')}/${formatAutoHandoffRegressionValue(releaseGatePreflight.weekly_ops_runtime_ui_mode_violation_total, '0')}`,
    `- Runtime ui-mode violation rate (latest/run-rate/max): ${formatAutoHandoffRegressionValue(releaseGatePreflight.latest_weekly_ops_runtime_ui_mode_violation_rate_percent)}/${formatAutoHandoffRegressionValue(releaseGatePreflight.weekly_ops_runtime_ui_mode_violation_run_rate_percent)}/${formatAutoHandoffRegressionValue(releaseGatePreflight.weekly_ops_runtime_ui_mode_violation_rate_max_percent)}%`,
    `- Reasons: ${Array.isArray(releaseGatePreflight.reasons) && releaseGatePreflight.reasons.length > 0 ? releaseGatePreflight.reasons.join(' | ') : 'none'}`,
    `- Parse error: ${formatAutoHandoffRegressionValue(releaseGatePreflight.parse_error)}`,
    '',
    '## Current Failure Summary',
    '',
    `- Failed phase: ${formatAutoHandoffRegressionValue(failureSummary.failed_phase && failureSummary.failed_phase.id)}`,
    `- Gate failed: ${failureSummary.gate_failed === true ? 'yes' : 'no'}`,
    `- Release gate preflight blocked: ${failureSummary.release_gate_preflight_blocked === true ? 'yes' : 'no'}`,
    `- Highlights: ${Array.isArray(failureSummary.highlights) && failureSummary.highlights.length > 0 ? failureSummary.highlights.join(' | ') : 'none'}`,
    '',
    '## Current Ontology',
    '',
    `- Status: ${formatAutoHandoffRegressionValue(ontology.status)}`,
    `- Passed: ${ontology.passed === true ? 'yes' : 'no'}`,
    `- Quality score: ${formatAutoHandoffRegressionValue(ontology.quality_score)}`,
    `- Entity total: ${formatAutoHandoffRegressionValue(ontologyMetrics.entity_total)}`,
    `- Relation total: ${formatAutoHandoffRegressionValue(ontologyMetrics.relation_total)}`,
    `- Business rule unmapped: ${formatAutoHandoffRegressionValue(ontologyMetrics.business_rule_unmapped)}`,
    `- Decision undecided: ${formatAutoHandoffRegressionValue(ontologyMetrics.decision_undecided)}`,
    '',
    '## Current Regression',
    '',
    `- Trend: ${formatAutoHandoffRegressionValue(regression.trend)}`,
    `- Delta success rate: ${formatAutoHandoffRegressionValue(regression.delta && regression.delta.spec_success_rate_percent)}`,
    `- Delta risk rank: ${formatAutoHandoffRegressionValue(regression.delta && regression.delta.risk_level_rank)}`,
    `- Delta failed goals: ${formatAutoHandoffRegressionValue(regression.delta && regression.delta.failed_goals)}`,
    '',
    '## Current Moqui Baseline',
    '',
    `- Status: ${formatAutoHandoffRegressionValue(moquiBaseline.status)}`,
    `- Portfolio passed: ${moquiSummary.portfolio_passed === true ? 'yes' : (moquiSummary.portfolio_passed === false ? 'no' : 'n/a')}`,
    `- Avg score: ${formatAutoHandoffRegressionValue(moquiSummary.avg_score)}`,
    `- Valid-rate: ${formatAutoHandoffRegressionValue(moquiSummary.valid_rate_percent)}%`,
    `- Baseline failed templates: ${formatAutoHandoffRegressionValue(moquiSummary.baseline_failed)}`,
    `- Matrix regression count: ${formatAutoHandoffRegressionValue(moquiMatrixRegressions.length, '0')}`,
    `- Matrix regression gate (max): ${formatAutoHandoffRegressionValue(currentPolicy.max_moqui_matrix_regressions)}`,
    `- Scope mix (moqui/suite/other): ${formatAutoHandoffRegressionValue(moquiScopeBreakdown.moqui_erp, '0')}/${formatAutoHandoffRegressionValue(moquiScopeBreakdown.scene_orchestration, '0')}/${formatAutoHandoffRegressionValue(moquiScopeBreakdown.other, '0')}`,
    `- Entity coverage: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'entity_coverage', 'rate_percent', '%')}`,
    `- Relation coverage: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'relation_coverage', 'rate_percent', '%')}`,
    `- Business-rule coverage: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'business_rule_coverage', 'rate_percent', '%')}`,
    `- Business-rule closed: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'business_rule_closed', 'rate_percent', '%')}`,
    `- Decision coverage: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'decision_coverage', 'rate_percent', '%')}`,
    `- Decision closed: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'decision_closed', 'rate_percent', '%')}`,
    `- Delta avg score: ${formatAutoHandoffRegressionValue(moquiDeltas.avg_score)}`,
    `- Delta valid-rate: ${formatAutoHandoffRegressionValue(moquiDeltas.valid_rate_percent)}%`,
    `- Delta entity coverage: ${formatAutoHandoffMoquiCoverageDeltaMetric(moquiCompare, 'entity_coverage', 'rate_percent', '%')}`,
    `- Delta business-rule closed: ${formatAutoHandoffMoquiCoverageDeltaMetric(moquiCompare, 'business_rule_closed', 'rate_percent', '%')}`,
    `- Delta decision closed: ${formatAutoHandoffMoquiCoverageDeltaMetric(moquiCompare, 'decision_closed', 'rate_percent', '%')}`,
    `- Matrix regressions: ${formatAutoHandoffMoquiCoverageRegressions(moquiCompare, 5)}`,
    `- Newly failed templates: ${Array.isArray(moquiFailedTemplates.newly_failed) && moquiFailedTemplates.newly_failed.length > 0 ? moquiFailedTemplates.newly_failed.join(', ') : 'none'}`,
    `- Recovered templates: ${Array.isArray(moquiFailedTemplates.recovered) && moquiFailedTemplates.recovered.length > 0 ? moquiFailedTemplates.recovered.join(', ') : 'none'}`,
    `- Top baseline gaps: ${moquiGapFrequency.length > 0 ? moquiGapFrequency.slice(0, 3).map(item => `${item.gap}:${item.count}`).join(' | ') : 'none'}`,
    `- Baseline JSON: ${formatAutoHandoffRegressionValue(moquiBaseline.output && moquiBaseline.output.json)}`,
    '',
    '## Current Scene Package Batch',
    '',
    `- Status: ${formatAutoHandoffRegressionValue(scenePackageBatch.status)}`,
    `- Generated: ${scenePackageBatch.generated === true ? 'yes' : 'no'}`,
    `- Selected specs: ${formatAutoHandoffRegressionValue(scenePackageBatchSummary.selected)}`,
    `- Failed specs: ${formatAutoHandoffRegressionValue(scenePackageBatchSummary.failed)}`,
    `- Batch gate passed: ${scenePackageBatchSummary.batch_gate_passed === true ? 'yes' : (scenePackageBatchSummary.batch_gate_passed === false ? 'no' : 'n/a')}`,
    `- Batch gate failure count: ${formatAutoHandoffRegressionValue(scenePackageBatchSummary.batch_gate_failure_count)}`,
    `- Ontology average score: ${formatAutoHandoffRegressionValue(scenePackageBatchSummary.ontology_average_score)}`,
    `- Ontology valid-rate: ${formatAutoHandoffRegressionValue(scenePackageBatchSummary.ontology_valid_rate_percent)}%`,
    `- Batch gate failures: ${scenePackageBatchFailures.length > 0 ? scenePackageBatchFailures.map(item => item && item.message ? item.message : '').filter(Boolean).join(' | ') : 'none'}`,
    `- Scene batch JSON: ${formatAutoHandoffRegressionValue(scenePackageBatch.output && scenePackageBatch.output.json)}`,
    '',
    '## Current Capability Coverage',
    '',
    `- Status: ${formatAutoHandoffRegressionValue(capabilityCoverage.status)}`,
    `- Passed: ${capabilitySummary.passed === true ? 'yes' : (capabilitySummary.passed === false ? 'no' : 'n/a')}`,
    `- Coverage: ${formatAutoHandoffRegressionValue(capabilitySummary.coverage_percent)}%`,
    `- Min required: ${formatAutoHandoffRegressionValue(capabilitySummary.min_required_percent)}%`,
    `- Covered capabilities: ${formatAutoHandoffRegressionValue(capabilitySummary.covered_capabilities)}`,
    `- Uncovered capabilities: ${formatAutoHandoffRegressionValue(capabilitySummary.uncovered_capabilities)}`,
    `- Delta coverage: ${formatAutoHandoffRegressionValue(capabilityCompare.delta_coverage_percent)}%`,
    `- Delta covered capabilities: ${formatAutoHandoffRegressionValue(capabilityCompare.delta_covered_capabilities)}`,
    `- Newly covered: ${Array.isArray(capabilityCompare.newly_covered) && capabilityCompare.newly_covered.length > 0 ? capabilityCompare.newly_covered.join(', ') : 'none'}`,
    `- Newly uncovered: ${Array.isArray(capabilityCompare.newly_uncovered) && capabilityCompare.newly_uncovered.length > 0 ? capabilityCompare.newly_uncovered.join(', ') : 'none'}`,
    `- Lexicon version: ${formatAutoHandoffRegressionValue(capabilityNormalization.lexicon_version)}`,
    `- Expected alias mapped: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.expected_alias_mapped) ? capabilityNormalization.expected_alias_mapped.length : 0)}`,
    `- Expected deprecated alias: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.expected_deprecated_aliases) ? capabilityNormalization.expected_deprecated_aliases.length : 0)}`,
    `- Expected unknown: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.expected_unknown) ? capabilityNormalization.expected_unknown.length : 0)}`,
    `- Provided alias mapped: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.provided_alias_mapped) ? capabilityNormalization.provided_alias_mapped.length : 0)}`,
    `- Provided deprecated alias: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.provided_deprecated_aliases) ? capabilityNormalization.provided_deprecated_aliases.length : 0)}`,
    `- Provided unknown: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.provided_unknown) ? capabilityNormalization.provided_unknown.length : 0)}`,
    `- Capability gaps: ${capabilityGaps.length > 0 ? capabilityGaps.join(', ') : 'none'}`,
    `- Coverage warnings: ${capabilityWarnings.length > 0 ? capabilityWarnings.join(' | ') : 'none'}`,
    `- Coverage JSON: ${formatAutoHandoffRegressionValue(capabilityCoverage.output && capabilityCoverage.output.json)}`,
    '',
    '## Trend Series',
    '',
    ...trendSeriesLines,
    '',
    '## Risk Layer View',
    '',
    ...riskLayerLines,
    '',
    '## Governance Snapshot',
    '',
    `- Risk level: ${formatAutoHandoffRegressionValue(governanceHealth.risk_level)}`,
    `- Concern count: ${formatAutoHandoffRegressionValue(Array.isArray(governanceHealth.concerns) ? governanceHealth.concerns.length : 0, '0')}`,
    `- Recommendation count: ${formatAutoHandoffRegressionValue(Array.isArray(governanceHealth.recommendations) ? governanceHealth.recommendations.length : 0, '0')}`,
    `- Release gate available: ${governanceReleaseGate.available === true ? 'yes' : 'no'}`,
    `- Release gate latest passed: ${governanceReleaseGate.latest_gate_passed === true ? 'yes' : (governanceReleaseGate.latest_gate_passed === false ? 'no' : 'n/a')}`,
    `- Handoff quality available: ${governanceHandoffQuality.available === true ? 'yes' : 'no'}`,
    `- Handoff latest status: ${formatAutoHandoffRegressionValue(governanceHandoffQuality.latest_status)}`,
    `- Handoff latest gate passed: ${governanceHandoffQuality.latest_gate_passed === true ? 'yes' : (governanceHandoffQuality.latest_gate_passed === false ? 'no' : 'n/a')}`,
    `- Handoff latest ontology score: ${formatAutoHandoffRegressionValue(governanceHandoffQuality.latest_ontology_quality_score)}`,
    '',
    '## Recommendations'
  ];

  if (recommendations.length === 0) {
    lines.push('', '- None');
  } else {
    recommendations.forEach(item => {
      lines.push('', `- ${item}`);
    });
  }

  return `${lines.join('\n')}\n`;
}


function renderAutoHandoffReleaseNotesDraft(payload = {}, context = {}, dependencies = {}) {
  const { normalizeHandoffReleaseVersion, normalizeHandoffReleaseDate } = dependencies;
  const current = payload.current || {};
  const currentOverview = payload.current_overview || {};
  const gate = currentOverview.gate && typeof currentOverview.gate === 'object'
    ? currentOverview.gate
    : {};
  const gateActual = gate && gate.actual && typeof gate.actual === 'object'
    ? gate.actual
    : {};
  const releaseGatePreflight = currentOverview.release_gate_preflight && typeof currentOverview.release_gate_preflight === 'object'
    ? currentOverview.release_gate_preflight
    : {};
  const failureSummary = currentOverview.failure_summary && typeof currentOverview.failure_summary === 'object'
    ? currentOverview.failure_summary
    : {};
  const currentPolicy = currentOverview.policy && typeof currentOverview.policy === 'object'
    ? currentOverview.policy
    : {};
  const ontology = currentOverview.ontology_validation && typeof currentOverview.ontology_validation === 'object'
    ? currentOverview.ontology_validation
    : {};
  const ontologyMetrics = ontology && ontology.metrics && typeof ontology.metrics === 'object'
    ? ontology.metrics
    : {};
  const regression = currentOverview.regression && typeof currentOverview.regression === 'object'
    ? currentOverview.regression
    : {};
  const moquiBaseline = currentOverview.moqui_baseline && typeof currentOverview.moqui_baseline === 'object'
    ? currentOverview.moqui_baseline
    : {};
  const moquiSummary = moquiBaseline && moquiBaseline.summary && typeof moquiBaseline.summary === 'object'
    ? moquiBaseline.summary
    : {};
  const moquiScopeBreakdown = moquiSummary && moquiSummary.scope_breakdown && typeof moquiSummary.scope_breakdown === 'object'
    ? moquiSummary.scope_breakdown
    : {};
  const moquiGapFrequency = Array.isArray(moquiSummary && moquiSummary.gap_frequency)
    ? moquiSummary.gap_frequency
    : [];
  const moquiCompare = moquiBaseline && moquiBaseline.compare && typeof moquiBaseline.compare === 'object'
    ? moquiBaseline.compare
    : {};
  const moquiMatrixRegressions = buildAutoHandoffMoquiCoverageRegressions(moquiCompare);
  const moquiDeltas = moquiCompare && moquiCompare.deltas && typeof moquiCompare.deltas === 'object'
    ? moquiCompare.deltas
    : {};
  const moquiFailedTemplates = moquiCompare && moquiCompare.failed_templates && typeof moquiCompare.failed_templates === 'object'
    ? moquiCompare.failed_templates
    : {};
  const scenePackageBatch = currentOverview.scene_package_batch && typeof currentOverview.scene_package_batch === 'object'
    ? currentOverview.scene_package_batch
    : {};
  const scenePackageBatchSummary = scenePackageBatch && scenePackageBatch.summary && typeof scenePackageBatch.summary === 'object'
    ? scenePackageBatch.summary
    : {};
  const scenePackageBatchGate = scenePackageBatch && scenePackageBatch.batch_ontology_gate && typeof scenePackageBatch.batch_ontology_gate === 'object'
    ? scenePackageBatch.batch_ontology_gate
    : {};
  const scenePackageBatchFailures = Array.isArray(scenePackageBatchGate.failures)
    ? scenePackageBatchGate.failures
    : [];
  const capabilityCoverage = currentOverview.capability_coverage && typeof currentOverview.capability_coverage === 'object'
    ? currentOverview.capability_coverage
    : {};
  const capabilitySummary = capabilityCoverage && capabilityCoverage.summary && typeof capabilityCoverage.summary === 'object'
    ? capabilityCoverage.summary
    : {};
  const capabilityCompare = capabilityCoverage && capabilityCoverage.compare && typeof capabilityCoverage.compare === 'object'
    ? capabilityCoverage.compare
    : {};
  const capabilityGaps = Array.isArray(capabilityCoverage && capabilityCoverage.gaps)
    ? capabilityCoverage.gaps
    : [];
  const capabilityNormalization = capabilityCoverage && capabilityCoverage.normalization && typeof capabilityCoverage.normalization === 'object'
    ? capabilityCoverage.normalization
    : {};
  const capabilityWarnings = Array.isArray(capabilityCoverage && capabilityCoverage.warnings)
    ? capabilityCoverage.warnings
    : [];
  const riskLayers = payload.risk_layers && typeof payload.risk_layers === 'object'
    ? payload.risk_layers
    : {};
  const statusCounts = payload.aggregates && payload.aggregates.status_counts
    ? payload.aggregates.status_counts
    : {};
  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  const governanceSnapshot = payload.governance_snapshot && typeof payload.governance_snapshot === 'object'
    ? payload.governance_snapshot
    : null;
  const governanceHealth = governanceSnapshot && governanceSnapshot.health &&
    typeof governanceSnapshot.health === 'object'
    ? governanceSnapshot.health
    : {};
  const governanceReleaseGate = governanceHealth.release_gate && typeof governanceHealth.release_gate === 'object'
    ? governanceHealth.release_gate
    : {};
  const governanceHandoffQuality = governanceHealth.handoff_quality && typeof governanceHealth.handoff_quality === 'object'
    ? governanceHealth.handoff_quality
    : {};
  const reviewFile = typeof context.reviewFile === 'string' && context.reviewFile.trim()
    ? context.reviewFile.trim()
    : null;
  const version = normalizeHandoffReleaseVersion(context.version, '0.0.0');
  const releaseDate = normalizeHandoffReleaseDate(context.releaseDate);

  const riskLines = ['low', 'medium', 'high', 'unknown'].map(level => {
    const scoped = riskLayers[level] && typeof riskLayers[level] === 'object'
      ? riskLayers[level]
      : {};
    return (
      `- ${level}: count=${formatAutoHandoffRegressionValue(scoped.count, '0')}, ` +
      `avg_success=${formatAutoHandoffRegressionValue(scoped.avg_spec_success_rate_percent)}, ` +
      `avg_failed_goals=${formatAutoHandoffRegressionValue(scoped.avg_failed_goals)}, ` +
      `avg_ontology_quality=${formatAutoHandoffRegressionValue(scoped.avg_ontology_quality_score)}, ` +
      `avg_moqui_matrix_regressions=${formatAutoHandoffRegressionValue(scoped.avg_moqui_matrix_regression_count, '0')}`
    );
  });

  const lines = [
    `# Release Notes Draft: ${version}`,
    '',
    `Release date: ${releaseDate}`,
    '',
    '## Handoff Evidence Summary',
    '',
    `- Evidence file: ${formatAutoHandoffRegressionValue(payload.evidence_file)}`,
    `- Current session: ${formatAutoHandoffRegressionValue(current.session_id)}`,
    `- Current status: ${formatAutoHandoffRegressionValue(current.status)}`,
    `- Gate passed: ${gate.passed === true ? 'yes' : 'no'}`,
    `- Release gate preflight available: ${releaseGatePreflight.available === true ? 'yes' : 'no'}`,
    `- Release gate preflight blocked: ${releaseGatePreflight.blocked === true ? 'yes' : 'no'}`,
    `- Release gate preflight hard-gate: ${currentPolicy.require_release_gate_preflight === true ? 'enabled' : 'advisory'}`,
    `- Release gate preflight reasons: ${Array.isArray(releaseGatePreflight.reasons) && releaseGatePreflight.reasons.length > 0 ? releaseGatePreflight.reasons.join(' | ') : 'none'}`,
    `- Release gate runtime block rate (latest/max): ${formatAutoHandoffRegressionValue(releaseGatePreflight.latest_weekly_ops_runtime_block_rate_percent)}/${formatAutoHandoffRegressionValue(releaseGatePreflight.weekly_ops_runtime_block_rate_max_percent)}%`,
    `- Release gate runtime ui-mode violations (latest/total): ${formatAutoHandoffRegressionValue(releaseGatePreflight.latest_weekly_ops_runtime_ui_mode_violation_total, '0')}/${formatAutoHandoffRegressionValue(releaseGatePreflight.weekly_ops_runtime_ui_mode_violation_total, '0')}`,
    `- Release gate runtime ui-mode violation rate (latest/run-rate/max): ${formatAutoHandoffRegressionValue(releaseGatePreflight.latest_weekly_ops_runtime_ui_mode_violation_rate_percent)}/${formatAutoHandoffRegressionValue(releaseGatePreflight.weekly_ops_runtime_ui_mode_violation_run_rate_percent)}/${formatAutoHandoffRegressionValue(releaseGatePreflight.weekly_ops_runtime_ui_mode_violation_rate_max_percent)}%`,
    `- Failure summary highlights: ${Array.isArray(failureSummary.highlights) && failureSummary.highlights.length > 0 ? failureSummary.highlights.join(' | ') : 'none'}`,
    `- Spec success rate: ${formatAutoHandoffRegressionValue(gateActual.spec_success_rate_percent)}`,
    `- Risk level: ${formatAutoHandoffRegressionValue(gateActual.risk_level)}`,
    `- Ontology quality score: ${formatAutoHandoffRegressionValue(gateActual.ontology_quality_score)}`,
    `- Ontology unmapped rules: ${formatAutoHandoffRegressionValue(gateActual.ontology_business_rule_unmapped, formatAutoHandoffRegressionValue(ontologyMetrics.business_rule_unmapped))}`,
    `- Ontology undecided decisions: ${formatAutoHandoffRegressionValue(gateActual.ontology_decision_undecided, formatAutoHandoffRegressionValue(ontologyMetrics.decision_undecided))}`,
    `- Regression trend: ${formatAutoHandoffRegressionValue(regression.trend, formatAutoHandoffRegressionValue(payload.trend))}`,
    `- Window trend: ${formatAutoHandoffRegressionValue(payload.window_trend && payload.window_trend.trend)}`,
    `- Gate pass rate (window): ${formatAutoHandoffRegressionValue(payload.aggregates && payload.aggregates.gate_pass_rate_percent)}%`,
    `- Moqui baseline portfolio passed: ${moquiSummary.portfolio_passed === true ? 'yes' : (moquiSummary.portfolio_passed === false ? 'no' : 'n/a')}`,
    `- Moqui baseline avg score: ${formatAutoHandoffRegressionValue(moquiSummary.avg_score)}`,
    `- Moqui baseline valid-rate: ${formatAutoHandoffRegressionValue(moquiSummary.valid_rate_percent)}%`,
    `- Moqui baseline failed templates: ${formatAutoHandoffRegressionValue(moquiSummary.baseline_failed)}`,
    `- Moqui matrix regression count: ${formatAutoHandoffRegressionValue(moquiMatrixRegressions.length, '0')}`,
    `- Moqui matrix regression gate (max): ${formatAutoHandoffRegressionValue(currentPolicy.max_moqui_matrix_regressions)}`,
    `- Moqui scope mix (moqui/suite/other): ${formatAutoHandoffRegressionValue(moquiScopeBreakdown.moqui_erp, '0')}/${formatAutoHandoffRegressionValue(moquiScopeBreakdown.scene_orchestration, '0')}/${formatAutoHandoffRegressionValue(moquiScopeBreakdown.other, '0')}`,
    `- Moqui entity coverage: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'entity_coverage', 'rate_percent', '%')}`,
    `- Moqui relation coverage: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'relation_coverage', 'rate_percent', '%')}`,
    `- Moqui business-rule coverage: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'business_rule_coverage', 'rate_percent', '%')}`,
    `- Moqui business-rule closed: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'business_rule_closed', 'rate_percent', '%')}`,
    `- Moqui decision coverage: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'decision_coverage', 'rate_percent', '%')}`,
    `- Moqui decision closed: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'decision_closed', 'rate_percent', '%')}`,
    `- Moqui baseline avg score delta: ${formatAutoHandoffRegressionValue(moquiDeltas.avg_score)}`,
    `- Moqui baseline valid-rate delta: ${formatAutoHandoffRegressionValue(moquiDeltas.valid_rate_percent)}%`,
    `- Moqui entity coverage delta: ${formatAutoHandoffMoquiCoverageDeltaMetric(moquiCompare, 'entity_coverage', 'rate_percent', '%')}`,
    `- Moqui business-rule closed delta: ${formatAutoHandoffMoquiCoverageDeltaMetric(moquiCompare, 'business_rule_closed', 'rate_percent', '%')}`,
    `- Moqui decision closed delta: ${formatAutoHandoffMoquiCoverageDeltaMetric(moquiCompare, 'decision_closed', 'rate_percent', '%')}`,
    `- Moqui matrix regressions: ${formatAutoHandoffMoquiCoverageRegressions(moquiCompare, 5)}`,
    `- Moqui newly failed templates: ${Array.isArray(moquiFailedTemplates.newly_failed) && moquiFailedTemplates.newly_failed.length > 0 ? moquiFailedTemplates.newly_failed.join(', ') : 'none'}`,
    `- Moqui top baseline gaps: ${moquiGapFrequency.length > 0 ? moquiGapFrequency.slice(0, 3).map(item => `${item.gap}:${item.count}`).join(' | ') : 'none'}`,
    `- Scene package batch status: ${formatAutoHandoffRegressionValue(scenePackageBatch.status)}`,
    `- Scene package batch selected: ${formatAutoHandoffRegressionValue(scenePackageBatchSummary.selected)}`,
    `- Scene package batch failed: ${formatAutoHandoffRegressionValue(scenePackageBatchSummary.failed)}`,
    `- Scene package batch gate passed: ${scenePackageBatchSummary.batch_gate_passed === true ? 'yes' : (scenePackageBatchSummary.batch_gate_passed === false ? 'no' : 'n/a')}`,
    `- Scene package batch gate failures: ${scenePackageBatchFailures.length > 0 ? scenePackageBatchFailures.map(item => item && item.message ? item.message : '').filter(Boolean).join(' | ') : 'none'}`,
    `- Capability coverage status: ${formatAutoHandoffRegressionValue(capabilityCoverage.status)}`,
    `- Capability coverage passed: ${capabilitySummary.passed === true ? 'yes' : (capabilitySummary.passed === false ? 'no' : 'n/a')}`,
    `- Capability coverage: ${formatAutoHandoffRegressionValue(capabilitySummary.coverage_percent)}%`,
    `- Capability min required: ${formatAutoHandoffRegressionValue(capabilitySummary.min_required_percent)}%`,
    `- Capability coverage delta: ${formatAutoHandoffRegressionValue(capabilityCompare.delta_coverage_percent)}%`,
    `- Capability newly uncovered: ${Array.isArray(capabilityCompare.newly_uncovered) && capabilityCompare.newly_uncovered.length > 0 ? capabilityCompare.newly_uncovered.join(', ') : 'none'}`,
    `- Capability lexicon version: ${formatAutoHandoffRegressionValue(capabilityNormalization.lexicon_version)}`,
    `- Capability expected alias mapped: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.expected_alias_mapped) ? capabilityNormalization.expected_alias_mapped.length : 0)}`,
    `- Capability expected deprecated alias: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.expected_deprecated_aliases) ? capabilityNormalization.expected_deprecated_aliases.length : 0)}`,
    `- Capability provided deprecated alias: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.provided_deprecated_aliases) ? capabilityNormalization.provided_deprecated_aliases.length : 0)}`,
    `- Capability gaps: ${capabilityGaps.length > 0 ? capabilityGaps.join(', ') : 'none'}`,
    `- Capability warnings: ${capabilityWarnings.length > 0 ? capabilityWarnings.join(' | ') : 'none'}`,
    '',
    '## Status Breakdown',
    '',
    `- completed: ${formatAutoHandoffRegressionValue(statusCounts.completed, '0')}`,
    `- failed: ${formatAutoHandoffRegressionValue(statusCounts.failed, '0')}`,
    `- dry_run: ${formatAutoHandoffRegressionValue(statusCounts.dry_run, '0')}`,
    `- running: ${formatAutoHandoffRegressionValue(statusCounts.running, '0')}`,
    `- other: ${formatAutoHandoffRegressionValue(statusCounts.other, '0')}`,
    '',
    '## Risk Layer Snapshot',
    '',
    ...riskLines,
    '',
    '## Governance Snapshot',
    '',
    `- Risk level: ${formatAutoHandoffRegressionValue(governanceHealth.risk_level)}`,
    `- Concern count: ${formatAutoHandoffRegressionValue(Array.isArray(governanceHealth.concerns) ? governanceHealth.concerns.length : 0, '0')}`,
    `- Recommendation count: ${formatAutoHandoffRegressionValue(Array.isArray(governanceHealth.recommendations) ? governanceHealth.recommendations.length : 0, '0')}`,
    `- Release gate available: ${governanceReleaseGate.available === true ? 'yes' : 'no'}`,
    `- Release gate latest passed: ${governanceReleaseGate.latest_gate_passed === true ? 'yes' : (governanceReleaseGate.latest_gate_passed === false ? 'no' : 'n/a')}`,
    `- Handoff quality available: ${governanceHandoffQuality.available === true ? 'yes' : 'no'}`,
    `- Handoff latest status: ${formatAutoHandoffRegressionValue(governanceHandoffQuality.latest_status)}`,
    `- Handoff latest gate passed: ${governanceHandoffQuality.latest_gate_passed === true ? 'yes' : (governanceHandoffQuality.latest_gate_passed === false ? 'no' : 'n/a')}`,
    `- Handoff latest ontology score: ${formatAutoHandoffRegressionValue(governanceHandoffQuality.latest_ontology_quality_score)}`,
    '',
    '## Release Evidence Artifacts',
    '',
    `- Evidence review report: ${reviewFile || 'n/a'}`,
    `- Handoff report: ${formatAutoHandoffRegressionValue(currentOverview.handoff_report_file)}`,
    `- Release evidence JSON: ${formatAutoHandoffRegressionValue(payload.evidence_file)}`,
    `- Moqui baseline JSON: ${formatAutoHandoffRegressionValue(moquiBaseline.output && moquiBaseline.output.json)}`,
    `- Moqui baseline markdown: ${formatAutoHandoffRegressionValue(moquiBaseline.output && moquiBaseline.output.markdown)}`,
    `- Scene package batch JSON: ${formatAutoHandoffRegressionValue(scenePackageBatch.output && scenePackageBatch.output.json)}`,
    `- Capability coverage JSON: ${formatAutoHandoffRegressionValue(capabilityCoverage.output && capabilityCoverage.output.json)}`,
    `- Capability coverage markdown: ${formatAutoHandoffRegressionValue(capabilityCoverage.output && capabilityCoverage.output.markdown)}`,
    `- Governance snapshot generated at: ${formatAutoHandoffRegressionValue(governanceSnapshot && governanceSnapshot.generated_at)}`,
    '',
    '## Recommendations'
  ];

  if (recommendations.length === 0) {
    lines.push('', '- None');
  } else {
    recommendations.forEach(item => {
      lines.push('', `- ${item}`);
    });
  }

  return `${lines.join('\n')}\n`;
}


async function buildAutoHandoffRegression(projectPath, currentResult, dependencies = {}) {
  const { listAutoHandoffRunReports, buildAutoHandoffRegressionSnapshot, buildAutoHandoffRegressionComparison } = dependencies;
  const reports = await listAutoHandoffRunReports(projectPath);
  const previous = reports.find(item => item.session_id !== currentResult.session_id) || null;
  const currentSnapshot = buildAutoHandoffRegressionSnapshot(currentResult, dependencies);
  if (!previous) {
    return {
      mode: 'auto-handoff-regression',
      current: currentSnapshot,
      previous: null,
      trend: 'baseline',
      delta: {
        spec_success_rate_percent: null,
        risk_level_rank: null,
        failed_goals: null,
        elapsed_ms: null,
        ontology_quality_score: null,
        ontology_unmapped_rules: null,
        ontology_undecided_decisions: null,
        ontology_business_rule_pass_rate_percent: null,
        ontology_decision_resolved_rate_percent: null,
        scene_package_batch_failure_count: null
      }
    };
  }

  const previousSnapshot = buildAutoHandoffRegressionSnapshot(previous, dependencies);
  const comparison = buildAutoHandoffRegressionComparison(currentSnapshot, previousSnapshot);
  return {
    mode: 'auto-handoff-regression',
    current: currentSnapshot,
    previous: previousSnapshot,
    trend: comparison.trend,
    delta: comparison.delta
  };
}

async function buildAutoHandoffRegressionReport(projectPath, options = {}, dependencies = {}) {
  const {
    listAutoHandoffRunReports,
    normalizeHandoffSessionQuery,
    normalizeHandoffRegressionWindow,
    buildAutoHandoffRegressionSnapshot,
    buildAutoHandoffRegressionComparison,
    buildAutoHandoffRegressionWindowTrend,
    buildAutoHandoffRegressionAggregates,
    buildAutoHandoffRegressionRiskLayers,
    buildAutoHandoffRegressionRecommendations
  } = dependencies;
  const reports = await listAutoHandoffRunReports(projectPath);
  if (reports.length === 0) {
    throw new Error('no handoff run reports found');
  }
  const query = normalizeHandoffSessionQuery(options.sessionId);
  const windowSize = normalizeHandoffRegressionWindow(options.window);
  let currentIndex = 0;
  if (query !== 'latest') {
    currentIndex = reports.findIndex(item => item.session_id === query);
    if (currentIndex < 0) {
      throw new Error(`handoff run session not found: ${query}`);
    }
  }

  const chainReports = reports.slice(currentIndex, currentIndex + windowSize);
  const series = chainReports.map(item => buildAutoHandoffRegressionSnapshot(item, dependencies));
  const currentSnapshot = series[0];
  const previousSnapshot = series[1] || null;
  const comparison = previousSnapshot
    ? buildAutoHandoffRegressionComparison(currentSnapshot, previousSnapshot)
    : {
      trend: 'baseline',
      delta: {
        spec_success_rate_percent: null,
        risk_level_rank: null,
        failed_goals: null,
        elapsed_ms: null,
        ontology_quality_score: null,
        ontology_unmapped_rules: null,
        ontology_undecided_decisions: null,
        ontology_business_rule_pass_rate_percent: null,
        ontology_decision_resolved_rate_percent: null,
        scene_package_batch_failure_count: null
      }
    };
  const windowTrend = buildAutoHandoffRegressionWindowTrend(series);
  const aggregates = buildAutoHandoffRegressionAggregates(series);
  const riskLayers = buildAutoHandoffRegressionRiskLayers(series);

  const payload = {
    mode: 'auto-handoff-regression',
    current: currentSnapshot,
    previous: previousSnapshot,
    trend: comparison.trend,
    delta: comparison.delta,
    window: {
      requested: windowSize,
      actual: series.length
    },
    series,
    window_trend: windowTrend,
    aggregates,
    risk_layers: riskLayers,
    recommendations: []
  };
  payload.recommendations = buildAutoHandoffRegressionRecommendations(payload);
  return payload;
}


module.exports = {
  buildAutoHandoffRegressionSnapshot,
  buildAutoHandoffRegressionComparison,
  buildAutoHandoffRegressionWindowTrend,
  buildAutoHandoffRegressionAggregates,
  buildAutoHandoffRegressionRiskLayers,
  buildAutoHandoffRegressionRecommendations,
  formatAutoHandoffRegressionValue,
  getAutoHandoffMoquiCoverageMatrix,
  getAutoHandoffMoquiCoverageMetric,
  formatAutoHandoffMoquiCoverageMetric,
  getAutoHandoffMoquiCoverageDeltaMatrix,
  getAutoHandoffMoquiCoverageDeltaMetric,
  formatAutoHandoffMoquiCoverageDeltaMetric,
  getAutoHandoffMoquiCoverageMetricLabel,
  buildAutoHandoffMoquiCoverageRegressions,
  formatAutoHandoffMoquiCoverageRegressions,
  renderAutoHandoffRegressionMarkdown,
  renderAutoHandoffEvidenceReviewMarkdown,
  renderAutoHandoffReleaseNotesDraft,
  buildAutoHandoffRegression,
  buildAutoHandoffRegressionReport
};