const { parseAutoHandoffGateBoolean, normalizeHandoffText } = require('./governance-signals');
const { buildMoquiRegressionRecoverySequenceLines } = require('./moqui-recovery-sequence');

function deriveGovernanceRiskLevel(summary) {
  const failureRate = Number(summary && summary.failure_rate_percent) || 0;
  const pendingGoals = Number(summary && summary.pending_goals_sum) || 0;
  const failedSessions = Number(summary && summary.failed_sessions) || 0;
  const releaseGate = summary && summary.release_gate && typeof summary.release_gate === 'object'
    ? summary.release_gate
    : {};
  const releaseGateAvailable = releaseGate.available === true;
  const releaseGatePassed = parseAutoHandoffGateBoolean(releaseGate.latest_gate_passed, null);
  const releaseGatePassRate = Number(releaseGate.pass_rate_percent);
  const sceneBatchPassRate = Number(releaseGate.scene_package_batch_pass_rate_percent);
  const driftAlertRate = Number(releaseGate.drift_alert_rate_percent);
  const driftBlockedRuns = Number(releaseGate.drift_blocked_runs);
  const weeklyOpsKnownRuns = Number(releaseGate.weekly_ops_known_runs);
  const weeklyOpsBlockedRuns = Number(releaseGate.weekly_ops_blocked_runs);
  const weeklyOpsBlockRate = Number(releaseGate.weekly_ops_block_rate_percent);
  const weeklyOpsViolationsTotal = Number(releaseGate.weekly_ops_violations_total);
  const weeklyOpsWarningsTotal = Number(releaseGate.weekly_ops_warnings_total);
  const weeklyOpsConfigWarningsTotal = Number(releaseGate.weekly_ops_config_warnings_total);
  const weeklyOpsAuthTierBlockRateMax = Number(
    releaseGate.weekly_ops_authorization_tier_block_rate_max_percent
  );
  const weeklyOpsDialogueBlockRateMax = Number(
    releaseGate.weekly_ops_dialogue_authorization_block_rate_max_percent
  );
  const weeklyOpsLatestRuntimeBlockRate = Number(
    releaseGate.latest_weekly_ops_runtime_block_rate_percent
  );
  const weeklyOpsLatestRuntimeUiModeViolationTotal = Number(
    releaseGate.latest_weekly_ops_runtime_ui_mode_violation_total
  );
  const weeklyOpsLatestRuntimeUiModeViolationRate = Number(
    releaseGate.latest_weekly_ops_runtime_ui_mode_violation_rate_percent
  );
  const weeklyOpsRuntimeBlockRateMax = Number(
    releaseGate.weekly_ops_runtime_block_rate_max_percent
  );
  const weeklyOpsRuntimeUiModeViolationTotal = Number(
    releaseGate.weekly_ops_runtime_ui_mode_violation_total
  );
  const weeklyOpsRuntimeUiModeViolationRunRate = Number(
    releaseGate.weekly_ops_runtime_ui_mode_violation_run_rate_percent
  );
  const weeklyOpsRuntimeUiModeViolationRateMax = Number(
    releaseGate.weekly_ops_runtime_ui_mode_violation_rate_max_percent
  );
  const handoffQuality = summary && summary.handoff_quality && typeof summary.handoff_quality === 'object'
    ? summary.handoff_quality
    : {};
  const handoffAvailable = handoffQuality.available === true && (Number(handoffQuality.total_runs) || 0) > 0;
  const handoffLatestStatus = normalizeHandoffText(handoffQuality.latest_status);
  const handoffLatestGatePassed = parseAutoHandoffGateBoolean(handoffQuality.latest_gate_passed, null);
  const handoffLatestOntologyScore = Number(handoffQuality.latest_ontology_quality_score);
  const handoffCapabilityPassed = parseAutoHandoffGateBoolean(handoffQuality.latest_capability_coverage_passed, null);
  const handoffFailureRate = Number(handoffQuality.failure_rate_percent);
  const handoffGatePassRate = Number(handoffQuality.gate_pass_rate_percent);
  const handoffCapabilityPassRate = Number(handoffQuality.capability_coverage_pass_rate_percent);
  const handoffLatestCapabilityExpectedUnknownCount = Number(
    handoffQuality.latest_capability_expected_unknown_count
  );
  const handoffLatestCapabilityProvidedUnknownCount = Number(
    handoffQuality.latest_capability_provided_unknown_count
  );
  const handoffCapabilityExpectedUnknownPositiveRate = Number(
    handoffQuality.capability_expected_unknown_positive_rate_percent
  );
  const handoffCapabilityProvidedUnknownPositiveRate = Number(
    handoffQuality.capability_provided_unknown_positive_rate_percent
  );
  const handoffLatestMoquiMatrixRegressionCount = Number(handoffQuality.latest_moqui_matrix_regression_count);
  const handoffLatestMoquiMatrixRegressionGateMax = Number(handoffQuality.latest_moqui_matrix_regression_gate_max);
  const handoffMoquiMatrixRegressionPositiveRate = Number(handoffQuality.moqui_matrix_regression_positive_rate_percent);
  const handoffPreflightBlocked = parseAutoHandoffGateBoolean(
    handoffQuality.latest_release_gate_preflight_blocked,
    null
  );
  const handoffMatrixRegressionPositive = (
    Number.isFinite(handoffLatestMoquiMatrixRegressionCount) &&
    handoffLatestMoquiMatrixRegressionCount > 0
  );
  const handoffMatrixRegressionOverGate = (
    handoffMatrixRegressionPositive &&
    Number.isFinite(handoffLatestMoquiMatrixRegressionGateMax) &&
    handoffLatestMoquiMatrixRegressionCount > handoffLatestMoquiMatrixRegressionGateMax
  );
  const handoffMatrixRegressionPressureHigh = (
    Number.isFinite(handoffMoquiMatrixRegressionPositiveRate) &&
    handoffMoquiMatrixRegressionPositiveRate >= 50
  );
  const handoffCapabilityLexiconUnknownPositive = (
    (Number.isFinite(handoffLatestCapabilityExpectedUnknownCount) && handoffLatestCapabilityExpectedUnknownCount > 0) ||
    (Number.isFinite(handoffLatestCapabilityProvidedUnknownCount) && handoffLatestCapabilityProvidedUnknownCount > 0)
  );
  const handoffCapabilityLexiconUnknownPressureHigh = (
    (Number.isFinite(handoffCapabilityExpectedUnknownPositiveRate) && handoffCapabilityExpectedUnknownPositiveRate >= 50) ||
    (Number.isFinite(handoffCapabilityProvidedUnknownPositiveRate) && handoffCapabilityProvidedUnknownPositiveRate >= 50)
  );

  let riskLevel = 'low';
  if (failureRate >= 40 || pendingGoals >= 5) {
    riskLevel = 'high';
  } else if (failureRate >= 20 || pendingGoals > 0 || failedSessions > 0) {
    riskLevel = 'medium';
  }
  if (releaseGateAvailable) {
    const hasHighDriftPressure = (
      (Number.isFinite(driftAlertRate) && driftAlertRate >= 50) ||
      (Number.isFinite(driftBlockedRuns) && driftBlockedRuns > 0)
    );
    const hasLowPassRate = (
      (Number.isFinite(releaseGatePassRate) && releaseGatePassRate < 60) ||
      (Number.isFinite(sceneBatchPassRate) && sceneBatchPassRate < 60)
    );
    const hasHighWeeklyOpsPressure = (
      (Number.isFinite(weeklyOpsBlockedRuns) && weeklyOpsBlockedRuns > 0) ||
      (Number.isFinite(weeklyOpsBlockRate) && weeklyOpsBlockRate >= 40) ||
      (Number.isFinite(weeklyOpsAuthTierBlockRateMax) && weeklyOpsAuthTierBlockRateMax >= 60) ||
      (Number.isFinite(weeklyOpsDialogueBlockRateMax) && weeklyOpsDialogueBlockRateMax >= 60) ||
      (Number.isFinite(weeklyOpsLatestRuntimeUiModeViolationTotal) && weeklyOpsLatestRuntimeUiModeViolationTotal > 0) ||
      (Number.isFinite(weeklyOpsRuntimeUiModeViolationTotal) && weeklyOpsRuntimeUiModeViolationTotal > 0) ||
      (Number.isFinite(weeklyOpsRuntimeUiModeViolationRunRate) && weeklyOpsRuntimeUiModeViolationRunRate > 0) ||
      (Number.isFinite(weeklyOpsLatestRuntimeUiModeViolationRate) && weeklyOpsLatestRuntimeUiModeViolationRate > 0) ||
      (Number.isFinite(weeklyOpsRuntimeUiModeViolationRateMax) && weeklyOpsRuntimeUiModeViolationRateMax > 0) ||
      (Number.isFinite(weeklyOpsLatestRuntimeBlockRate) && weeklyOpsLatestRuntimeBlockRate >= 40) ||
      (Number.isFinite(weeklyOpsRuntimeBlockRateMax) && weeklyOpsRuntimeBlockRateMax >= 40)
    );
    const hasMediumWeeklyOpsPressure = (
      (Number.isFinite(weeklyOpsKnownRuns) && weeklyOpsKnownRuns > 0) && (
        (Number.isFinite(weeklyOpsViolationsTotal) && weeklyOpsViolationsTotal > 0) ||
        (Number.isFinite(weeklyOpsWarningsTotal) && weeklyOpsWarningsTotal > 0) ||
        (Number.isFinite(weeklyOpsConfigWarningsTotal) && weeklyOpsConfigWarningsTotal > 0) ||
        (Number.isFinite(weeklyOpsAuthTierBlockRateMax) && weeklyOpsAuthTierBlockRateMax > 40) ||
        (Number.isFinite(weeklyOpsDialogueBlockRateMax) && weeklyOpsDialogueBlockRateMax > 40) ||
        (Number.isFinite(weeklyOpsBlockRate) && weeklyOpsBlockRate > 0) ||
        (Number.isFinite(weeklyOpsLatestRuntimeBlockRate) && weeklyOpsLatestRuntimeBlockRate > 0) ||
        (Number.isFinite(weeklyOpsRuntimeBlockRateMax) && weeklyOpsRuntimeBlockRateMax > 0)
      )
    );
    if (releaseGatePassed === false && (hasHighDriftPressure || hasLowPassRate)) {
      riskLevel = 'high';
    } else if (hasHighWeeklyOpsPressure) {
      riskLevel = 'high';
    } else if (
      riskLevel !== 'high' && (
        releaseGatePassed === false ||
        (Number.isFinite(releaseGatePassRate) && releaseGatePassRate < 85) ||
        (Number.isFinite(sceneBatchPassRate) && sceneBatchPassRate < 85) ||
        (Number.isFinite(driftAlertRate) && driftAlertRate > 0) ||
        hasMediumWeeklyOpsPressure
      )
    ) {
      riskLevel = 'medium';
    }
  }
  if (handoffAvailable) {
    const handoffFailed = handoffLatestStatus && !['completed', 'dry-run', 'dry_run'].includes(handoffLatestStatus);
    const handoffSevereQualityDrop = (
      (Number.isFinite(handoffLatestOntologyScore) && handoffLatestOntologyScore < 70) ||
      handoffCapabilityPassed === false
    );
    const handoffHighFailureRate = Number.isFinite(handoffFailureRate) && handoffFailureRate >= 40;
    if (
      handoffFailed ||
      handoffHighFailureRate ||
      handoffPreflightBlocked === true ||
      handoffMatrixRegressionOverGate ||
      handoffCapabilityLexiconUnknownPositive ||
      (handoffLatestGatePassed === false && handoffSevereQualityDrop) ||
      (handoffMatrixRegressionPositive && handoffMatrixRegressionPressureHigh) ||
      handoffCapabilityLexiconUnknownPressureHigh
    ) {
      riskLevel = 'high';
    } else if (
      riskLevel !== 'high' && (
        handoffLatestGatePassed === false ||
        (Number.isFinite(handoffGatePassRate) && handoffGatePassRate < 85) ||
        (Number.isFinite(handoffCapabilityPassRate) && handoffCapabilityPassRate < 85) ||
        (Number.isFinite(handoffLatestOntologyScore) && handoffLatestOntologyScore < 85) ||
        (Number.isFinite(handoffFailureRate) && handoffFailureRate > 0) ||
        handoffMatrixRegressionPositive ||
        (Number.isFinite(handoffMoquiMatrixRegressionPositiveRate) && handoffMoquiMatrixRegressionPositiveRate > 0) ||
        (Number.isFinite(handoffCapabilityExpectedUnknownPositiveRate) && handoffCapabilityExpectedUnknownPositiveRate > 0) ||
        (Number.isFinite(handoffCapabilityProvidedUnknownPositiveRate) && handoffCapabilityProvidedUnknownPositiveRate > 0)
      )
    ) {
      riskLevel = 'medium';
    }
  }
  return riskLevel;
}

function buildGovernanceConcerns(summary) {
  const concerns = [];
  const totalSessions = Number(summary && summary.total_sessions) || 0;
  const failedSessions = Number(summary && summary.failed_sessions) || 0;
  const pendingGoals = Number(summary && summary.pending_goals_sum) || 0;
  const failureRate = Number(summary && summary.failure_rate_percent) || 0;
  const recoverySignatures = Number(summary && summary.recovery_signature_count) || 0;
  const releaseGate = summary && summary.release_gate && typeof summary.release_gate === 'object'
    ? summary.release_gate
    : {};
  const releaseGateAvailable = releaseGate.available === true;
  const releaseGatePassed = parseAutoHandoffGateBoolean(releaseGate.latest_gate_passed, null);
  const releaseGatePassRate = Number(releaseGate.pass_rate_percent);
  const sceneBatchPassRate = Number(releaseGate.scene_package_batch_pass_rate_percent);
  const driftAlertRate = Number(releaseGate.drift_alert_rate_percent);
  const driftBlockedRuns = Number(releaseGate.drift_blocked_runs);
  const weeklyOpsKnownRuns = Number(releaseGate.weekly_ops_known_runs);
  const weeklyOpsBlockedRuns = Number(releaseGate.weekly_ops_blocked_runs);
  const weeklyOpsBlockRate = Number(releaseGate.weekly_ops_block_rate_percent);
  const weeklyOpsViolationsTotal = Number(releaseGate.weekly_ops_violations_total);
  const weeklyOpsWarningsTotal = Number(releaseGate.weekly_ops_warnings_total);
  const weeklyOpsConfigWarningsTotal = Number(releaseGate.weekly_ops_config_warnings_total);
  const weeklyOpsAuthTierBlockRateMax = Number(
    releaseGate.weekly_ops_authorization_tier_block_rate_max_percent
  );
  const weeklyOpsDialogueBlockRateMax = Number(
    releaseGate.weekly_ops_dialogue_authorization_block_rate_max_percent
  );
  const weeklyOpsLatestRuntimeBlockRate = Number(
    releaseGate.latest_weekly_ops_runtime_block_rate_percent
  );
  const weeklyOpsLatestRuntimeUiModeViolationTotal = Number(
    releaseGate.latest_weekly_ops_runtime_ui_mode_violation_total
  );
  const weeklyOpsLatestRuntimeUiModeViolationRate = Number(
    releaseGate.latest_weekly_ops_runtime_ui_mode_violation_rate_percent
  );
  const weeklyOpsRuntimeBlockRateMax = Number(
    releaseGate.weekly_ops_runtime_block_rate_max_percent
  );
  const weeklyOpsRuntimeUiModeViolationTotal = Number(
    releaseGate.weekly_ops_runtime_ui_mode_violation_total
  );
  const weeklyOpsRuntimeUiModeViolationRunRate = Number(
    releaseGate.weekly_ops_runtime_ui_mode_violation_run_rate_percent
  );
  const weeklyOpsRuntimeUiModeViolationRateMax = Number(
    releaseGate.weekly_ops_runtime_ui_mode_violation_rate_max_percent
  );
  const handoffQuality = summary && summary.handoff_quality && typeof summary.handoff_quality === 'object'
    ? summary.handoff_quality
    : {};
  const handoffAvailable = handoffQuality.available === true;
  const handoffTotalRuns = Number(handoffQuality.total_runs) || 0;
  const handoffLatestStatus = normalizeHandoffText(handoffQuality.latest_status);
  const handoffLatestGatePassed = parseAutoHandoffGateBoolean(handoffQuality.latest_gate_passed, null);
  const handoffLatestOntologyScore = Number(handoffQuality.latest_ontology_quality_score);
  const handoffFailureRate = Number(handoffQuality.failure_rate_percent);
  const handoffCapabilityPassRate = Number(handoffQuality.capability_coverage_pass_rate_percent);
  const handoffLatestCapabilityExpectedUnknownCount = Number(
    handoffQuality.latest_capability_expected_unknown_count
  );
  const handoffLatestCapabilityProvidedUnknownCount = Number(
    handoffQuality.latest_capability_provided_unknown_count
  );
  const handoffCapabilityExpectedUnknownPositiveRate = Number(
    handoffQuality.capability_expected_unknown_positive_rate_percent
  );
  const handoffCapabilityProvidedUnknownPositiveRate = Number(
    handoffQuality.capability_provided_unknown_positive_rate_percent
  );
  const handoffLatestMoquiMatrixRegressionCount = Number(handoffQuality.latest_moqui_matrix_regression_count);
  const handoffLatestMoquiMatrixRegressionGateMax = Number(handoffQuality.latest_moqui_matrix_regression_gate_max);
  const handoffMaxMoquiMatrixRegressionCount = Number(handoffQuality.max_moqui_matrix_regression_count);
  const handoffMoquiMatrixRegressionPositiveRate = Number(handoffQuality.moqui_matrix_regression_positive_rate_percent);
  const handoffPreflightBlocked = parseAutoHandoffGateBoolean(
    handoffQuality.latest_release_gate_preflight_blocked,
    null
  );

  if (totalSessions === 0) {
    concerns.push('No archived sessions found for the selected filter window.');
  }
  if (failedSessions > 0) {
    concerns.push(`${failedSessions} failed session(s) detected across governance archives.`);
  }
  if (pendingGoals > 0) {
    concerns.push(`${pendingGoals} pending controller goal(s) remain unprocessed.`);
  }
  if (failureRate >= 20) {
    concerns.push(`Overall session failure rate is elevated at ${failureRate}%.`);
  }
  if (failedSessions > 0 && recoverySignatures === 0) {
    concerns.push('Recovery memory has no signatures despite failed sessions.');
  }
  if (!releaseGateAvailable) {
    concerns.push('Release gate history is unavailable; governance lacks handoff release trend context.');
  } else {
    if (releaseGatePassed === false) {
      concerns.push('Latest release gate evaluation is failed.');
    }
    if (Number.isFinite(releaseGatePassRate) && releaseGatePassRate < 85) {
      concerns.push(`Release gate pass rate is low at ${releaseGatePassRate}%.`);
    }
    if (Number.isFinite(sceneBatchPassRate) && sceneBatchPassRate < 85) {
      concerns.push(`Scene package batch pass rate is low at ${sceneBatchPassRate}%.`);
    }
    if (Number.isFinite(driftAlertRate) && driftAlertRate > 0) {
      concerns.push(`Release drift alert rate is ${driftAlertRate}%.`);
    }
    if (Number.isFinite(driftBlockedRuns) && driftBlockedRuns > 0) {
      concerns.push(`${driftBlockedRuns} release(s) were blocked by drift alerts.`);
    }
    if (Number.isFinite(weeklyOpsKnownRuns) && weeklyOpsKnownRuns > 0) {
      concerns.push(`Weekly ops signals observed in ${weeklyOpsKnownRuns} release gate run(s).`);
    }
    if (Number.isFinite(weeklyOpsBlockedRuns) && weeklyOpsBlockedRuns > 0) {
      concerns.push(`${weeklyOpsBlockedRuns} release run(s) were blocked by weekly ops gate.`);
    }
    if (Number.isFinite(weeklyOpsBlockRate) && weeklyOpsBlockRate > 0) {
      concerns.push(`Weekly ops block rate is ${weeklyOpsBlockRate}%.`);
    }
    if (Number.isFinite(weeklyOpsViolationsTotal) && weeklyOpsViolationsTotal > 0) {
      concerns.push(`Weekly ops violations total is ${weeklyOpsViolationsTotal}.`);
    }
    if (Number.isFinite(weeklyOpsWarningsTotal) && weeklyOpsWarningsTotal > 0) {
      concerns.push(`Weekly ops warnings total is ${weeklyOpsWarningsTotal}.`);
    }
    if (Number.isFinite(weeklyOpsConfigWarningsTotal) && weeklyOpsConfigWarningsTotal > 0) {
      concerns.push(`Weekly ops config warnings total is ${weeklyOpsConfigWarningsTotal}.`);
    }
    if (Number.isFinite(weeklyOpsAuthTierBlockRateMax) && weeklyOpsAuthTierBlockRateMax > 40) {
      concerns.push(`Weekly ops authorization-tier block-rate max is ${weeklyOpsAuthTierBlockRateMax}%.`);
    }
    if (Number.isFinite(weeklyOpsDialogueBlockRateMax) && weeklyOpsDialogueBlockRateMax > 40) {
      concerns.push(`Weekly ops dialogue-authorization block-rate max is ${weeklyOpsDialogueBlockRateMax}%.`);
    }
    if (Number.isFinite(weeklyOpsLatestRuntimeBlockRate) && weeklyOpsLatestRuntimeBlockRate > 0) {
      concerns.push(`Weekly ops latest runtime block rate is ${weeklyOpsLatestRuntimeBlockRate}%.`);
    }
    if (Number.isFinite(weeklyOpsRuntimeBlockRateMax) && weeklyOpsRuntimeBlockRateMax > 0) {
      concerns.push(`Weekly ops runtime block-rate max is ${weeklyOpsRuntimeBlockRateMax}%.`);
    }
    if (
      Number.isFinite(weeklyOpsLatestRuntimeUiModeViolationTotal) &&
      weeklyOpsLatestRuntimeUiModeViolationTotal > 0
    ) {
      concerns.push(
        `Weekly ops latest runtime ui-mode violations total is ${weeklyOpsLatestRuntimeUiModeViolationTotal}.`
      );
    }
    if (
      Number.isFinite(weeklyOpsLatestRuntimeUiModeViolationRate) &&
      weeklyOpsLatestRuntimeUiModeViolationRate > 0
    ) {
      concerns.push(
        `Weekly ops latest runtime ui-mode violation rate is ${weeklyOpsLatestRuntimeUiModeViolationRate}%.`
      );
    }
    if (Number.isFinite(weeklyOpsRuntimeUiModeViolationTotal) && weeklyOpsRuntimeUiModeViolationTotal > 0) {
      concerns.push(`Weekly ops runtime ui-mode violations total is ${weeklyOpsRuntimeUiModeViolationTotal}.`);
    }
    if (Number.isFinite(weeklyOpsRuntimeUiModeViolationRunRate) && weeklyOpsRuntimeUiModeViolationRunRate > 0) {
      concerns.push(
        `Weekly ops runtime ui-mode violation run rate is ${weeklyOpsRuntimeUiModeViolationRunRate}%.`
      );
    }
    if (Number.isFinite(weeklyOpsRuntimeUiModeViolationRateMax) && weeklyOpsRuntimeUiModeViolationRateMax > 0) {
      concerns.push(
        `Weekly ops runtime ui-mode violation rate max is ${weeklyOpsRuntimeUiModeViolationRateMax}%.`
      );
    }
  }
  if (!handoffAvailable) {
    concerns.push('Handoff release evidence is unavailable; governance lacks handoff quality context.');
  } else if (handoffTotalRuns <= 0) {
    concerns.push('Handoff release evidence has no runs yet.');
  } else {
    if (handoffLatestStatus && !['completed', 'dry-run', 'dry_run'].includes(handoffLatestStatus)) {
      concerns.push(`Latest handoff run status is ${handoffLatestStatus}.`);
    }
    if (handoffLatestGatePassed === false) {
      concerns.push('Latest handoff gate evaluation is failed.');
    }
    if (handoffPreflightBlocked === true) {
      concerns.push('Latest handoff release gate preflight is blocked.');
    }
    if (Number.isFinite(handoffLatestOntologyScore) && handoffLatestOntologyScore < 85) {
      concerns.push(`Latest handoff ontology score is low at ${handoffLatestOntologyScore}.`);
    }
    if (Number.isFinite(handoffFailureRate) && handoffFailureRate > 0) {
      concerns.push(`Handoff run failure rate is ${handoffFailureRate}%.`);
    }
    if (Number.isFinite(handoffCapabilityPassRate) && handoffCapabilityPassRate < 85) {
      concerns.push(`Handoff capability coverage pass rate is low at ${handoffCapabilityPassRate}%.`);
    }
    if (
      Number.isFinite(handoffLatestCapabilityExpectedUnknownCount) &&
      handoffLatestCapabilityExpectedUnknownCount > 0
    ) {
      concerns.push(
        `Latest handoff manifest capability unknown count is ${handoffLatestCapabilityExpectedUnknownCount}.`
      );
    }
    if (
      Number.isFinite(handoffLatestCapabilityProvidedUnknownCount) &&
      handoffLatestCapabilityProvidedUnknownCount > 0
    ) {
      concerns.push(
        `Latest handoff template capability unknown count is ${handoffLatestCapabilityProvidedUnknownCount}.`
      );
    }
    if (
      Number.isFinite(handoffCapabilityExpectedUnknownPositiveRate) &&
      handoffCapabilityExpectedUnknownPositiveRate > 0
    ) {
      concerns.push(
        `Handoff manifest capability unknown positive rate is ${handoffCapabilityExpectedUnknownPositiveRate}%.`
      );
    }
    if (
      Number.isFinite(handoffCapabilityProvidedUnknownPositiveRate) &&
      handoffCapabilityProvidedUnknownPositiveRate > 0
    ) {
      concerns.push(
        `Handoff template capability unknown positive rate is ${handoffCapabilityProvidedUnknownPositiveRate}%.`
      );
    }
    if (Number.isFinite(handoffLatestMoquiMatrixRegressionCount) && handoffLatestMoquiMatrixRegressionCount > 0) {
      concerns.push(
        `Latest handoff Moqui matrix regression count is ${handoffLatestMoquiMatrixRegressionCount}.`
      );
    }
    if (
      Number.isFinite(handoffLatestMoquiMatrixRegressionCount) &&
      Number.isFinite(handoffLatestMoquiMatrixRegressionGateMax) &&
      handoffLatestMoquiMatrixRegressionCount > handoffLatestMoquiMatrixRegressionGateMax
    ) {
      concerns.push(
        `Latest handoff Moqui matrix regressions exceed gate (${handoffLatestMoquiMatrixRegressionCount} > ` +
        `${handoffLatestMoquiMatrixRegressionGateMax}).`
      );
    }
    if (Number.isFinite(handoffMoquiMatrixRegressionPositiveRate) && handoffMoquiMatrixRegressionPositiveRate > 0) {
      concerns.push(
        `Handoff Moqui matrix regression positive rate is ${handoffMoquiMatrixRegressionPositiveRate}%.`
      );
    }
    if (Number.isFinite(handoffMaxMoquiMatrixRegressionCount) && handoffMaxMoquiMatrixRegressionCount > 0) {
      concerns.push(`Handoff Moqui matrix regression max is ${handoffMaxMoquiMatrixRegressionCount}.`);
    }
  }

  return concerns;
}

function buildGovernanceRecommendations(summary) {
  const recommendations = [];
  const failedSessions = Number(summary && summary.failed_sessions) || 0;
  const pendingGoals = Number(summary && summary.pending_goals_sum) || 0;
  const riskLevel = `${summary && summary.risk_level ? summary.risk_level : 'low'}`.trim().toLowerCase();
  const releaseGate = summary && summary.release_gate && typeof summary.release_gate === 'object'
    ? summary.release_gate
    : {};
  const releaseGateAvailable = releaseGate.available === true;
  const releaseGatePassed = parseAutoHandoffGateBoolean(releaseGate.latest_gate_passed, null);
  const driftAlertRate = Number(releaseGate.drift_alert_rate_percent);
  const releaseGatePassRate = Number(releaseGate.pass_rate_percent);
  const sceneBatchPassRate = Number(releaseGate.scene_package_batch_pass_rate_percent);
  const weeklyOpsKnownRuns = Number(releaseGate.weekly_ops_known_runs);
  const weeklyOpsBlockedRuns = Number(releaseGate.weekly_ops_blocked_runs);
  const weeklyOpsBlockRate = Number(releaseGate.weekly_ops_block_rate_percent);
  const weeklyOpsViolationsTotal = Number(releaseGate.weekly_ops_violations_total);
  const weeklyOpsWarningsTotal = Number(releaseGate.weekly_ops_warnings_total);
  const weeklyOpsConfigWarningsTotal = Number(releaseGate.weekly_ops_config_warnings_total);
  const weeklyOpsAuthTierBlockRateMax = Number(
    releaseGate.weekly_ops_authorization_tier_block_rate_max_percent
  );
  const weeklyOpsDialogueBlockRateMax = Number(
    releaseGate.weekly_ops_dialogue_authorization_block_rate_max_percent
  );
  const weeklyOpsLatestRuntimeBlockRate = Number(
    releaseGate.latest_weekly_ops_runtime_block_rate_percent
  );
  const weeklyOpsLatestRuntimeUiModeViolationTotal = Number(
    releaseGate.latest_weekly_ops_runtime_ui_mode_violation_total
  );
  const weeklyOpsLatestRuntimeUiModeViolationRate = Number(
    releaseGate.latest_weekly_ops_runtime_ui_mode_violation_rate_percent
  );
  const weeklyOpsRuntimeBlockRateMax = Number(
    releaseGate.weekly_ops_runtime_block_rate_max_percent
  );
  const weeklyOpsRuntimeUiModeViolationTotal = Number(
    releaseGate.weekly_ops_runtime_ui_mode_violation_total
  );
  const weeklyOpsRuntimeUiModeViolationRunRate = Number(
    releaseGate.weekly_ops_runtime_ui_mode_violation_run_rate_percent
  );
  const weeklyOpsRuntimeUiModeViolationRateMax = Number(
    releaseGate.weekly_ops_runtime_ui_mode_violation_rate_max_percent
  );
  const handoffQuality = summary && summary.handoff_quality && typeof summary.handoff_quality === 'object'
    ? summary.handoff_quality
    : {};
  const handoffAvailable = handoffQuality.available === true;
  const handoffTotalRuns = Number(handoffQuality.total_runs) || 0;
  const handoffLatestStatus = normalizeHandoffText(handoffQuality.latest_status);
  const handoffLatestGatePassed = parseAutoHandoffGateBoolean(handoffQuality.latest_gate_passed, null);
  const handoffFailureRate = Number(handoffQuality.failure_rate_percent);
  const handoffCapabilityPassRate = Number(handoffQuality.capability_coverage_pass_rate_percent);
  const handoffLatestCapabilityExpectedUnknownCount = Number(
    handoffQuality.latest_capability_expected_unknown_count
  );
  const handoffLatestCapabilityProvidedUnknownCount = Number(
    handoffQuality.latest_capability_provided_unknown_count
  );
  const handoffCapabilityExpectedUnknownPositiveRate = Number(
    handoffQuality.capability_expected_unknown_positive_rate_percent
  );
  const handoffCapabilityProvidedUnknownPositiveRate = Number(
    handoffQuality.capability_provided_unknown_positive_rate_percent
  );
  const handoffLatestMoquiMatrixRegressionCount = Number(handoffQuality.latest_moqui_matrix_regression_count);
  const handoffLatestMoquiMatrixRegressionGateMax = Number(handoffQuality.latest_moqui_matrix_regression_gate_max);
  const handoffMoquiMatrixRegressionPositiveRate = Number(handoffQuality.moqui_matrix_regression_positive_rate_percent);
  const handoffPreflightBlocked = parseAutoHandoffGateBoolean(
    handoffQuality.latest_release_gate_preflight_blocked,
    null
  );

  if (failedSessions > 0) {
    recommendations.push('Run `sce auto close-loop-recover latest --recover-until-complete --json` to drain failed goals.');
  }
  if (pendingGoals > 0) {
    recommendations.push('Run `sce auto close-loop-controller --controller-resume latest --json` to continue pending queue work.');
  }
  if (riskLevel === 'low') {
    recommendations.push('Keep daily governance checks with `sce auto governance stats --days 14 --json`.');
  } else if (riskLevel === 'high') {
    recommendations.push('Apply stricter gate policy (`--program-gate-profile staging|prod`) before next program-scale run.');
  }
  if (!releaseGateAvailable) {
    recommendations.push(
      'Generate/attach release gate history asset: ' +
      '`sce auto handoff gate-index --dir .sce/reports/release-evidence --out .sce/reports/release-evidence/release-gate-history.json --json`.'
    );
  } else {
    if (releaseGatePassed === false || (Number.isFinite(releaseGatePassRate) && releaseGatePassRate < 85)) {
      recommendations.push('Recheck latest release evidence with `sce auto handoff evidence --window 5 --json`.');
    }
    if (
      (Number.isFinite(driftAlertRate) && driftAlertRate > 0) ||
      (Number.isFinite(sceneBatchPassRate) && sceneBatchPassRate < 85)
    ) {
      recommendations.push(
        'Stabilize scene package publish-batch quality and rerun: ' +
        '`sce scene package-publish-batch --manifest docs/handoffs/handoff-manifest.json --dry-run --json`.'
      );
    }
    if (
      (Number.isFinite(weeklyOpsKnownRuns) && weeklyOpsKnownRuns > 0) &&
      (
        (Number.isFinite(weeklyOpsBlockedRuns) && weeklyOpsBlockedRuns > 0) ||
        (Number.isFinite(weeklyOpsBlockRate) && weeklyOpsBlockRate > 0) ||
        (Number.isFinite(weeklyOpsViolationsTotal) && weeklyOpsViolationsTotal > 0) ||
        (Number.isFinite(weeklyOpsWarningsTotal) && weeklyOpsWarningsTotal > 0) ||
        (Number.isFinite(weeklyOpsRuntimeBlockRateMax) && weeklyOpsRuntimeBlockRateMax > 0) ||
        (Number.isFinite(weeklyOpsRuntimeUiModeViolationTotal) && weeklyOpsRuntimeUiModeViolationTotal > 0) ||
        (Number.isFinite(weeklyOpsRuntimeUiModeViolationRunRate) && weeklyOpsRuntimeUiModeViolationRunRate > 0)
      )
    ) {
      recommendations.push(
        'Rebuild weekly ops summary and gate evidence with ' +
        '`node scripts/release-ops-weekly-summary.js --json` + `node scripts/release-weekly-ops-gate.js`.'
      );
      recommendations.push(
        'Export weekly/drift remediation pack with ' +
        '`node scripts/release-risk-remediation-bundle.js --gate-report .sce/reports/release-evidence/release-gate.json --json`.'
      );
    }
    if (Number.isFinite(weeklyOpsConfigWarningsTotal) && weeklyOpsConfigWarningsTotal > 0) {
      recommendations.push(
        'Fix invalid weekly ops threshold variables (`KSE_RELEASE_WEEKLY_OPS_*`) and rerun release gates ' +
        'to clear config warnings.'
      );
    }
    if (
      (Number.isFinite(weeklyOpsLatestRuntimeUiModeViolationTotal) && weeklyOpsLatestRuntimeUiModeViolationTotal > 0) ||
      (Number.isFinite(weeklyOpsRuntimeUiModeViolationTotal) && weeklyOpsRuntimeUiModeViolationTotal > 0) ||
      (Number.isFinite(weeklyOpsLatestRuntimeUiModeViolationRate) && weeklyOpsLatestRuntimeUiModeViolationRate > 0) ||
      (Number.isFinite(weeklyOpsRuntimeUiModeViolationRateMax) && weeklyOpsRuntimeUiModeViolationRateMax > 0) ||
      (Number.isFinite(weeklyOpsRuntimeUiModeViolationRunRate) && weeklyOpsRuntimeUiModeViolationRunRate > 0)
    ) {
      recommendations.push(
        'Rebuild interactive runtime governance evidence with ' +
        '`node scripts/interactive-governance-report.js --period weekly --fail-on-alert --json`.'
      );
      recommendations.push(
        'Review runtime ui-mode policy baseline (`docs/interactive-customization/runtime-mode-policy-baseline.json`) ' +
        'to keep `user-app` suggestion-only and route apply traffic to `ops-console`.'
      );
    }
    if (
      (Number.isFinite(weeklyOpsLatestRuntimeBlockRate) && weeklyOpsLatestRuntimeBlockRate > 40) ||
      (Number.isFinite(weeklyOpsRuntimeBlockRateMax) && weeklyOpsRuntimeBlockRateMax > 40)
    ) {
      recommendations.push(
        'Reduce runtime deny/review pressure by tuning authorization and runtime mode policy, then rerun ' +
        '`node scripts/interactive-governance-report.js --period weekly --json`.'
      );
    }
    if (
      (Number.isFinite(weeklyOpsAuthTierBlockRateMax) && weeklyOpsAuthTierBlockRateMax > 40) ||
      (Number.isFinite(weeklyOpsDialogueBlockRateMax) && weeklyOpsDialogueBlockRateMax > 40)
    ) {
      recommendations.push(
        'Tune authorization-tier policy pressure with ' +
        '`node scripts/interactive-authorization-tier-evaluate.js --policy docs/interactive-customization/authorization-tier-policy-baseline.json --json`.'
      );
      recommendations.push(
        'Tune dialogue authorization policy pressure with ' +
        '`node scripts/interactive-dialogue-governance.js --policy docs/interactive-customization/dialogue-governance-policy-baseline.json --authorization-dialogue-policy docs/interactive-customization/authorization-dialogue-policy-baseline.json --json`.'
      );
    }
  }
  if (!handoffAvailable) {
    recommendations.push(
      'Generate handoff release evidence with ' +
      '`sce auto handoff run --manifest docs/handoffs/handoff-manifest.json --dry-run --json`.'
    );
  } else if (handoffTotalRuns > 0) {
    const handoffMoquiMatrixRegressionPositive = (
      Number.isFinite(handoffLatestMoquiMatrixRegressionCount) &&
      handoffLatestMoquiMatrixRegressionCount > 0
    );
    const handoffMoquiMatrixRegressionOverGate = (
      handoffMoquiMatrixRegressionPositive &&
      Number.isFinite(handoffLatestMoquiMatrixRegressionGateMax) &&
      handoffLatestMoquiMatrixRegressionCount > handoffLatestMoquiMatrixRegressionGateMax
    );
    if (
      (handoffLatestStatus && !['completed', 'dry-run', 'dry_run'].includes(handoffLatestStatus)) ||
      handoffLatestGatePassed === false ||
      handoffPreflightBlocked === true
    ) {
      recommendations.push('Recheck handoff quality with `sce auto handoff evidence --window 5 --json`.');
      recommendations.push(
        'Resume failed handoff goals with ' +
        '`sce auto handoff run --manifest docs/handoffs/handoff-manifest.json --continue-from latest --continue-strategy failed-only --json`.'
      );
    }
    if (
      (Number.isFinite(handoffFailureRate) && handoffFailureRate > 0) ||
      (Number.isFinite(handoffCapabilityPassRate) && handoffCapabilityPassRate < 85)
    ) {
      recommendations.push(
        'Re-run default Moqui quality gates via ' +
        '`sce auto handoff run --manifest docs/handoffs/handoff-manifest.json --dry-run --json`.'
      );
    }
    if (
      (Number.isFinite(handoffLatestCapabilityExpectedUnknownCount) && handoffLatestCapabilityExpectedUnknownCount > 0) ||
      (Number.isFinite(handoffLatestCapabilityProvidedUnknownCount) && handoffLatestCapabilityProvidedUnknownCount > 0) ||
      (Number.isFinite(handoffCapabilityExpectedUnknownPositiveRate) && handoffCapabilityExpectedUnknownPositiveRate > 0) ||
      (Number.isFinite(handoffCapabilityProvidedUnknownPositiveRate) && handoffCapabilityProvidedUnknownPositiveRate > 0)
    ) {
      recommendations.push(
        'Normalize capability lexicon gaps with ' +
        '`node scripts/moqui-lexicon-audit.js --manifest docs/handoffs/handoff-manifest.json ' +
        '--template-dir .sce/templates/scene-packages --fail-on-gap --json`.'
      );
      recommendations.push(
        'Re-run strict handoff lexicon gates with ' +
        '`sce auto handoff run --manifest docs/handoffs/handoff-manifest.json --dry-run --json`.'
      );
    }
    if (
      handoffMoquiMatrixRegressionPositive ||
      handoffMoquiMatrixRegressionOverGate ||
      (Number.isFinite(handoffMoquiMatrixRegressionPositiveRate) && handoffMoquiMatrixRegressionPositiveRate > 0)
    ) {
      recommendations.push(
        'Recover Moqui matrix regressions via ' +
        '`sce auto handoff run --manifest docs/handoffs/handoff-manifest.json ' +
        '--dry-run --max-moqui-matrix-regressions 0 --json`.'
      );
      recommendations.push(
        'Inspect Moqui baseline matrix drift with ' +
        '`sce scene moqui-baseline --include-all ' +
        '--compare-with .sce/reports/release-evidence/moqui-template-baseline.json --json`.'
      );
      recommendations.push(...buildMoquiRegressionRecoverySequenceLines({
        wrapCommands: true,
        withPeriod: true
      }));
    }
  }

  return Array.from(new Set(recommendations));
}

module.exports = {
  deriveGovernanceRiskLevel,
  buildGovernanceConcerns,
  buildGovernanceRecommendations
};


