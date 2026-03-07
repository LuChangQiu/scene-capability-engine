const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const {
  maybeWriteProgramKpi,
  maybeWriteProgramAudit
} = require('../../../lib/auto/program-output');

describe('auto program output helpers', () => {
  test('writes program KPI payload and backfills file path', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-program-output-'));
    try {
      const summary = {
        mode: 'auto-close-loop-program',
        status: 'completed',
        program_elapsed_ms: 123,
        total_goals: 2,
        processed_goals: 2,
        completed_goals: 2,
        failed_goals: 0,
        metrics: { success_rate_percent: 100 },
        program_kpi: { risk_level: 'low' },
        program_diagnostics: { failed_goal_count: 0 },
        program_coordination: { topology: 'master-sub' }
      };
      await maybeWriteProgramKpi(summary, 'program-kpi.json', tempDir, {
        pathModule: path,
        fs
      });
      expect(summary.program_kpi_file).toBe(path.join(tempDir, 'program-kpi.json'));
      const payload = await fs.readJson(summary.program_kpi_file);
      expect(payload.mode).toBe('auto-close-loop-program-kpi');
      expect(payload.program_kpi).toEqual(expect.objectContaining({ risk_level: 'low' }));
    } finally {
      await fs.remove(tempDir);
    }
  });

  test('writes program audit payload and backfills audit path', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-program-output-'));
    try {
      const summary = {
        mode: 'auto-close-loop-program',
        status: 'partial-failed',
        program_elapsed_ms: 456,
        total_goals: 2,
        processed_goals: 2,
        completed_goals: 1,
        failed_goals: 1,
        metrics: { success_rate_percent: 50 },
        batch_retry: { performed_rounds: 1 },
        program_kpi: { risk_level: 'high' },
        program_diagnostics: { failed_goal_count: 1 },
        program_coordination: { topology: 'master-sub' },
        resource_plan: { agent_budget: 2 },
        results: [{ status: 'failed', goal: 'a' }]
      };
      await maybeWriteProgramAudit(summary, 'program-audit.json', tempDir, {
        pathModule: path,
        fs,
        now: () => '2026-03-07T00:00:00.000Z'
      });
      expect(summary.program_audit_file).toBe(path.join(tempDir, 'program-audit.json'));
      const payload = await fs.readJson(summary.program_audit_file);
      expect(payload.mode).toBe('auto-close-loop-program-audit');
      expect(payload.generated_at).toBe('2026-03-07T00:00:00.000Z');
      expect(payload.program_coordination).toEqual(expect.objectContaining({ topology: 'master-sub' }));
      expect(payload.results).toHaveLength(1);
    } finally {
      await fs.remove(tempDir);
    }
  });
});
