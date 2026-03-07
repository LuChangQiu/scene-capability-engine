const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const {
  buildAutoHandoffEvidenceSnapshot,
  buildAutoHandoffEvidenceStatusCounts,
  resolveAutoHandoffReleaseDraftContext,
  buildAutoHandoffEvidenceReviewReport
} = require('../../../lib/auto/handoff-evidence-review-service');

describe('auto handoff evidence review service', () => {
  test('builds evidence snapshot and status counts', () => {
    const snapshot = buildAutoHandoffEvidenceSnapshot({
      session_id: 'sess-1',
      status: 'completed',
      merged_at: '2026-03-08T00:00:00.000Z',
      gate: { passed: true, actual: { spec_success_rate_percent: 100, risk_level: 'low', ontology_quality_score: 90 } },
      ontology_validation: { metrics: { business_rule_unmapped: 0, decision_undecided: 0 } },
      moqui_baseline: { compare: {} },
      scene_package_batch: { status: 'passed', summary: { batch_gate_failure_count: 0 } },
      capability_coverage: { summary: { coverage_percent: 100, passed: true } }
    }, {
      normalizeHandoffText: (v) => String(v || '').trim(),
      buildAutoHandoffMoquiCoverageRegressions: () => [],
      normalizeRiskRank: () => 1
    });
    expect(snapshot).toEqual(expect.objectContaining({
      session_id: 'sess-1',
      gate_passed: true,
      spec_success_rate_percent: 100,
      risk_level: 'low',
      capability_coverage_percent: 100,
      moqui_matrix_regression_count: 0
    }));
    expect(buildAutoHandoffEvidenceStatusCounts([{ status: 'completed' }, { status: 'failed' }, { status: 'dry-run' }])).toEqual({
      completed: 1,
      failed: 1,
      dry_run: 1,
      running: 0,
      other: 0
    });
  });

  test('resolves release draft context from package version and override', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-handoff-draft-'));
    try {
      await fs.writeJson(path.join(tempDir, 'package.json'), { version: '3.6.33' }, { spaces: 2 });
      const result = await resolveAutoHandoffReleaseDraftContext(tempDir, { releaseDate: '2026-03-08' }, {
        fs,
        pathModule: path,
        normalizeHandoffReleaseVersion: (candidate, fallback) => candidate || fallback,
        normalizeHandoffReleaseDate: (candidate) => candidate
      });
      expect(result).toEqual({ version: '3.6.33', releaseDate: '2026-03-08' });
    } finally {
      await fs.remove(tempDir);
    }
  });

  test('builds evidence review report with governance snapshot', async () => {
    const report = await buildAutoHandoffEvidenceReviewReport('proj', {}, {
      loadAutoHandoffReleaseEvidence: async () => ({
        file: 'handoff-runs.json',
        payload: { updated_at: '2026-03-08T00:00:00.000Z' },
        sessions: [
          { session_id: 'new', status: 'completed', gate: { passed: true } },
          { session_id: 'old', status: 'failed', gate: { passed: false } }
        ]
      }),
      normalizeHandoffSessionQuery: () => 'latest',
      normalizeHandoffEvidenceWindow: () => 5,
      normalizeHandoffText: (v) => String(v || '').trim(),
      buildAutoHandoffEvidenceSnapshot: (item) => ({ session_id: item.session_id, status: item.status, gate: item.gate }),
      buildAutoHandoffRegressionComparison: () => ({ trend: 'improved', delta: { spec_success_rate_percent: 20 } }),
      buildAutoHandoffRegressionWindowTrend: () => ({ trend: 'improved' }),
      buildAutoHandoffRegressionAggregates: () => ({ total: 2 }),
      buildAutoHandoffRegressionRiskLayers: () => ({ low: { count: 1 } }),
      buildAutoHandoffEvidenceStatusCounts: () => ({ completed: 1, failed: 1, dry_run: 0, running: 0, other: 0 }),
      buildAutoGovernanceStats: async () => ({ mode: 'auto-governance-stats', generated_at: '2026-03-08T00:00:00.000Z', health: { risk_level: 'low' } }),
      buildAutoHandoffRegressionRecommendations: () => ['review'],
      now: () => '2026-03-08T00:00:00.000Z'
    });

    expect(report).toEqual(expect.objectContaining({
      mode: 'auto-handoff-evidence-review',
      current: expect.objectContaining({ session_id: 'new' }),
      previous: expect.objectContaining({ session_id: 'old' }),
      trend: 'improved',
      aggregates: expect.objectContaining({ gate_pass_rate_percent: 50 }),
      governance_snapshot: expect.objectContaining({ health: { risk_level: 'low' } }),
      recommendations: ['review']
    }));
  });
});
