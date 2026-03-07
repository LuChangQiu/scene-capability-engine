async function buildAutoObservabilitySnapshot(projectPath, options = {}, dependencies = {}) {
  const {
    normalizeStatsWindowDays,
    normalizeStatusFilter,
    statsCloseLoopSessions,
    statsCloseLoopBatchSummarySessions,
    statsCloseLoopControllerSessions,
    statsGovernanceCloseLoopSessions,
    buildAutoGovernanceStats,
    buildAutoKpiTrend,
    calculatePercent,
    schemaVersion,
    now = () => new Date().toISOString()
  } = dependencies;

  const days = normalizeStatsWindowDays(options.days);
  const statusFilter = normalizeStatusFilter(options.status);
  const normalizedStatsOptions = {
    days,
    status: statusFilter.length > 0 ? statusFilter.join(',') : undefined
  };
  const normalizedTrendOptions = {
    weeks: options.weeks,
    mode: options.trendMode,
    period: options.trendPeriod
  };

  const [
    sessionStats,
    batchStats,
    controllerStats,
    governanceSessionStats,
    governanceHealth,
    trend
  ] = await Promise.all([
    statsCloseLoopSessions(projectPath, normalizedStatsOptions),
    statsCloseLoopBatchSummarySessions(projectPath, normalizedStatsOptions),
    statsCloseLoopControllerSessions(projectPath, normalizedStatsOptions),
    statsGovernanceCloseLoopSessions(projectPath, normalizedStatsOptions),
    buildAutoGovernanceStats(projectPath, normalizedStatsOptions),
    buildAutoKpiTrend(projectPath, normalizedTrendOptions)
  ]);

  const totalSessions =
    (Number(sessionStats.total_sessions) || 0) +
    (Number(batchStats.total_sessions) || 0) +
    (Number(controllerStats.total_sessions) || 0) +
    (Number(governanceSessionStats.total_sessions) || 0);
  const completedSessions =
    (Number(sessionStats.completed_sessions) || 0) +
    (Number(batchStats.completed_sessions) || 0) +
    (Number(controllerStats.completed_sessions) || 0) +
    (Number(governanceSessionStats.completed_sessions) || 0);
  const failedSessions =
    (Number(sessionStats.failed_sessions) || 0) +
    (Number(batchStats.failed_sessions) || 0) +
    (Number(controllerStats.failed_sessions) || 0) +
    (Number(governanceSessionStats.failed_sessions) || 0);
  const governanceWeeklyOpsStop = governanceSessionStats &&
    governanceSessionStats.release_gate &&
    governanceSessionStats.release_gate.weekly_ops_stop &&
    typeof governanceSessionStats.release_gate.weekly_ops_stop === 'object'
    ? governanceSessionStats.release_gate.weekly_ops_stop
    : null;

  return {
    mode: 'auto-observability-snapshot',
    generated_at: now(),
    schema_version: schemaVersion,
    criteria: {
      days,
      status_filter: statusFilter,
      trend_weeks: trend.weeks,
      trend_mode: trend.mode,
      trend_period: trend.period_unit
    },
    highlights: {
      total_sessions: totalSessions,
      completed_sessions: completedSessions,
      failed_sessions: failedSessions,
      completion_rate_percent: calculatePercent(completedSessions, totalSessions),
      failure_rate_percent: calculatePercent(failedSessions, totalSessions),
      governance_risk_level: governanceHealth && governanceHealth.health
        ? governanceHealth.health.risk_level
        : 'unknown',
      governance_weekly_ops_stop_sessions: Number(
        governanceWeeklyOpsStop && governanceWeeklyOpsStop.sessions
      ) || 0,
      governance_weekly_ops_stop_session_rate_percent: Number(
        governanceWeeklyOpsStop && governanceWeeklyOpsStop.session_rate_percent
      ) || 0,
      governance_weekly_ops_high_pressure_sessions: Number(
        governanceWeeklyOpsStop && governanceWeeklyOpsStop.high_pressure_sessions
      ) || 0,
      governance_weekly_ops_high_pressure_rate_percent: Number(
        governanceWeeklyOpsStop && governanceWeeklyOpsStop.high_pressure_session_rate_percent
      ) || 0,
      governance_weekly_ops_config_warning_positive_sessions: Number(
        governanceWeeklyOpsStop && governanceWeeklyOpsStop.config_warning_positive_sessions
      ) || 0,
      governance_weekly_ops_auth_tier_pressure_sessions: Number(
        governanceWeeklyOpsStop && governanceWeeklyOpsStop.auth_tier_pressure_sessions
      ) || 0,
      governance_weekly_ops_dialogue_authorization_pressure_sessions: Number(
        governanceWeeklyOpsStop && governanceWeeklyOpsStop.dialogue_authorization_pressure_sessions
      ) || 0,
      governance_weekly_ops_runtime_block_rate_high_sessions: Number(
        governanceWeeklyOpsStop && governanceWeeklyOpsStop.runtime_block_rate_high_sessions
      ) || 0,
      governance_weekly_ops_runtime_ui_mode_violation_high_sessions: Number(
        governanceWeeklyOpsStop && governanceWeeklyOpsStop.runtime_ui_mode_violation_high_sessions
      ) || 0,
      governance_weekly_ops_runtime_ui_mode_violation_total_sum: Number(
        governanceWeeklyOpsStop && governanceWeeklyOpsStop.runtime_ui_mode_violation_total_sum
      ) || 0,
      kpi_anomaly_count: Array.isArray(trend.anomalies) ? trend.anomalies.length : 0
    },
    snapshots: {
      close_loop_session: sessionStats,
      batch_session: batchStats,
      controller_session: controllerStats,
      governance_session: governanceSessionStats,
      governance_weekly_ops_stop: governanceWeeklyOpsStop,
      governance_health: governanceHealth,
      kpi_trend: trend
    }
  };
}

module.exports = {
  buildAutoObservabilitySnapshot
};
