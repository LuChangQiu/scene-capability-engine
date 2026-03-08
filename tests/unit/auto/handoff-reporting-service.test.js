const {
  buildAutoHandoffRegressionSnapshot,
  buildAutoHandoffRegressionReport,
  renderAutoHandoffRegressionMarkdown,
  renderAutoHandoffEvidenceReviewMarkdown,
  renderAutoHandoffReleaseNotesDraft
} = require('../../../lib/auto/handoff-reporting-service');

describe('auto handoff reporting service', () => {
  test('builds regression snapshot with normalized risk and scene batch state', () => {
    const snapshot = buildAutoHandoffRegressionSnapshot({
      session_id: 'handoff-1',
      status: 'completed',
      generated_at: '2026-03-08T00:00:00.000Z',
      spec_status: { success_rate_percent: 90 },
      gates: { actual: { risk_level: 'medium' } },
      batch_summary: { failed_goals: 1 },
      ontology_validation: { quality_score: 88, metrics: { business_rule_unmapped: 1, decision_undecided: 0 } },
      scene_package_batch: { status: 'failed', summary: { batch_gate_failure_count: 2 } },
      moqui_baseline: { compare: { coverage_matrix_regressions: [{ metric: 'forms', label: 'Forms', delta: { rate_percent: -5 } }] } }
    }, {
      normalizeHandoffText: (value) => typeof value === 'string' ? value.trim() : '',
      normalizeRiskRank: (level) => ({ low: 1, medium: 2, high: 3 }[`${level}`.trim().toLowerCase()] || 3)
    });

    expect(snapshot).toEqual(expect.objectContaining({
      session_id: 'handoff-1',
      risk_level: 'medium',
      risk_level_rank: 2,
      scene_package_batch_passed: false,
      scene_package_batch_failure_count: 2,
    }));
  });

  test('builds regression report and renders markdown views', async () => {
    const reports = [
      {
        session_id: 'handoff-new',
        status: 'completed',
        generated_at: '2026-03-08T00:00:00.000Z',
        spec_status: { success_rate_percent: 100 },
        gates: { actual: { risk_level: 'low' } },
        batch_summary: { failed_goals: 0 },
        ontology_validation: { quality_score: 92, metrics: { business_rule_unmapped: 0, decision_undecided: 0 } },
        scene_package_batch: { status: 'passed', summary: { batch_gate_failure_count: 0 } },
        moqui_baseline: { compare: {} }
      },
      {
        session_id: 'handoff-old',
        status: 'failed',
        generated_at: '2026-03-07T00:00:00.000Z',
        spec_status: { success_rate_percent: 70 },
        gates: { actual: { risk_level: 'high' } },
        batch_summary: { failed_goals: 2 },
        ontology_validation: { quality_score: 70, metrics: { business_rule_unmapped: 3, decision_undecided: 2 } },
        scene_package_batch: { status: 'failed', summary: { batch_gate_failure_count: 1 } },
        moqui_baseline: { compare: {} }
      }
    ];

    const common = {
      normalizeHandoffText: (value) => typeof value === 'string' ? value.trim() : '',
      normalizeRiskRank: (level) => ({ low: 1, medium: 2, high: 3 }[`${level}`.trim().toLowerCase()] || 3)
    };
    const report = await buildAutoHandoffRegressionReport('demo', { sessionId: 'latest', window: 2 }, {
      listAutoHandoffRunReports: async () => reports,
      normalizeHandoffSessionQuery: (value) => value || 'latest',
      normalizeHandoffRegressionWindow: (value) => Number(value) || 2,
      buildAutoHandoffRegressionSnapshot: (item) => buildAutoHandoffRegressionSnapshot(item, common),
      buildAutoHandoffRegressionComparison: require('../../../lib/auto/handoff-reporting-service').buildAutoHandoffRegressionComparison,
      buildAutoHandoffRegressionWindowTrend: require('../../../lib/auto/handoff-reporting-service').buildAutoHandoffRegressionWindowTrend,
      buildAutoHandoffRegressionAggregates: require('../../../lib/auto/handoff-reporting-service').buildAutoHandoffRegressionAggregates,
      buildAutoHandoffRegressionRiskLayers: require('../../../lib/auto/handoff-reporting-service').buildAutoHandoffRegressionRiskLayers,
      buildAutoHandoffRegressionRecommendations: require('../../../lib/auto/handoff-reporting-service').buildAutoHandoffRegressionRecommendations
    });

    expect(report.trend).toBe('improved');
    const regressionMd = renderAutoHandoffRegressionMarkdown(report);
    expect(regressionMd).toContain('# Auto Handoff Regression Report');
    expect(regressionMd).toContain('handoff-new');

    const evidenceMd = renderAutoHandoffEvidenceReviewMarkdown({
      generated_at: '2026-03-08T00:00:00.000Z',
      evidence_file: '.sce/reports/release-evidence/handoff-runs.json',
      current: report.current,
      trend: report.trend,
      delta: report.delta,
      window: report.window,
      aggregates: { ...report.aggregates, status_counts: { completed: 1, failed: 1, dry_run: 0, running: 0, other: 0 }, gate_pass_rate_percent: 50 },
      risk_layers: report.risk_layers,
      recommendations: report.recommendations,
      governance_snapshot: { mode: 'auto-governance-stats', generated_at: '2026-03-08T00:00:00.000Z' }
    });
    expect(evidenceMd).toContain('# Auto Handoff Release Evidence Review');

    const draftMd = renderAutoHandoffReleaseNotesDraft({
      generated_at: '2026-03-08T00:00:00.000Z',
      trend: report.trend,
      current: report.current,
      previous: report.previous,
      delta: report.delta,
      recommendations: report.recommendations,
      governance_snapshot: { health: { recommendations: ['keep monitoring'] } }
    }, {
      version: '3.6.34',
      releaseDate: '2026-03-08'
    }, {
      normalizeHandoffReleaseVersion: (value, fallback) => {
        const trimmed = String(value || fallback || '0.0.0').trim();
        return trimmed.startsWith('v') ? trimmed : 'v' + trimmed;
      },
      normalizeHandoffReleaseDate: (value) => value
    });
    expect(draftMd).toContain('# Release Notes Draft: v3.6.34');
  });
});
