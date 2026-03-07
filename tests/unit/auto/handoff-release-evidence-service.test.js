const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const {
  loadAutoHandoffReleaseEvidence,
  mergeAutoHandoffRunIntoReleaseEvidence,
  writeAutoHandoffRunReport
} = require('../../../lib/auto/handoff-release-evidence-service');

describe('auto handoff release evidence service', () => {
  test('loads release evidence and sorts sessions by merged timestamp desc', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-handoff-evidence-'));
    try {
      const evidenceFile = path.join(tempDir, 'handoff-runs.json');
      await fs.writeJson(evidenceFile, {
        sessions: [
          { session_id: 'older', merged_at: '2026-03-07T00:00:00.000Z' },
          { session_id: 'newer', merged_at: '2026-03-08T00:00:00.000Z' }
        ]
      }, { spaces: 2 });
      const result = await loadAutoHandoffReleaseEvidence(tempDir, evidenceFile, {
        resolveAutoHandoffReleaseEvidenceFile: (_projectPath, fileCandidate) => fileCandidate,
        fs
      });
      expect(result.sessions.map(item => item.session_id)).toEqual(['newer', 'older']);
    } finally {
      await fs.remove(tempDir);
    }
  });

  test('merges run into release evidence and updates existing session', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-handoff-evidence-'));
    try {
      const evidenceFile = path.join(tempDir, '.sce', 'reports', 'release-evidence', 'handoff-runs.json');
      await fs.ensureDir(path.dirname(evidenceFile));
      await fs.writeJson(evidenceFile, {
        generated_at: '2026-03-07T00:00:00.000Z',
        sessions: [
          { session_id: 'same', merged_at: '2026-03-07T00:00:00.000Z', old: true }
        ]
      }, { spaces: 2 });
      const result = await mergeAutoHandoffRunIntoReleaseEvidence(tempDir, {
        session_id: 'same',
        policy: { release_evidence_window: 5 }
      }, 'report.json', {
        resolveAutoHandoffReleaseEvidenceFile: () => evidenceFile,
        normalizeHandoffReleaseEvidenceWindow: (v) => v,
        loadAutoHandoffReleaseEvidence: async (projectPath, file) => loadAutoHandoffReleaseEvidence(projectPath, file, {
          resolveAutoHandoffReleaseEvidenceFile: (_projectPath, fileCandidate) => fileCandidate,
          fs
        }),
        fs,
        buildAutoHandoffRegressionReport: async () => ({ window: { requested: 5, actual: 1 }, trend: 'stable', aggregates: {}, risk_layers: {} }),
        normalizeHandoffText: (v) => String(v || '').trim(),
        buildAutoHandoffReleaseEvidenceEntry: (_projectPath, sourceResult, reportFile, trendWindow) => ({ session_id: sourceResult.session_id, merged_at: '2026-03-08T00:00:00.000Z', reportFile, trend_window: trendWindow }),
        now: () => '2026-03-08T00:00:00.000Z'
      });
      expect(result).toEqual(expect.objectContaining({ merged: true, updated_existing: true, total_runs: 1, latest_session_id: 'same' }));
      const payload = await fs.readJson(evidenceFile);
      expect(payload.sessions).toHaveLength(1);
      expect(payload.sessions[0]).toEqual(expect.objectContaining({ session_id: 'same' }));
      expect(payload.latest_trend_window).toEqual(expect.objectContaining({ trend: 'stable' }));
    } finally {
      await fs.remove(tempDir);
    }
  });

  test('writes default handoff run report through shared output writer', async () => {
    const calls = [];
    await writeAutoHandoffRunReport('proj', { session_id: 'session-1' }, null, {
      maybeWriteOutput: async (...args) => { calls.push(args); },
      reportDir: '.sce/reports/handoff-runs'
    });
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toContain(path.join('.sce', 'reports', 'handoff-runs'));
  });
});
