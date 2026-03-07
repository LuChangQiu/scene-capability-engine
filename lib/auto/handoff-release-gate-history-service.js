async function buildAutoHandoffReleaseGateHistoryIndex(projectPath, options = {}, dependencies = {}) {
  const {
    normalizeHandoffGateHistoryKeep,
    resolveAutoHandoffReleaseGateHistoryFile,
    loadAutoHandoffReleaseGateReports,
    loadAutoHandoffReleaseGateHistorySeed,
    mergeAutoHandoffReleaseGateHistoryEntries,
    toAutoHandoffTimestamp,
    normalizeHandoffText,
    buildAutoHandoffReleaseGateHistoryAggregates,
    now = () => new Date().toISOString()
  } = dependencies;

  const keep = normalizeHandoffGateHistoryKeep(options.keep);
  const outFile = resolveAutoHandoffReleaseGateHistoryFile(projectPath, options.out);
  const historySeedFile = typeof options.historyFile === 'string' && options.historyFile.trim()
    ? resolveAutoHandoffReleaseGateHistoryFile(projectPath, options.historyFile)
    : outFile;
  const reportResult = await loadAutoHandoffReleaseGateReports(projectPath, options.dir);
  const historySeed = await loadAutoHandoffReleaseGateHistorySeed(projectPath, historySeedFile);
  const mergedEntries = mergeAutoHandoffReleaseGateHistoryEntries([
    ...reportResult.entries,
    ...historySeed.entries
  ]);

  if (mergedEntries.length === 0) {
    throw new Error(`no release gate reports found: ${reportResult.dir}`);
  }

  mergedEntries.sort((left, right) => {
    const leftTs = toAutoHandoffTimestamp(left && left.evaluated_at);
    const rightTs = toAutoHandoffTimestamp(right && right.evaluated_at);
    if (rightTs !== leftTs) {
      return rightTs - leftTs;
    }
    const leftTag = normalizeHandoffText(left && left.tag) || '';
    const rightTag = normalizeHandoffText(right && right.tag) || '';
    return rightTag.localeCompare(leftTag);
  });

  const entries = mergedEntries.slice(0, keep);
  const latestEntry = entries[0] || null;
  const warnings = [...reportResult.warnings, ...historySeed.warnings];
  return {
    mode: 'auto-handoff-release-gate-history',
    generated_at: now(),
    source_dir: reportResult.dir,
    report_file_count: reportResult.report_files.length,
    report_entry_count: reportResult.entries.length,
    seed_file: historySeed.file,
    seed_entry_count: historySeed.entries.length,
    keep,
    total_entries: entries.length,
    latest: latestEntry
      ? {
          tag: latestEntry.tag,
          evaluated_at: latestEntry.evaluated_at,
          gate_passed: latestEntry.gate_passed,
          risk_level: latestEntry.risk_level,
          scene_package_batch_passed: latestEntry.scene_package_batch_passed,
          scene_package_batch_failure_count: latestEntry.scene_package_batch_failure_count,
          capability_expected_unknown_count: latestEntry.capability_expected_unknown_count,
          capability_provided_unknown_count: latestEntry.capability_provided_unknown_count,
          release_gate_preflight_available: latestEntry.release_gate_preflight_available,
          release_gate_preflight_blocked: latestEntry.release_gate_preflight_blocked,
          require_release_gate_preflight: latestEntry.require_release_gate_preflight,
          weekly_ops_blocked: latestEntry.weekly_ops_blocked,
          weekly_ops_risk_level: latestEntry.weekly_ops_risk_level,
          weekly_ops_governance_status: latestEntry.weekly_ops_governance_status,
          weekly_ops_authorization_tier_block_rate_percent: latestEntry.weekly_ops_authorization_tier_block_rate_percent,
          weekly_ops_dialogue_authorization_block_rate_percent: latestEntry.weekly_ops_dialogue_authorization_block_rate_percent,
          weekly_ops_matrix_regression_positive_rate_percent: latestEntry.weekly_ops_matrix_regression_positive_rate_percent,
          weekly_ops_runtime_block_rate_percent: latestEntry.weekly_ops_runtime_block_rate_percent,
          weekly_ops_runtime_ui_mode_violation_total: latestEntry.weekly_ops_runtime_ui_mode_violation_total,
          weekly_ops_runtime_ui_mode_violation_rate_percent: latestEntry.weekly_ops_runtime_ui_mode_violation_rate_percent,
          weekly_ops_violations_count: latestEntry.weekly_ops_violations_count,
          weekly_ops_warning_count: latestEntry.weekly_ops_warning_count,
          weekly_ops_config_warning_count: latestEntry.weekly_ops_config_warning_count,
          drift_alert_count: latestEntry.drift_alert_count,
          drift_blocked: latestEntry.drift_blocked
        }
      : null,
    aggregates: buildAutoHandoffReleaseGateHistoryAggregates(entries),
    warnings,
    warnings_count: warnings.length,
    entries
  };
}

function renderAutoHandoffReleaseGateHistoryMarkdown(payload = {}, dependencies = {}) {
  const { formatAutoHandoffRegressionValue } = dependencies;
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const aggregates = payload.aggregates && typeof payload.aggregates === 'object'
    ? payload.aggregates
    : {};
  const latest = payload.latest && typeof payload.latest === 'object'
    ? payload.latest
    : null;
  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
  const recentEntries = entries.slice(0, 10);

  const lines = [
    '# Auto Handoff Release Gate History',
    '',
    `- Generated at: ${formatAutoHandoffRegressionValue(payload.generated_at)}`,
    `- Source dir: ${formatAutoHandoffRegressionValue(payload.source_dir)}`,
    `- Total entries: ${formatAutoHandoffRegressionValue(payload.total_entries, '0')}`,
    `- Keep: ${formatAutoHandoffRegressionValue(payload.keep, '0')}`,
    ''
  ];

  if (latest) {
    lines.push('## Latest');
    lines.push('');
    lines.push(`- Tag: ${formatAutoHandoffRegressionValue(latest.tag)}`);
    lines.push(`- Evaluated at: ${formatAutoHandoffRegressionValue(latest.evaluated_at)}`);
    lines.push(`- Gate passed: ${latest.gate_passed === true ? 'yes' : (latest.gate_passed === false ? 'no' : 'n/a')}`);
    lines.push(`- Risk level: ${formatAutoHandoffRegressionValue(latest.risk_level)}`);
    lines.push(`- Scene package batch: ${latest.scene_package_batch_passed === true ? 'pass' : (latest.scene_package_batch_passed === false ? 'fail' : 'n/a')}`);
    lines.push(`- Scene package batch failures: ${formatAutoHandoffRegressionValue(latest.scene_package_batch_failure_count)}`);
    lines.push(`- Capability expected unknown count: ${formatAutoHandoffRegressionValue(latest.capability_expected_unknown_count, '0')}`);
    lines.push(`- Capability provided unknown count: ${formatAutoHandoffRegressionValue(latest.capability_provided_unknown_count, '0')}`);
    lines.push(`- Release preflight available: ${latest.release_gate_preflight_available === true ? 'yes' : (latest.release_gate_preflight_available === false ? 'no' : 'n/a')}`);
    lines.push(`- Release preflight blocked: ${latest.release_gate_preflight_blocked === true ? 'yes' : (latest.release_gate_preflight_blocked === false ? 'no' : 'n/a')}`);
    lines.push(`- Release preflight hard-gate: ${latest.require_release_gate_preflight === true ? 'enabled' : (latest.require_release_gate_preflight === false ? 'advisory' : 'n/a')}`);
    lines.push(`- Weekly ops blocked: ${latest.weekly_ops_blocked === true ? 'yes' : (latest.weekly_ops_blocked === false ? 'no' : 'n/a')}`);
    lines.push(`- Weekly ops risk: ${formatAutoHandoffRegressionValue(latest.weekly_ops_risk_level)}`);
    lines.push(`- Weekly ops governance status: ${formatAutoHandoffRegressionValue(latest.weekly_ops_governance_status)}`);
    lines.push(`- Weekly ops auth-tier block rate: ${formatAutoHandoffRegressionValue(latest.weekly_ops_authorization_tier_block_rate_percent)}%`);
    lines.push(`- Weekly ops dialogue-auth block rate: ${formatAutoHandoffRegressionValue(latest.weekly_ops_dialogue_authorization_block_rate_percent)}%`);
    lines.push(`- Weekly ops matrix regression-positive rate: ${formatAutoHandoffRegressionValue(latest.weekly_ops_matrix_regression_positive_rate_percent)}%`);
    lines.push(`- Weekly ops runtime block rate: ${formatAutoHandoffRegressionValue(latest.weekly_ops_runtime_block_rate_percent)}%`);
    lines.push(`- Weekly ops runtime ui-mode violations: ${formatAutoHandoffRegressionValue(latest.weekly_ops_runtime_ui_mode_violation_total, '0')}`);
    lines.push(`- Weekly ops runtime ui-mode violation rate: ${formatAutoHandoffRegressionValue(latest.weekly_ops_runtime_ui_mode_violation_rate_percent)}%`);
    lines.push(`- Weekly ops violations: ${formatAutoHandoffRegressionValue(latest.weekly_ops_violations_count, '0')}`);
    lines.push(`- Weekly ops warnings: ${formatAutoHandoffRegressionValue(latest.weekly_ops_warning_count, '0')}`);
    lines.push(`- Weekly ops config warnings: ${formatAutoHandoffRegressionValue(latest.weekly_ops_config_warning_count, '0')}`);
    lines.push(`- Drift alerts: ${formatAutoHandoffRegressionValue(latest.drift_alert_count, '0')}`);
    lines.push(`- Drift blocked: ${latest.drift_blocked === true ? 'yes' : (latest.drift_blocked === false ? 'no' : 'n/a')}`);
    lines.push('');
  }

  lines.push('## Aggregates');
  lines.push('');
  lines.push(`- Gate pass rate: ${formatAutoHandoffRegressionValue(aggregates.pass_rate_percent)}%`);
  lines.push(`- Passed: ${formatAutoHandoffRegressionValue(aggregates.gate_passed_count, '0')}`);
  lines.push(`- Failed: ${formatAutoHandoffRegressionValue(aggregates.gate_failed_count, '0')}`);
  lines.push(`- Unknown: ${formatAutoHandoffRegressionValue(aggregates.gate_unknown_count, '0')}`);
  lines.push(`- Evidence used: ${formatAutoHandoffRegressionValue(aggregates.evidence_used_count, '0')}`);
  lines.push(`- Enforce mode runs: ${formatAutoHandoffRegressionValue(aggregates.enforce_count, '0')}`);
  lines.push(`- Advisory mode runs: ${formatAutoHandoffRegressionValue(aggregates.advisory_count, '0')}`);
  lines.push(`- Avg spec success rate: ${formatAutoHandoffRegressionValue(aggregates.avg_spec_success_rate_percent)}`);
  lines.push(`- Scene package batch pass rate: ${formatAutoHandoffRegressionValue(aggregates.scene_package_batch_pass_rate_percent)}%`);
  lines.push(`- Scene package batch failed: ${formatAutoHandoffRegressionValue(aggregates.scene_package_batch_failed_count, '0')}`);
  lines.push(`- Avg scene package batch failures: ${formatAutoHandoffRegressionValue(aggregates.avg_scene_package_batch_failure_count)}`);
  lines.push(`- Capability expected unknown positive rate: ${formatAutoHandoffRegressionValue(aggregates.capability_expected_unknown_positive_rate_percent)}%`);
  lines.push(`- Avg capability expected unknown count: ${formatAutoHandoffRegressionValue(aggregates.avg_capability_expected_unknown_count)}`);
  lines.push(`- Max capability expected unknown count: ${formatAutoHandoffRegressionValue(aggregates.max_capability_expected_unknown_count)}`);
  lines.push(`- Capability provided unknown positive rate: ${formatAutoHandoffRegressionValue(aggregates.capability_provided_unknown_positive_rate_percent)}%`);
  lines.push(`- Avg capability provided unknown count: ${formatAutoHandoffRegressionValue(aggregates.avg_capability_provided_unknown_count)}`);
  lines.push(`- Max capability provided unknown count: ${formatAutoHandoffRegressionValue(aggregates.max_capability_provided_unknown_count)}`);
  lines.push(`- Drift alert runs: ${formatAutoHandoffRegressionValue(aggregates.drift_alert_runs, '0')}`);
  lines.push(`- Drift blocked runs: ${formatAutoHandoffRegressionValue(aggregates.drift_blocked_runs, '0')}`);
  lines.push(`- Drift alert rate: ${formatAutoHandoffRegressionValue(aggregates.drift_alert_rate_percent)}%`);
  lines.push(`- Drift block rate: ${formatAutoHandoffRegressionValue(aggregates.drift_block_rate_percent)}%`);
  lines.push(`- Weekly ops known runs: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_known_runs, '0')}`);
  lines.push(`- Weekly ops blocked runs: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_blocked_runs, '0')}`);
  lines.push(`- Weekly ops block rate: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_block_rate_percent)}%`);
  lines.push(`- Weekly ops violations total: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_violations_total, '0')}`);
  lines.push(`- Weekly ops warnings total: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_warnings_total, '0')}`);
  lines.push(`- Weekly ops config warnings total: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_config_warnings_total, '0')}`);
  lines.push(`- Weekly ops config warning runs: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_config_warning_runs, '0')}`);
  lines.push(`- Weekly ops config warning run rate: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_config_warning_run_rate_percent)}%`);
  lines.push(`- Weekly ops auth-tier block rate avg/max: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_authorization_tier_block_rate_avg_percent)}/${formatAutoHandoffRegressionValue(aggregates.weekly_ops_authorization_tier_block_rate_max_percent)}%`);
  lines.push(`- Weekly ops dialogue-auth block rate avg/max: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_dialogue_authorization_block_rate_avg_percent)}/${formatAutoHandoffRegressionValue(aggregates.weekly_ops_dialogue_authorization_block_rate_max_percent)}%`);
  lines.push(`- Weekly ops matrix regression-positive rate avg/max: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_matrix_regression_positive_rate_avg_percent)}/${formatAutoHandoffRegressionValue(aggregates.weekly_ops_matrix_regression_positive_rate_max_percent)}%`);
  lines.push(`- Weekly ops runtime block rate avg/max: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_runtime_block_rate_avg_percent)}/${formatAutoHandoffRegressionValue(aggregates.weekly_ops_runtime_block_rate_max_percent)}%`);
  lines.push(`- Weekly ops runtime ui-mode known runs: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_runtime_ui_mode_violation_known_runs, '0')}`);
  lines.push(`- Weekly ops runtime ui-mode violation runs: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_runtime_ui_mode_violation_runs, '0')}`);
  lines.push(`- Weekly ops runtime ui-mode violation run rate: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_runtime_ui_mode_violation_run_rate_percent)}%`);
  lines.push(`- Weekly ops runtime ui-mode violations total: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_runtime_ui_mode_violation_total, '0')}`);
  lines.push(`- Weekly ops runtime ui-mode violation rate avg/max: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_runtime_ui_mode_violation_rate_avg_percent)}/${formatAutoHandoffRegressionValue(aggregates.weekly_ops_runtime_ui_mode_violation_rate_max_percent)}%`);
  lines.push(`- Release preflight known runs: ${formatAutoHandoffRegressionValue(aggregates.release_gate_preflight_known_runs, '0')}`);
  lines.push(`- Release preflight available runs: ${formatAutoHandoffRegressionValue(aggregates.release_gate_preflight_available_runs, '0')}`);
  lines.push(`- Release preflight blocked runs: ${formatAutoHandoffRegressionValue(aggregates.release_gate_preflight_blocked_runs, '0')}`);
  lines.push(`- Release preflight hard-gate runs: ${formatAutoHandoffRegressionValue(aggregates.release_gate_preflight_hard_gate_runs, '0')}`);
  lines.push(`- Release preflight availability rate: ${formatAutoHandoffRegressionValue(aggregates.release_gate_preflight_availability_rate_percent)}%`);
  lines.push(`- Release preflight block rate: ${formatAutoHandoffRegressionValue(aggregates.release_gate_preflight_block_rate_percent)}%`);
  lines.push(`- Risk levels: low=${formatAutoHandoffRegressionValue(aggregates.risk_levels && aggregates.risk_levels.low, '0')}, medium=${formatAutoHandoffRegressionValue(aggregates.risk_levels && aggregates.risk_levels.medium, '0')}, high=${formatAutoHandoffRegressionValue(aggregates.risk_levels && aggregates.risk_levels.high, '0')}, unknown=${formatAutoHandoffRegressionValue(aggregates.risk_levels && aggregates.risk_levels.unknown, '0')}`);
  lines.push('');
  lines.push('## Recent Entries');
  lines.push('');

  if (recentEntries.length === 0) {
    lines.push('- None');
  } else {
    recentEntries.forEach(entry => {
      const tag = formatAutoHandoffRegressionValue(entry && entry.tag);
      const passed = entry && entry.gate_passed === true ? 'yes' : (entry && entry.gate_passed === false ? 'no' : 'n/a');
      const risk = formatAutoHandoffRegressionValue(entry && entry.risk_level);
      const successRate = formatAutoHandoffRegressionValue(entry && entry.spec_success_rate_percent);
      const evaluatedAt = formatAutoHandoffRegressionValue(entry && entry.evaluated_at);
      const violations = formatAutoHandoffRegressionValue(entry && entry.violations_count, '0');
      const sceneBatch = entry && entry.scene_package_batch_passed === true
        ? 'pass'
        : (entry && entry.scene_package_batch_passed === false ? 'fail' : 'n/a');
      const sceneBatchFailures = formatAutoHandoffRegressionValue(entry && entry.scene_package_batch_failure_count);
      const capabilityExpectedUnknown = formatAutoHandoffRegressionValue(entry && entry.capability_expected_unknown_count, '0');
      const capabilityProvidedUnknown = formatAutoHandoffRegressionValue(entry && entry.capability_provided_unknown_count, '0');
      const preflightBlocked = entry && entry.release_gate_preflight_blocked === true
        ? 'yes'
        : (entry && entry.release_gate_preflight_blocked === false ? 'no' : 'n/a');
      const preflightHardGate = entry && entry.require_release_gate_preflight === true
        ? 'enabled'
        : (entry && entry.require_release_gate_preflight === false ? 'advisory' : 'n/a');
      const driftAlerts = formatAutoHandoffRegressionValue(entry && entry.drift_alert_count, '0');
      const driftBlocked = entry && entry.drift_blocked === true
        ? 'yes'
        : (entry && entry.drift_blocked === false ? 'no' : 'n/a');
      const weeklyOpsBlocked = entry && entry.weekly_ops_blocked === true
        ? 'yes'
        : (entry && entry.weekly_ops_blocked === false ? 'no' : 'n/a');
      const weeklyOpsConfigWarnings = formatAutoHandoffRegressionValue(entry && entry.weekly_ops_config_warning_count, '0');
      const weeklyOpsDialogueRate = formatAutoHandoffRegressionValue(entry && entry.weekly_ops_dialogue_authorization_block_rate_percent);
      const weeklyOpsAuthTierRate = formatAutoHandoffRegressionValue(entry && entry.weekly_ops_authorization_tier_block_rate_percent);
      const weeklyOpsRuntimeBlockRate = formatAutoHandoffRegressionValue(entry && entry.weekly_ops_runtime_block_rate_percent);
      const weeklyOpsRuntimeUiModeViolationTotal = formatAutoHandoffRegressionValue(entry && entry.weekly_ops_runtime_ui_mode_violation_total, '0');
      const weeklyOpsRuntimeUiModeViolationRate = formatAutoHandoffRegressionValue(entry && entry.weekly_ops_runtime_ui_mode_violation_rate_percent);
      lines.push(
        `- ${tag} | passed=${passed} | risk=${risk} | scene-batch=${sceneBatch} | ` +
        `scene-failures=${sceneBatchFailures} | capability-unknown=${capabilityExpectedUnknown}/${capabilityProvidedUnknown} | ` +
        `preflight-blocked=${preflightBlocked} | hard-gate=${preflightHardGate} | ` +
        `drift-alerts=${driftAlerts} | drift-blocked=${driftBlocked} | ` +
        `weekly-blocked=${weeklyOpsBlocked} | weekly-config-warnings=${weeklyOpsConfigWarnings} | ` +
        `weekly-auth-tier-rate=${weeklyOpsAuthTierRate}% | weekly-dialogue-rate=${weeklyOpsDialogueRate}% | ` +
        `weekly-runtime-block-rate=${weeklyOpsRuntimeBlockRate}% | ` +
        `weekly-runtime-ui-mode=${weeklyOpsRuntimeUiModeViolationTotal}/${weeklyOpsRuntimeUiModeViolationRate}% | ` +
        `success=${successRate} | violations=${violations} | at=${evaluatedAt}`
      );
    });
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push('## Warnings');
    warnings.forEach(item => {
      lines.push('', `- ${item}`);
    });
  }

  return `${lines.join('\n')}\n`;
}

module.exports = {
  buildAutoHandoffReleaseGateHistoryIndex,
  renderAutoHandoffReleaseGateHistoryMarkdown
};
