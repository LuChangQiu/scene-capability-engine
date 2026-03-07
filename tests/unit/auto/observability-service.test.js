const { buildAutoObservabilitySnapshot } = require('../../../lib/auto/observability-service');

describe('auto observability service', () => {
  test('aggregates session, governance, and trend telemetry into one snapshot', async () => {
    const result = await buildAutoObservabilitySnapshot('proj', {
      days: 14,
      status: 'completed,failed',
      weeks: 6,
      trendMode: 'all',
      trendPeriod: 'week'
    }, {
      normalizeStatsWindowDays: (value) => value,
      normalizeStatusFilter: () => ['completed', 'failed'],
      statsCloseLoopSessions: async () => ({ total_sessions: 4, completed_sessions: 3, failed_sessions: 1 }),
      statsCloseLoopBatchSummarySessions: async () => ({ total_sessions: 3, completed_sessions: 2, failed_sessions: 1 }),
      statsCloseLoopControllerSessions: async () => ({ total_sessions: 2, completed_sessions: 1, failed_sessions: 1 }),
      statsGovernanceCloseLoopSessions: async () => ({
        total_sessions: 1,
        completed_sessions: 1,
        failed_sessions: 0,
        release_gate: {
          weekly_ops_stop: {
            sessions: 2,
            session_rate_percent: 25,
            high_pressure_sessions: 1,
            high_pressure_session_rate_percent: 12.5,
            config_warning_positive_sessions: 1,
            auth_tier_pressure_sessions: 1,
            dialogue_authorization_pressure_sessions: 0,
            runtime_block_rate_high_sessions: 1,
            runtime_ui_mode_violation_high_sessions: 0,
            runtime_ui_mode_violation_total_sum: 3
          }
        }
      }),
      buildAutoGovernanceStats: async () => ({ health: { risk_level: 'medium' } }),
      buildAutoKpiTrend: async () => ({ weeks: 6, mode: 'all', period_unit: 'week', anomalies: [{ id: 'a1' }, { id: 'a2' }] }),
      calculatePercent: (value, total) => total === 0 ? 0 : Number(((value / total) * 100).toFixed(2)),
      schemaVersion: '1.0',
      now: () => '2026-03-07T00:00:00.000Z'
    });

    expect(result).toEqual(expect.objectContaining({
      mode: 'auto-observability-snapshot',
      generated_at: '2026-03-07T00:00:00.000Z',
      schema_version: '1.0',
      criteria: expect.objectContaining({
        days: 14,
        status_filter: ['completed', 'failed'],
        trend_weeks: 6,
        trend_mode: 'all',
        trend_period: 'week'
      }),
      highlights: expect.objectContaining({
        total_sessions: 10,
        completed_sessions: 7,
        failed_sessions: 3,
        completion_rate_percent: 70,
        failure_rate_percent: 30,
        governance_risk_level: 'medium',
        governance_weekly_ops_stop_sessions: 2,
        governance_weekly_ops_runtime_ui_mode_violation_total_sum: 3,
        kpi_anomaly_count: 2
      }),
      snapshots: expect.objectContaining({
        governance_weekly_ops_stop: expect.objectContaining({ sessions: 2 }),
        governance_health: expect.objectContaining({ health: { risk_level: 'medium' } }),
        kpi_trend: expect.objectContaining({ weeks: 6 })
      })
    }));
  });
});
