function buildAutoHandoffEvidenceSnapshot(entry = {}, dependencies = {}) {
  const {
    normalizeHandoffText,
    buildAutoHandoffMoquiCoverageRegressions,
    normalizeRiskRank
  } = dependencies;
  const toNumber = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const gate = entry && typeof entry.gate === 'object' ? entry.gate : {};
  const gateActual = gate && typeof gate.actual === 'object' ? gate.actual : {};
  const ontology = entry && typeof entry.ontology_validation === 'object'
    ? entry.ontology_validation
    : {};
  const ontologyMetrics = ontology && typeof ontology.metrics === 'object'
    ? ontology.metrics
    : {};
  const moquiBaseline = entry && typeof entry.moqui_baseline === 'object'
    ? entry.moqui_baseline
    : {};
  const moquiCompare = moquiBaseline && typeof moquiBaseline.compare === 'object'
    ? moquiBaseline.compare
    : {};
  const moquiMatrixRegressions = buildAutoHandoffMoquiCoverageRegressions(moquiCompare);
  const scenePackageBatch = entry && typeof entry.scene_package_batch === 'object'
    ? entry.scene_package_batch
    : {};
  const scenePackageBatchSummary = scenePackageBatch && typeof scenePackageBatch.summary === 'object'
    ? scenePackageBatch.summary
    : {};
  const sceneBatchStatus = normalizeHandoffText(scenePackageBatch.status);
  const sceneBatchPassed = sceneBatchStatus
    ? (sceneBatchStatus === 'skipped' ? null : sceneBatchStatus === 'passed')
    : null;
  const riskLevel = normalizeHandoffText(
    gateActual.risk_level
      || (entry && entry.regression ? entry.regression.risk_level : null)
      || 'high'
  ) || 'high';

  return {
    session_id: normalizeHandoffText(entry.session_id),
    status: normalizeHandoffText(entry.status),
    merged_at: normalizeHandoffText(entry.merged_at),
    manifest_path: normalizeHandoffText(entry.manifest_path),
    gate_passed: gate.passed === true,
    spec_success_rate_percent: toNumber(gateActual.spec_success_rate_percent),
    risk_level: `${riskLevel}`.trim().toLowerCase(),
    risk_level_rank: normalizeRiskRank(riskLevel),
    failed_goals: toNumber(entry && entry.batch_summary ? entry.batch_summary.failed_goals : null),
    elapsed_ms: null,
    ontology_quality_score: toNumber(
      gateActual.ontology_quality_score !== undefined
        ? gateActual.ontology_quality_score
        : ontology.quality_score
    ),
    ontology_unmapped_rules: toNumber(
      gateActual.ontology_business_rule_unmapped !== undefined
        ? gateActual.ontology_business_rule_unmapped
        : ontologyMetrics.business_rule_unmapped
    ),
    ontology_undecided_decisions: toNumber(
      gateActual.ontology_decision_undecided !== undefined
        ? gateActual.ontology_decision_undecided
        : ontologyMetrics.decision_undecided
    ),
    ontology_business_rule_pass_rate_percent: toNumber(ontologyMetrics.business_rule_pass_rate_percent),
    ontology_decision_resolved_rate_percent: toNumber(ontologyMetrics.decision_resolved_rate_percent),
    scene_package_batch_status: sceneBatchStatus,
    scene_package_batch_passed: typeof sceneBatchPassed === 'boolean' ? sceneBatchPassed : null,
    scene_package_batch_failure_count: toNumber(
      scenePackageBatchSummary.batch_gate_failure_count !== undefined
        ? scenePackageBatchSummary.batch_gate_failure_count
        : scenePackageBatchSummary.failed
    ),
    capability_coverage_percent: toNumber(
      entry &&
      entry.capability_coverage &&
      entry.capability_coverage.summary
        ? entry.capability_coverage.summary.coverage_percent
        : null
    ),
    capability_coverage_passed: Boolean(
      entry &&
      entry.capability_coverage &&
      entry.capability_coverage.summary &&
      entry.capability_coverage.summary.passed === true
    ),
    moqui_matrix_regression_count: moquiMatrixRegressions.length,
    generated_at: normalizeHandoffText(entry.merged_at)
  };
}

function buildAutoHandoffEvidenceStatusCounts(entries = []) {
  const counts = {
    completed: 0,
    failed: 0,
    dry_run: 0,
    running: 0,
    other: 0
  };
  entries.forEach(entry => {
    const status = `${entry && entry.status ? entry.status : ''}`.trim().toLowerCase();
    if (status === 'completed') {
      counts.completed += 1;
    } else if (status === 'failed') {
      counts.failed += 1;
    } else if (status === 'dry-run' || status === 'dry_run') {
      counts.dry_run += 1;
    } else if (status === 'running') {
      counts.running += 1;
    } else {
      counts.other += 1;
    }
  });
  return counts;
}

async function resolveAutoHandoffReleaseDraftContext(projectPath, options = {}, dependencies = {}) {
  const { fs, pathModule } = dependencies;
  let packageVersion = null;
  try {
    const packagePayload = await fs.readJson(pathModule.join(projectPath, 'package.json'));
    if (packagePayload && typeof packagePayload.version === 'string' && packagePayload.version.trim()) {
      packageVersion = packagePayload.version.trim();
    }
  } catch (_error) {
    packageVersion = null;
  }
  return {
    version: dependencies.normalizeHandoffReleaseVersion(options.releaseVersion, packageVersion || '0.0.0'),
    releaseDate: dependencies.normalizeHandoffReleaseDate(options.releaseDate)
  };
}

async function buildAutoHandoffEvidenceReviewReport(projectPath, options = {}, dependencies = {}) {
  const {
    loadAutoHandoffReleaseEvidence,
    normalizeHandoffSessionQuery,
    normalizeHandoffEvidenceWindow,
    normalizeHandoffText,
    buildAutoHandoffEvidenceSnapshot,
    buildAutoHandoffRegressionComparison,
    buildAutoHandoffRegressionWindowTrend,
    buildAutoHandoffRegressionAggregates,
    buildAutoHandoffRegressionRiskLayers,
    buildAutoHandoffEvidenceStatusCounts,
    buildAutoGovernanceStats,
    buildAutoHandoffRegressionRecommendations,
    now = () => new Date().toISOString()
  } = dependencies;

  const releaseEvidence = await loadAutoHandoffReleaseEvidence(projectPath, options.file);
  if (releaseEvidence.sessions.length === 0) {
    throw new Error(`no release evidence sessions found: ${releaseEvidence.file}`);
  }

  const query = normalizeHandoffSessionQuery(options.sessionId);
  const windowSize = normalizeHandoffEvidenceWindow(options.window);
  let currentIndex = 0;
  if (query !== 'latest') {
    currentIndex = releaseEvidence.sessions.findIndex(item => normalizeHandoffText(item.session_id) === query);
    if (currentIndex < 0) {
      throw new Error(`release evidence session not found: ${query}`);
    }
  }

  const selectedEntries = releaseEvidence.sessions.slice(currentIndex, currentIndex + windowSize);
  const series = selectedEntries.map(item => buildAutoHandoffEvidenceSnapshot(item));
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
  const statusCounts = buildAutoHandoffEvidenceStatusCounts(selectedEntries);
  const gatePassCount = selectedEntries.filter(item => item && item.gate && item.gate.passed === true).length;
  const gatePassRate = selectedEntries.length > 0
    ? Number(((gatePassCount / selectedEntries.length) * 100).toFixed(2))
    : null;
  let governanceSnapshot = null;
  try {
    const governanceStats = await buildAutoGovernanceStats(projectPath, {});
    governanceSnapshot = {
      mode: governanceStats && governanceStats.mode ? governanceStats.mode : 'auto-governance-stats',
      generated_at: governanceStats && governanceStats.generated_at ? governanceStats.generated_at : now(),
      criteria: governanceStats && governanceStats.criteria ? governanceStats.criteria : null,
      totals: governanceStats && governanceStats.totals ? governanceStats.totals : null,
      health: governanceStats && governanceStats.health ? governanceStats.health : null
    };
  } catch (error) {
    governanceSnapshot = {
      mode: 'auto-governance-stats',
      generated_at: now(),
      error: error.message
    };
  }

  const payload = {
    mode: 'auto-handoff-evidence-review',
    generated_at: now(),
    evidence_file: releaseEvidence.file,
    release_evidence_updated_at: normalizeHandoffText(releaseEvidence.payload.updated_at),
    session_query: query,
    current: currentSnapshot,
    current_overview: selectedEntries[0] || null,
    previous: previousSnapshot,
    trend: comparison.trend,
    delta: comparison.delta,
    window: {
      requested: windowSize,
      actual: series.length
    },
    series,
    window_trend: windowTrend,
    aggregates: {
      ...aggregates,
      status_counts: statusCounts,
      gate_pass_rate_percent: gatePassRate
    },
    risk_layers: riskLayers,
    governance_snapshot: governanceSnapshot,
    recommendations: []
  };
  payload.recommendations = buildAutoHandoffRegressionRecommendations(payload);
  return payload;
}

module.exports = {
  buildAutoHandoffEvidenceSnapshot,
  buildAutoHandoffEvidenceStatusCounts,
  resolveAutoHandoffReleaseDraftContext,
  buildAutoHandoffEvidenceReviewReport
};
