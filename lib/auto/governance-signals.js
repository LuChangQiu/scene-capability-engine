function normalizeHandoffText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseAutoHandoffGateBoolean(value, fallback = null) {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = normalizeHandoffText(value).toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (['1', 'true', 'yes', 'y', 'on', 'passed', 'pass'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off', 'failed', 'fail', 'blocked'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function normalizeAutoHandoffGateRiskLevel(levelCandidate) {
  const normalized = normalizeHandoffText(levelCandidate).toLowerCase();
  if (!normalized) {
    return null;
  }
  if (['low', 'medium', 'high', 'critical'].includes(normalized)) {
    return normalized;
  }
  return null;
}

function toGovernanceReleaseGateNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeGovernanceReleaseGateSnapshot(snapshotCandidate) {
  if (!snapshotCandidate || typeof snapshotCandidate !== 'object' || Array.isArray(snapshotCandidate)) {
    return null;
  }
  return {
    available: snapshotCandidate.available === true,
    latest_gate_passed: parseAutoHandoffGateBoolean(snapshotCandidate.latest_gate_passed, null),
    pass_rate_percent: toGovernanceReleaseGateNumber(snapshotCandidate.pass_rate_percent),
    scene_package_batch_pass_rate_percent: toGovernanceReleaseGateNumber(snapshotCandidate.scene_package_batch_pass_rate_percent),
    drift_alert_rate_percent: toGovernanceReleaseGateNumber(snapshotCandidate.drift_alert_rate_percent),
    drift_blocked_runs: toGovernanceReleaseGateNumber(snapshotCandidate.drift_blocked_runs)
  };
}

function normalizeGovernanceWeeklyOpsStopDetail(detailCandidate) {
  if (!detailCandidate || typeof detailCandidate !== 'object' || Array.isArray(detailCandidate)) {
    return null;
  }
  const latestCandidate = detailCandidate.latest && typeof detailCandidate.latest === 'object' ? detailCandidate.latest : {};
  const aggregatesCandidate = detailCandidate.aggregates && typeof detailCandidate.aggregates === 'object' ? detailCandidate.aggregates : {};
  const pressureCandidate = detailCandidate.pressure && typeof detailCandidate.pressure === 'object' ? detailCandidate.pressure : {};

  const latestRiskLevelRaw = normalizeHandoffText(latestCandidate.risk_level);
  const latestRiskLevel = latestRiskLevelRaw ? normalizeAutoHandoffGateRiskLevel(latestRiskLevelRaw) : null;
  const normalized = {
    latest: {
      blocked: parseAutoHandoffGateBoolean(latestCandidate.blocked, null),
      risk_level: latestRiskLevel,
      governance_status: normalizeHandoffText(latestCandidate.governance_status),
      authorization_tier_block_rate_percent: toGovernanceReleaseGateNumber(latestCandidate.authorization_tier_block_rate_percent),
      dialogue_authorization_block_rate_percent: toGovernanceReleaseGateNumber(latestCandidate.dialogue_authorization_block_rate_percent),
      config_warning_count: toGovernanceReleaseGateNumber(latestCandidate.config_warning_count),
      runtime_block_rate_percent: toGovernanceReleaseGateNumber(latestCandidate.runtime_block_rate_percent),
      runtime_ui_mode_violation_total: toGovernanceReleaseGateNumber(latestCandidate.runtime_ui_mode_violation_total),
      runtime_ui_mode_violation_rate_percent: toGovernanceReleaseGateNumber(latestCandidate.runtime_ui_mode_violation_rate_percent)
    },
    aggregates: {
      blocked_runs: toGovernanceReleaseGateNumber(aggregatesCandidate.blocked_runs),
      block_rate_percent: toGovernanceReleaseGateNumber(aggregatesCandidate.block_rate_percent),
      violations_total: toGovernanceReleaseGateNumber(aggregatesCandidate.violations_total),
      warnings_total: toGovernanceReleaseGateNumber(aggregatesCandidate.warnings_total),
      config_warnings_total: toGovernanceReleaseGateNumber(aggregatesCandidate.config_warnings_total),
      authorization_tier_block_rate_max_percent: toGovernanceReleaseGateNumber(aggregatesCandidate.authorization_tier_block_rate_max_percent),
      dialogue_authorization_block_rate_max_percent: toGovernanceReleaseGateNumber(aggregatesCandidate.dialogue_authorization_block_rate_max_percent),
      runtime_block_rate_max_percent: toGovernanceReleaseGateNumber(aggregatesCandidate.runtime_block_rate_max_percent),
      runtime_ui_mode_violation_total: toGovernanceReleaseGateNumber(aggregatesCandidate.runtime_ui_mode_violation_total),
      runtime_ui_mode_violation_run_rate_percent: toGovernanceReleaseGateNumber(aggregatesCandidate.runtime_ui_mode_violation_run_rate_percent),
      runtime_ui_mode_violation_rate_max_percent: toGovernanceReleaseGateNumber(aggregatesCandidate.runtime_ui_mode_violation_rate_max_percent)
    },
    pressure: {
      blocked: parseAutoHandoffGateBoolean(pressureCandidate.blocked, null),
      high: parseAutoHandoffGateBoolean(pressureCandidate.high, null),
      config_warning_positive: parseAutoHandoffGateBoolean(pressureCandidate.config_warning_positive, null),
      auth_tier_block_rate_high: parseAutoHandoffGateBoolean(pressureCandidate.auth_tier_block_rate_high, null),
      dialogue_authorization_block_rate_high: parseAutoHandoffGateBoolean(pressureCandidate.dialogue_authorization_block_rate_high, null),
      runtime_block_rate_high: parseAutoHandoffGateBoolean(pressureCandidate.runtime_block_rate_high, null),
      runtime_ui_mode_violation_high: parseAutoHandoffGateBoolean(pressureCandidate.runtime_ui_mode_violation_high, null)
    }
  };
  const hasSignal = (
    typeof normalized.latest.blocked === 'boolean' ||
    !!normalized.latest.risk_level ||
    !!normalized.latest.governance_status ||
    Number.isFinite(normalized.latest.authorization_tier_block_rate_percent) ||
    Number.isFinite(normalized.latest.dialogue_authorization_block_rate_percent) ||
    Number.isFinite(normalized.latest.config_warning_count) ||
    Number.isFinite(normalized.latest.runtime_block_rate_percent) ||
    Number.isFinite(normalized.latest.runtime_ui_mode_violation_total) ||
    Number.isFinite(normalized.latest.runtime_ui_mode_violation_rate_percent) ||
    Number.isFinite(normalized.aggregates.blocked_runs) ||
    Number.isFinite(normalized.aggregates.block_rate_percent) ||
    Number.isFinite(normalized.aggregates.violations_total) ||
    Number.isFinite(normalized.aggregates.warnings_total) ||
    Number.isFinite(normalized.aggregates.config_warnings_total) ||
    Number.isFinite(normalized.aggregates.authorization_tier_block_rate_max_percent) ||
    Number.isFinite(normalized.aggregates.dialogue_authorization_block_rate_max_percent) ||
    Number.isFinite(normalized.aggregates.runtime_block_rate_max_percent) ||
    Number.isFinite(normalized.aggregates.runtime_ui_mode_violation_total) ||
    Number.isFinite(normalized.aggregates.runtime_ui_mode_violation_run_rate_percent) ||
    Number.isFinite(normalized.aggregates.runtime_ui_mode_violation_rate_max_percent) ||
    typeof normalized.pressure.blocked === 'boolean' ||
    typeof normalized.pressure.high === 'boolean' ||
    typeof normalized.pressure.config_warning_positive === 'boolean' ||
    typeof normalized.pressure.auth_tier_block_rate_high === 'boolean' ||
    typeof normalized.pressure.dialogue_authorization_block_rate_high === 'boolean' ||
    typeof normalized.pressure.runtime_block_rate_high === 'boolean' ||
    typeof normalized.pressure.runtime_ui_mode_violation_high === 'boolean'
  );
  return hasSignal ? normalized : null;
}

module.exports = {
  normalizeHandoffText,
  parseAutoHandoffGateBoolean,
  normalizeAutoHandoffGateRiskLevel,
  toGovernanceReleaseGateNumber,
  normalizeGovernanceReleaseGateSnapshot,
  normalizeGovernanceWeeklyOpsStopDetail
};
