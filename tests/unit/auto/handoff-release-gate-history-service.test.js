const {
  buildAutoHandoffReleaseGateHistoryIndex,
  renderAutoHandoffReleaseGateHistoryMarkdown
} = require('../../../lib/auto/handoff-release-gate-history-service');

describe('auto handoff release gate history service', () => {
  test('builds release gate history index from merged report and seed entries', async () => {
    const result = await buildAutoHandoffReleaseGateHistoryIndex('proj', {
      keep: 2,
      out: 'out.json'
    }, {
      normalizeHandoffGateHistoryKeep: (v) => Number(v),
      resolveAutoHandoffReleaseGateHistoryFile: (_projectPath, file) => file || 'default.json',
      loadAutoHandoffReleaseGateReports: async () => ({
        dir: '.sce/reports/release-evidence',
        report_files: ['a.json'],
        entries: [
          { tag: 'v2.0.0', evaluated_at: '2026-03-08T00:00:00.000Z', gate_passed: false }
        ],
        warnings: ['report-warning']
      }),
      loadAutoHandoffReleaseGateHistorySeed: async () => ({
        file: 'seed.json',
        entries: [
          { tag: 'v1.0.0', evaluated_at: '2026-03-07T00:00:00.000Z', gate_passed: true },
          { tag: 'v0.9.0', evaluated_at: '2026-03-06T00:00:00.000Z', gate_passed: true }
        ],
        warnings: ['seed-warning']
      }),
      mergeAutoHandoffReleaseGateHistoryEntries: (entries) => entries,
      toAutoHandoffTimestamp: (v) => Date.parse(v || 0),
      normalizeHandoffText: (v) => String(v || '').trim(),
      buildAutoHandoffReleaseGateHistoryAggregates: (entries) => ({ count: entries.length }),
      now: () => '2026-03-08T00:00:00.000Z'
    });

    expect(result).toEqual(expect.objectContaining({
      mode: 'auto-handoff-release-gate-history',
      generated_at: '2026-03-08T00:00:00.000Z',
      total_entries: 2,
      keep: 2,
      warnings_count: 2,
      aggregates: { count: 2 }
    }));
    expect(result.latest).toEqual(expect.objectContaining({ tag: 'v2.0.0', gate_passed: false }));
    expect(result.entries).toHaveLength(2);
  });

  test('renders release gate history markdown', () => {
    const markdown = renderAutoHandoffReleaseGateHistoryMarkdown({
      generated_at: '2026-03-08T00:00:00.000Z',
      source_dir: '.sce/reports/release-evidence',
      total_entries: 1,
      keep: 10,
      latest: {
        tag: 'v2.0.0',
        evaluated_at: '2026-03-08T00:00:00.000Z',
        gate_passed: false,
        risk_level: 'high',
        scene_package_batch_passed: false,
        scene_package_batch_failure_count: 2,
        capability_expected_unknown_count: 1,
        capability_provided_unknown_count: 2,
        release_gate_preflight_available: true,
        release_gate_preflight_blocked: true,
        require_release_gate_preflight: true,
        weekly_ops_blocked: true,
        weekly_ops_risk_level: 'high',
        weekly_ops_governance_status: 'alert',
        weekly_ops_authorization_tier_block_rate_percent: 55,
        weekly_ops_dialogue_authorization_block_rate_percent: 66,
        weekly_ops_matrix_regression_positive_rate_percent: 40,
        weekly_ops_runtime_block_rate_percent: 52,
        weekly_ops_runtime_ui_mode_violation_total: 2,
        weekly_ops_runtime_ui_mode_violation_rate_percent: 25,
        weekly_ops_violations_count: 1,
        weekly_ops_warning_count: 0,
        weekly_ops_config_warning_count: 2,
        drift_alert_count: 1,
        drift_blocked: true
      },
      aggregates: {
        pass_rate_percent: 50,
        gate_passed_count: 0,
        gate_failed_count: 1,
        gate_unknown_count: 0,
        evidence_used_count: 1,
        enforce_count: 1,
        advisory_count: 0,
        avg_spec_success_rate_percent: 70,
        scene_package_batch_pass_rate_percent: 0,
        scene_package_batch_failed_count: 1,
        avg_scene_package_batch_failure_count: 2,
        capability_expected_unknown_positive_rate_percent: 100,
        avg_capability_expected_unknown_count: 1,
        max_capability_expected_unknown_count: 1,
        capability_provided_unknown_positive_rate_percent: 100,
        avg_capability_provided_unknown_count: 2,
        max_capability_provided_unknown_count: 2,
        drift_alert_runs: 1,
        drift_blocked_runs: 1,
        drift_alert_rate_percent: 100,
        drift_block_rate_percent: 100,
        weekly_ops_known_runs: 1,
        weekly_ops_blocked_runs: 1,
        weekly_ops_block_rate_percent: 100,
        weekly_ops_violations_total: 1,
        weekly_ops_warnings_total: 0,
        weekly_ops_config_warnings_total: 2,
        weekly_ops_config_warning_runs: 1,
        weekly_ops_config_warning_run_rate_percent: 100,
        weekly_ops_authorization_tier_block_rate_avg_percent: 55,
        weekly_ops_authorization_tier_block_rate_max_percent: 55,
        weekly_ops_dialogue_authorization_block_rate_avg_percent: 66,
        weekly_ops_dialogue_authorization_block_rate_max_percent: 66,
        weekly_ops_matrix_regression_positive_rate_avg_percent: 40,
        weekly_ops_matrix_regression_positive_rate_max_percent: 40,
        weekly_ops_runtime_block_rate_avg_percent: 52,
        weekly_ops_runtime_block_rate_max_percent: 52,
        weekly_ops_runtime_ui_mode_violation_known_runs: 1,
        weekly_ops_runtime_ui_mode_violation_runs: 1,
        weekly_ops_runtime_ui_mode_violation_run_rate_percent: 100,
        weekly_ops_runtime_ui_mode_violation_total: 2,
        weekly_ops_runtime_ui_mode_violation_rate_avg_percent: 25,
        weekly_ops_runtime_ui_mode_violation_rate_max_percent: 25,
        release_gate_preflight_known_runs: 1,
        release_gate_preflight_available_runs: 1,
        release_gate_preflight_blocked_runs: 1,
        release_gate_preflight_hard_gate_runs: 1,
        release_gate_preflight_availability_rate_percent: 100,
        release_gate_preflight_block_rate_percent: 100,
        risk_levels: { low: 0, medium: 0, high: 1, unknown: 0 }
      },
      entries: [
        {
          tag: 'v2.0.0',
          gate_passed: false,
          risk_level: 'high',
          scene_package_batch_passed: false,
          scene_package_batch_failure_count: 2,
          capability_expected_unknown_count: 1,
          capability_provided_unknown_count: 2,
          release_gate_preflight_blocked: true,
          require_release_gate_preflight: true,
          drift_alert_count: 1,
          drift_blocked: true,
          weekly_ops_blocked: true,
          weekly_ops_config_warning_count: 2,
          weekly_ops_authorization_tier_block_rate_percent: 55,
          weekly_ops_dialogue_authorization_block_rate_percent: 66,
          weekly_ops_runtime_block_rate_percent: 52,
          weekly_ops_runtime_ui_mode_violation_total: 2,
          weekly_ops_runtime_ui_mode_violation_rate_percent: 25,
          spec_success_rate_percent: 70,
          violations_count: 1,
          evaluated_at: '2026-03-08T00:00:00.000Z'
        }
      ],
      warnings: ['warn-1']
    }, {
      formatAutoHandoffRegressionValue: (value, fallback = 'n/a') => value === undefined || value === null || value === '' ? fallback : String(value)
    });

    expect(markdown).toContain('# Auto Handoff Release Gate History');
    expect(markdown).toContain('## Aggregates');
    expect(markdown).toContain('Release preflight block rate: 100%');
    expect(markdown).toContain('weekly-blocked=yes');
    expect(markdown).toContain('capability-unknown=1/2');
    expect(markdown).toContain('## Warnings');
  });
});
