const { Command } = require('commander');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

jest.mock('../../../lib/auto/close-loop-runner', () => ({
  runAutoCloseLoop: jest.fn()
}));

const { runAutoCloseLoop } = require('../../../lib/auto/close-loop-runner');
const { registerAutoCommands } = require('../../../lib/commands/auto');

describe('auto close-loop command', () => {
  let exitSpy;
  let errorSpy;
  let logSpy;
  let cwdSpy;
  let tempDir;

  beforeEach(async () => {
    jest.resetAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-auto-command-'));
    const baselineScript = path.join(tempDir, 'scripts', 'moqui-template-baseline-report.js');
    await fs.ensureDir(path.dirname(baselineScript));
    await fs.writeFile(
      baselineScript,
      `'use strict';
const fs = require('fs');
const path = require('path');
const readArg = flag => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
};
const outFile = readArg('--out');
const markdownFile = readArg('--markdown-out');
const payload = {
  mode: 'moqui-template-baseline',
  generated_at: '2026-02-17T00:00:00.000Z',
  summary: {
    total_templates: 3,
    scoped_templates: 3,
    avg_score: 95,
    valid_rate_percent: 100,
    baseline_passed: 3,
    baseline_failed: 0,
    portfolio_passed: true,
    scope_breakdown: {
      moqui_erp: 2,
      scene_orchestration: 1,
      other: 0
    },
    coverage_matrix: {
      entity_coverage: { count: 3, rate_percent: 100 },
      relation_coverage: { count: 3, rate_percent: 100 },
      business_rule_coverage: { count: 3, rate_percent: 100 },
      business_rule_closed: { count: 3, rate_percent: 100 },
      decision_coverage: { count: 3, rate_percent: 100 },
      decision_closed: { count: 3, rate_percent: 100 }
    },
    gap_frequency: []
  },
  compare: {
    previous_generated_at: null,
    deltas: {
      scoped_templates: 0,
      avg_score: 0,
      valid_rate_percent: 0,
      baseline_passed: 0,
      baseline_failed: 0
    },
    coverage_matrix_deltas: {
      entity_coverage: { count: 0, rate_percent: 0 },
      relation_coverage: { count: 0, rate_percent: 0 },
      business_rule_closed: { count: 0, rate_percent: 0 },
      decision_closed: { count: 0, rate_percent: 0 }
    },
    coverage_matrix_regressions: [],
    failed_templates: {
      previous: [],
      current: [],
      newly_failed: [],
      recovered: []
    }
  }
};
if (outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
}
if (markdownFile) {
  fs.mkdirSync(path.dirname(markdownFile), { recursive: true });
  fs.writeFileSync(markdownFile, '# Mock Moqui Baseline\\n', 'utf8');
}
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(payload));
}
`,
      'utf8'
    );
    const defaultReleaseGateHistoryFile = path.join(
      tempDir,
      '.sce',
      'reports',
      'release-evidence',
      'release-gate-history.json'
    );
    await fs.ensureDir(path.dirname(defaultReleaseGateHistoryFile));
    await fs.writeJson(defaultReleaseGateHistoryFile, {
      mode: 'auto-handoff-release-gate-history',
      total_entries: 1,
      latest: {
        tag: 'v0.0.0-test',
        gate_passed: true,
        risk_level: 'low',
        weekly_ops_runtime_block_rate_percent: 0,
        weekly_ops_runtime_ui_mode_violation_total: 0,
        weekly_ops_runtime_ui_mode_violation_rate_percent: 0
      },
      aggregates: {
        pass_rate_percent: 100,
        scene_package_batch_pass_rate_percent: 100,
        scene_package_batch_failed_count: 0,
        drift_alert_rate_percent: 0,
        drift_alert_runs: 0,
        drift_blocked_runs: 0,
        weekly_ops_runtime_block_rate_max_percent: 0,
        weekly_ops_runtime_ui_mode_violation_total: 0,
        weekly_ops_runtime_ui_mode_violation_run_rate_percent: 0,
        weekly_ops_runtime_ui_mode_violation_rate_max_percent: 0
      },
      entries: [
        {
          tag: 'v0.0.0-test',
          gate_passed: true,
          risk_level: 'low',
          weekly_ops_runtime_block_rate_percent: 0,
          weekly_ops_runtime_ui_mode_violation_total: 0,
          weekly_ops_runtime_ui_mode_violation_rate_percent: 0
        }
      ]
    }, { spaces: 2 });
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tempDir);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    exitSpy.mockRestore();
    cwdSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  function buildProgram() {
    const program = new Command();
    program.exitOverride();
    registerAutoCommands(program);
    return program;
  }

  test('allows --resume latest without goal argument', async () => {
    runAutoCloseLoop.mockResolvedValue({ status: 'prepared' });
    const program = buildProgram();

    await program.parseAsync(['node', 'sce', 'auto', 'close-loop', '--resume', 'latest']);

    expect(runAutoCloseLoop).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        resume: 'latest'
      })
    );
  });

  test('allows --resume interrupted without goal argument', async () => {
    runAutoCloseLoop.mockResolvedValue({ status: 'prepared' });
    const program = buildProgram();

    await program.parseAsync(['node', 'sce', 'auto', 'close-loop', '--resume', 'interrupted']);

    expect(runAutoCloseLoop).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        resume: 'interrupted'
      })
    );
  });

  test('supports close-loop continue shorthand without --resume', async () => {
    runAutoCloseLoop.mockResolvedValue({ status: 'prepared' });
    const program = buildProgram();

    await program.parseAsync(['node', 'sce', 'auto', 'close-loop', 'continue']);

    expect(runAutoCloseLoop).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        resume: 'interrupted'
      })
    );
  });

  test('supports close-loop 继续 shorthand without --resume', async () => {
    runAutoCloseLoop.mockResolvedValue({ status: 'prepared' });
    const program = buildProgram();

    await program.parseAsync(['node', 'sce', 'auto', 'close-loop', '继续']);

    expect(runAutoCloseLoop).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        resume: 'interrupted'
      })
    );
  });

  test('supports auto continue command as interrupted resume', async () => {
    runAutoCloseLoop.mockResolvedValue({ status: 'prepared' });
    const program = buildProgram();

    await program.parseAsync(['node', 'sce', 'auto', 'continue']);

    expect(runAutoCloseLoop).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        resume: 'interrupted'
      })
    );
  });

  test('requires goal when --resume is not provided', async () => {
    runAutoCloseLoop.mockResolvedValue({ status: 'prepared' });
    const program = buildProgram();

    await expect(
      program.parseAsync(['node', 'sce', 'auto', 'close-loop'])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('Goal is required unless --resume is provided.');
  });

  test('forwards goal and replan/session options to close-loop runner', async () => {
    runAutoCloseLoop.mockResolvedValue({ status: 'completed' });
    const program = buildProgram();

    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop',
      'deliver sce autonomous close-loop',
      '--replan-strategy',
      'fixed',
      '--replan-attempts',
      '2',
      '--replan-no-progress-window',
      '4',
      '--session-keep',
      '5',
      '--session-older-than-days',
      '14'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledWith(
      'deliver sce autonomous close-loop',
      expect.objectContaining({
        replanStrategy: 'fixed',
        replanAttempts: 2,
        replanNoProgressWindow: 4,
        sessionKeep: 5,
        sessionOlderThanDays: 14
      })
    );
  });

  test('runs close-loop-batch with json goals file and writes summary', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    const outFile = path.join(tempDir, 'batch-summary.json');
    await fs.writeJson(goalsFile, {
      goals: ['first autonomous goal', 'second autonomous goal']
    }, { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({
        status: 'completed',
        portfolio: { master_spec: '121-00-first', sub_specs: ['121-01-a', '121-02-b'] },
        orchestration: {
          rateLimit: {
            signalCount: 2,
            totalBackoffMs: 1200,
            lastLaunchHoldMs: 700
          }
        }
      })
      .mockResolvedValueOnce({
        status: 'completed',
        portfolio: { master_spec: '122-00-second', sub_specs: ['122-01-a', '122-02-b'] },
        orchestration: {
          rateLimit: {
            signalCount: 1,
            totalBackoffMs: 300,
            lastLaunchHoldMs: 200
          }
        }
      });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--json',
      '--out',
      outFile
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(2);
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(
      1,
      'first autonomous goal',
      expect.objectContaining({
        quiet: true,
        run: true,
        stream: false
      })
    );
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(
      2,
      'second autonomous goal',
      expect.objectContaining({
        quiet: true
      })
    );

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.mode).toBe('auto-close-loop-batch');
    expect(summary.status).toBe('completed');
    expect(summary.total_goals).toBe(2);
    expect(summary.processed_goals).toBe(2);
    expect(summary.completed_goals).toBe(2);
    expect(summary.failed_goals).toBe(0);
    expect(summary.metrics).toEqual(expect.objectContaining({
      total_rate_limit_signals: 3,
      average_rate_limit_signals_per_goal: 1.5,
      total_rate_limit_backoff_ms: 1500,
      average_rate_limit_backoff_ms_per_goal: 750,
      max_rate_limit_launch_hold_ms: 700
    }));
    expect(summary.resource_plan).toEqual(expect.objectContaining({
      agent_budget: null,
      effective_goal_parallel: 2
    }));
    expect(summary.output_file).toBe(outFile);

    const summaryFile = await fs.readJson(outFile);
    expect(summaryFile.mode).toBe('auto-close-loop-batch');
    expect(summaryFile.results).toHaveLength(2);
  });

  test('parses line-based goals file in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.txt');
    await fs.writeFile(
      goalsFile,
      [
        '# comment',
        'first line goal',
        '',
        '  second line goal  '
      ].join('\n'),
      'utf8'
    );

    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '121-00-a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '121-00-b', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--format',
      'lines',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(2);
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(1, 'first line goal', expect.any(Object));
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(2, 'second line goal', expect.any(Object));
  });

  test('supports concurrent goal execution with --batch-parallel', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, {
      goals: ['goal one', 'goal two', 'goal three', 'goal four']
    }, { spaces: 2 });

    let inFlight = 0;
    let maxInFlight = 0;
    runAutoCloseLoop.mockImplementation(async goal => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 30));
      inFlight -= 1;
      return {
        status: 'completed',
        portfolio: {
          master_spec: `master-${goal.replace(/\s+/g, '-')}`,
          sub_specs: []
        }
      };
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--batch-parallel',
      '2',
      '--continue-on-error',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(4);
    expect(maxInFlight).toBe(2);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.batch_parallel).toBe(2);
    expect(summary.status).toBe('completed');
    expect(summary.processed_goals).toBe(4);
  });

  test('allocates unique prefixes per goal for parallel close-loop-batch runs', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, {
      goals: ['goal one', 'goal two', 'goal three']
    }, { spaces: 2 });
    await fs.ensureDir(path.join(tempDir, '.sce', 'specs', '210-00-existing'));

    runAutoCloseLoop.mockImplementation(async (_goal, options) => ({
      status: 'completed',
      portfolio: {
        master_spec: `master-${options.prefix}`,
        sub_specs: []
      }
    }));

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--batch-parallel',
      '2',
      '--continue-on-error',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(3);
    const prefixes = runAutoCloseLoop.mock.calls
      .map(call => call[1].prefix)
      .sort((a, b) => a - b);
    expect(prefixes).toEqual([211, 212, 213]);
    expect(new Set(prefixes).size).toBe(3);
  });

  test('applies batch agent budget to per-goal maxParallel', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, {
      goals: ['goal one', 'goal two']
    }, { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '121-00-a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '121-00-b', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--batch-parallel',
      '2',
      '--batch-agent-budget',
      '6',
      '--continue-on-error',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(2);
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(
      1,
      'goal one',
      expect.objectContaining({
        maxParallel: 3
      })
    );
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(
      2,
      'goal two',
      expect.objectContaining({
        maxParallel: 3
      })
    );

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.batch_parallel).toBe(2);
    expect(summary.resource_plan).toEqual(expect.objectContaining({
      agent_budget: 6,
      per_goal_max_parallel: 3,
      effective_goal_parallel: 2
    }));
  });

  test('caps effective batch parallelism when batch agent budget is lower', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, {
      goals: ['goal one', 'goal two', 'goal three']
    }, { spaces: 2 });

    let inFlight = 0;
    let maxInFlight = 0;
    runAutoCloseLoop.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 20));
      inFlight -= 1;
      return {
        status: 'completed',
        portfolio: {
          master_spec: '121-00-ok',
          sub_specs: []
        }
      };
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--batch-parallel',
      '3',
      '--batch-agent-budget',
      '2',
      '--continue-on-error',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(2);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.batch_parallel).toBe(2);
    expect(summary.resource_plan).toEqual(expect.objectContaining({
      agent_budget: 2,
      effective_goal_parallel: 2,
      per_goal_max_parallel: 1
    }));
  });

  test('uses complexity-weighted scheduling under batch agent budget', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    const complexGoal = [
      'deliver orchestration integration migration observability and security resilience,',
      'plus quality compliance governance and performance hardening,',
      'with closed-loop remediation and parallel master sub coordination.'
    ].join(' ');
    await fs.writeJson(goalsFile, {
      goals: [complexGoal, 'simple goal']
    }, { spaces: 2 });

    let inFlight = 0;
    let maxInFlight = 0;
    runAutoCloseLoop.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 20));
      inFlight -= 1;
      return {
        status: 'completed',
        portfolio: {
          master_spec: '121-00-ok',
          sub_specs: []
        }
      };
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--batch-parallel',
      '2',
      '--batch-agent-budget',
      '2',
      '--continue-on-error',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.resource_plan).toEqual(expect.objectContaining({
      weighted_scheduling_enabled: true,
      max_concurrent_goals: 1
    }));
    expect(summary.resource_plan.goal_complexity_summary.max).toBeGreaterThanOrEqual(2);
    expect(summary.results[0].goal_weight).toBeGreaterThanOrEqual(2);
  });

  test('resumes pending goals from previous batch summary', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    const summaryFile = path.join(tempDir, 'old-summary.json');
    await fs.writeJson(goalsFile, {
      goals: ['goal one', 'goal two', 'goal three']
    }, { spaces: 2 });
    await fs.writeJson(summaryFile, {
      mode: 'auto-close-loop-batch',
      status: 'failed',
      goals_file: goalsFile,
      total_goals: 3,
      processed_goals: 1,
      stopped_early: true,
      results: [
        {
          index: 1,
          goal: 'goal one',
          status: 'failed',
          master_spec: '121-00-one',
          sub_spec_count: 2,
          error: null
        }
      ]
    }, { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-b', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-c', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      '--resume-from-summary',
      summaryFile,
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(3);
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(1, 'goal one', expect.any(Object));
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(2, 'goal two', expect.any(Object));
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(3, 'goal three', expect.any(Object));

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.resumed_from_summary).toEqual(expect.objectContaining({
      file: summaryFile,
      strategy: 'pending'
    }));
    expect(summary.total_goals).toBe(3);
    expect(summary.processed_goals).toBe(3);
  });

  test('supports --resume-strategy failed-only for summary resume', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    const summaryFile = path.join(tempDir, 'old-summary.json');
    await fs.writeJson(goalsFile, {
      goals: ['goal one', 'goal two', 'goal three']
    }, { spaces: 2 });
    await fs.writeJson(summaryFile, {
      mode: 'auto-close-loop-batch',
      status: 'failed',
      goals_file: goalsFile,
      total_goals: 3,
      processed_goals: 1,
      stopped_early: true,
      results: [
        {
          index: 1,
          goal: 'goal one',
          status: 'failed',
          master_spec: '121-00-one',
          sub_spec_count: 2,
          error: null
        }
      ]
    }, { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-b', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      '--resume-from-summary',
      summaryFile,
      '--resume-strategy',
      'failed-only',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(1);
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(1, 'goal one', expect.any(Object));

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.resumed_from_summary).toEqual(expect.objectContaining({
      strategy: 'failed-only'
    }));
    expect(summary.total_goals).toBe(1);
    expect(summary.processed_goals).toBe(1);
  });

  test('supports --resume-from-summary latest using persisted batch session summaries', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    const summaryDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    const latestSummaryFile = path.join(summaryDir, 'batch-latest.json');
    await fs.ensureDir(summaryDir);
    await fs.writeJson(goalsFile, {
      goals: ['goal one', 'goal two']
    }, { spaces: 2 });
    await fs.writeJson(latestSummaryFile, {
      mode: 'auto-close-loop-batch',
      status: 'failed',
      goals_file: goalsFile,
      total_goals: 2,
      processed_goals: 1,
      stopped_early: true,
      results: [
        {
          index: 1,
          goal: 'goal one',
          status: 'failed',
          master_spec: '121-00-one',
          sub_spec_count: 0,
          error: null
        }
      ]
    }, { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-b', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      '--resume-from-summary',
      'latest',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(2);
    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.resumed_from_summary).toEqual(expect.objectContaining({
      file: latestSummaryFile
    }));
  });

  test('persists batch session summary by default', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });
    runAutoCloseLoop.mockResolvedValueOnce({
      status: 'completed',
      portfolio: { master_spec: '122-00-a', sub_specs: [] }
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.batch_session).toBeDefined();
    expect(summary.batch_session.id).toContain('batch-');
    expect(await fs.pathExists(summary.batch_session.file)).toBe(true);
  });

  test('supports disabling batch session persistence with --no-batch-session', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });
    runAutoCloseLoop.mockResolvedValueOnce({
      status: 'completed',
      portfolio: { master_spec: '122-00-a', sub_specs: [] }
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--no-batch-session',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.batch_session).toBeUndefined();

    const summaryDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    expect(await fs.pathExists(summaryDir)).toBe(false);
  });

  test('runs close-loop-program with autonomous defaults and generated goals', async () => {
    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-10-a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-10-b', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-10-c', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-program',
      'build autonomous close-loop, master/sub decomposition, orchestration and quality rollout for sce',
      '--program-goals',
      '3',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(3);
    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.mode).toBe('auto-close-loop-program');
    expect(summary.total_goals).toBe(3);
    expect(summary.generated_from_goal).toEqual(expect.objectContaining({
      strategy: 'semantic-clause-and-category',
      produced_goal_count: 3
    }));
    expect(summary.autonomous_policy).toEqual(expect.objectContaining({
      enabled: true,
      profile: 'closed-loop'
    }));
    expect(summary.batch_retry).toEqual(expect.objectContaining({
      until_complete: true,
      max_rounds: 10
    }));
    expect(summary.program_kpi).toEqual(expect.objectContaining({
      convergence_state: 'converged',
      risk_level: 'low',
      completion_rate_percent: 100,
      failure_rate_percent: 0
    }));
    expect(summary.program_diagnostics).toEqual(expect.objectContaining({
      failed_goal_count: 0
    }));
    expect(summary.program_diagnostics.failure_clusters).toEqual([]);
    expect(summary.program_diagnostics.remediation_actions[0]).toEqual(expect.objectContaining({
      priority: 'monitor'
    }));
  });

  test('supports close-loop-program with explicit retry max rounds', async () => {
    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-11-a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-11-b', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-program',
      'build autonomous close-loop and orchestrate multi-spec program',
      '--program-goals',
      '2',
      '--batch-retry-max-rounds',
      '3',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.mode).toBe('auto-close-loop-program');
    expect(summary.batch_retry).toEqual(expect.objectContaining({
      until_complete: true,
      max_rounds: 3
    }));
  });

  test('writes close-loop-program KPI snapshot with --program-kpi-out', async () => {
    const kpiOutFile = path.join(tempDir, 'program-kpi.json');
    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-b', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-program',
      'build autonomous close-loop and orchestrate multi-spec program',
      '--program-goals',
      '2',
      '--program-kpi-out',
      kpiOutFile,
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.program_kpi_file).toBe(kpiOutFile);
    expect(await fs.pathExists(kpiOutFile)).toBe(true);

    const kpiPayload = await fs.readJson(kpiOutFile);
    expect(kpiPayload.mode).toBe('auto-close-loop-program-kpi');
    expect(kpiPayload.program_kpi).toEqual(expect.objectContaining({
      convergence_state: 'converged',
      risk_level: 'low'
    }));
    expect(kpiPayload.program_diagnostics).toEqual(expect.objectContaining({
      failed_goal_count: 0
    }));
  });

  test('writes program audit file with recovery and coordination trace', async () => {
    const auditOutFile = path.join(tempDir, 'program-audit.json');
    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-b', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-program',
      'build autonomous close-loop and orchestrate multi-spec program',
      '--program-goals',
      '2',
      '--program-audit-out',
      auditOutFile,
      '--json'
    ]);

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.program_audit_file).toBe(auditOutFile);
    expect(await fs.pathExists(auditOutFile)).toBe(true);
    const auditPayload = await fs.readJson(auditOutFile);
    expect(auditPayload.mode).toBe('auto-close-loop-program-audit');
    expect(auditPayload.program_coordination).toEqual(expect.objectContaining({
      topology: 'master-sub'
    }));
  });

  test('fails program convergence gate when max risk policy is stricter than actual risk', async () => {
    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '122-12-gate-r1', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-gate-r2', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-gate-r3', sub_specs: [] } });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-program',
        'deliver resilient autonomous rollout',
        '--program-goals',
        '2',
        '--batch-retry-rounds',
        '1',
        '--program-max-risk-level',
        'low',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.status).toBe('completed');
    expect(summary.program_kpi.risk_level).toBe('medium');
    expect(summary.program_gate).toEqual(expect.objectContaining({
      passed: false
    }));
  });

  test('fails program convergence gate when max agent budget policy is stricter than actual budget', async () => {
    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-budget-r1', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-budget-r2', sub_specs: [] } });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-program',
        'deliver resilient autonomous rollout',
        '--program-goals',
        '2',
        '--batch-agent-budget',
        '4',
        '--program-max-agent-budget',
        '2',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.status).toBe('completed');
    expect(summary.program_gate).toEqual(expect.objectContaining({
      passed: false,
      policy: expect.objectContaining({
        max_agent_budget: 2
      }),
      actual: expect.objectContaining({
        agent_budget: 4
      })
    }));
    expect(summary.program_gate.reasons.join(' ')).toContain('agent_budget');
  });

  test('fails program convergence gate when max total sub-specs policy is stricter than actual', async () => {
    runAutoCloseLoop
      .mockResolvedValueOnce({
        status: 'completed',
        portfolio: { master_spec: '122-12-subspec-r1', sub_specs: ['a', 'b', 'c'] }
      })
      .mockResolvedValueOnce({
        status: 'completed',
        portfolio: { master_spec: '122-12-subspec-r2', sub_specs: ['d', 'e', 'f'] }
      });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-program',
        'deliver resilient autonomous rollout',
        '--program-goals',
        '2',
        '--program-max-total-sub-specs',
        '4',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.status).toBe('completed');
    expect(summary.program_gate).toEqual(expect.objectContaining({
      passed: false,
      policy: expect.objectContaining({
        max_total_sub_specs: 4
      }),
      actual: expect.objectContaining({
        total_sub_specs: 6
      })
    }));
    expect(summary.program_gate.reasons.join(' ')).toContain('total_sub_specs');
  });

  test('fails program convergence gate when max elapsed policy is stricter than actual runtime', async () => {
    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-time-r1', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-time-r2', sub_specs: [] } });

    const nowSpy = jest.spyOn(Date, 'now');
    let ticks = 0;
    nowSpy.mockImplementation(() => {
      ticks += 1;
      return 1700000000000 + (ticks * 90000);
    });

    try {
      const program = buildProgram();
      await expect(
        program.parseAsync([
          'node',
          'sce',
          'auto',
          'close-loop-program',
          'deliver resilient autonomous rollout',
          '--program-goals',
          '2',
          '--program-max-elapsed-minutes',
          '1',
          '--json'
        ])
      ).rejects.toThrow('process.exit called');
    } finally {
      nowSpy.mockRestore();
    }

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.status).toBe('completed');
    expect(summary.program_gate).toEqual(expect.objectContaining({
      passed: false,
      policy: expect.objectContaining({
        max_elapsed_minutes: 1
      }),
      actual: expect.objectContaining({
        elapsed_minutes: expect.any(Number)
      })
    }));
    expect(summary.program_gate.actual.elapsed_minutes).toBeGreaterThan(1);
    expect(summary.program_gate.reasons.join(' ')).toContain('program_elapsed_minutes');
  });

  test('validates --program-max-elapsed-minutes range in close-loop-program', async () => {
    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-program',
        'deliver resilient autonomous rollout',
        '--program-max-elapsed-minutes',
        '0'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--program-max-elapsed-minutes must be an integer between 1 and 10080.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --program-max-agent-budget range in close-loop-program', async () => {
    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-program',
        'deliver resilient autonomous rollout',
        '--program-max-agent-budget',
        '0'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--program-max-agent-budget must be an integer between 1 and 500.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --program-max-total-sub-specs range in close-loop-program', async () => {
    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-program',
        'deliver resilient autonomous rollout',
        '--program-max-total-sub-specs',
        '0'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--program-max-total-sub-specs must be an integer between 1 and 500000.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --program-govern-max-rounds range in close-loop-program', async () => {
    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-program',
        'deliver resilient autonomous rollout',
        '--program-govern-until-stable',
        '--program-govern-max-rounds',
        '0'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--program-govern-max-rounds must be an integer between 1 and 20.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --program-govern-use-action range in close-loop-program', async () => {
    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-program',
        'deliver resilient autonomous rollout',
        '--program-govern-until-stable',
        '--program-govern-use-action',
        '0'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--program-govern-use-action must be an integer between 1 and 20.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('governance loop replays program with remediation patch until gate is stable', async () => {
    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-govern-r1a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-govern-r1b', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-govern-r2a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-govern-r2b', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-program',
      'deliver resilient autonomous rollout',
      '--program-goals',
      '2',
      '--batch-agent-budget',
      '2',
      '--program-max-agent-budget',
      '1',
      '--program-govern-until-stable',
      '--program-govern-max-rounds',
      '2',
      '--program-govern-max-minutes',
      '10',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(4);
    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.program_gate_effective).toEqual(expect.objectContaining({
      passed: true
    }));
    expect(summary.program_governance).toEqual(expect.objectContaining({
      enabled: true,
      performed_rounds: 1,
      converged: true
    }));
    expect(summary.program_governance.history[0]).toEqual(expect.objectContaining({
      execution_mode: 'program-replay',
      applied_patch: expect.objectContaining({
        batchAgentBudget: 1
      })
    }));
  });

  test('governance loop auto-selects remediation action and applies strategy patch in recover cycle', async () => {
    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '122-12-govern-act-r1a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-govern-act-r1b', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-govern-act-r2a', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-program',
      'deliver resilient autonomous rollout',
      '--program-goals',
      '2',
      '--batch-retry-rounds',
      '0',
      '--no-program-auto-recover',
      '--program-govern-until-stable',
      '--program-govern-use-action',
      '1',
      '--program-govern-max-rounds',
      '2',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(3);
    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.program_governance).toEqual(expect.objectContaining({
      enabled: true,
      action_selection_enabled: true,
      pinned_action_index: 1,
      performed_rounds: 1
    }));
    expect(summary.program_governance.history[0]).toEqual(expect.objectContaining({
      execution_mode: 'recover-cycle',
      selected_action_index: 1,
      selected_action: expect.stringContaining('Resume unresolved goals'),
      applied_patch: expect.objectContaining({
        batchRetryUntilComplete: true
      })
    }));
  });

  test('governance replay can run without action selection when --no-program-govern-auto-action is set', async () => {
    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-govern-noact-r1a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-govern-noact-r1b', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-govern-noact-r2a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-govern-noact-r2b', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-program',
      'deliver resilient autonomous rollout',
      '--program-goals',
      '2',
      '--batch-agent-budget',
      '2',
      '--program-max-agent-budget',
      '1',
      '--program-govern-until-stable',
      '--no-program-govern-auto-action',
      '--program-govern-max-rounds',
      '2',
      '--json'
    ]);

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.program_governance).toEqual(expect.objectContaining({
      enabled: true,
      action_selection_enabled: false,
      performed_rounds: 1
    }));
    expect(summary.program_governance.history[0]).toEqual(expect.objectContaining({
      execution_mode: 'program-replay',
      selected_action_index: null,
      action_selection_source: null
    }));
  });

  test('governance loop reduces concurrency when high rate-limit anomaly is detected', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    await fs.ensureDir(sessionDir);
    const baselineFile = path.join(sessionDir, 'govern-rate-limit-baseline.json');
    await fs.writeJson(baselineFile, {
      mode: 'auto-close-loop-program',
      status: 'completed',
      updated_at: '2026-02-10T10:00:00.000Z',
      total_goals: 2,
      processed_goals: 2,
      failed_goals: 0,
      metrics: {
        success_rate_percent: 100,
        total_sub_specs: 2,
        total_rate_limit_signals: 0,
        total_rate_limit_backoff_ms: 0,
        average_rate_limit_signals_per_goal: 0,
        average_rate_limit_backoff_ms_per_goal: 0
      },
      program_kpi: { completion_rate_percent: 100 },
      program_gate_effective: { passed: true },
      spec_session_budget: { estimated_created: 1 }
    }, { spaces: 2 });
    await fs.utimes(baselineFile, new Date('2026-02-10T10:00:00.000Z'), new Date('2026-02-10T10:00:00.000Z'));

    runAutoCloseLoop.mockImplementation(async () => ({
      status: 'completed',
      portfolio: { master_spec: '122-12-govern-rate-limit', sub_specs: [] },
      orchestration: {
        rateLimit: {
          signalCount: 4,
          totalBackoffMs: 4000,
          lastLaunchHoldMs: 2000
        }
      }
    }));

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-program',
      'deliver resilient autonomous rollout',
      '--program-goals',
      '2',
      '--batch-parallel',
      '3',
      '--batch-agent-budget',
      '3',
      '--program-govern-until-stable',
      '--program-govern-max-rounds',
      '1',
      '--program-govern-anomaly-period',
      'day',
      '--json'
    ]);

    expect(runAutoCloseLoop.mock.calls.length).toBeGreaterThanOrEqual(4);
    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.program_governance).toEqual(expect.objectContaining({
      enabled: true,
      performed_rounds: 1
    }));
    expect(summary.program_governance.history[0]).toEqual(expect.objectContaining({
      trigger: expect.objectContaining({
        anomaly_failed: true
      }),
      applied_patch: expect.objectContaining({
        batchParallel: 2,
        batchAgentBudget: 2
      })
    }));
    expect(summary.program_governance.history[0].patch_reasons.join(' ')).toContain('rate-limit-spike');
  });

  test('validates --dequeue-limit range in close-loop-controller', async () => {
    const queueFile = path.join(tempDir, 'controller-goals.lines');
    await fs.writeFile(queueFile, 'deliver goal one\n', 'utf8');
    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-controller',
        queueFile,
        '--dequeue-limit',
        '0'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--dequeue-limit must be an integer between 1 and 100.');
  });

  test('drains controller queue in one cycle by default and runs close-loop-program autonomously', async () => {
    runAutoCloseLoop
      .mockResolvedValue({ status: 'completed', portfolio: { master_spec: '200-00-controller', sub_specs: [] } });

    const queueFile = path.join(tempDir, 'controller-goals.lines');
    await fs.writeFile(queueFile, 'deliver goal one\ndeliver goal two\n', 'utf8');
    const doneFile = path.join(tempDir, 'controller-done.lines');

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-controller',
      queueFile,
      '--program-goals',
      '2',
      '--max-cycles',
      '1',
      '--controller-done-file',
      doneFile,
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(4);
    const queueAfter = await fs.readFile(queueFile, 'utf8');
    expect(queueAfter.trim()).toBe('');

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary).toEqual(expect.objectContaining({
      mode: 'auto-close-loop-controller',
      status: 'completed',
      dequeue_limit: 'all',
      processed_goals: 2,
      completed_goals: 2,
      failed_goals: 0,
      pending_goals: 0
    }));
    expect(summary.done_archive_file).toBeTruthy();
    expect(await fs.pathExists(doneFile)).toBe(true);
  });

  test('deduplicates duplicate controller goals by default', async () => {
    runAutoCloseLoop
      .mockResolvedValue({ status: 'completed', portfolio: { master_spec: '200-00-controller', sub_specs: [] } });

    const queueFile = path.join(tempDir, 'controller-goals.lines');
    await fs.writeFile(queueFile, 'deliver goal one\ndeliver goal one\n', 'utf8');

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-controller',
      queueFile,
      '--dequeue-limit',
      '10',
      '--max-cycles',
      '1',
      '--json'
    ]);

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary).toEqual(expect.objectContaining({
      mode: 'auto-close-loop-controller',
      processed_goals: 1,
      pending_goals: 0,
      dedupe_enabled: true
    }));
    expect(summary.dedupe_dropped_goals).toBeGreaterThanOrEqual(1);
  });

  test('supports --controller-resume latest to continue queue from persisted controller session', async () => {
    runAutoCloseLoop
      .mockResolvedValue({ status: 'completed', portfolio: { master_spec: '200-00-controller', sub_specs: [] } });

    const queueFile = path.join(tempDir, 'resume-controller-goals.lines');
    await fs.writeFile(queueFile, 'deliver resume goal one\n', 'utf8');
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    await fs.ensureDir(sessionDir);
    const sessionFile = path.join(sessionDir, 'controller-resume.json');
    await fs.writeJson(sessionFile, {
      mode: 'auto-close-loop-controller',
      status: 'partial-failed',
      queue_file: queueFile,
      queue_format: 'lines',
      controller_session: {
        id: 'controller-resume',
        file: sessionFile
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-controller',
      '--controller-resume',
      'latest',
      '--dequeue-limit',
      '1',
      '--max-cycles',
      '1',
      '--json'
    ]);

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary).toEqual(expect.objectContaining({
      mode: 'auto-close-loop-controller',
      processed_goals: 1,
      pending_goals: 0
    }));
    expect(summary.resumed_from_controller_session).toEqual(expect.objectContaining({
      id: 'controller-resume'
    }));
  });

  test('fails close-loop-controller when queue lock is already held', async () => {
    runAutoCloseLoop
      .mockResolvedValue({ status: 'completed', portfolio: { master_spec: '200-00-controller', sub_specs: [] } });

    const queueFile = path.join(tempDir, 'controller-goals.lines');
    await fs.writeFile(queueFile, 'deliver goal one\n', 'utf8');
    await fs.writeJson(`${queueFile}.lock`, {
      token: 'existing-token',
      pid: 12345,
      host: 'test-host',
      acquired_at: new Date().toISOString(),
      touched_at: new Date().toISOString()
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-controller',
        queueFile
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('Controller lock is held');
  });

  test('applies program gate profile defaults when explicit thresholds are omitted', async () => {
    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '122-12-prof-r1', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-prof-r2', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-prof-r3', sub_specs: [] } });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-program',
        'deliver resilient autonomous rollout',
        '--program-goals',
        '2',
        '--batch-retry-rounds',
        '1',
        '--program-gate-profile',
        'prod',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.program_gate).toEqual(expect.objectContaining({
      passed: false,
      policy: expect.objectContaining({
        profile: 'prod',
        max_risk_level: 'low'
      })
    }));
  });

  test('uses fallback gate profile when primary gate fails', async () => {
    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '122-12-fallback-r1', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-fallback-r2', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-fallback-r3', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-program',
      'deliver resilient autonomous rollout',
      '--program-goals',
      '2',
      '--batch-retry-rounds',
      '1',
      '--program-gate-profile',
      'prod',
      '--program-gate-fallback-profile',
      'staging',
      '--json'
    ]);

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.program_gate).toEqual(expect.objectContaining({
      passed: false,
      policy: expect.objectContaining({ profile: 'prod' })
    }));
    expect(summary.program_gate_fallback).toEqual(expect.objectContaining({
      passed: true,
      policy: expect.objectContaining({ profile: 'staging' })
    }));
    expect(summary.program_gate_effective).toEqual(expect.objectContaining({
      passed: true,
      source: 'fallback-chain'
    }));
  });

  test('uses fallback gate chain and accepts later profile when earlier fallback fails', async () => {
    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '122-12-fallback-chain-r1', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-fallback-chain-r2', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-fallback-chain-r3', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-program',
      'deliver resilient autonomous rollout',
      '--program-goals',
      '2',
      '--batch-retry-rounds',
      '1',
      '--program-gate-profile',
      'prod',
      '--program-gate-fallback-chain',
      'prod,staging',
      '--json'
    ]);

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.program_gate_fallbacks).toHaveLength(2);
    expect(summary.program_gate_fallbacks[0].passed).toBe(false);
    expect(summary.program_gate_fallbacks[1].passed).toBe(true);
    expect(summary.program_gate_effective).toEqual(expect.objectContaining({
      passed: true,
      source: 'fallback-chain',
      fallback_profile: 'staging',
      attempted_fallback_count: 2
    }));
  });

  test('auto-recovers close-loop-program to completion without manual recover command', async () => {
    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '122-12-a', sub_specs: ['122-12-a-1'] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-b', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-12-a-fix', sub_specs: ['122-12-a-fix-1'] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-program',
      'deliver autonomous close-loop with master/sub multi-spec execution and quality guardrails',
      '--program-goals',
      '2',
      '--batch-retry-rounds',
      '0',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(3);
    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.mode).toBe('auto-close-loop-program');
    expect(summary.status).toBe('completed');
    expect(summary.failed_goals).toBe(0);
    expect(summary.auto_recovery).toEqual(expect.objectContaining({
      enabled: true,
      triggered: true,
      recover_until_complete: true,
      converged: true
    }));
    expect(summary.program_coordination).toEqual(expect.objectContaining({
      topology: 'master-sub',
      unresolved_goal_count: 0
    }));
  });

  test('emits failure clusters and remediation actions for failed close-loop-program', async () => {
    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '122-13-a', sub_specs: [] } })
      .mockRejectedValueOnce(new Error('orchestration timeout while waiting for agent response'));

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-program',
        'build autonomous close-loop and orchestrate multi-spec program',
        '--program-goals',
        '2',
        '--batch-retry-rounds',
        '0',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.mode).toBe('auto-close-loop-program');
    expect(summary.status).toMatch(/failed/);
    expect(summary.program_diagnostics).toEqual(expect.objectContaining({
      failed_goal_count: 2
    }));
    expect(summary.program_diagnostics.failure_clusters.length).toBeGreaterThan(0);
    expect(summary.program_diagnostics.remediation_actions.length).toBeGreaterThan(0);
    expect(summary.program_diagnostics.remediation_actions[0]).toEqual(expect.objectContaining({
      priority: 'high'
    }));
  });

  test('reuses learned remediation action when --use-action is omitted in close-loop-recover', async () => {
    const summaryFile = path.join(tempDir, 'program-failed-summary.json');
    await fs.writeJson(summaryFile, {
      mode: 'auto-close-loop-program',
      status: 'failed',
      total_goals: 2,
      processed_goals: 2,
      completed_goals: 0,
      failed_goals: 2,
      results: [
        {
          index: 1,
          goal: 'recover goal one',
          status: 'failed',
          error: 'orchestration timeout while waiting for agent response'
        },
        {
          index: 2,
          goal: 'recover goal two',
          status: 'error',
          error: 'agent timed out before completion'
        }
      ]
    }, { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-13-a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-13-b', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-13-a-r2', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-13-b-r2', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-recover',
      summaryFile,
      '--use-action',
      '2',
      '--recovery-memory-scope',
      'sce-scope-a',
      '--dry-run',
      '--json'
    ]);

    logSpy.mockClear();

    const secondProgram = buildProgram();
    await secondProgram.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-recover',
      summaryFile,
      '--recovery-memory-scope',
      'sce-scope-a',
      '--dry-run',
      '--json'
    ]);

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.recovered_from_summary).toEqual(expect.objectContaining({
      selected_action_index: 2
    }));
    expect(summary.recovery_plan).toEqual(expect.objectContaining({
      selection_source: 'memory'
    }));
    expect(summary.recovery_plan.selection_explain).toEqual(expect.objectContaining({
      mode: 'memory'
    }));
    expect(summary.recovery_memory).toEqual(expect.objectContaining({
      scope: 'sce-scope-a',
      selection_source: 'memory',
      selected_action_index: 2
    }));
  });

  test('recovers from summary with selected remediation action via close-loop-recover', async () => {
    const summaryFile = path.join(tempDir, 'program-failed-summary.json');
    await fs.writeJson(summaryFile, {
      mode: 'auto-close-loop-program',
      status: 'failed',
      total_goals: 2,
      processed_goals: 2,
      completed_goals: 0,
      failed_goals: 2,
      results: [
        {
          index: 1,
          goal: 'recover goal one',
          status: 'failed',
          error: 'orchestration timeout while waiting for agent response'
        },
        {
          index: 2,
          goal: 'recover goal two',
          status: 'error',
          error: 'agent timed out before completion'
        }
      ]
    }, { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-14-a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-14-b', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-recover',
      summaryFile,
      '--use-action',
      '2',
      '--dry-run',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(2);
    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.mode).toBe('auto-close-loop-recover');
    expect(summary.recovered_from_summary).toEqual(expect.objectContaining({
      file: summaryFile,
      selected_action_index: 2
    }));
    expect(summary.recovery_plan).toEqual(expect.objectContaining({
      applied_patch: expect.objectContaining({
        batchParallel: 2,
        batchAgentBudget: 2
      })
    }));
    expect(summary.resource_plan).toEqual(expect.objectContaining({
      agent_budget: 2
    }));
    expect(summary.recovery_cycle).toEqual(expect.objectContaining({
      enabled: false,
      performed_rounds: 1,
      converged: true
    }));
  });

  test('applies program gate budget policy in close-loop-recover', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    const summaryFile = path.join(tempDir, 'summary-for-recover-gate.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });
    await fs.writeJson(summaryFile, {
      mode: 'auto-close-loop-program',
      status: 'failed',
      goals_file: goalsFile,
      total_goals: 1,
      processed_goals: 1,
      failed_goals: 1,
      results: [
        {
          index: 1,
          goal: 'goal one',
          status: 'failed',
          master_spec: '121-00-a',
          sub_spec_count: 0
        }
      ],
      program_diagnostics: {
        remediation_actions: []
      }
    }, { spaces: 2 });

    runAutoCloseLoop.mockResolvedValueOnce({
      status: 'completed',
      portfolio: { master_spec: '122-00-fixed', sub_specs: [] }
    });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-recover',
        summaryFile,
        '--batch-agent-budget',
        '2',
        '--program-max-agent-budget',
        '1',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.mode).toBe('auto-close-loop-recover');
    expect(summary.program_gate).toEqual(expect.objectContaining({
      passed: false,
      policy: expect.objectContaining({
        max_agent_budget: 1
      }),
      actual: expect.objectContaining({
        agent_budget: 2
      })
    }));
  });

  test('runs multi-round close-loop-recover until completion', async () => {
    const summaryFile = path.join(tempDir, 'program-failed-summary.json');
    await fs.writeJson(summaryFile, {
      mode: 'auto-close-loop-program',
      status: 'failed',
      total_goals: 2,
      processed_goals: 2,
      completed_goals: 0,
      failed_goals: 2,
      results: [
        {
          index: 1,
          goal: 'recover goal one',
          status: 'failed',
          error: 'orchestration timeout while waiting for agent response'
        },
        {
          index: 2,
          goal: 'recover goal two',
          status: 'error',
          error: 'agent timed out before completion'
        }
      ]
    }, { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '122-15-a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-15-b', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-15-a-fix', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-recover',
      summaryFile,
      '--use-action',
      '2',
      '--recover-until-complete',
      '--recover-max-rounds',
      '3',
      '--batch-retry-rounds',
      '0',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(3);
    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.mode).toBe('auto-close-loop-recover');
    expect(summary.status).toBe('completed');
    expect(summary.recovery_cycle).toEqual(expect.objectContaining({
      enabled: true,
      max_rounds: 3,
      performed_rounds: 2,
      converged: true,
      exhausted: false
    }));
    expect(summary.recovery_cycle.history).toHaveLength(2);
  });

  test('validates --use-action range in close-loop-recover', async () => {
    const summaryFile = path.join(tempDir, 'program-failed-summary.json');
    await fs.writeJson(summaryFile, {
      mode: 'auto-close-loop-program',
      status: 'failed',
      total_goals: 1,
      processed_goals: 1,
      completed_goals: 0,
      failed_goals: 1,
      results: [
        {
          index: 1,
          goal: 'recover goal one',
          status: 'failed',
          error: 'orchestration timeout while waiting for agent response'
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-recover',
        summaryFile,
        '--use-action',
        '9',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    expect(runAutoCloseLoop).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.error).toContain('--use-action 9 is out of range.');
  });

  test('rejects --recover-max-rounds without --recover-until-complete in close-loop-recover', async () => {
    const summaryFile = path.join(tempDir, 'program-failed-summary.json');
    await fs.writeJson(summaryFile, {
      mode: 'auto-close-loop-program',
      status: 'failed',
      total_goals: 1,
      processed_goals: 1,
      completed_goals: 0,
      failed_goals: 1,
      results: [
        {
          index: 1,
          goal: 'recover goal one',
          status: 'failed',
          error: 'orchestration timeout while waiting for agent response'
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-recover',
        summaryFile,
        '--recover-max-rounds',
        '2',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    expect(runAutoCloseLoop).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.error).toContain('--recover-max-rounds requires --recover-until-complete.');
  });

  test('validates --recover-max-minutes range in close-loop-recover', async () => {
    const summaryFile = path.join(tempDir, 'program-failed-summary.json');
    await fs.writeJson(summaryFile, {
      mode: 'auto-close-loop-program',
      status: 'failed',
      total_goals: 1,
      processed_goals: 1,
      completed_goals: 0,
      failed_goals: 1,
      results: [
        {
          index: 1,
          goal: 'recover goal one',
          status: 'failed',
          error: 'orchestration timeout while waiting for agent response'
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-recover',
        summaryFile,
        '--recover-max-minutes',
        '0',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.error).toContain('--recover-max-minutes must be an integer between 1 and 10080.');
  });

  test('fails close-loop-batch when goals file is missing', async () => {
    const program = buildProgram();

    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        'missing-goals.json'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('Goals file not found');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('requires goals file when --resume-from-summary is not provided', async () => {
    const program = buildProgram();

    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('<goals-file> is required unless --resume-from-summary or --decompose-goal is provided.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('runs close-loop-batch from --decompose-goal without goals file', async () => {
    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-b', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-c', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      '--decompose-goal',
      'build autonomous close-loop, master/sub decomposition, orchestration, and quality gate rollout for sce',
      '--program-goals',
      '3',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(3);
    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.total_goals).toBe(3);
    expect(summary.generated_from_goal).toEqual(expect.objectContaining({
      strategy: 'semantic-clause-and-category',
      target_goal_count: 3,
      produced_goal_count: 3
    }));
  });

  test('auto-refines decomposed goals when quality score threshold is not met', async () => {
    runAutoCloseLoop.mockResolvedValue({
      status: 'planned',
      portfolio: { master_spec: '122-00-refine', sub_specs: [] }
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      '--decompose-goal',
      'orchestration, quality, docs',
      '--program-goals',
      '12',
      '--program-min-quality-score',
      '99',
      '--dry-run',
      '--json'
    ]);

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.generated_from_goal.quality.refinement).toEqual(expect.objectContaining({
      attempted: true,
      min_score: 99
    }));
  });

  test('fails decomposition quality gate when score remains below threshold', async () => {
    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        '--decompose-goal',
        'orchestration, quality, docs',
        '--program-goals',
        '12',
        '--program-min-quality-score',
        '99',
        '--program-quality-gate',
        '--dry-run',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(output).toContain('Decomposition quality score');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('rejects mixing goals file with --decompose-goal', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--decompose-goal',
        'split this into multiple goals'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('Provide either <goals-file> or --decompose-goal, not both.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('rejects mixing --resume-from-summary with --decompose-goal', async () => {
    const summaryFile = path.join(tempDir, 'summary.json');
    await fs.writeJson(summaryFile, { mode: 'auto-close-loop-batch', results: [] }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        '--resume-from-summary',
        summaryFile,
        '--decompose-goal',
        'split this into multiple goals'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('Provide either --resume-from-summary or --decompose-goal, not both.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('rejects --program-goals without --decompose-goal', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--program-goals',
        '4'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--program-goals requires --decompose-goal.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --program-goals range in close-loop-batch', async () => {
    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        '--decompose-goal',
        'split this into multiple goals',
        '--program-goals',
        '1'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--program-goals must be an integer between 2 and 12.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('rejects using goals file and --resume-from-summary together', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    const summaryFile = path.join(tempDir, 'summary.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });
    await fs.writeJson(summaryFile, { mode: 'auto-close-loop-batch', results: [] }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--resume-from-summary',
        summaryFile
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('Provide either <goals-file> or --resume-from-summary, not both.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --resume-strategy when resuming from summary', async () => {
    const summaryFile = path.join(tempDir, 'summary.json');
    await fs.writeJson(summaryFile, { mode: 'auto-close-loop-batch', results: [] }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        '--resume-from-summary',
        summaryFile,
        '--resume-strategy',
        'random-mode'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--resume-strategy must be one of: pending, failed-only');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --batch-parallel range in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--batch-parallel',
        '0'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--batch-parallel must be an integer between 1 and 20.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --batch-agent-budget range in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--batch-agent-budget',
        '0'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--batch-agent-budget must be an integer between 1 and 500.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --batch-priority strategy in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--batch-priority',
        'random-order'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--batch-priority must be one of: fifo, complex-first, complex-last, critical-first.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --batch-aging-factor range in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--batch-aging-factor',
        '-1'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--batch-aging-factor must be an integer between 0 and 100.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --batch-retry-rounds range in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--batch-retry-rounds',
        '6'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--batch-retry-rounds must be an integer between 0 and 5.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --batch-retry-strategy in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--batch-retry-strategy',
        'random'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--batch-retry-strategy must be one of: adaptive, strict.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('allows --batch-retry-max-rounds under default autonomous policy', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });
    runAutoCloseLoop.mockResolvedValueOnce({
      status: 'completed',
      portfolio: { master_spec: '122-00-a', sub_specs: [] }
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--batch-retry-max-rounds',
      '3',
      '--json'
    ]);

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.batch_retry).toEqual(expect.objectContaining({
      until_complete: true,
      max_rounds: 3
    }));
  });

  test('validates --batch-retry-max-rounds range in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--batch-retry-until-complete',
        '--batch-retry-max-rounds',
        '0'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--batch-retry-max-rounds must be an integer between 1 and 20.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --batch-session-keep range in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--batch-session-keep',
        '-1'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--batch-session-keep must be an integer between 0 and 1000.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('enables autonomous batch closed-loop policy by default', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, {
      goals: ['goal one', 'goal two', 'goal three']
    }, { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-a', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-b', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-c', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(3);
    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.autonomous_policy).toEqual(expect.objectContaining({
      enabled: true,
      profile: 'closed-loop'
    }));
    expect(summary.batch_parallel).toBe(3);
    expect(summary.resource_plan).toEqual(expect.objectContaining({
      scheduling_strategy: 'complex-first',
      aging_factor: 2
    }));
    expect(summary.batch_retry).toEqual(expect.objectContaining({
      enabled: true,
      until_complete: true,
      configured_rounds: 0,
      max_rounds: 10
    }));
  });

  test('allows --batch-retry-max-rounds with default autonomous policy', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });
    runAutoCloseLoop.mockResolvedValueOnce({
      status: 'completed',
      portfolio: { master_spec: '122-00-a', sub_specs: [] }
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--batch-retry-max-rounds',
      '3',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.batch_retry).toEqual(expect.objectContaining({
      until_complete: true,
      max_rounds: 3
    }));
  });

  test('validates --batch-session-older-than-days range in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--batch-session-older-than-days',
        '-1'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--batch-session-older-than-days must be an integer between 0 and 36500.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --spec-session-keep range in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--spec-session-keep',
        '-1'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--keep must be an integer between 0 and 5000.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --spec-session-protect-window-days range in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--spec-session-protect-window-days',
        '-1'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--spec-session-protect-window-days must be an integer between 0 and 36500.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --spec-session-max-total range in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--spec-session-max-total',
        '0'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--spec-session-max-total must be an integer between 1 and 500000.');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('fails close-loop-batch when duplicate goal guard exceeds configured threshold', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['same goal', 'same goal'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--spec-session-max-duplicate-goals',
        '0',
        '--spec-session-budget-hard-fail',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Goal input duplicate guard exceeded');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('validates --spec-session-max-created range in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--spec-session-max-created',
        '-1'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--spec-session-max-created must be an integer between 0 and 500000.');
  });

  test('validates --spec-session-max-created-per-goal range in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--spec-session-max-created-per-goal',
        '-1'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--spec-session-max-created-per-goal must be a number between 0 and 1000.');
  });

  test('validates --spec-session-max-duplicate-goals range in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--spec-session-max-duplicate-goals',
        '-1'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--spec-session-max-duplicate-goals must be an integer between 0 and 500000.');
  });

  test('prioritizes complex goals first with --batch-priority complex-first', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    const complexGoal = [
      'deliver orchestration integration migration observability and security resilience,',
      'plus quality compliance governance and performance hardening,',
      'with closed-loop remediation and parallel master sub coordination.'
    ].join(' ');
    await fs.writeJson(goalsFile, {
      goals: ['simple goal', complexGoal]
    }, { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-complex', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-simple', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--batch-priority',
      'complex-first',
      '--batch-parallel',
      '1',
      '--continue-on-error',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(2);
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(1, complexGoal, expect.any(Object));
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(2, 'simple goal', expect.any(Object));
  });

  test('prioritizes critical goals first with --batch-priority critical-first', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    const criticalGoal = 'build core platform schema baseline and dependency contracts for master orchestration';
    await fs.writeJson(goalsFile, {
      goals: ['polish release notes and docs wording', criticalGoal]
    }, { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-critical', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-non-critical', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--batch-priority',
      'critical-first',
      '--batch-parallel',
      '1',
      '--continue-on-error',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(2);
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(1, criticalGoal, expect.any(Object));
    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.resource_plan).toEqual(expect.objectContaining({
      scheduling_strategy: 'critical-first'
    }));
  });

  test('reports priority and aging metadata in batch resource plan', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    const heavyGoalOne = [
      'deliver orchestration integration migration observability and security resilience,',
      'plus quality compliance governance and performance hardening,',
      'with closed-loop remediation and parallel master sub coordination.'
    ].join(' ');
    const heavyGoalTwo = [
      'build autonomous governance compliance and resilience hardening across orchestration,',
      'with integrated observability dashboards and quality gate automation,',
      'plus closed-loop remediation and dependency-aware parallel execution.'
    ].join(' ');
    await fs.writeJson(goalsFile, {
      goals: [heavyGoalOne, heavyGoalTwo, 'simple goal']
    }, { spaces: 2 });

    runAutoCloseLoop.mockImplementation(async goal => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return {
        status: 'completed',
        portfolio: {
          master_spec: `master-${goal.slice(0, 12).replace(/\s+/g, '-')}`,
          sub_specs: []
        }
      };
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--batch-priority',
      'complex-first',
      '--batch-aging-factor',
      '3',
      '--batch-parallel',
      '3',
      '--batch-agent-budget',
      '5',
      '--continue-on-error',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const summary = JSON.parse(output.trim());
    expect(summary.resource_plan).toEqual(expect.objectContaining({
      scheduling_strategy: 'complex-first',
      aging_factor: 3
    }));
    expect(summary.resource_plan.max_wait_ticks).toBeGreaterThanOrEqual(1);
    expect(summary.resource_plan.starvation_wait_events).toBeGreaterThanOrEqual(1);
    expect(summary.results.some(item => item.wait_ticks > 0)).toBe(true);
    expect(summary.results.every(item => Number.isFinite(item.base_priority))).toBe(true);
  });

  test('continues after failed goals by default in close-loop-batch', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['first failed goal', 'second should still run'], { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '121-00-fail', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-pass', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '121-00-fail-r2', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--batch-parallel',
      '1',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(3);
    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.completed_goals).toBe(2);
    expect(summary.failed_goals).toBe(0);
    expect(summary.status).toBe('completed');
    expect(summary.batch_retry).toEqual(expect.objectContaining({
      until_complete: true,
      performed_rounds: 1
    }));
  });

  test('continues on error in close-loop-batch when retry-until-complete is disabled', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['first throws', 'second still runs'], { spaces: 2 });

    runAutoCloseLoop
      .mockRejectedValueOnce(new Error('runner exploded'))
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '122-00-pass', sub_specs: [] } });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--batch-retry-rounds',
        '0',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(2);
    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.processed_goals).toBe(2);
    expect(summary.completed_goals).toBe(1);
    expect(summary.failed_goals).toBe(1);
    expect(summary.stopped_early).toBe(false);
    expect(summary.status).toBe('partial-failed');
  });

  test('auto-retries failed goals in close-loop-batch with --batch-retry-rounds', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['first flaky goal', 'second stable goal'], { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '121-00-flaky', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '121-00-stable', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '121-00-flaky-fixed', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--continue-on-error',
      '--batch-retry-rounds',
      '1',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(3);
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(1, 'first flaky goal', expect.any(Object));
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(2, 'second stable goal', expect.any(Object));
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(3, 'first flaky goal', expect.any(Object));

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.status).toBe('completed');
    expect(summary.failed_goals).toBe(0);
    expect(summary.batch_retry).toEqual(expect.objectContaining({
      enabled: true,
      configured_rounds: 1,
      performed_rounds: 1,
      exhausted: false
    }));
    expect(summary.results).toHaveLength(2);
    expect(summary.results[0].status).toBe('completed');
    expect(summary.results[0].batch_attempt).toBe(2);
    expect(summary.results[1].status).toBe('completed');
    expect(summary.results[1].batch_attempt).toBe(1);
  });

  test('adaptive retry applies rate-limit backpressure for next round', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['first rate-limited goal', 'second stable goal'], { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({
        status: 'failed',
        portfolio: { master_spec: '121-00-rate-limit-r1', sub_specs: [] },
        orchestration: {
          rateLimit: {
            signalCount: 2,
            totalBackoffMs: 1800,
            lastLaunchHoldMs: 900
          }
        }
      })
      .mockResolvedValueOnce({
        status: 'completed',
        portfolio: { master_spec: '121-00-stable-r1', sub_specs: [] }
      })
      .mockResolvedValueOnce({
        status: 'completed',
        portfolio: { master_spec: '121-00-rate-limit-r2-fixed', sub_specs: [] }
      });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--continue-on-error',
      '--batch-parallel',
      '3',
      '--batch-agent-budget',
      '3',
      '--batch-retry-rounds',
      '1',
      '--batch-retry-strategy',
      'adaptive',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(3);
    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.batch_retry).toEqual(expect.objectContaining({
      strategy: 'adaptive',
      performed_rounds: 1
    }));
    expect(summary.batch_retry.history[0]).toEqual(expect.objectContaining({
      round: 1,
      applied_batch_parallel: 3,
      applied_batch_agent_budget: 3,
      rate_limit_signals: 2,
      rate_limit_signals_per_goal: 1,
      rate_limit_backoff_ms: 1800,
      rate_limit_launch_hold_ms: 900,
      adaptive_backpressure_applied: true,
      backpressure_level: 'mild',
      next_batch_parallel: 2,
      next_batch_agent_budget: 2
    }));
    expect(summary.batch_retry.history[1]).toEqual(expect.objectContaining({
      round: 2,
      applied_batch_parallel: 2,
      applied_batch_agent_budget: 2
    }));
  });

  test('adaptive retry applies severe backpressure under sustained rate-limit pressure', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['high pressure goal', 'stable goal'], { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({
        status: 'failed',
        portfolio: { master_spec: '121-00-high-pressure-r1', sub_specs: [] },
        orchestration: {
          rateLimit: {
            signalCount: 6,
            totalBackoffMs: 12000,
            lastLaunchHoldMs: 6000
          }
        }
      })
      .mockResolvedValueOnce({
        status: 'completed',
        portfolio: { master_spec: '121-00-stable-r1', sub_specs: [] }
      })
      .mockResolvedValueOnce({
        status: 'completed',
        portfolio: { master_spec: '121-00-high-pressure-r2-fixed', sub_specs: [] }
      });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--continue-on-error',
      '--batch-parallel',
      '4',
      '--batch-agent-budget',
      '8',
      '--batch-retry-rounds',
      '1',
      '--batch-retry-strategy',
      'adaptive',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(3);
    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.batch_retry).toEqual(expect.objectContaining({
      strategy: 'adaptive',
      performed_rounds: 1
    }));
    expect(summary.batch_retry.history[0]).toEqual(expect.objectContaining({
      round: 1,
      applied_batch_parallel: 4,
      applied_batch_agent_budget: 8,
      rate_limit_signals: 6,
      rate_limit_signals_per_goal: 3,
      rate_limit_backoff_ms: 12000,
      rate_limit_launch_hold_ms: 6000,
      adaptive_backpressure_applied: true,
      backpressure_level: 'severe',
      next_batch_parallel: 2,
      next_batch_agent_budget: 4
    }));
    expect(summary.batch_retry.history[1]).toEqual(expect.objectContaining({
      round: 2,
      applied_batch_parallel: 2,
      applied_batch_agent_budget: 4
    }));
  });

  test('uses adaptive retry strategy to drain failed goals while keeping default continue-on-error', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['first flaky goal', 'second stable goal'], { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '121-00-fail-r1', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '121-00-pass-r1', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '121-00-fail-r2-fixed', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--batch-retry-rounds',
      '1',
      '--batch-retry-strategy',
      'adaptive',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(3);
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(1, 'first flaky goal', expect.any(Object));
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(2, 'second stable goal', expect.any(Object));
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(3, 'first flaky goal', expect.any(Object));

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.status).toBe('completed');
    expect(summary.batch_retry).toEqual(expect.objectContaining({
      strategy: 'adaptive',
      configured_rounds: 1,
      performed_rounds: 1
    }));
    expect(summary.batch_retry.history[1]).toEqual(expect.objectContaining({
      round: 2,
      continue_on_error: true
    }));
    expect(summary.results[1].status).toBe('completed');
    expect(summary.results[1].batch_attempt).toBe(1);
  });

  test('uses strict retry strategy and keeps default continue-on-error behavior across retry rounds', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['first always fails', 'second also fails'], { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '121-00-fail-r1', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '121-00-fail-r1b', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '121-00-fail-r2', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '121-00-fail-r2b', sub_specs: [] } });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--batch-retry-rounds',
        '1',
        '--batch-retry-strategy',
        'strict',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(4);
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(1, 'first always fails', expect.any(Object));
    expect(runAutoCloseLoop).toHaveBeenNthCalledWith(2, 'second also fails', expect.any(Object));

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.status).toBe('failed');
    expect(summary.batch_retry).toEqual(expect.objectContaining({
      strategy: 'strict',
      configured_rounds: 1,
      performed_rounds: 1,
      exhausted: true
    }));
    expect(summary.batch_retry.history[1]).toEqual(expect.objectContaining({
      round: 2,
      continue_on_error: true
    }));
    expect(summary.results[1].status).toBe('failed');
  });

  test('supports --batch-retry-until-complete without explicit retry rounds', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['single flaky goal'], { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '121-00-fail-r1', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'failed', portfolio: { master_spec: '121-00-fail-r2', sub_specs: [] } })
      .mockResolvedValueOnce({ status: 'completed', portfolio: { master_spec: '121-00-pass-r3', sub_specs: [] } });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--batch-retry-until-complete',
      '--batch-retry-max-rounds',
      '3',
      '--json'
    ]);

    expect(runAutoCloseLoop).toHaveBeenCalledTimes(3);
    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.status).toBe('completed');
    expect(summary.batch_retry).toEqual(expect.objectContaining({
      until_complete: true,
      configured_rounds: 0,
      max_rounds: 3,
      performed_rounds: 2,
      exhausted: false
    }));
    expect(summary.results[0].status).toBe('completed');
    expect(summary.results[0].batch_attempt).toBe(3);
  });

  test('emits rate-limit recovery recommendation when retry budget is exhausted under 429 pressure', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['always rate-limited goal'], { spaces: 2 });

    runAutoCloseLoop
      .mockResolvedValueOnce({
        status: 'failed',
        portfolio: { master_spec: '121-00-rate-limit-r1', sub_specs: [] },
        orchestration: {
          rateLimit: {
            signalCount: 4,
            totalBackoffMs: 6000,
            lastLaunchHoldMs: 3000
          }
        }
      })
      .mockResolvedValueOnce({
        status: 'failed',
        portfolio: { master_spec: '121-00-rate-limit-r2', sub_specs: [] },
        orchestration: {
          rateLimit: {
            signalCount: 3,
            totalBackoffMs: 4000,
            lastLaunchHoldMs: 2000
          }
        }
      });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--batch-parallel',
        '3',
        '--batch-agent-budget',
        '4',
        '--batch-retry-rounds',
        '1',
        '--batch-retry-strategy',
        'adaptive',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const summary = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(summary.status).toBe('failed');
    expect(summary.batch_retry).toEqual(expect.objectContaining({
      exhausted: true,
      rate_limit_pressure_detected: true,
      total_rate_limit_signals: 7,
      total_rate_limit_backoff_ms: 10000,
      total_rate_limit_launch_hold_ms: 5000,
      recovery_recommended: true
    }));
    expect(summary.batch_retry.recovery_patch).toEqual(expect.objectContaining({
      batch_parallel: 2,
      batch_agent_budget: 2,
      batch_retry_until_complete: true,
      batch_retry_strategy: 'adaptive'
    }));
    expect(summary.batch_retry.recovery_suggested_command).toContain('--batch-parallel 2');
    expect(summary.batch_retry.recovery_suggested_command).toContain('--batch-agent-budget 2');
    expect(summary.batch_retry.recovery_suggested_command).toContain('--batch-retry-until-complete');
  });

  test('lists close-loop sessions in json mode', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    await fs.ensureDir(sessionDir);
    const sessionPath = path.join(sessionDir, 'demo-session.json');
    await fs.writeJson(sessionPath, {
      session_id: 'demo-session',
      updated_at: '2026-02-14T10:00:00.000Z',
      status: 'completed',
      goal: 'demo goal',
      portfolio: {
        master_spec: '121-00-demo',
        sub_specs: ['121-01-a', '121-02-b']
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'session', 'list', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-session-list');
    expect(parsed.total).toBe(1);
    expect(parsed.status_filter).toEqual([]);
    expect(parsed.status_counts).toEqual(expect.objectContaining({ completed: 1 }));
    expect(parsed.sessions[0].id).toBe('demo-session');
    expect(parsed.sessions[0].master_spec).toBe('121-00-demo');
  });

  test('filters close-loop sessions by status in json mode', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    await fs.ensureDir(sessionDir);
    const completedSession = path.join(sessionDir, 'session-completed.json');
    const failedSession = path.join(sessionDir, 'session-failed.json');
    await fs.writeJson(completedSession, {
      session_id: 'session-completed',
      status: 'completed',
      portfolio: { sub_specs: [] }
    }, { spaces: 2 });
    await fs.writeJson(failedSession, {
      session_id: 'session-failed',
      status: 'failed',
      portfolio: { sub_specs: [] }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'session', 'list', '--status', 'completed', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-session-list');
    expect(parsed.total).toBe(1);
    expect(parsed.status_filter).toEqual(['completed']);
    expect(parsed.status_counts).toEqual(expect.objectContaining({ completed: 1 }));
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[0].id).toBe('session-completed');
  });

  test('aggregates close-loop session stats in json mode', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    await fs.ensureDir(sessionDir);
    const completedSession = path.join(sessionDir, 'session-stats-completed.json');
    const failedSession = path.join(sessionDir, 'session-stats-failed.json');
    await fs.writeJson(completedSession, {
      session_id: 'session-stats-completed',
      status: 'completed',
      goal: 'completed goal',
      portfolio: {
        master_spec: '121-00-completed',
        sub_specs: ['121-01-a', '121-02-b']
      }
    }, { spaces: 2 });
    await fs.writeJson(failedSession, {
      session_id: 'session-stats-failed',
      status: 'failed',
      goal: 'failed goal',
      portfolio: {
        master_spec: '121-00-failed',
        sub_specs: ['121-03-c']
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'session', 'stats', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-session-stats');
    expect(parsed.total_sessions).toBe(2);
    expect(parsed.completed_sessions).toBe(1);
    expect(parsed.failed_sessions).toBe(1);
    expect(parsed.completion_rate_percent).toBe(50);
    expect(parsed.failure_rate_percent).toBe(50);
    expect(parsed.sub_spec_count_sum).toBe(3);
    expect(parsed.unique_master_spec_count).toBe(2);
    expect(parsed.status_counts).toEqual(expect.objectContaining({
      completed: 1,
      failed: 1
    }));
    expect(parsed.master_spec_counts).toEqual(expect.objectContaining({
      '121-00-completed': 1,
      '121-00-failed': 1
    }));
    expect(Array.isArray(parsed.latest_sessions)).toBe(true);
    expect(parsed.latest_sessions.length).toBe(2);
  });

  test('filters close-loop session stats by days and status', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    await fs.ensureDir(sessionDir);
    const oldSession = path.join(sessionDir, 'session-stats-old.json');
    const freshSession = path.join(sessionDir, 'session-stats-fresh.json');
    await fs.writeJson(oldSession, {
      session_id: 'session-stats-old',
      status: 'completed',
      portfolio: { master_spec: '121-00-old', sub_specs: [] }
    }, { spaces: 2 });
    await fs.writeJson(freshSession, {
      session_id: 'session-stats-fresh',
      status: 'completed',
      portfolio: { master_spec: '121-00-fresh', sub_specs: ['121-01-a'] }
    }, { spaces: 2 });
    await fs.utimes(oldSession, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));
    const now = new Date();
    await fs.utimes(freshSession, now, now);

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'session',
      'stats',
      '--days',
      '30',
      '--status',
      'completed',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-session-stats');
    expect(parsed.criteria.days).toBe(30);
    expect(parsed.criteria.status_filter).toEqual(['completed']);
    expect(parsed.total_sessions).toBe(1);
    expect(parsed.sub_spec_count_sum).toBe(1);
    expect(parsed.latest_sessions[0].id).toBe('session-stats-fresh');
  });

  test('lists spec-session directories in json mode', async () => {
    const specsDir = path.join(tempDir, '.sce', 'specs');
    const specA = path.join(specsDir, '121-00-demo-a');
    const specB = path.join(specsDir, '121-01-demo-b');
    await fs.ensureDir(specA);
    await fs.ensureDir(specB);
    await fs.utimes(specA, new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-01T00:00:00.000Z'));
    await fs.utimes(specB, new Date('2026-01-02T00:00:00.000Z'), new Date('2026-01-02T00:00:00.000Z'));

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'spec-session', 'list', '--limit', '1', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-spec-session-list');
    expect(parsed.total).toBe(2);
    expect(parsed.specs).toHaveLength(1);
    expect(parsed.specs[0].id).toBe('121-01-demo-b');
  });

  test('prunes spec-session directories with keep policy', async () => {
    const specsDir = path.join(tempDir, '.sce', 'specs');
    const oldSpec = path.join(specsDir, '121-00-old-spec');
    const newSpec = path.join(specsDir, '122-00-new-spec');
    await fs.ensureDir(oldSpec);
    await fs.ensureDir(newSpec);
    await fs.utimes(oldSpec, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));
    await fs.utimes(newSpec, new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-01T00:00:00.000Z'));

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'spec-session', 'prune', '--keep', '1', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-spec-session-prune');
    expect(parsed.deleted_count).toBe(1);
    expect(await fs.pathExists(newSpec)).toBe(true);
    expect(await fs.pathExists(oldSpec)).toBe(false);
  });

  test('protects active spec-session directories by default', async () => {
    const specsDir = path.join(tempDir, '.sce', 'specs');
    const activeSpec = path.join(specsDir, '121-00-active');
    const staleSpec = path.join(specsDir, '121-01-stale');
    await fs.ensureDir(activeSpec);
    await fs.ensureDir(staleSpec);
    await fs.writeJson(path.join(activeSpec, 'collaboration.json'), {
      status: 'in-progress'
    }, { spaces: 2 });
    await fs.utimes(activeSpec, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));
    await fs.utimes(staleSpec, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'spec-session',
      'prune',
      '--keep',
      '0',
      '--older-than-days',
      '1',
      '--json'
    ]);

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.mode).toBe('auto-spec-session-prune');
    expect(parsed.protect_active).toBe(true);
    expect(parsed.protected_count).toBeGreaterThanOrEqual(1);
    expect(parsed.deleted_count).toBe(1);
    expect(await fs.pathExists(activeSpec)).toBe(true);
    expect(await fs.pathExists(staleSpec)).toBe(false);
  });

  test('allows pruning active specs with --no-protect-active', async () => {
    const specsDir = path.join(tempDir, '.sce', 'specs');
    const activeSpec = path.join(specsDir, '121-00-active');
    await fs.ensureDir(activeSpec);
    await fs.writeJson(path.join(activeSpec, 'collaboration.json'), {
      status: 'in-progress'
    }, { spaces: 2 });
    await fs.utimes(activeSpec, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'spec-session',
      'prune',
      '--keep',
      '0',
      '--older-than-days',
      '1',
      '--no-protect-active',
      '--json'
    ]);

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.mode).toBe('auto-spec-session-prune');
    expect(parsed.protect_active).toBe(false);
    expect(parsed.protected_count).toBe(0);
    expect(parsed.deleted_count).toBe(1);
    expect(await fs.pathExists(activeSpec)).toBe(false);
  });

  test('supports custom protection window in spec-session prune output', async () => {
    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'spec-session',
      'prune',
      '--protect-window-days',
      '0',
      '--dry-run',
      '--json'
    ]);

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.mode).toBe('auto-spec-session-prune');
    expect(parsed.protect_window_days).toBe(0);
  });

  test('includes protection ranking top in spec-session prune output', async () => {
    const specsDir = path.join(tempDir, '.sce', 'specs');
    const activeSpec = path.join(specsDir, '121-00-active');
    const staleSpec = path.join(specsDir, '121-01-stale');
    await fs.ensureDir(activeSpec);
    await fs.ensureDir(staleSpec);
    await fs.writeJson(path.join(activeSpec, 'collaboration.json'), {
      status: 'in-progress'
    }, { spaces: 2 });
    await fs.utimes(activeSpec, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));
    await fs.utimes(staleSpec, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'spec-session',
      'prune',
      '--keep',
      '0',
      '--older-than-days',
      '1',
      '--json'
    ]);

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.mode).toBe('auto-spec-session-prune');
    expect(Array.isArray(parsed.protection_ranking_top)).toBe(true);
    expect(parsed.protection_ranking_top).toEqual(expect.arrayContaining([
      expect.objectContaining({
        spec: '121-00-active',
        total_references: 1
      })
    ]));
    expect(parsed.protection_ranking).toBeUndefined();
    expect(parsed.protected_specs[0].reasons).toBeUndefined();
  });

  test('shows detailed protection reasons when requested in spec-session prune', async () => {
    const specsDir = path.join(tempDir, '.sce', 'specs');
    const activeSpec = path.join(specsDir, '121-00-active');
    const staleSpec = path.join(specsDir, '121-01-stale');
    await fs.ensureDir(activeSpec);
    await fs.ensureDir(staleSpec);
    await fs.writeJson(path.join(activeSpec, 'collaboration.json'), {
      status: 'in-progress'
    }, { spaces: 2 });
    await fs.utimes(activeSpec, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));
    await fs.utimes(staleSpec, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'spec-session',
      'prune',
      '--keep',
      '0',
      '--older-than-days',
      '1',
      '--show-protection-reasons',
      '--json'
    ]);

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.mode).toBe('auto-spec-session-prune');
    expect(parsed.protected_specs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: '121-00-active',
        reasons: expect.objectContaining({
          total_references: 1,
          collaboration_active: 1
        })
      })
    ]));
    expect(parsed.protection_ranking).toEqual(expect.arrayContaining([
      expect.objectContaining({
        spec: '121-00-active',
        total_references: 1,
        reasons: expect.objectContaining({
          collaboration_active: 1
        })
      })
    ]));
  });

  test('protects specs referenced by controller sessions during spec-session prune', async () => {
    const specsDir = path.join(tempDir, '.sce', 'specs');
    const activeSpec = path.join(specsDir, '121-00-controller-active');
    const staleSpec = path.join(specsDir, '121-01-stale');
    await fs.ensureDir(activeSpec);
    await fs.ensureDir(staleSpec);
    await fs.utimes(activeSpec, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));
    await fs.utimes(staleSpec, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));

    const batchSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    await fs.ensureDir(batchSessionDir);
    const nestedBatchSummary = path.join(batchSessionDir, 'controller-protected-summary.json');
    await fs.writeJson(nestedBatchSummary, {
      mode: 'auto-close-loop-program',
      status: 'partial-failed',
      results: [
        {
          index: 1,
          goal: 'controller derived goal',
          status: 'failed',
          master_spec: '121-00-controller-active'
        }
      ]
    }, { spaces: 2 });

    const controllerSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    await fs.ensureDir(controllerSessionDir);
    const controllerSessionFile = path.join(controllerSessionDir, 'controller-protected-session.json');
    await fs.writeJson(controllerSessionFile, {
      mode: 'auto-close-loop-controller',
      status: 'partial-failed',
      results: [
        {
          goal: 'controller goal',
          status: 'failed',
          batch_session_file: nestedBatchSummary
        }
      ],
      controller_session: {
        id: 'controller-protected-session',
        file: controllerSessionFile
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'spec-session',
      'prune',
      '--keep',
      '0',
      '--older-than-days',
      '1',
      '--show-protection-reasons',
      '--json'
    ]);

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.protected_specs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: '121-00-controller-active',
        reasons: expect.objectContaining({
          controller_session_recent_or_incomplete: 1
        })
      })
    ]));
    expect(await fs.pathExists(activeSpec)).toBe(true);
    expect(await fs.pathExists(staleSpec)).toBe(false);
  });

  test('applies automatic spec-session retention policy in close-loop-batch summary', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });
    const specsDir = path.join(tempDir, '.sce', 'specs');
    const oldSpec = path.join(specsDir, '121-00-old');
    const newSpec = path.join(specsDir, '122-00-new');
    await fs.ensureDir(oldSpec);
    await fs.ensureDir(newSpec);
    await fs.utimes(oldSpec, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));
    await fs.utimes(newSpec, new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-01T00:00:00.000Z'));

    runAutoCloseLoop.mockResolvedValueOnce({
      status: 'completed',
      portfolio: { master_spec: '122-00-new', sub_specs: [] }
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--spec-session-keep',
      '1',
      '--spec-session-older-than-days',
      '1',
      '--json'
    ]);

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.spec_session_prune).toEqual(expect.objectContaining({
      mode: 'auto-spec-session-prune',
      deleted_count: 1,
      protect_active: true
    }));
    expect(await fs.pathExists(newSpec)).toBe(true);
    expect(await fs.pathExists(oldSpec)).toBe(false);
  });

  test('reports spec-session budget telemetry in close-loop-batch summary', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });
    const specsDir = path.join(tempDir, '.sce', 'specs');
    await fs.ensureDir(path.join(specsDir, '121-00-existing-a'));
    await fs.ensureDir(path.join(specsDir, '121-01-existing-b'));

    runAutoCloseLoop.mockResolvedValueOnce({
      status: 'completed',
      portfolio: { master_spec: '122-00-new', sub_specs: [] }
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'close-loop-batch',
      goalsFile,
      '--spec-session-max-total',
      '1',
      '--json'
    ]);

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.spec_session_budget).toEqual(expect.objectContaining({
      enabled: true,
      max_total: 1,
      hard_fail: false,
      total_before: 2,
      total_after: 2,
      over_limit_before: true,
      over_limit_after: true,
      hard_fail_triggered: false
    }));
  });

  test('fails close-loop-batch after run when spec growth guard exceeds max-created with hard-fail', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });
    const specsDir = path.join(tempDir, '.sce', 'specs');
    await fs.ensureDir(path.join(specsDir, '121-00-existing-a'));

    runAutoCloseLoop.mockImplementationOnce(async () => {
      await fs.ensureDir(path.join(specsDir, '122-00-created-during-run'));
      return {
        status: 'completed',
        portfolio: { master_spec: '122-00-created-during-run', sub_specs: [] }
      };
    });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--spec-session-max-created',
        '0',
        '--spec-session-budget-hard-fail',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.status).toBe('completed');
    expect(parsed.spec_session_growth_guard).toEqual(expect.objectContaining({
      enabled: true,
      max_created: 0,
      estimated_created: 1,
      over_limit: true,
      hard_fail_triggered: true
    }));
  });

  test('fails close-loop-batch before run when spec-session budget is already exceeded with hard-fail', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });
    const specsDir = path.join(tempDir, '.sce', 'specs');
    await fs.ensureDir(path.join(specsDir, '121-00-existing-a'));
    await fs.ensureDir(path.join(specsDir, '121-01-existing-b'));

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--spec-session-max-total',
        '1',
        '--spec-session-budget-hard-fail',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Spec session budget exceeded before run');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('fails close-loop-batch after run when spec-session budget exceeds limit with hard-fail', async () => {
    const goalsFile = path.join(tempDir, 'goals.json');
    await fs.writeJson(goalsFile, ['goal one'], { spaces: 2 });
    const specsDir = path.join(tempDir, '.sce', 'specs');
    await fs.ensureDir(path.join(specsDir, '121-00-existing-a'));

    runAutoCloseLoop.mockImplementationOnce(async () => {
      await fs.ensureDir(path.join(specsDir, '122-00-created-during-run'));
      return {
        status: 'completed',
        portfolio: { master_spec: '122-00-created-during-run', sub_specs: [] }
      };
    });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'close-loop-batch',
        goalsFile,
        '--spec-session-max-total',
        '1',
        '--spec-session-budget-hard-fail',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.status).toBe('completed');
    expect(parsed.spec_session_budget).toEqual(expect.objectContaining({
      enabled: true,
      hard_fail: true,
      total_before: 1,
      total_after: 2,
      over_limit_after: true,
      hard_fail_triggered: true
    }));
  });

  test('validates --keep range in spec-session prune', async () => {
    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'spec-session',
        'prune',
        '--keep',
        '-1'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--keep must be an integer between 0 and 5000.');
  });

  test('validates --protect-window-days range in spec-session prune', async () => {
    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'spec-session',
        'prune',
        '--protect-window-days',
        '-1'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--spec-session-protect-window-days must be an integer between 0 and 36500.');
  });

  test('lists close-loop-batch summary sessions in json mode', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    await fs.ensureDir(sessionDir);
    const sessionPath = path.join(sessionDir, 'demo-batch-session.json');
    await fs.writeJson(sessionPath, {
      mode: 'auto-close-loop-batch',
      status: 'completed',
      goals_file: '.sce/goals.json',
      total_goals: 2,
      processed_goals: 2,
      updated_at: '2026-02-14T10:00:00.000Z',
      batch_session: {
        id: 'demo-batch-session',
        file: sessionPath
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'batch-session', 'list', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-batch-session-list');
    expect(parsed.total).toBe(1);
    expect(parsed.status_filter).toEqual([]);
    expect(parsed.status_counts).toEqual(expect.objectContaining({ completed: 1 }));
    expect(parsed.sessions[0].id).toBe('demo-batch-session');
    expect(parsed.sessions[0].status).toBe('completed');
  });

  test('filters close-loop-batch summary sessions by status in json mode', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    await fs.ensureDir(sessionDir);
    const completedSession = path.join(sessionDir, 'batch-completed.json');
    const failedSession = path.join(sessionDir, 'batch-failed.json');
    await fs.writeJson(completedSession, {
      mode: 'auto-close-loop-batch',
      status: 'completed',
      batch_session: { id: 'batch-completed', file: completedSession }
    }, { spaces: 2 });
    await fs.writeJson(failedSession, {
      mode: 'auto-close-loop-batch',
      status: 'failed',
      batch_session: { id: 'batch-failed', file: failedSession }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'batch-session',
      'list',
      '--status',
      'failed',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-batch-session-list');
    expect(parsed.total).toBe(1);
    expect(parsed.status_filter).toEqual(['failed']);
    expect(parsed.status_counts).toEqual(expect.objectContaining({ failed: 1 }));
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[0].id).toBe('batch-failed');
  });

  test('aggregates close-loop-batch summary session stats in json mode', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    await fs.ensureDir(sessionDir);
    const completedSession = path.join(sessionDir, 'batch-stats-completed.json');
    const failedSession = path.join(sessionDir, 'batch-stats-failed.json');
    await fs.writeJson(completedSession, {
      mode: 'auto-close-loop-batch',
      status: 'completed',
      total_goals: 4,
      processed_goals: 4,
      batch_session: { id: 'batch-stats-completed', file: completedSession }
    }, { spaces: 2 });
    await fs.writeJson(failedSession, {
      mode: 'auto-close-loop-batch',
      status: 'failed',
      total_goals: 3,
      processed_goals: 1,
      batch_session: { id: 'batch-stats-failed', file: failedSession }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'batch-session', 'stats', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-batch-session-stats');
    expect(parsed.total_sessions).toBe(2);
    expect(parsed.completed_sessions).toBe(1);
    expect(parsed.failed_sessions).toBe(1);
    expect(parsed.completion_rate_percent).toBe(50);
    expect(parsed.failure_rate_percent).toBe(50);
    expect(parsed.total_goals_sum).toBe(7);
    expect(parsed.processed_goals_sum).toBe(5);
    expect(parsed.unprocessed_goals_sum).toBe(2);
    expect(parsed.average_processed_ratio_percent).toBeCloseTo(71.43, 2);
    expect(parsed.status_counts).toEqual(expect.objectContaining({
      completed: 1,
      failed: 1
    }));
    expect(Array.isArray(parsed.latest_sessions)).toBe(true);
    expect(parsed.latest_sessions.length).toBe(2);
  });

  test('filters close-loop-batch summary session stats by days and status', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    await fs.ensureDir(sessionDir);
    const oldSession = path.join(sessionDir, 'batch-stats-old.json');
    const freshSession = path.join(sessionDir, 'batch-stats-fresh.json');
    await fs.writeJson(oldSession, {
      mode: 'auto-close-loop-batch',
      status: 'failed',
      total_goals: 5,
      processed_goals: 2,
      batch_session: { id: 'batch-stats-old', file: oldSession }
    }, { spaces: 2 });
    await fs.writeJson(freshSession, {
      mode: 'auto-close-loop-batch',
      status: 'failed',
      total_goals: 6,
      processed_goals: 1,
      batch_session: { id: 'batch-stats-fresh', file: freshSession }
    }, { spaces: 2 });
    await fs.utimes(oldSession, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));
    const now = new Date();
    await fs.utimes(freshSession, now, now);

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'batch-session',
      'stats',
      '--days',
      '30',
      '--status',
      'failed',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-batch-session-stats');
    expect(parsed.criteria.days).toBe(30);
    expect(parsed.criteria.status_filter).toEqual(['failed']);
    expect(parsed.total_sessions).toBe(1);
    expect(parsed.total_goals_sum).toBe(6);
    expect(parsed.processed_goals_sum).toBe(1);
    expect(parsed.latest_sessions[0].id).toBe('batch-stats-fresh');
  });

  test('prunes sessions with keep policy', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    await fs.ensureDir(sessionDir);
    const oldSession = path.join(sessionDir, 'old-session.json');
    const newSession = path.join(sessionDir, 'new-session.json');
    await fs.writeJson(oldSession, { session_id: 'old-session', portfolio: { sub_specs: [] } }, { spaces: 2 });
    await fs.writeJson(newSession, { session_id: 'new-session', portfolio: { sub_specs: [] } }, { spaces: 2 });
    await fs.utimes(oldSession, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));
    await fs.utimes(newSession, new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-01T00:00:00.000Z'));

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'session', 'prune', '--keep', '1', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-session-prune');
    expect(parsed.deleted_count).toBe(1);
    expect(await fs.pathExists(newSession)).toBe(true);
    expect(await fs.pathExists(oldSession)).toBe(false);
  });

  test('supports prune dry-run without deleting files', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    await fs.ensureDir(sessionDir);
    const candidate = path.join(sessionDir, 'candidate.json');
    await fs.writeJson(candidate, { session_id: 'candidate', portfolio: { sub_specs: [] } }, { spaces: 2 });
    await fs.utimes(candidate, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'session',
      'prune',
      '--keep',
      '0',
      '--older-than-days',
      '1',
      '--dry-run',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.dry_run).toBe(true);
    expect(parsed.deleted_count).toBe(1);
    expect(await fs.pathExists(candidate)).toBe(true);
  });

  test('prunes close-loop-batch summary sessions with keep policy', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    await fs.ensureDir(sessionDir);
    const oldSession = path.join(sessionDir, 'old-batch-session.json');
    const newSession = path.join(sessionDir, 'new-batch-session.json');
    await fs.writeJson(oldSession, {
      mode: 'auto-close-loop-batch',
      batch_session: { id: 'old-batch-session', file: oldSession }
    }, { spaces: 2 });
    await fs.writeJson(newSession, {
      mode: 'auto-close-loop-batch',
      batch_session: { id: 'new-batch-session', file: newSession }
    }, { spaces: 2 });
    await fs.utimes(oldSession, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));
    await fs.utimes(newSession, new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-01T00:00:00.000Z'));

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'batch-session', 'prune', '--keep', '1', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-batch-session-prune');
    expect(parsed.deleted_count).toBe(1);
    expect(await fs.pathExists(newSession)).toBe(true);
    expect(await fs.pathExists(oldSession)).toBe(false);
  });

  test('lists close-loop-controller summary sessions in json mode', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    await fs.ensureDir(sessionDir);
    const sessionPath = path.join(sessionDir, 'demo-controller-session.json');
    await fs.writeJson(sessionPath, {
      mode: 'auto-close-loop-controller',
      status: 'completed',
      queue_file: '.sce/auto/controller-goals.lines',
      queue_format: 'lines',
      processed_goals: 2,
      pending_goals: 0,
      updated_at: '2026-02-14T10:00:00.000Z',
      controller_session: {
        id: 'demo-controller-session',
        file: sessionPath
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'controller-session', 'list', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-controller-session-list');
    expect(parsed.total).toBe(1);
    expect(parsed.status_filter).toEqual([]);
    expect(parsed.status_counts).toEqual(expect.objectContaining({ completed: 1 }));
    expect(parsed.sessions[0].id).toBe('demo-controller-session');
    expect(parsed.sessions[0].status).toBe('completed');
  });

  test('filters close-loop-controller summary sessions by status in json mode', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    await fs.ensureDir(sessionDir);
    const completedSession = path.join(sessionDir, 'controller-completed.json');
    const partialFailedSession = path.join(sessionDir, 'controller-partial-failed.json');
    await fs.writeJson(completedSession, {
      mode: 'auto-close-loop-controller',
      status: 'completed',
      controller_session: { id: 'controller-completed', file: completedSession }
    }, { spaces: 2 });
    await fs.writeJson(partialFailedSession, {
      mode: 'auto-close-loop-controller',
      status: 'partial-failed',
      controller_session: { id: 'controller-partial-failed', file: partialFailedSession }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'controller-session',
      'list',
      '--status',
      'partial-failed',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-controller-session-list');
    expect(parsed.total).toBe(1);
    expect(parsed.status_filter).toEqual(['partial-failed']);
    expect(parsed.status_counts).toEqual(expect.objectContaining({ 'partial-failed': 1 }));
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[0].id).toBe('controller-partial-failed');
  });

  test('aggregates close-loop-controller session stats in json mode', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    await fs.ensureDir(sessionDir);
    const completedSession = path.join(sessionDir, 'controller-stats-completed.json');
    const failedSession = path.join(sessionDir, 'controller-stats-partial-failed.json');
    await fs.writeJson(completedSession, {
      mode: 'auto-close-loop-controller',
      status: 'completed',
      queue_format: 'lines',
      processed_goals: 3,
      pending_goals: 0,
      controller_session: { id: 'controller-stats-completed', file: completedSession }
    }, { spaces: 2 });
    await fs.writeJson(failedSession, {
      mode: 'auto-close-loop-controller',
      status: 'partial-failed',
      queue_format: 'json',
      processed_goals: 1,
      pending_goals: 2,
      controller_session: { id: 'controller-stats-partial-failed', file: failedSession }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'controller-session', 'stats', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-controller-session-stats');
    expect(parsed.total_sessions).toBe(2);
    expect(parsed.completed_sessions).toBe(1);
    expect(parsed.failed_sessions).toBe(1);
    expect(parsed.completion_rate_percent).toBe(50);
    expect(parsed.failure_rate_percent).toBe(50);
    expect(parsed.processed_goals_sum).toBe(4);
    expect(parsed.pending_goals_sum).toBe(2);
    expect(parsed.status_counts).toEqual(expect.objectContaining({
      completed: 1,
      'partial-failed': 1
    }));
    expect(parsed.queue_format_counts).toEqual(expect.objectContaining({
      lines: 1,
      json: 1
    }));
    expect(Array.isArray(parsed.latest_sessions)).toBe(true);
    expect(parsed.latest_sessions.length).toBe(2);
  });

  test('filters close-loop-controller session stats by days and status', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    await fs.ensureDir(sessionDir);
    const oldSession = path.join(sessionDir, 'controller-stats-old.json');
    const freshSession = path.join(sessionDir, 'controller-stats-fresh.json');
    await fs.writeJson(oldSession, {
      mode: 'auto-close-loop-controller',
      status: 'completed',
      processed_goals: 2,
      pending_goals: 0,
      controller_session: { id: 'controller-stats-old', file: oldSession }
    }, { spaces: 2 });
    await fs.writeJson(freshSession, {
      mode: 'auto-close-loop-controller',
      status: 'completed',
      processed_goals: 5,
      pending_goals: 1,
      controller_session: { id: 'controller-stats-fresh', file: freshSession }
    }, { spaces: 2 });
    await fs.utimes(oldSession, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));
    const now = new Date();
    await fs.utimes(freshSession, now, now);

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'controller-session',
      'stats',
      '--days',
      '30',
      '--status',
      'completed',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-controller-session-stats');
    expect(parsed.criteria.days).toBe(30);
    expect(parsed.criteria.status_filter).toEqual(['completed']);
    expect(parsed.total_sessions).toBe(1);
    expect(parsed.processed_goals_sum).toBe(5);
    expect(parsed.pending_goals_sum).toBe(1);
    expect(parsed.status_counts).toEqual(expect.objectContaining({ completed: 1 }));
    expect(parsed.latest_sessions[0].id).toBe('controller-stats-fresh');
  });

  test('aggregates governance stats across session archives in json mode', async () => {
    const closeLoopSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    const batchSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    const controllerSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    await fs.ensureDir(closeLoopSessionDir);
    await fs.ensureDir(batchSessionDir);
    await fs.ensureDir(controllerSessionDir);

    const closeLoopFile = path.join(closeLoopSessionDir, 'governance-session.json');
    await fs.writeJson(closeLoopFile, {
      session_id: 'governance-session',
      status: 'completed',
      goal: 'governance goal',
      portfolio: {
        master_spec: '121-00-governance',
        sub_specs: ['121-01-a', '121-02-b']
      }
    }, { spaces: 2 });

    const batchFile = path.join(batchSessionDir, 'governance-batch.json');
    await fs.writeJson(batchFile, {
      mode: 'auto-close-loop-batch',
      status: 'failed',
      total_goals: 4,
      processed_goals: 2,
      batch_session: { id: 'governance-batch', file: batchFile }
    }, { spaces: 2 });

    const controllerFile = path.join(controllerSessionDir, 'governance-controller.json');
    await fs.writeJson(controllerFile, {
      mode: 'auto-close-loop-controller',
      status: 'completed',
      queue_format: 'lines',
      processed_goals: 3,
      pending_goals: 0,
      controller_session: { id: 'governance-controller', file: controllerFile }
    }, { spaces: 2 });

    const recoveryMemoryFile = path.join(tempDir, '.sce', 'auto', 'close-loop-recovery-memory.json');
    await fs.ensureDir(path.dirname(recoveryMemoryFile));
    await fs.writeJson(recoveryMemoryFile, {
      version: 1,
      signatures: {
        'signature-governance': {
          signature: 'signature-governance',
          scope: 'scope-governance',
          attempts: 2,
          successes: 1,
          failures: 1,
          last_used_at: '2026-02-14T10:00:00.000Z',
          actions: {
            '1': {
              index: 1,
              title: 'retry latest',
              attempts: 2,
              successes: 1,
              failures: 1,
              last_used_at: '2026-02-14T10:00:00.000Z'
            }
          }
        }
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'governance', 'stats', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-stats');
    expect(parsed.totals).toEqual(expect.objectContaining({
      total_sessions: 3,
      completed_sessions: 2,
      failed_sessions: 1,
      completion_rate_percent: 66.67,
      failure_rate_percent: 33.33
    }));
    expect(parsed.throughput).toEqual(expect.objectContaining({
      sub_spec_count_sum: 2,
      batch_total_goals_sum: 4,
      batch_processed_goals_sum: 2,
      controller_processed_goals_sum: 3,
      controller_pending_goals_sum: 0
    }));
    expect(parsed.health.risk_level).toBe('medium');
    expect(Array.isArray(parsed.health.concerns)).toBe(true);
    expect(parsed.top_master_specs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: '121-00-governance',
        count: 1
      })
    ]));
    expect(parsed.recovery_memory).toEqual(expect.objectContaining({
      signature_count: 1,
      action_count: 1
    }));
    expect(parsed.archives.session.total_sessions).toBe(1);
    expect(parsed.archives.batch_session.total_sessions).toBe(1);
    expect(parsed.archives.controller_session.total_sessions).toBe(1);
  });

  test('filters governance stats by days and status', async () => {
    const closeLoopSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    const batchSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    const controllerSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    await fs.ensureDir(closeLoopSessionDir);
    await fs.ensureDir(batchSessionDir);
    await fs.ensureDir(controllerSessionDir);

    const oldCloseLoop = path.join(closeLoopSessionDir, 'governance-old-session.json');
    const newCloseLoop = path.join(closeLoopSessionDir, 'governance-new-session.json');
    await fs.writeJson(oldCloseLoop, {
      session_id: 'governance-old-session',
      status: 'failed',
      portfolio: { master_spec: '121-00-old', sub_specs: [] }
    }, { spaces: 2 });
    await fs.writeJson(newCloseLoop, {
      session_id: 'governance-new-session',
      status: 'completed',
      portfolio: { master_spec: '121-00-new', sub_specs: ['121-01-new'] }
    }, { spaces: 2 });

    const oldBatch = path.join(batchSessionDir, 'governance-old-batch.json');
    const newBatch = path.join(batchSessionDir, 'governance-new-batch.json');
    await fs.writeJson(oldBatch, {
      mode: 'auto-close-loop-batch',
      status: 'failed',
      total_goals: 5,
      processed_goals: 1,
      batch_session: { id: 'governance-old-batch', file: oldBatch }
    }, { spaces: 2 });
    await fs.writeJson(newBatch, {
      mode: 'auto-close-loop-batch',
      status: 'completed',
      total_goals: 2,
      processed_goals: 2,
      batch_session: { id: 'governance-new-batch', file: newBatch }
    }, { spaces: 2 });

    const oldController = path.join(controllerSessionDir, 'governance-old-controller.json');
    const newController = path.join(controllerSessionDir, 'governance-new-controller.json');
    await fs.writeJson(oldController, {
      mode: 'auto-close-loop-controller',
      status: 'partial-failed',
      processed_goals: 1,
      pending_goals: 2,
      controller_session: { id: 'governance-old-controller', file: oldController }
    }, { spaces: 2 });
    await fs.writeJson(newController, {
      mode: 'auto-close-loop-controller',
      status: 'completed',
      processed_goals: 3,
      pending_goals: 0,
      controller_session: { id: 'governance-new-controller', file: newController }
    }, { spaces: 2 });

    const oldDate = new Date('2020-01-01T00:00:00.000Z');
    await fs.utimes(oldCloseLoop, oldDate, oldDate);
    await fs.utimes(oldBatch, oldDate, oldDate);
    await fs.utimes(oldController, oldDate, oldDate);
    const now = new Date();
    await fs.utimes(newCloseLoop, now, now);
    await fs.utimes(newBatch, now, now);
    await fs.utimes(newController, now, now);

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'stats',
      '--days',
      '30',
      '--status',
      'completed',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-stats');
    expect(parsed.criteria.days).toBe(30);
    expect(parsed.criteria.status_filter).toEqual(['completed']);
    expect(parsed.totals).toEqual(expect.objectContaining({
      total_sessions: 3,
      completed_sessions: 3,
      failed_sessions: 0,
      completion_rate_percent: 100,
      failure_rate_percent: 0
    }));
    expect(parsed.archives.session.total_sessions).toBe(1);
    expect(parsed.archives.batch_session.total_sessions).toBe(1);
    expect(parsed.archives.controller_session.total_sessions).toBe(1);
    expect(parsed.health.risk_level).toBe('low');
  });

  test('elevates governance risk when release gate history degrades', async () => {
    const closeLoopSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    const batchSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    const controllerSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    const releaseEvidenceDir = path.join(tempDir, '.sce', 'reports', 'release-evidence');
    await fs.ensureDir(closeLoopSessionDir);
    await fs.ensureDir(batchSessionDir);
    await fs.ensureDir(controllerSessionDir);
    await fs.ensureDir(releaseEvidenceDir);

    const closeLoopFile = path.join(closeLoopSessionDir, 'governance-release-gate-session.json');
    await fs.writeJson(closeLoopFile, {
      session_id: 'governance-release-gate-session',
      status: 'completed',
      portfolio: {
        master_spec: '121-00-governance',
        sub_specs: ['121-01-a']
      }
    }, { spaces: 2 });

    const batchFile = path.join(batchSessionDir, 'governance-release-gate-batch.json');
    await fs.writeJson(batchFile, {
      mode: 'auto-close-loop-batch',
      status: 'completed',
      total_goals: 2,
      processed_goals: 2,
      batch_session: { id: 'governance-release-gate-batch', file: batchFile }
    }, { spaces: 2 });

    const controllerFile = path.join(controllerSessionDir, 'governance-release-gate-controller.json');
    await fs.writeJson(controllerFile, {
      mode: 'auto-close-loop-controller',
      status: 'completed',
      processed_goals: 2,
      pending_goals: 0,
      controller_session: { id: 'governance-release-gate-controller', file: controllerFile }
    }, { spaces: 2 });

    const releaseGateHistoryFile = path.join(releaseEvidenceDir, 'release-gate-history.json');
    await fs.writeJson(releaseGateHistoryFile, {
      mode: 'auto-handoff-release-gate-history',
      total_entries: 5,
      latest: {
        tag: 'v1.47.35',
        gate_passed: false,
        risk_level: 'high',
        weekly_ops_blocked: true,
        weekly_ops_risk_level: 'high',
        weekly_ops_governance_status: 'alert',
        weekly_ops_authorization_tier_block_rate_percent: 58,
        weekly_ops_dialogue_authorization_block_rate_percent: 66,
        weekly_ops_config_warning_count: 2,
        weekly_ops_runtime_block_rate_percent: 52,
        weekly_ops_runtime_ui_mode_violation_total: 2,
        weekly_ops_runtime_ui_mode_violation_rate_percent: 25
      },
      aggregates: {
        pass_rate_percent: 40,
        scene_package_batch_pass_rate_percent: 50,
        drift_alert_rate_percent: 100,
        drift_alert_runs: 3,
        drift_blocked_runs: 1,
        weekly_ops_known_runs: 4,
        weekly_ops_blocked_runs: 2,
        weekly_ops_block_rate_percent: 50,
        weekly_ops_violations_total: 3,
        weekly_ops_warnings_total: 5,
        weekly_ops_config_warnings_total: 2,
        weekly_ops_authorization_tier_block_rate_max_percent: 58,
        weekly_ops_dialogue_authorization_block_rate_max_percent: 66,
        weekly_ops_runtime_block_rate_max_percent: 52,
        weekly_ops_runtime_ui_mode_violation_known_runs: 4,
        weekly_ops_runtime_ui_mode_violation_runs: 2,
        weekly_ops_runtime_ui_mode_violation_run_rate_percent: 50,
        weekly_ops_runtime_ui_mode_violation_total: 2,
        weekly_ops_runtime_ui_mode_violation_rate_avg_percent: 20,
        weekly_ops_runtime_ui_mode_violation_rate_max_percent: 25
      },
      entries: []
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'governance', 'stats', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-stats');
    expect(parsed.health.risk_level).toBe('high');
    expect(parsed.health.release_gate).toEqual(expect.objectContaining({
      available: true,
      latest_gate_passed: false,
      drift_alert_rate_percent: 100,
      weekly_ops_blocked_runs: 2,
      weekly_ops_dialogue_authorization_block_rate_max_percent: 66,
      weekly_ops_runtime_ui_mode_violation_total: 2
    }));
    expect(parsed.health.concerns).toEqual(expect.arrayContaining([
      expect.stringContaining('Latest release gate evaluation is failed'),
      expect.stringContaining('Weekly ops config warnings total is 2'),
      expect.stringContaining('runtime ui-mode violations total is 2')
    ]));
    expect(parsed.health.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('sce auto handoff evidence --window 5 --json'),
      expect.stringContaining('SCE_RELEASE_WEEKLY_OPS_*'),
      expect.stringContaining('interactive-dialogue-governance.js'),
      expect.stringContaining('interactive-governance-report.js')
    ]));
  });

  test('elevates governance risk when handoff quality degrades', async () => {
    const closeLoopSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    const batchSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    const controllerSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    const releaseEvidenceDir = path.join(tempDir, '.sce', 'reports', 'release-evidence');
    await fs.ensureDir(closeLoopSessionDir);
    await fs.ensureDir(batchSessionDir);
    await fs.ensureDir(controllerSessionDir);
    await fs.ensureDir(releaseEvidenceDir);

    const closeLoopFile = path.join(closeLoopSessionDir, 'governance-handoff-quality-session.json');
    await fs.writeJson(closeLoopFile, {
      session_id: 'governance-handoff-quality-session',
      status: 'completed',
      portfolio: {
        master_spec: '121-00-governance',
        sub_specs: ['121-01-a']
      }
    }, { spaces: 2 });

    const batchFile = path.join(batchSessionDir, 'governance-handoff-quality-batch.json');
    await fs.writeJson(batchFile, {
      mode: 'auto-close-loop-batch',
      status: 'completed',
      total_goals: 2,
      processed_goals: 2,
      batch_session: { id: 'governance-handoff-quality-batch', file: batchFile }
    }, { spaces: 2 });

    const controllerFile = path.join(controllerSessionDir, 'governance-handoff-quality-controller.json');
    await fs.writeJson(controllerFile, {
      mode: 'auto-close-loop-controller',
      status: 'completed',
      processed_goals: 2,
      pending_goals: 0,
      controller_session: { id: 'governance-handoff-quality-controller', file: controllerFile }
    }, { spaces: 2 });

    const releaseEvidenceFile = path.join(releaseEvidenceDir, 'handoff-runs.json');
    await fs.writeJson(releaseEvidenceFile, {
      mode: 'auto-handoff-release-evidence',
      generated_at: '2026-02-18T00:00:00.000Z',
      updated_at: '2026-02-18T01:00:00.000Z',
      latest_session_id: 'handoff-degraded',
      total_runs: 2,
      sessions: [
        {
          session_id: 'handoff-degraded',
          merged_at: '2026-02-18T01:00:00.000Z',
          status: 'failed',
          gate: {
            passed: false,
            actual: {
              spec_success_rate_percent: 72,
              risk_level: 'high',
              ontology_quality_score: 65
            }
          },
          release_gate_preflight: {
            available: true,
            blocked: true
          },
          failure_summary: {
            highlights: ['release_gate_preflight: latest-release-gate-failed']
          },
          capability_coverage: {
            summary: {
              coverage_percent: 70,
              passed: false
            }
          },
          scene_package_batch: {
            summary: {
              batch_gate_passed: false
            }
          },
          batch_summary: {
            failed_goals: 2
          }
        },
        {
          session_id: 'handoff-healthy',
          merged_at: '2026-02-17T01:00:00.000Z',
          status: 'completed',
          gate: {
            passed: true,
            actual: {
              spec_success_rate_percent: 98,
              risk_level: 'low',
              ontology_quality_score: 92
            }
          },
          capability_coverage: {
            summary: {
              coverage_percent: 100,
              passed: true
            }
          },
          scene_package_batch: {
            summary: {
              batch_gate_passed: true
            }
          },
          batch_summary: {
            failed_goals: 0
          }
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'governance', 'stats', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-stats');
    expect(parsed.health.risk_level).toBe('high');
    expect(parsed.health.handoff_quality).toEqual(expect.objectContaining({
      available: true,
      latest_status: 'failed',
      latest_gate_passed: false,
      latest_ontology_quality_score: 65,
      latest_capability_coverage_passed: false
    }));
    expect(parsed.health.concerns).toEqual(expect.arrayContaining([
      expect.stringContaining('Latest handoff run status is failed')
    ]));
    expect(parsed.health.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('sce auto handoff evidence --window 5 --json')
    ]));
  });

  test('elevates governance risk when handoff Moqui matrix regressions exceed gate', async () => {
    const closeLoopSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    const batchSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    const controllerSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    const releaseEvidenceDir = path.join(tempDir, '.sce', 'reports', 'release-evidence');
    await fs.ensureDir(closeLoopSessionDir);
    await fs.ensureDir(batchSessionDir);
    await fs.ensureDir(controllerSessionDir);
    await fs.ensureDir(releaseEvidenceDir);

    const closeLoopFile = path.join(closeLoopSessionDir, 'governance-handoff-matrix-session.json');
    await fs.writeJson(closeLoopFile, {
      session_id: 'governance-handoff-matrix-session',
      status: 'completed',
      portfolio: {
        master_spec: '121-00-governance',
        sub_specs: ['121-01-a']
      }
    }, { spaces: 2 });

    const batchFile = path.join(batchSessionDir, 'governance-handoff-matrix-batch.json');
    await fs.writeJson(batchFile, {
      mode: 'auto-close-loop-batch',
      status: 'completed',
      total_goals: 2,
      processed_goals: 2,
      batch_session: { id: 'governance-handoff-matrix-batch', file: batchFile }
    }, { spaces: 2 });

    const controllerFile = path.join(controllerSessionDir, 'governance-handoff-matrix-controller.json');
    await fs.writeJson(controllerFile, {
      mode: 'auto-close-loop-controller',
      status: 'completed',
      processed_goals: 2,
      pending_goals: 0,
      controller_session: { id: 'governance-handoff-matrix-controller', file: controllerFile }
    }, { spaces: 2 });

    const releaseEvidenceFile = path.join(releaseEvidenceDir, 'handoff-runs.json');
    await fs.writeJson(releaseEvidenceFile, {
      mode: 'auto-handoff-release-evidence',
      generated_at: '2026-02-18T00:00:00.000Z',
      updated_at: '2026-02-18T01:00:00.000Z',
      latest_session_id: 'handoff-matrix-regression',
      total_runs: 2,
      sessions: [
        {
          session_id: 'handoff-matrix-regression',
          merged_at: '2026-02-18T01:00:00.000Z',
          status: 'completed',
          gate: {
            passed: true,
            actual: {
              spec_success_rate_percent: 96,
              risk_level: 'low',
              ontology_quality_score: 92
            }
          },
          capability_coverage: {
            summary: {
              coverage_percent: 100,
              passed: true
            }
          },
          release_gate_preflight: {
            available: true,
            blocked: false
          },
          moqui_baseline: {
            compare: {
              coverage_matrix_deltas: {
                business_rule_closed: { count: -1, rate_percent: -25 },
                decision_closed: { count: 0, rate_percent: 0 }
              }
            }
          },
          policy: {
            max_moqui_matrix_regressions: 0
          }
        },
        {
          session_id: 'handoff-matrix-healthy',
          merged_at: '2026-02-17T01:00:00.000Z',
          status: 'completed',
          gate: {
            passed: true,
            actual: {
              spec_success_rate_percent: 98,
              risk_level: 'low',
              ontology_quality_score: 93,
              moqui_matrix_regression_count: 0
            }
          },
          capability_coverage: {
            summary: {
              coverage_percent: 100,
              passed: true
            }
          },
          release_gate_preflight: {
            available: true,
            blocked: false
          },
          policy: {
            max_moqui_matrix_regressions: 0
          }
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'governance', 'stats', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-stats');
    expect(parsed.health.risk_level).toBe('high');
    expect(parsed.health.handoff_quality).toEqual(expect.objectContaining({
      latest_moqui_matrix_regression_count: 1,
      latest_moqui_matrix_regression_gate_max: 0,
      avg_moqui_matrix_regression_count: 0.5,
      max_moqui_matrix_regression_count: 1,
      moqui_matrix_regression_positive_rate_percent: 50
    }));
    expect(parsed.health.concerns).toEqual(expect.arrayContaining([
      expect.stringContaining('Moqui matrix regressions exceed gate')
    ]));
    expect(parsed.health.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('--max-moqui-matrix-regressions 0')
    ]));
    expect(parsed.health.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('moqui-matrix-remediation-phased-runner.js'),
      expect.stringContaining('run:matrix-remediation-from-baseline'),
      expect.stringContaining('run:matrix-remediation-clusters-phased'),
      expect.stringContaining('matrix-remediation.capability-clusters.json'),
      expect.stringContaining('run:matrix-remediation-clusters')
    ]));
    expect(parsed.health.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('Moqui regression recovery sequence (recommended)'),
      expect.stringContaining('Step 1 (Cluster phased):'),
      expect.stringContaining('Step 2 (Baseline phased):')
    ]));
  });

  test('elevates governance risk when handoff lexicon unknown capability counts are positive', async () => {
    const closeLoopSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    const batchSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    const controllerSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    const releaseEvidenceDir = path.join(tempDir, '.sce', 'reports', 'release-evidence');
    await fs.ensureDir(closeLoopSessionDir);
    await fs.ensureDir(batchSessionDir);
    await fs.ensureDir(controllerSessionDir);
    await fs.ensureDir(releaseEvidenceDir);

    const closeLoopFile = path.join(closeLoopSessionDir, 'governance-handoff-lexicon-session.json');
    await fs.writeJson(closeLoopFile, {
      session_id: 'governance-handoff-lexicon-session',
      status: 'completed',
      portfolio: {
        master_spec: '121-00-governance',
        sub_specs: ['121-01-a']
      }
    }, { spaces: 2 });

    const batchFile = path.join(batchSessionDir, 'governance-handoff-lexicon-batch.json');
    await fs.writeJson(batchFile, {
      mode: 'auto-close-loop-batch',
      status: 'completed',
      total_goals: 2,
      processed_goals: 2,
      batch_session: { id: 'governance-handoff-lexicon-batch', file: batchFile }
    }, { spaces: 2 });

    const controllerFile = path.join(controllerSessionDir, 'governance-handoff-lexicon-controller.json');
    await fs.writeJson(controllerFile, {
      mode: 'auto-close-loop-controller',
      status: 'completed',
      processed_goals: 2,
      pending_goals: 0,
      controller_session: { id: 'governance-handoff-lexicon-controller', file: controllerFile }
    }, { spaces: 2 });

    const releaseEvidenceFile = path.join(releaseEvidenceDir, 'handoff-runs.json');
    await fs.writeJson(releaseEvidenceFile, {
      mode: 'auto-handoff-release-evidence',
      generated_at: '2026-02-18T00:00:00.000Z',
      updated_at: '2026-02-18T01:00:00.000Z',
      latest_session_id: 'handoff-lexicon-blocked',
      total_runs: 2,
      sessions: [
        {
          session_id: 'handoff-lexicon-blocked',
          merged_at: '2026-02-18T01:00:00.000Z',
          status: 'completed',
          gate: {
            passed: true,
            actual: {
              spec_success_rate_percent: 98,
              risk_level: 'low',
              ontology_quality_score: 95,
              capability_expected_unknown_count: 1,
              capability_provided_unknown_count: 2
            }
          },
          capability_coverage: {
            summary: {
              coverage_percent: 100,
              passed: true
            }
          },
          release_gate_preflight: {
            available: true,
            blocked: false
          }
        },
        {
          session_id: 'handoff-lexicon-healthy',
          merged_at: '2026-02-17T01:00:00.000Z',
          status: 'completed',
          gate: {
            passed: true,
            actual: {
              spec_success_rate_percent: 99,
              risk_level: 'low',
              ontology_quality_score: 94,
              capability_expected_unknown_count: 0,
              capability_provided_unknown_count: 0
            }
          },
          capability_coverage: {
            summary: {
              coverage_percent: 100,
              passed: true
            }
          },
          release_gate_preflight: {
            available: true,
            blocked: false
          }
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'governance', 'stats', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-stats');
    expect(parsed.health.risk_level).toBe('high');
    expect(parsed.health.handoff_quality).toEqual(expect.objectContaining({
      latest_capability_expected_unknown_count: 1,
      latest_capability_provided_unknown_count: 2,
      capability_expected_unknown_positive_rate_percent: 50,
      capability_provided_unknown_positive_rate_percent: 50
    }));
    expect(parsed.health.concerns).toEqual(expect.arrayContaining([
      expect.stringContaining('manifest capability unknown count is 1'),
      expect.stringContaining('template capability unknown count is 2')
    ]));
    expect(parsed.health.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('node scripts/moqui-lexicon-audit.js')
    ]));
  });

  test('plans governance maintenance actions in json mode without apply', async () => {
    const closeLoopSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    await fs.ensureDir(closeLoopSessionDir);
    const sessionFile = path.join(closeLoopSessionDir, 'governance-maintain-plan-session.json');
    await fs.writeJson(sessionFile, {
      session_id: 'governance-maintain-plan-session',
      status: 'completed',
      portfolio: { master_spec: '121-00-plan', sub_specs: [] }
    }, { spaces: 2 });

    const recoveryMemoryFile = path.join(tempDir, '.sce', 'auto', 'close-loop-recovery-memory.json');
    await fs.ensureDir(path.dirname(recoveryMemoryFile));
    await fs.writeJson(recoveryMemoryFile, {
      version: 1,
      signatures: {
        'maintain-plan-signature': {
          signature: 'maintain-plan-signature',
          scope: 'maintain-plan',
          attempts: 1,
          successes: 1,
          failures: 0,
          last_used_at: '2026-02-14T10:00:00.000Z',
          actions: {
            '1': {
              index: 1,
              title: 'reuse',
              attempts: 1,
              successes: 1,
              failures: 0,
              last_used_at: '2026-02-14T10:00:00.000Z'
            }
          }
        }
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'maintain',
      '--session-keep',
      '0',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-maintain');
    expect(parsed.apply).toBe(false);
    expect(parsed.summary.planned_actions).toBeGreaterThanOrEqual(2);
    expect(parsed.summary.applied_actions).toBe(0);
    expect(parsed.executed_actions).toEqual([]);
    expect(parsed.plan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'session-prune',
        enabled: true,
        apply_supported: true
      }),
      expect.objectContaining({
        id: 'recovery-memory-prune',
        enabled: true,
        apply_supported: true
      })
    ]));
  });

  test('prioritizes release gate remediation actions in governance maintain plan', async () => {
    const releaseEvidenceDir = path.join(tempDir, '.sce', 'reports', 'release-evidence');
    await fs.ensureDir(releaseEvidenceDir);
    await fs.writeJson(path.join(releaseEvidenceDir, 'release-gate-history.json'), {
      mode: 'auto-handoff-release-gate-history',
      total_entries: 5,
      latest: {
        tag: 'v1.47.35',
        gate_passed: false,
        risk_level: 'high'
      },
      aggregates: {
        pass_rate_percent: 50,
        scene_package_batch_pass_rate_percent: 55,
        drift_alert_rate_percent: 100,
        drift_alert_runs: 3,
        drift_blocked_runs: 1
      },
      entries: []
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'maintain',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-maintain');
    expect(parsed.plan[0]).toEqual(expect.objectContaining({
      id: 'release-gate-evidence-review',
      enabled: true,
      apply_supported: false
    }));
    expect(parsed.plan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'release-gate-scene-batch-remediate',
        enabled: true,
        apply_supported: false
      })
    ]));
  });

  test('adds handoff remediation action in governance maintain plan when handoff quality blocks', async () => {
    const releaseEvidenceDir = path.join(tempDir, '.sce', 'reports', 'release-evidence');
    await fs.ensureDir(releaseEvidenceDir);
    await fs.writeJson(path.join(releaseEvidenceDir, 'handoff-runs.json'), {
      mode: 'auto-handoff-release-evidence',
      generated_at: '2026-02-18T00:00:00.000Z',
      updated_at: '2026-02-18T01:00:00.000Z',
      latest_session_id: 'handoff-blocked',
      total_runs: 1,
      sessions: [
        {
          session_id: 'handoff-blocked',
          merged_at: '2026-02-18T01:00:00.000Z',
          status: 'failed',
          gate: {
            passed: false,
            actual: {
              spec_success_rate_percent: 70,
              risk_level: 'high',
              ontology_quality_score: 66
            }
          },
          release_gate_preflight: {
            available: true,
            blocked: true
          },
          capability_coverage: {
            summary: {
              coverage_percent: 65,
              passed: false
            }
          },
          batch_summary: {
            failed_goals: 2
          }
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'maintain',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-maintain');
    expect(parsed.plan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'release-gate-handoff-remediate',
        enabled: true,
        apply_supported: false
      })
    ]));
  });

  test('applies governance maintenance actions and returns after assessment', async () => {
    const closeLoopSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    const batchSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    const controllerSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    await fs.ensureDir(closeLoopSessionDir);
    await fs.ensureDir(batchSessionDir);
    await fs.ensureDir(controllerSessionDir);

    const sessionOld = path.join(closeLoopSessionDir, 'governance-maintain-old-session.json');
    const sessionNew = path.join(closeLoopSessionDir, 'governance-maintain-new-session.json');
    await fs.writeJson(sessionOld, {
      session_id: 'governance-maintain-old-session',
      status: 'completed',
      portfolio: { master_spec: '121-00-old', sub_specs: [] }
    }, { spaces: 2 });
    await fs.writeJson(sessionNew, {
      session_id: 'governance-maintain-new-session',
      status: 'completed',
      portfolio: { master_spec: '121-00-new', sub_specs: [] }
    }, { spaces: 2 });

    const batchOld = path.join(batchSessionDir, 'governance-maintain-old-batch.json');
    const batchNew = path.join(batchSessionDir, 'governance-maintain-new-batch.json');
    await fs.writeJson(batchOld, {
      mode: 'auto-close-loop-batch',
      status: 'completed',
      total_goals: 2,
      processed_goals: 2,
      batch_session: { id: 'governance-maintain-old-batch', file: batchOld }
    }, { spaces: 2 });
    await fs.writeJson(batchNew, {
      mode: 'auto-close-loop-batch',
      status: 'completed',
      total_goals: 2,
      processed_goals: 2,
      batch_session: { id: 'governance-maintain-new-batch', file: batchNew }
    }, { spaces: 2 });

    const controllerOld = path.join(controllerSessionDir, 'governance-maintain-old-controller.json');
    const controllerNew = path.join(controllerSessionDir, 'governance-maintain-new-controller.json');
    await fs.writeJson(controllerOld, {
      mode: 'auto-close-loop-controller',
      status: 'completed',
      processed_goals: 1,
      pending_goals: 0,
      controller_session: { id: 'governance-maintain-old-controller', file: controllerOld }
    }, { spaces: 2 });
    await fs.writeJson(controllerNew, {
      mode: 'auto-close-loop-controller',
      status: 'completed',
      processed_goals: 1,
      pending_goals: 0,
      controller_session: { id: 'governance-maintain-new-controller', file: controllerNew }
    }, { spaces: 2 });

    const oldDate = new Date('2020-01-01T00:00:00.000Z');
    await fs.utimes(sessionOld, oldDate, oldDate);
    await fs.utimes(batchOld, oldDate, oldDate);
    await fs.utimes(controllerOld, oldDate, oldDate);
    const now = new Date();
    await fs.utimes(sessionNew, now, now);
    await fs.utimes(batchNew, now, now);
    await fs.utimes(controllerNew, now, now);

    const recoveryMemoryFile = path.join(tempDir, '.sce', 'auto', 'close-loop-recovery-memory.json');
    await fs.ensureDir(path.dirname(recoveryMemoryFile));
    await fs.writeJson(recoveryMemoryFile, {
      version: 1,
      signatures: {
        'maintain-apply-signature': {
          signature: 'maintain-apply-signature',
          scope: 'maintain-apply',
          attempts: 1,
          successes: 0,
          failures: 1,
          last_used_at: '2020-01-01T00:00:00.000Z',
          actions: {
            '1': {
              index: 1,
              title: 'legacy',
              attempts: 1,
              successes: 0,
              failures: 1,
              last_used_at: '2020-01-01T00:00:00.000Z'
            }
          }
        }
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'maintain',
      '--apply',
      '--session-keep',
      '1',
      '--batch-session-keep',
      '1',
      '--controller-session-keep',
      '1',
      '--recovery-memory-older-than-days',
      '30',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-maintain');
    expect(parsed.apply).toBe(true);
    expect(parsed.summary.applied_actions).toBe(4);
    expect(parsed.summary.failed_actions).toBe(0);
    expect(parsed.executed_actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'session-prune', status: 'applied' }),
      expect.objectContaining({ id: 'batch-session-prune', status: 'applied' }),
      expect.objectContaining({ id: 'controller-session-prune', status: 'applied' }),
      expect.objectContaining({ id: 'recovery-memory-prune', status: 'applied' })
    ]));
    expect(parsed.after_assessment).toEqual(expect.objectContaining({
      mode: 'auto-governance-stats'
    }));
    expect(parsed.after_assessment.archives.session.total_sessions).toBe(1);
    expect(parsed.after_assessment.archives.batch_session.total_sessions).toBe(1);
    expect(parsed.after_assessment.archives.controller_session.total_sessions).toBe(1);
    expect(parsed.after_assessment.recovery_memory.signature_count).toBe(0);

    expect(await fs.pathExists(sessionOld)).toBe(false);
    expect(await fs.pathExists(batchOld)).toBe(false);
    expect(await fs.pathExists(controllerOld)).toBe(false);
    expect(await fs.pathExists(sessionNew)).toBe(true);
    expect(await fs.pathExists(batchNew)).toBe(true);
    expect(await fs.pathExists(controllerNew)).toBe(true);
  });

  test('runs governance close-loop in plan-only mode', async () => {
    const closeLoopSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    const releaseEvidenceDir = path.join(tempDir, '.sce', 'reports', 'release-evidence');
    await fs.ensureDir(closeLoopSessionDir);
    await fs.ensureDir(releaseEvidenceDir);
    const failedSession = path.join(closeLoopSessionDir, 'governance-close-loop-plan-failed.json');
    await fs.writeJson(failedSession, {
      session_id: 'governance-close-loop-plan-failed',
      status: 'failed',
      portfolio: { master_spec: '121-00-close-loop', sub_specs: [] }
    }, { spaces: 2 });
    await fs.writeJson(path.join(releaseEvidenceDir, 'release-gate-history.json'), {
      mode: 'auto-handoff-release-gate-history',
      total_entries: 4,
      latest: {
        tag: 'v1.47.35',
        gate_passed: false,
        risk_level: 'high'
      },
      aggregates: {
        pass_rate_percent: 75,
        scene_package_batch_pass_rate_percent: 70,
        drift_alert_rate_percent: 50,
        drift_alert_runs: 2,
        drift_blocked_runs: 1
      },
      entries: []
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'close-loop',
      '--plan-only',
      '--max-rounds',
      '3',
      '--target-risk',
      'low',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-close-loop');
    expect(parsed.plan_only).toBe(true);
    expect(parsed.apply).toBe(false);
    expect(parsed.performed_rounds).toBe(1);
    expect(parsed.stop_reason).toBe('non-mutating-mode');
    expect(Array.isArray(parsed.rounds)).toBe(true);
    expect(parsed.rounds).toHaveLength(1);
    expect(parsed.rounds[0].release_gate_before).toEqual(expect.objectContaining({
      available: true,
      latest_gate_passed: false,
      drift_alert_rate_percent: 50
    }));
    expect(parsed.rounds[0].release_gate_after).toEqual(expect.objectContaining({
      available: true,
      latest_gate_passed: false,
      drift_alert_rate_percent: 50
    }));
  });

  test('runs governance close-loop with apply and converges to target risk', async () => {
    const closeLoopSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    const batchSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    const controllerSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    await fs.ensureDir(closeLoopSessionDir);
    await fs.ensureDir(batchSessionDir);
    await fs.ensureDir(controllerSessionDir);

    const sessionOld = path.join(closeLoopSessionDir, 'governance-close-loop-apply-old-session.json');
    const sessionNew = path.join(closeLoopSessionDir, 'governance-close-loop-apply-new-session.json');
    await fs.writeJson(sessionOld, {
      session_id: 'governance-close-loop-apply-old-session',
      status: 'completed',
      portfolio: { master_spec: '121-00-old', sub_specs: [] }
    }, { spaces: 2 });
    await fs.writeJson(sessionNew, {
      session_id: 'governance-close-loop-apply-new-session',
      status: 'completed',
      portfolio: { master_spec: '121-00-new', sub_specs: [] }
    }, { spaces: 2 });

    const batchOld = path.join(batchSessionDir, 'governance-close-loop-apply-old-batch.json');
    const batchNew = path.join(batchSessionDir, 'governance-close-loop-apply-new-batch.json');
    await fs.writeJson(batchOld, {
      mode: 'auto-close-loop-batch',
      status: 'completed',
      total_goals: 2,
      processed_goals: 2,
      batch_session: { id: 'governance-close-loop-apply-old-batch', file: batchOld }
    }, { spaces: 2 });
    await fs.writeJson(batchNew, {
      mode: 'auto-close-loop-batch',
      status: 'completed',
      total_goals: 2,
      processed_goals: 2,
      batch_session: { id: 'governance-close-loop-apply-new-batch', file: batchNew }
    }, { spaces: 2 });

    const controllerOld = path.join(controllerSessionDir, 'governance-close-loop-apply-old-controller.json');
    const controllerNew = path.join(controllerSessionDir, 'governance-close-loop-apply-new-controller.json');
    await fs.writeJson(controllerOld, {
      mode: 'auto-close-loop-controller',
      status: 'completed',
      processed_goals: 1,
      pending_goals: 0,
      controller_session: { id: 'governance-close-loop-apply-old-controller', file: controllerOld }
    }, { spaces: 2 });
    await fs.writeJson(controllerNew, {
      mode: 'auto-close-loop-controller',
      status: 'completed',
      processed_goals: 1,
      pending_goals: 0,
      controller_session: { id: 'governance-close-loop-apply-new-controller', file: controllerNew }
    }, { spaces: 2 });

    const oldDate = new Date('2020-01-01T00:00:00.000Z');
    await fs.utimes(sessionOld, oldDate, oldDate);
    await fs.utimes(batchOld, oldDate, oldDate);
    await fs.utimes(controllerOld, oldDate, oldDate);
    const now = new Date();
    await fs.utimes(sessionNew, now, now);
    await fs.utimes(batchNew, now, now);
    await fs.utimes(controllerNew, now, now);

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'close-loop',
      '--max-rounds',
      '3',
      '--target-risk',
      'low',
      '--session-keep',
      '1',
      '--batch-session-keep',
      '1',
      '--controller-session-keep',
      '1',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-close-loop');
    expect(parsed.apply).toBe(true);
    expect(parsed.plan_only).toBe(false);
    expect(parsed.converged).toBe(true);
    expect(parsed.stop_reason).toBe('target-risk-reached');
    expect(parsed.performed_rounds).toBeGreaterThanOrEqual(1);
    expect(parsed.final_assessment.health.risk_level).toBe('low');

    expect(await fs.pathExists(sessionOld)).toBe(false);
    expect(await fs.pathExists(batchOld)).toBe(false);
    expect(await fs.pathExists(controllerOld)).toBe(false);
    expect(await fs.pathExists(sessionNew)).toBe(true);
    expect(await fs.pathExists(batchNew)).toBe(true);
    expect(await fs.pathExists(controllerNew)).toBe(true);
  });

  test('stops governance close-loop when release gate is blocked', async () => {
    const releaseEvidenceDir = path.join(tempDir, '.sce', 'reports', 'release-evidence');
    await fs.ensureDir(releaseEvidenceDir);
    await fs.writeJson(path.join(releaseEvidenceDir, 'release-gate-history.json'), {
      mode: 'auto-handoff-release-gate-history',
      total_entries: 6,
      latest: {
        tag: 'v1.47.35',
        gate_passed: false,
        risk_level: 'high'
      },
      aggregates: {
        pass_rate_percent: 45,
        scene_package_batch_pass_rate_percent: 55,
        drift_alert_rate_percent: 100,
        drift_alert_runs: 3,
        drift_blocked_runs: 2
      },
      entries: []
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'close-loop',
      '--max-rounds',
      '3',
      '--target-risk',
      'low',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-close-loop');
    expect(parsed.stop_reason).toBe('release-gate-blocked');
    expect(parsed.converged).toBe(false);
    expect(parsed.stop_detail).toEqual(expect.objectContaining({
      type: 'release-gate-block'
    }));
    expect(parsed.stop_detail.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('latest-release-gate-failed')
    ]));
    expect(parsed.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('sce auto handoff evidence --window 5 --json')
    ]));
  });

  test('stops governance close-loop when weekly ops pressure blocks release gate', async () => {
    const releaseEvidenceDir = path.join(tempDir, '.sce', 'reports', 'release-evidence');
    await fs.ensureDir(releaseEvidenceDir);
    await fs.writeJson(path.join(releaseEvidenceDir, 'release-gate-history.json'), {
      mode: 'auto-handoff-release-gate-history',
      total_entries: 4,
      latest: {
        tag: 'v1.47.36',
        gate_passed: true,
        risk_level: 'medium',
        weekly_ops_blocked: true,
        weekly_ops_risk_level: 'high',
        weekly_ops_governance_status: 'alert',
        weekly_ops_authorization_tier_block_rate_percent: 58,
        weekly_ops_dialogue_authorization_block_rate_percent: 66,
        weekly_ops_config_warning_count: 2,
        weekly_ops_runtime_block_rate_percent: 55,
        weekly_ops_runtime_ui_mode_violation_total: 1,
        weekly_ops_runtime_ui_mode_violation_rate_percent: 25
      },
      aggregates: {
        pass_rate_percent: 100,
        scene_package_batch_pass_rate_percent: 100,
        drift_alert_rate_percent: 0,
        drift_alert_runs: 0,
        drift_blocked_runs: 0,
        weekly_ops_known_runs: 4,
        weekly_ops_blocked_runs: 2,
        weekly_ops_block_rate_percent: 50,
        weekly_ops_violations_total: 3,
        weekly_ops_warnings_total: 5,
        weekly_ops_config_warnings_total: 2,
        weekly_ops_authorization_tier_block_rate_max_percent: 58,
        weekly_ops_dialogue_authorization_block_rate_max_percent: 66,
        weekly_ops_runtime_block_rate_max_percent: 55,
        weekly_ops_runtime_ui_mode_violation_known_runs: 4,
        weekly_ops_runtime_ui_mode_violation_runs: 1,
        weekly_ops_runtime_ui_mode_violation_run_rate_percent: 25,
        weekly_ops_runtime_ui_mode_violation_total: 1,
        weekly_ops_runtime_ui_mode_violation_rate_avg_percent: 10,
        weekly_ops_runtime_ui_mode_violation_rate_max_percent: 25
      },
      entries: []
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'close-loop',
      '--max-rounds',
      '3',
      '--target-risk',
      'low',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-close-loop');
    expect(parsed.stop_reason).toBe('release-gate-blocked');
    expect(parsed.converged).toBe(false);
    expect(parsed.stop_detail).toEqual(expect.objectContaining({
      type: 'release-gate-block'
    }));
    expect(parsed.stop_detail.reasons).toEqual(expect.arrayContaining([
      'weekly-ops-latest-blocked',
      'weekly-ops-latest-risk-high',
      'weekly-ops-governance-status:alert',
      'weekly-ops-config-warnings-positive:2',
      'weekly-ops-blocked-runs-positive:2',
      'weekly-ops-auth-tier-block-rate-high:58',
      'weekly-ops-dialogue-authorization-block-rate-high:66',
      'weekly-ops-latest-runtime-block-rate-high:55',
      'weekly-ops-latest-runtime-ui-mode-violations-positive:1',
      'weekly-ops-latest-runtime-ui-mode-violation-rate-positive:25',
      'weekly-ops-runtime-block-rate-high:55',
      'weekly-ops-runtime-ui-mode-violations-positive:1',
      'weekly-ops-runtime-ui-mode-violation-run-rate-positive:25',
      'weekly-ops-runtime-ui-mode-violation-rate-high:25'
    ]));
    expect(parsed.stop_detail.weekly_ops).toEqual(expect.objectContaining({
      latest: expect.objectContaining({
        blocked: true,
        risk_level: 'high',
        governance_status: 'alert',
        authorization_tier_block_rate_percent: 58,
        dialogue_authorization_block_rate_percent: 66,
        config_warning_count: 2,
        runtime_block_rate_percent: 55,
        runtime_ui_mode_violation_total: 1,
        runtime_ui_mode_violation_rate_percent: 25
      }),
      aggregates: expect.objectContaining({
        blocked_runs: 2,
        block_rate_percent: 50,
        violations_total: 3,
        warnings_total: 5,
        config_warnings_total: 2,
        authorization_tier_block_rate_max_percent: 58,
        dialogue_authorization_block_rate_max_percent: 66,
        runtime_block_rate_max_percent: 55,
        runtime_ui_mode_violation_total: 1,
        runtime_ui_mode_violation_run_rate_percent: 25,
        runtime_ui_mode_violation_rate_max_percent: 25
      }),
      pressure: expect.objectContaining({
        blocked: true,
        high: true,
        config_warning_positive: true,
        auth_tier_block_rate_high: true,
        dialogue_authorization_block_rate_high: true,
        runtime_block_rate_high: true,
        runtime_ui_mode_violation_high: true
      })
    }));
    expect(parsed.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('release-ops-weekly-summary.js'),
      expect.stringContaining('SCE_RELEASE_WEEKLY_OPS_*'),
      expect.stringContaining('interactive-authorization-tier-evaluate.js'),
      expect.stringContaining('interactive-dialogue-governance.js'),
      expect.stringContaining('interactive-governance-report.js')
    ]));
  });

  test('stops governance close-loop when handoff quality is blocked', async () => {
    const releaseEvidenceDir = path.join(tempDir, '.sce', 'reports', 'release-evidence');
    await fs.ensureDir(releaseEvidenceDir);
    await fs.writeJson(path.join(releaseEvidenceDir, 'release-gate-history.json'), {
      mode: 'auto-handoff-release-gate-history',
      total_entries: 3,
      latest: {
        tag: 'v1.47.40',
        gate_passed: true,
        risk_level: 'low'
      },
      aggregates: {
        pass_rate_percent: 100,
        scene_package_batch_pass_rate_percent: 100,
        drift_alert_rate_percent: 0,
        drift_alert_runs: 0,
        drift_blocked_runs: 0
      },
      entries: []
    }, { spaces: 2 });
    await fs.writeJson(path.join(releaseEvidenceDir, 'handoff-runs.json'), {
      mode: 'auto-handoff-release-evidence',
      generated_at: '2026-02-18T00:00:00.000Z',
      updated_at: '2026-02-18T01:00:00.000Z',
      latest_session_id: 'handoff-blocked',
      total_runs: 1,
      sessions: [
        {
          session_id: 'handoff-blocked',
          merged_at: '2026-02-18T01:00:00.000Z',
          status: 'failed',
          gate: {
            passed: false,
            actual: {
              spec_success_rate_percent: 70,
              risk_level: 'high',
              ontology_quality_score: 66
            }
          },
          release_gate_preflight: {
            available: true,
            blocked: true
          },
          capability_coverage: {
            summary: {
              coverage_percent: 65,
              passed: false
            }
          },
          batch_summary: {
            failed_goals: 2
          }
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'close-loop',
      '--max-rounds',
      '3',
      '--target-risk',
      'low',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-close-loop');
    expect(parsed.stop_reason).toBe('release-gate-blocked');
    expect(parsed.converged).toBe(false);
    expect(parsed.stop_detail).toEqual(expect.objectContaining({
      type: 'release-gate-block'
    }));
    expect(parsed.stop_detail.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('handoff-latest-status:failed')
    ]));
    expect(parsed.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('sce auto handoff evidence --window 5 --json'),
      expect.stringContaining('--continue-from latest --continue-strategy failed-only')
    ]));
  });

  test('stops governance close-loop when handoff Moqui matrix regressions exceed gate', async () => {
    const releaseEvidenceDir = path.join(tempDir, '.sce', 'reports', 'release-evidence');
    await fs.ensureDir(releaseEvidenceDir);
    await fs.writeJson(path.join(releaseEvidenceDir, 'handoff-runs.json'), {
      mode: 'auto-handoff-release-evidence',
      generated_at: '2026-02-18T00:00:00.000Z',
      updated_at: '2026-02-18T01:00:00.000Z',
      latest_session_id: 'handoff-matrix-blocked',
      total_runs: 1,
      sessions: [
        {
          session_id: 'handoff-matrix-blocked',
          merged_at: '2026-02-18T01:00:00.000Z',
          status: 'completed',
          gate: {
            passed: true,
            actual: {
              spec_success_rate_percent: 96,
              risk_level: 'low',
              ontology_quality_score: 92
            }
          },
          release_gate_preflight: {
            available: true,
            blocked: false
          },
          capability_coverage: {
            summary: {
              coverage_percent: 100,
              passed: true
            }
          },
          moqui_baseline: {
            compare: {
              coverage_matrix_deltas: {
                business_rule_closed: { count: -1, rate_percent: -20 }
              }
            }
          },
          policy: {
            max_moqui_matrix_regressions: 0
          }
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'close-loop',
      '--max-rounds',
      '3',
      '--target-risk',
      'low',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-close-loop');
    expect(parsed.stop_reason).toBe('release-gate-blocked');
    expect(parsed.converged).toBe(false);
    expect(parsed.stop_detail).toEqual(expect.objectContaining({
      type: 'release-gate-block'
    }));
    expect(parsed.stop_detail.reasons).toEqual(expect.arrayContaining([
      'handoff-moqui-matrix-regressions-positive:1',
      'handoff-moqui-matrix-regressions-over-gate:1/0'
    ]));
    expect(parsed.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('--max-moqui-matrix-regressions 0'),
      expect.stringContaining('sce scene moqui-baseline --include-all')
    ]));
    expect(parsed.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('moqui-matrix-remediation-phased-runner.js'),
      expect.stringContaining('run:matrix-remediation-from-baseline'),
      expect.stringContaining('run:matrix-remediation-clusters-phased'),
      expect.stringContaining('matrix-remediation.capability-clusters.json'),
      expect.stringContaining('run:matrix-remediation-clusters')
    ]));
    expect(parsed.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('Moqui regression recovery sequence (recommended)'),
      expect.stringContaining('Step 1 (Cluster phased):'),
      expect.stringContaining('Step 2 (Baseline phased):')
    ]));
  });

  test('stops governance close-loop when handoff lexicon unknown counts are positive', async () => {
    const releaseEvidenceDir = path.join(tempDir, '.sce', 'reports', 'release-evidence');
    await fs.ensureDir(releaseEvidenceDir);
    await fs.writeJson(path.join(releaseEvidenceDir, 'handoff-runs.json'), {
      mode: 'auto-handoff-release-evidence',
      generated_at: '2026-02-18T00:00:00.000Z',
      updated_at: '2026-02-18T01:00:00.000Z',
      latest_session_id: 'handoff-lexicon-blocked',
      total_runs: 1,
      sessions: [
        {
          session_id: 'handoff-lexicon-blocked',
          merged_at: '2026-02-18T01:00:00.000Z',
          status: 'completed',
          gate: {
            passed: true,
            actual: {
              spec_success_rate_percent: 98,
              risk_level: 'low',
              ontology_quality_score: 95,
              capability_expected_unknown_count: 1,
              capability_provided_unknown_count: 2
            }
          },
          release_gate_preflight: {
            available: true,
            blocked: false
          },
          capability_coverage: {
            summary: {
              coverage_percent: 100,
              passed: true
            }
          }
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'close-loop',
      '--max-rounds',
      '3',
      '--target-risk',
      'low',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-close-loop');
    expect(parsed.stop_reason).toBe('release-gate-blocked');
    expect(parsed.converged).toBe(false);
    expect(parsed.stop_detail).toEqual(expect.objectContaining({
      type: 'release-gate-block'
    }));
    expect(parsed.stop_detail.reasons).toEqual(expect.arrayContaining([
      'handoff-capability-expected-unknown-positive:1',
      'handoff-capability-provided-unknown-positive:2'
    ]));
    expect(parsed.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('node scripts/moqui-lexicon-audit.js')
    ]));
  });

  test('runs governance close-loop with advisory execution enabled', async () => {
    runAutoCloseLoop.mockResolvedValue({
      status: 'completed',
      portfolio: { master_spec: '121-00-advisory', sub_specs: ['121-01-advisory'] }
    });

    const closeLoopSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    const batchSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    const controllerSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    const controllerQueueFile = path.join(tempDir, '.sce', 'auto', 'controller-queue.lines');
    await fs.ensureDir(closeLoopSessionDir);
    await fs.ensureDir(batchSessionDir);
    await fs.ensureDir(controllerSessionDir);
    await fs.ensureDir(path.dirname(controllerQueueFile));

    await fs.writeJson(path.join(closeLoopSessionDir, 'governance-advisory-failed-session.json'), {
      session_id: 'governance-advisory-failed-session',
      status: 'failed',
      portfolio: { master_spec: '121-00-advisory-master', sub_specs: [] }
    }, { spaces: 2 });

    const failedSummary = path.join(batchSessionDir, 'governance-advisory-failed-summary.json');
    await fs.writeJson(failedSummary, {
      mode: 'auto-close-loop-batch',
      status: 'failed',
      total_goals: 1,
      processed_goals: 1,
      completed_goals: 0,
      failed_goals: 1,
      results: [
        {
          index: 1,
          goal: 'governance advisory recover goal',
          status: 'failed',
          error: 'timeout'
        }
      ],
      batch_session: {
        id: 'governance-advisory-failed-summary',
        file: failedSummary
      }
    }, { spaces: 2 });

    const controllerSessionFile = path.join(controllerSessionDir, 'governance-advisory-controller.json');
    await fs.writeJson(controllerSessionFile, {
      mode: 'auto-close-loop-controller',
      status: 'partial-failed',
      queue_file: controllerQueueFile,
      queue_format: 'lines',
      processed_goals: 0,
      pending_goals: 1,
      controller_session: {
        id: 'governance-advisory-controller',
        file: controllerSessionFile
      }
    }, { spaces: 2 });
    await fs.writeFile(controllerQueueFile, 'controller advisory queued goal\n', 'utf8');

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'close-loop',
      '--max-rounds',
      '1',
      '--target-risk',
      'high',
      '--execute-advisory',
      '--advisory-recover-max-rounds',
      '2',
      '--advisory-controller-max-cycles',
      '1',
      '--dry-run',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-close-loop');
    expect(parsed.execute_advisory).toBe(true);
    expect(parsed.stop_reason).toBe('non-mutating-mode');
    expect(parsed.advisory_policy).toEqual(expect.objectContaining({
      recover_max_rounds: 2,
      controller_max_cycles: 1
    }));
    expect(parsed.advisory_summary).toEqual(expect.objectContaining({
      planned_actions: 2,
      executed_actions: 2,
      failed_actions: 0
    }));
    expect(parsed.rounds[0]).toEqual(expect.objectContaining({
      advisory_planned_actions: 2,
      advisory_executed_actions: 2,
      advisory_failed_actions: 0
    }));
    expect(Array.isArray(parsed.rounds[0].advisory_actions)).toBe(true);
    expect(parsed.rounds[0].advisory_actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'recover-latest', status: 'applied' }),
      expect.objectContaining({ id: 'controller-resume-latest', status: 'applied' })
    ]));
  });

  test('skips unavailable advisory sources without failing governance close-loop', async () => {
    const closeLoopSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    await fs.ensureDir(closeLoopSessionDir);
    await fs.writeJson(path.join(closeLoopSessionDir, 'governance-advisory-skip-failed-session.json'), {
      session_id: 'governance-advisory-skip-failed-session',
      status: 'failed',
      portfolio: { master_spec: '121-00-advisory-skip', sub_specs: [] }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'close-loop',
      '--max-rounds',
      '2',
      '--target-risk',
      'low',
      '--execute-advisory',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-close-loop');
    expect(parsed.execute_advisory).toBe(true);
    expect(parsed.stop_reason).toBe('no-applicable-actions');
    expect(parsed.advisory_summary).toEqual(expect.objectContaining({
      planned_actions: 1,
      executed_actions: 0,
      failed_actions: 0,
      skipped_actions: 1
    }));
    expect(parsed.rounds[0]).toEqual(expect.objectContaining({
      advisory_planned_actions: 1,
      advisory_executed_actions: 0,
      advisory_failed_actions: 0,
      advisory_skipped_actions: 1
    }));
    expect(parsed.rounds[0].advisory_actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'recover-latest', status: 'skipped' })
    ]));
  });

  test('persists and resumes governance close-loop session', async () => {
    const closeLoopSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    await fs.ensureDir(closeLoopSessionDir);
    await fs.writeJson(path.join(closeLoopSessionDir, 'governance-resume-failed-session.json'), {
      session_id: 'governance-resume-failed-session',
      status: 'failed',
      portfolio: { master_spec: '121-00-governance-resume', sub_specs: [] }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'close-loop',
      '--plan-only',
      '--max-rounds',
      '3',
      '--governance-session-id',
      'gov-resume-session',
      '--json'
    ]);

    const firstOutput = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const firstPayload = JSON.parse(firstOutput.trim());
    expect(firstPayload.mode).toBe('auto-governance-close-loop');
    expect(firstPayload.governance_session).toEqual(expect.objectContaining({
      id: 'gov-resume-session'
    }));
    expect(firstPayload.performed_rounds).toBe(1);
    expect(firstPayload.stop_reason).toBe('non-mutating-mode');

    const governanceSessionFile = firstPayload.governance_session.file;
    expect(await fs.pathExists(governanceSessionFile)).toBe(true);

    logSpy.mockClear();
    const resumedProgram = buildProgram();
    await resumedProgram.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'close-loop',
      '--governance-resume',
      'gov-resume-session',
      '--plan-only',
      '--max-rounds',
      '3',
      '--json'
    ]);

    const resumedOutput = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const resumedPayload = JSON.parse(resumedOutput.trim());
    expect(resumedPayload.mode).toBe('auto-governance-close-loop');
    expect(resumedPayload.resumed_from_governance_session).toEqual(expect.objectContaining({
      id: 'gov-resume-session'
    }));
    expect(resumedPayload.governance_session).toEqual(expect.objectContaining({
      id: 'gov-resume-session'
    }));
    expect(resumedPayload.performed_rounds).toBe(2);
    expect(resumedPayload.rounds).toHaveLength(2);
    expect(resumedPayload.stop_reason).toBe('non-mutating-mode');
  });

  test('inherits persisted governance policy defaults on resume', async () => {
    const firstProgram = buildProgram();
    await firstProgram.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'close-loop',
      '--plan-only',
      '--max-rounds',
      '3',
      '--target-risk',
      'medium',
      '--execute-advisory',
      '--advisory-recover-max-rounds',
      '5',
      '--advisory-controller-max-cycles',
      '30',
      '--governance-session-id',
      'gov-resume-policy-defaults',
      '--json'
    ]);

    logSpy.mockClear();
    const resumedProgram = buildProgram();
    await resumedProgram.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'close-loop',
      '--governance-resume',
      'gov-resume-policy-defaults',
      '--plan-only',
      '--max-rounds',
      '4',
      '--json'
    ]);

    const resumedOutput = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const resumedPayload = JSON.parse(resumedOutput.trim());
    expect(resumedPayload.mode).toBe('auto-governance-close-loop');
    expect(resumedPayload.target_risk).toBe('medium');
    expect(resumedPayload.execute_advisory).toBe(true);
    expect(resumedPayload.advisory_policy).toEqual(expect.objectContaining({
      recover_max_rounds: 5,
      controller_max_cycles: 30
    }));
  });

  test('guards governance resume option drift unless override is enabled', async () => {
    const firstProgram = buildProgram();
    await firstProgram.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'close-loop',
      '--plan-only',
      '--max-rounds',
      '3',
      '--target-risk',
      'low',
      '--governance-session-id',
      'gov-resume-drift-guard',
      '--json'
    ]);

    logSpy.mockClear();
    errorSpy.mockClear();
    const rejectedProgram = buildProgram();
    await expect(
      rejectedProgram.parseAsync([
        'node',
        'sce',
        'auto',
        'governance',
        'close-loop',
        '--governance-resume',
        'gov-resume-drift-guard',
        '--plan-only',
        '--target-risk',
        'high',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');
    const driftOutput = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const driftPayload = JSON.parse(driftOutput.trim());
    expect(driftPayload.success).toBe(false);
    expect(driftPayload.error).toContain('Governance resume option drift detected');
    expect(driftPayload.error).toContain('--governance-resume-allow-drift');

    logSpy.mockClear();
    errorSpy.mockClear();
    const overrideProgram = buildProgram();
    await overrideProgram.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'close-loop',
      '--governance-resume',
      'gov-resume-drift-guard',
      '--governance-resume-allow-drift',
      '--plan-only',
      '--target-risk',
      'high',
      '--json'
    ]);
    const overrideOutput = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const overridePayload = JSON.parse(overrideOutput.trim());
    expect(overridePayload.target_risk).toBe('high');
    expect(overridePayload.mode).toBe('auto-governance-close-loop');
  });

  test('applies governance session retention policy after close-loop run', async () => {
    const governanceSessionDir = path.join(tempDir, '.sce', 'auto', 'governance-close-loop-sessions');
    await fs.ensureDir(governanceSessionDir);
    const staleFile = path.join(governanceSessionDir, 'governance-retention-stale.json');
    await fs.writeJson(staleFile, {
      mode: 'auto-governance-close-loop',
      status: 'stopped',
      governance_session: {
        id: 'governance-retention-stale',
        file: staleFile
      }
    }, { spaces: 2 });

    const oldDate = new Date('2020-01-01T00:00:00.000Z');
    await fs.utimes(staleFile, oldDate, oldDate);

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'close-loop',
      '--plan-only',
      '--governance-session-id',
      'governance-retention-current',
      '--governance-session-keep',
      '0',
      '--json'
    ]);
    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-close-loop');
    expect(parsed.governance_session_prune).toEqual(expect.objectContaining({
      mode: 'auto-governance-session-prune',
      deleted_count: 1
    }));
    expect(parsed.governance_session_prune.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'governance-retention-stale' })
    ]));
    expect(await fs.pathExists(staleFile)).toBe(false);
    const currentFile = path.join(governanceSessionDir, 'governance-retention-current.json');
    expect(await fs.pathExists(currentFile)).toBe(true);
  });

  test('lists, stats, and prunes governance close-loop sessions in json mode', async () => {
    const governanceSessionDir = path.join(tempDir, '.sce', 'auto', 'governance-close-loop-sessions');
    await fs.ensureDir(governanceSessionDir);

    const oldSession = path.join(governanceSessionDir, 'governance-session-old.json');
    const newSession = path.join(governanceSessionDir, 'governance-session-new.json');
    await fs.writeJson(oldSession, {
      mode: 'auto-governance-close-loop',
      status: 'failed',
      target_risk: 'low',
      max_rounds: 3,
      performed_rounds: 3,
      converged: false,
      stop_reason: 'release-gate-blocked',
      stop_detail: {
        type: 'release-gate-block',
        reasons: [
          'weekly-ops-latest-blocked',
          'weekly-ops-config-warnings-positive:2',
          'weekly-ops-auth-tier-block-rate-high:58',
          'weekly-ops-dialogue-authorization-block-rate-high:66'
        ],
        weekly_ops: {
          latest: {
            blocked: true,
            risk_level: 'high',
            governance_status: 'alert',
            authorization_tier_block_rate_percent: 58,
            dialogue_authorization_block_rate_percent: 66,
            config_warning_count: 2,
            runtime_block_rate_percent: 55,
            runtime_ui_mode_violation_total: 1,
            runtime_ui_mode_violation_rate_percent: 25
          },
          aggregates: {
            blocked_runs: 2,
            block_rate_percent: 50,
            violations_total: 3,
            warnings_total: 5,
            config_warnings_total: 2,
            authorization_tier_block_rate_max_percent: 58,
            dialogue_authorization_block_rate_max_percent: 66,
            runtime_block_rate_max_percent: 55,
            runtime_ui_mode_violation_total: 1,
            runtime_ui_mode_violation_run_rate_percent: 25,
            runtime_ui_mode_violation_rate_max_percent: 25
          },
          pressure: {
            blocked: true,
            high: true,
            config_warning_positive: true,
            auth_tier_block_rate_high: true,
            dialogue_authorization_block_rate_high: true,
            runtime_block_rate_high: true,
            runtime_ui_mode_violation_high: true
          }
        }
      },
      execute_advisory: true,
      advisory_summary: {
        planned_actions: 2,
        executed_actions: 1,
        failed_actions: 1,
        skipped_actions: 0
      },
      final_assessment: {
        health: {
          risk_level: 'high',
          release_gate: {
            available: true,
            latest_gate_passed: false,
            pass_rate_percent: 40,
            scene_package_batch_pass_rate_percent: 50,
            drift_alert_rate_percent: 100,
            drift_blocked_runs: 1
          }
        }
      },
      rounds: [
        {
          round: 1,
          release_gate_before: {
            available: true,
            latest_gate_passed: false,
            pass_rate_percent: 40,
            scene_package_batch_pass_rate_percent: 50,
            drift_alert_rate_percent: 100,
            drift_blocked_runs: 1
          },
          release_gate_after: {
            available: true,
            latest_gate_passed: false,
            pass_rate_percent: 45,
            scene_package_batch_pass_rate_percent: 55,
            drift_alert_rate_percent: 80,
            drift_blocked_runs: 1
          }
        }
      ],
      governance_session: {
        id: 'governance-session-old',
        file: oldSession
      }
    }, { spaces: 2 });
    await fs.writeJson(newSession, {
      mode: 'auto-governance-close-loop',
      status: 'completed',
      target_risk: 'low',
      max_rounds: 3,
      performed_rounds: 1,
      converged: true,
      stop_reason: 'target-risk-reached',
      execute_advisory: false,
      advisory_summary: {
        planned_actions: 0,
        executed_actions: 0,
        failed_actions: 0,
        skipped_actions: 0
      },
      final_assessment: {
        health: {
          risk_level: 'low',
          release_gate: {
            available: true,
            latest_gate_passed: true,
            pass_rate_percent: 100,
            scene_package_batch_pass_rate_percent: 100,
            drift_alert_rate_percent: 0,
            drift_blocked_runs: 0
          }
        }
      },
      rounds: [
        {
          round: 1,
          release_gate_before: {
            available: true,
            latest_gate_passed: true,
            pass_rate_percent: 100,
            scene_package_batch_pass_rate_percent: 100,
            drift_alert_rate_percent: 0,
            drift_blocked_runs: 0
          },
          release_gate_after: {
            available: true,
            latest_gate_passed: true,
            pass_rate_percent: 100,
            scene_package_batch_pass_rate_percent: 100,
            drift_alert_rate_percent: 0,
            drift_blocked_runs: 0
          }
        }
      ],
      governance_session: {
        id: 'governance-session-new',
        file: newSession
      },
      resumed_from_governance_session: {
        id: 'governance-session-old',
        file: oldSession
      }
    }, { spaces: 2 });

    await fs.utimes(oldSession, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));
    await fs.utimes(newSession, new Date(), new Date());

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'session',
      'list',
      '--status',
      'failed',
      '--json'
    ]);
    const listOutput = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const listPayload = JSON.parse(listOutput.trim());
    expect(listPayload.mode).toBe('auto-governance-session-list');
    expect(listPayload.total).toBe(1);
    expect(listPayload.resume_only).toBe(false);
    expect(listPayload.resumed_sessions).toBe(0);
    expect(listPayload.fresh_sessions).toBe(1);
    expect(listPayload.status_counts).toEqual(expect.objectContaining({
      failed: 1
    }));
    expect(listPayload.sessions).toHaveLength(1);
    expect(listPayload.sessions[0].id).toBe('governance-session-old');
    expect(listPayload.sessions[0].release_gate_latest_gate_passed).toBe(false);
    expect(listPayload.sessions[0].round_release_gate_changed).toBe(1);
    expect(listPayload.sessions[0].stop_detail_weekly_ops_available).toBe(true);
    expect(listPayload.sessions[0].stop_detail_weekly_ops_high_pressure).toBe(true);
    expect(listPayload.sessions[0].stop_detail_weekly_ops_config_warning_positive).toBe(true);
    expect(listPayload.sessions[0].stop_detail_weekly_ops_runtime_block_rate_high).toBe(true);
    expect(listPayload.sessions[0].stop_detail_weekly_ops_runtime_ui_mode_violation_high).toBe(true);

    logSpy.mockClear();
    const resumedListProgram = buildProgram();
    await resumedListProgram.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'session',
      'list',
      '--resume-only',
      '--json'
    ]);
    const resumedListOutput = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const resumedListPayload = JSON.parse(resumedListOutput.trim());
    expect(resumedListPayload.mode).toBe('auto-governance-session-list');
    expect(resumedListPayload.total).toBe(1);
    expect(resumedListPayload.resume_only).toBe(true);
    expect(resumedListPayload.resumed_sessions).toBe(1);
    expect(resumedListPayload.fresh_sessions).toBe(0);
    expect(resumedListPayload.sessions).toHaveLength(1);
    expect(resumedListPayload.sessions[0].id).toBe('governance-session-new');

    logSpy.mockClear();
    const statsProgram = buildProgram();
    await statsProgram.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'session',
      'stats',
      '--json'
    ]);
    const statsOutput = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const statsPayload = JSON.parse(statsOutput.trim());
    expect(statsPayload.mode).toBe('auto-governance-session-stats');
    expect(statsPayload.total_sessions).toBe(2);
    expect(statsPayload.resumed_sessions).toBe(1);
    expect(statsPayload.fresh_sessions).toBe(1);
    expect(statsPayload.resumed_rate_percent).toBe(50);
    expect(statsPayload.completed_sessions).toBe(1);
    expect(statsPayload.failed_sessions).toBe(1);
    expect(statsPayload.converged_sessions).toBe(1);
    expect(statsPayload.resumed_from_counts).toEqual(expect.objectContaining({
      'governance-session-old': 1
    }));
    expect(statsPayload.final_risk_counts).toEqual(expect.objectContaining({
      high: 1,
      low: 1
    }));
    expect(statsPayload.release_gate).toEqual(expect.objectContaining({
      observed_sessions: 2,
      failed_sessions: 1,
      failed_rate_percent: 50,
      drift_alert_sessions: 1,
      blocked_sessions: 1,
      average_pass_rate_percent: 70,
      average_scene_package_batch_pass_rate_percent: 75,
      average_drift_alert_rate_percent: 50,
      round_telemetry_observed: 2,
      round_telemetry_changed: 1,
      round_telemetry_change_rate_percent: 50
    }));
    expect(statsPayload.release_gate.weekly_ops_stop).toEqual(expect.objectContaining({
      sessions: 1,
      session_rate_percent: 50,
      blocked_sessions: 1,
      blocked_session_rate_percent: 100,
      high_pressure_sessions: 1,
      high_pressure_session_rate_percent: 100,
      config_warning_positive_sessions: 1,
      config_warning_positive_rate_percent: 100,
      auth_tier_pressure_sessions: 1,
      auth_tier_pressure_rate_percent: 100,
      dialogue_authorization_pressure_sessions: 1,
      dialogue_authorization_pressure_rate_percent: 100,
      runtime_block_rate_high_sessions: 1,
      runtime_block_rate_high_rate_percent: 100,
      runtime_ui_mode_violation_high_sessions: 1,
      runtime_ui_mode_violation_high_rate_percent: 100,
      blocked_runs_sum: 2,
      average_blocked_runs: 2,
      average_block_rate_percent: 50,
      config_warnings_total_sum: 2,
      average_config_warnings_total: 2,
      average_auth_tier_block_rate_percent: 58,
      average_dialogue_authorization_block_rate_percent: 66,
      average_runtime_block_rate_percent: 55,
      runtime_ui_mode_violation_total_sum: 1,
      average_runtime_ui_mode_violation_total: 1,
      average_runtime_ui_mode_violation_rate_percent: 25
    }));

    logSpy.mockClear();
    const pruneProgram = buildProgram();
    await pruneProgram.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'session',
      'prune',
      '--keep',
      '1',
      '--json'
    ]);
    const pruneOutput = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const prunePayload = JSON.parse(pruneOutput.trim());
    expect(prunePayload.mode).toBe('auto-governance-session-prune');
    expect(prunePayload.deleted_count).toBe(1);
    expect(prunePayload.errors).toEqual([]);
    expect(await fs.pathExists(oldSession)).toBe(false);
    expect(await fs.pathExists(newSession)).toBe(true);
  });

  test('aggregates weekly-ops stop pressure from legacy reason-only governance sessions', async () => {
    const governanceSessionDir = path.join(tempDir, '.sce', 'auto', 'governance-close-loop-sessions');
    await fs.ensureDir(governanceSessionDir);

    const legacySession = path.join(governanceSessionDir, 'governance-session-legacy-weekly-ops.json');
    await fs.writeJson(legacySession, {
      mode: 'auto-governance-close-loop',
      status: 'failed',
      target_risk: 'low',
      max_rounds: 2,
      performed_rounds: 1,
      converged: false,
      stop_reason: 'release-gate-blocked',
      stop_detail: {
        type: 'release-gate-block',
        reasons: [
          'weekly-ops-latest-blocked',
          'weekly-ops-latest-risk-high',
          'weekly-ops-config-warnings-positive:2',
          'weekly-ops-auth-tier-block-rate-high:58',
          'weekly-ops-dialogue-authorization-block-rate-high:66',
          'weekly-ops-runtime-block-rate-high:55',
          'weekly-ops-runtime-ui-mode-violations-positive:1'
        ]
      },
      final_assessment: {
        health: {
          risk_level: 'high',
          release_gate: {
            available: true,
            latest_gate_passed: false,
            pass_rate_percent: 65,
            scene_package_batch_pass_rate_percent: 70,
            drift_alert_rate_percent: 0,
            drift_blocked_runs: 0
          }
        }
      },
      governance_session: {
        id: 'governance-session-legacy-weekly-ops',
        file: legacySession
      }
    }, { spaces: 2 });
    await fs.utimes(legacySession, new Date('2026-02-20T00:00:00.000Z'), new Date('2026-02-20T00:00:00.000Z'));

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'governance',
      'session',
      'stats',
      '--json'
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-governance-session-stats');
    expect(parsed.total_sessions).toBe(1);
    expect(parsed.release_gate.weekly_ops_stop).toEqual(expect.objectContaining({
      sessions: 1,
      session_rate_percent: 100,
      blocked_sessions: 1,
      blocked_session_rate_percent: 100,
      high_pressure_sessions: 1,
      high_pressure_session_rate_percent: 100,
      config_warning_positive_sessions: 1,
      config_warning_positive_rate_percent: 100,
      auth_tier_pressure_sessions: 1,
      auth_tier_pressure_rate_percent: 100,
      dialogue_authorization_pressure_sessions: 1,
      dialogue_authorization_pressure_rate_percent: 100,
      runtime_block_rate_high_sessions: 1,
      runtime_block_rate_high_rate_percent: 100,
      runtime_ui_mode_violation_high_sessions: 1,
      runtime_ui_mode_violation_high_rate_percent: 100
    }));
    expect(parsed.latest_sessions[0]).toEqual(expect.objectContaining({
      id: 'governance-session-legacy-weekly-ops',
      stop_detail_weekly_ops_available: true,
      stop_detail_weekly_ops_blocked: true,
      stop_detail_weekly_ops_high_pressure: true,
      stop_detail_weekly_ops_config_warning_positive: true,
      stop_detail_weekly_ops_runtime_block_rate_high: true,
      stop_detail_weekly_ops_runtime_ui_mode_violation_high: true
    }));
  });

  test('prunes close-loop-controller summary sessions with keep policy', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    await fs.ensureDir(sessionDir);
    const oldSession = path.join(sessionDir, 'old-controller-session.json');
    const newSession = path.join(sessionDir, 'new-controller-session.json');
    await fs.writeJson(oldSession, {
      mode: 'auto-close-loop-controller',
      controller_session: { id: 'old-controller-session', file: oldSession }
    }, { spaces: 2 });
    await fs.writeJson(newSession, {
      mode: 'auto-close-loop-controller',
      controller_session: { id: 'new-controller-session', file: newSession }
    }, { spaces: 2 });
    await fs.utimes(oldSession, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));
    await fs.utimes(newSession, new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-01T00:00:00.000Z'));

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'controller-session', 'prune', '--keep', '1', '--json']);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    const parsed = JSON.parse(output.trim());
    expect(parsed.mode).toBe('auto-controller-session-prune');
    expect(parsed.deleted_count).toBe(1);
    expect(await fs.pathExists(newSession)).toBe(true);
    expect(await fs.pathExists(oldSession)).toBe(false);
  });

  test('aggregates weekly autonomous KPI trend in json mode', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    await fs.ensureDir(sessionDir);
    const fileA = path.join(sessionDir, 'week-a.json');
    const fileB = path.join(sessionDir, 'week-b.json');
    await fs.writeJson(fileA, {
      mode: 'auto-close-loop-program',
      status: 'completed',
      updated_at: '2026-02-14T10:00:00.000Z',
      total_goals: 2,
      processed_goals: 2,
      failed_goals: 0,
      metrics: {
        success_rate_percent: 100,
        total_sub_specs: 8
      },
      program_kpi: {
        completion_rate_percent: 100
      },
      program_gate_effective: {
        passed: true
      },
      spec_session_budget: {
        estimated_created: 2
      }
    }, { spaces: 2 });
    await fs.writeJson(fileB, {
      mode: 'auto-close-loop-recover',
      status: 'partial-failed',
      updated_at: '2026-02-13T10:00:00.000Z',
      total_goals: 2,
      processed_goals: 2,
      failed_goals: 1,
      metrics: {
        success_rate_percent: 50,
        total_sub_specs: 4
      },
      program_kpi: {
        completion_rate_percent: 50
      },
      program_gate_effective: {
        passed: false
      },
      spec_session_budget: {
        estimated_created: 1
      }
    }, { spaces: 2 });
    await fs.utimes(fileA, new Date('2026-02-14T10:00:00.000Z'), new Date('2026-02-14T10:00:00.000Z'));
    await fs.utimes(fileB, new Date('2026-02-13T10:00:00.000Z'), new Date('2026-02-13T10:00:00.000Z'));

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'kpi',
      'trend',
      '--weeks',
      '52',
      '--json'
    ]);

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.mode).toBe('auto-kpi-trend');
    expect(parsed.total_runs).toBe(2);
    expect(parsed.mode_breakdown).toEqual(expect.objectContaining({
      program: 1,
      recover: 1
    }));
    expect(parsed.overall).toEqual(expect.objectContaining({
      runs: 2,
      success_rate_percent: 75
    }));
    expect(Array.isArray(parsed.trend)).toBe(true);
    expect(parsed.trend.length).toBeGreaterThan(0);
    expect(parsed.period_unit).toBe('week');
    expect(Array.isArray(parsed.anomalies)).toBe(true);
  });

  test('aggregates daily autonomous KPI trend in json mode and flags anomalies', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    await fs.ensureDir(sessionDir);
    const fileA = path.join(sessionDir, 'day-a.json');
    const fileB = path.join(sessionDir, 'day-b.json');
    const fileC = path.join(sessionDir, 'day-c.json');
    await fs.writeJson(fileA, {
      mode: 'auto-close-loop-program',
      status: 'completed',
      updated_at: '2026-02-12T10:00:00.000Z',
      failed_goals: 0,
      metrics: {
        success_rate_percent: 100,
        total_sub_specs: 5,
        total_rate_limit_signals: 0,
        total_rate_limit_backoff_ms: 0,
        average_rate_limit_signals_per_goal: 0,
        average_rate_limit_backoff_ms_per_goal: 0
      },
      program_kpi: { completion_rate_percent: 100 },
      program_gate_effective: { passed: true },
      spec_session_budget: { estimated_created: 1 }
    }, { spaces: 2 });
    await fs.writeJson(fileB, {
      mode: 'auto-close-loop-program',
      status: 'completed',
      updated_at: '2026-02-13T10:00:00.000Z',
      failed_goals: 0,
      metrics: {
        success_rate_percent: 100,
        total_sub_specs: 5,
        total_rate_limit_signals: 0,
        total_rate_limit_backoff_ms: 0,
        average_rate_limit_signals_per_goal: 0,
        average_rate_limit_backoff_ms_per_goal: 0
      },
      program_kpi: { completion_rate_percent: 100 },
      program_gate_effective: { passed: true },
      spec_session_budget: { estimated_created: 1 }
    }, { spaces: 2 });
    await fs.writeJson(fileC, {
      mode: 'auto-close-loop-recover',
      status: 'partial-failed',
      updated_at: '2026-02-14T10:00:00.000Z',
      failed_goals: 4,
      metrics: {
        success_rate_percent: 40,
        total_sub_specs: 10,
        total_rate_limit_signals: 12,
        total_rate_limit_backoff_ms: 4800,
        average_rate_limit_signals_per_goal: 12,
        average_rate_limit_backoff_ms_per_goal: 4800
      },
      program_kpi: { completion_rate_percent: 40 },
      program_gate_effective: { passed: false },
      spec_session_budget: { estimated_created: 7 }
    }, { spaces: 2 });
    await fs.utimes(fileA, new Date('2026-02-12T10:00:00.000Z'), new Date('2026-02-12T10:00:00.000Z'));
    await fs.utimes(fileB, new Date('2026-02-13T10:00:00.000Z'), new Date('2026-02-13T10:00:00.000Z'));
    await fs.utimes(fileC, new Date('2026-02-14T10:00:00.000Z'), new Date('2026-02-14T10:00:00.000Z'));

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'kpi',
      'trend',
      '--weeks',
      '52',
      '--period',
      'day',
      '--json'
    ]);

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.mode).toBe('auto-kpi-trend');
    expect(parsed.period_unit).toBe('day');
    expect(parsed.total_runs).toBe(3);
    expect(parsed.trend.map(item => item.period)).toEqual(
      expect.arrayContaining(['2026-02-12', '2026-02-13', '2026-02-14'])
    );
    expect(parsed.anomaly_detection).toEqual(expect.objectContaining({
      enabled: true,
      latest_period: '2026-02-14'
    }));
    expect(parsed.anomalies).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'success-rate-drop' }),
      expect.objectContaining({ type: 'failed-goals-spike' }),
      expect.objectContaining({ type: 'spec-growth-spike' }),
      expect.objectContaining({ type: 'rate-limit-spike' })
    ]));
  });

  test('aggregates controller autonomous KPI trend in controller mode', async () => {
    const batchSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    const controllerSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    await fs.ensureDir(batchSessionDir);
    await fs.ensureDir(controllerSessionDir);

    const nestedProgramSummary = path.join(batchSessionDir, 'nested-program-summary.json');
    await fs.writeJson(nestedProgramSummary, {
      mode: 'auto-close-loop-program',
      status: 'completed',
      metrics: {
        total_sub_specs: 6
      },
      spec_session_budget: {
        estimated_created: 3
      }
    }, { spaces: 2 });

    const controllerSummary = path.join(controllerSessionDir, 'controller-a.json');
    await fs.writeJson(controllerSummary, {
      mode: 'auto-close-loop-controller',
      status: 'partial-failed',
      updated_at: '2026-02-14T10:00:00.000Z',
      processed_goals: 2,
      completed_goals: 1,
      failed_goals: 1,
      pending_goals: 0,
      results: [
        {
          goal: 'deliver one controller goal',
          status: 'failed',
          batch_session_file: nestedProgramSummary
        }
      ]
    }, { spaces: 2 });
    await fs.utimes(controllerSummary, new Date('2026-02-14T10:00:00.000Z'), new Date('2026-02-14T10:00:00.000Z'));

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'kpi',
      'trend',
      '--weeks',
      '52',
      '--mode',
      'controller',
      '--json'
    ]);

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.mode).toBe('auto-kpi-trend');
    expect(parsed.mode_filter).toBe('controller');
    expect(parsed.total_runs).toBe(1);
    expect(parsed.mode_breakdown).toEqual(expect.objectContaining({
      controller: 1
    }));
    expect(parsed.overall).toEqual(expect.objectContaining({
      success_rate_percent: 50,
      completion_rate_percent: 100,
      average_failed_goals: 1,
      average_total_sub_specs: 6,
      average_estimated_spec_created: 3
    }));
  });

  test('supports autonomous KPI trend csv output and csv file export', async () => {
    const sessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    await fs.ensureDir(sessionDir);
    const outputPath = path.join(tempDir, 'kpi-trend.csv');
    const fileA = path.join(sessionDir, 'csv-a.json');
    const fileB = path.join(sessionDir, 'csv-b.json');
    await fs.writeJson(fileA, {
      mode: 'auto-close-loop-program',
      status: 'completed',
      updated_at: '2026-02-14T10:00:00.000Z',
      failed_goals: 0,
      metrics: { success_rate_percent: 100, total_sub_specs: 4 },
      program_kpi: { completion_rate_percent: 100 },
      program_gate_effective: { passed: true },
      spec_session_budget: { estimated_created: 1 }
    }, { spaces: 2 });
    await fs.writeJson(fileB, {
      mode: 'auto-close-loop-recover',
      status: 'partial-failed',
      updated_at: '2026-02-13T10:00:00.000Z',
      failed_goals: 1,
      metrics: { success_rate_percent: 50, total_sub_specs: 2 },
      program_kpi: { completion_rate_percent: 50 },
      program_gate_effective: { passed: false },
      spec_session_budget: { estimated_created: 2 }
    }, { spaces: 2 });
    await fs.utimes(fileA, new Date('2026-02-14T10:00:00.000Z'), new Date('2026-02-14T10:00:00.000Z'));
    await fs.utimes(fileB, new Date('2026-02-13T10:00:00.000Z'), new Date('2026-02-13T10:00:00.000Z'));

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'kpi',
      'trend',
      '--weeks',
      '52',
      '--csv',
      '--out',
      outputPath
    ]);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(output).toContain('period,runs,completed_runs');
    expect(output).toContain('overall');
    expect(await fs.pathExists(outputPath)).toBe(true);
    const outputFile = await fs.readFile(outputPath, 'utf8');
    expect(outputFile).toContain('period,runs,completed_runs');
    expect(outputFile).toContain('overall');
  });

  test('validates kpi trend period option', async () => {
    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'kpi',
        'trend',
        '--period',
        'month'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--period must be one of: week, day.');
  });

  test('validates kpi trend mode option', async () => {
    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'kpi',
        'trend',
        '--mode',
        'unknown'
      ])
    ).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(errorOutput).toContain('--mode must be one of: all, batch, program, recover, controller.');
  });

  test('shows recovery memory stats in json mode', async () => {
    const memoryFile = path.join(tempDir, '.sce', 'auto', 'close-loop-recovery-memory.json');
    await fs.ensureDir(path.dirname(memoryFile));
    await fs.writeJson(memoryFile, {
      version: 1,
      signatures: {
        'sig-a': {
          attempts: 2,
          successes: 1,
          failures: 1,
          last_used_at: '2026-02-14T10:00:00.000Z',
          actions: {
            'action-1|resume': {
              attempts: 2,
              successes: 1,
              failures: 1,
              last_used_at: '2026-02-14T10:00:00.000Z'
            }
          }
        }
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'recovery-memory', 'show', '--json']);

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.mode).toBe('auto-recovery-memory-show');
    expect(parsed.stats).toEqual(expect.objectContaining({
      signature_count: 1,
      action_count: 1
    }));
  });

  test('prunes and clears recovery memory through commands', async () => {
    const memoryFile = path.join(tempDir, '.sce', 'auto', 'close-loop-recovery-memory.json');
    await fs.ensureDir(path.dirname(memoryFile));
    await fs.writeJson(memoryFile, {
      version: 1,
      signatures: {
        'sig-old': {
          attempts: 1,
          successes: 0,
          failures: 1,
          last_used_at: '2020-01-01T00:00:00.000Z',
          actions: {
            'action-1|old': {
              attempts: 1,
              successes: 0,
              failures: 1,
              last_used_at: '2020-01-01T00:00:00.000Z'
            }
          }
        },
        'sig-new': {
          attempts: 1,
          successes: 1,
          failures: 0,
          last_used_at: '2026-01-01T00:00:00.000Z',
          actions: {
            'action-1|new': {
              attempts: 1,
              successes: 1,
              failures: 0,
              last_used_at: '2026-01-01T00:00:00.000Z'
            }
          }
        }
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'recovery-memory',
      'prune',
      '--older-than-days',
      '365',
      '--json'
    ]);

    const pruned = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(pruned.mode).toBe('auto-recovery-memory-prune');
    expect(pruned.signatures_removed).toBeGreaterThanOrEqual(1);

    logSpy.mockClear();
    await program.parseAsync(['node', 'sce', 'auto', 'recovery-memory', 'clear', '--json']);
    const cleared = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(cleared.mode).toBe('auto-recovery-memory-clear');
    expect(await fs.pathExists(memoryFile)).toBe(false);
  });

  test('filters and prunes recovery memory by scope', async () => {
    const memoryFile = path.join(tempDir, '.sce', 'auto', 'close-loop-recovery-memory.json');
    await fs.ensureDir(path.dirname(memoryFile));
    await fs.writeJson(memoryFile, {
      version: 1,
      signatures: {
        'scope-a|sig-old': {
          scope: 'scope-a',
          attempts: 1,
          successes: 0,
          failures: 1,
          last_used_at: '2020-01-01T00:00:00.000Z',
          actions: {
            'action-1|old': {
              attempts: 1,
              successes: 0,
              failures: 1,
              last_used_at: '2020-01-01T00:00:00.000Z'
            }
          }
        },
        'scope-b|sig-new': {
          scope: 'scope-b',
          attempts: 1,
          successes: 1,
          failures: 0,
          last_used_at: '2026-01-01T00:00:00.000Z',
          actions: {
            'action-1|new': {
              attempts: 1,
              successes: 1,
              failures: 0,
              last_used_at: '2026-01-01T00:00:00.000Z'
            }
          }
        }
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'recovery-memory',
      'show',
      '--scope',
      'scope-a',
      '--json'
    ]);
    const shown = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(shown.scope).toBe('scope-a');
    expect(shown.stats.signature_count).toBe(1);

    logSpy.mockClear();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'recovery-memory',
      'prune',
      '--scope',
      'scope-a',
      '--older-than-days',
      '365',
      '--json'
    ]);
    const pruned = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(pruned.scope).toBe('scope-a');
    expect(pruned.signatures_removed).toBe(1);

    const payload = await fs.readJson(memoryFile);
    expect(Object.keys(payload.signatures)).toEqual(expect.arrayContaining(['scope-b|sig-new']));
    expect(payload.signatures['scope-a|sig-old']).toBeUndefined();
  });

  test('shows recovery memory scope aggregates', async () => {
    const memoryFile = path.join(tempDir, '.sce', 'auto', 'close-loop-recovery-memory.json');
    await fs.ensureDir(path.dirname(memoryFile));
    await fs.writeJson(memoryFile, {
      version: 1,
      signatures: {
        'scope-a|sig-1': {
          scope: 'scope-a',
          attempts: 4,
          successes: 3,
          failures: 1,
          actions: {
            'action-1|a': { attempts: 4, successes: 3, failures: 1 }
          }
        },
        'scope-b|sig-1': {
          scope: 'scope-b',
          attempts: 2,
          successes: 1,
          failures: 1,
          actions: {
            'action-1|b': { attempts: 2, successes: 1, failures: 1 }
          }
        }
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'recovery-memory', 'scopes', '--json']);
    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.mode).toBe('auto-recovery-memory-scopes');
    expect(parsed.total_scopes).toBe(2);
    expect(parsed.scopes[0]).toEqual(expect.objectContaining({
      scope: 'scope-a',
      signature_count: 1
    }));
  });

  test('builds unified observability snapshot in json mode', async () => {
    const closeLoopSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    const batchSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    const controllerSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    const governanceSessionDir = path.join(tempDir, '.sce', 'auto', 'governance-close-loop-sessions');
    const recoveryMemoryFile = path.join(tempDir, '.sce', 'auto', 'close-loop-recovery-memory.json');
    await fs.ensureDir(closeLoopSessionDir);
    await fs.ensureDir(batchSessionDir);
    await fs.ensureDir(controllerSessionDir);
    await fs.ensureDir(governanceSessionDir);
    await fs.ensureDir(path.dirname(recoveryMemoryFile));

    const closeLoopFile = path.join(closeLoopSessionDir, 'obs-close-loop.json');
    await fs.writeJson(closeLoopFile, {
      session_id: 'obs-close-loop',
      status: 'completed',
      goal: 'observability close-loop',
      portfolio: {
        master_spec: '121-00-obs',
        sub_specs: ['121-01-a']
      },
      schema_version: '1.0'
    }, { spaces: 2 });

    const batchFile = path.join(batchSessionDir, 'obs-batch.json');
    await fs.writeJson(batchFile, {
      mode: 'auto-close-loop-program',
      status: 'completed',
      total_goals: 1,
      processed_goals: 1,
      completed_goals: 1,
      failed_goals: 0,
      program_started_at: '2026-02-01T00:00:00.000Z',
      program_completed_at: '2026-02-01T00:05:00.000Z',
      batch_session: { id: 'obs-batch', file: batchFile },
      schema_version: '1.0'
    }, { spaces: 2 });

    const controllerFile = path.join(controllerSessionDir, 'obs-controller.json');
    await fs.writeJson(controllerFile, {
      status: 'completed',
      processed_goals: 1,
      pending_goals: 0,
      controller_session: { id: 'obs-controller', file: controllerFile },
      schema_version: '1.0'
    }, { spaces: 2 });

    const governanceFile = path.join(governanceSessionDir, 'obs-governance.json');
    await fs.writeJson(governanceFile, {
      mode: 'auto-governance-close-loop',
      status: 'completed',
      target_risk: 'medium',
      converged: true,
      stop_reason: 'release-gate-blocked',
      stop_detail: {
        type: 'release-gate-block',
        reasons: [
          'weekly-ops-latest-blocked',
          'weekly-ops-config-warnings-positive:1',
          'weekly-ops-auth-tier-block-rate-high:58',
          'weekly-ops-dialogue-authorization-block-rate-high:66',
          'weekly-ops-runtime-block-rate-high:55',
          'weekly-ops-runtime-ui-mode-violations-positive:1'
        ],
        weekly_ops: {
          latest: {
            blocked: true,
            risk_level: 'high',
            governance_status: 'alert',
            authorization_tier_block_rate_percent: 58,
            dialogue_authorization_block_rate_percent: 66,
            config_warning_count: 1,
            runtime_block_rate_percent: 55,
            runtime_ui_mode_violation_total: 1,
            runtime_ui_mode_violation_rate_percent: 25
          },
          aggregates: {
            blocked_runs: 1,
            block_rate_percent: 50,
            violations_total: 1,
            warnings_total: 1,
            config_warnings_total: 1,
            authorization_tier_block_rate_max_percent: 58,
            dialogue_authorization_block_rate_max_percent: 66,
            runtime_block_rate_max_percent: 55,
            runtime_ui_mode_violation_total: 1,
            runtime_ui_mode_violation_run_rate_percent: 100,
            runtime_ui_mode_violation_rate_max_percent: 25
          },
          pressure: {
            blocked: true,
            high: true,
            config_warning_positive: true,
            auth_tier_block_rate_high: true,
            dialogue_authorization_block_rate_high: true,
            runtime_block_rate_high: true,
            runtime_ui_mode_violation_high: true
          }
        }
      },
      governance_session: { id: 'obs-governance', file: governanceFile },
      final_assessment: {
        health: {
          risk_level: 'low'
        }
      },
      schema_version: '1.0'
    }, { spaces: 2 });

    await fs.writeJson(recoveryMemoryFile, {
      version: 1,
      signatures: {}
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'observability', 'snapshot', '--json']);

    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.mode).toBe('auto-observability-snapshot');
    expect(parsed.highlights.total_sessions).toBeGreaterThanOrEqual(4);
    expect(parsed.snapshots.close_loop_session.total_sessions).toBeGreaterThanOrEqual(1);
    expect(parsed.highlights).toEqual(expect.objectContaining({
      governance_weekly_ops_stop_sessions: 1,
      governance_weekly_ops_stop_session_rate_percent: 100,
      governance_weekly_ops_high_pressure_sessions: 1,
      governance_weekly_ops_high_pressure_rate_percent: 100,
      governance_weekly_ops_config_warning_positive_sessions: 1,
      governance_weekly_ops_auth_tier_pressure_sessions: 1,
      governance_weekly_ops_dialogue_authorization_pressure_sessions: 1,
      governance_weekly_ops_runtime_block_rate_high_sessions: 1,
      governance_weekly_ops_runtime_ui_mode_violation_high_sessions: 1,
      governance_weekly_ops_runtime_ui_mode_violation_total_sum: 1
    }));
    expect(parsed.snapshots.governance_weekly_ops_stop).toEqual(expect.objectContaining({
      sessions: 1,
      high_pressure_sessions: 1,
      config_warning_positive_sessions: 1,
      average_auth_tier_block_rate_percent: 58,
      average_dialogue_authorization_block_rate_percent: 66,
      average_runtime_block_rate_percent: 55,
      runtime_ui_mode_violation_total_sum: 1,
      average_runtime_ui_mode_violation_total: 1
    }));
    expect(parsed.snapshots.kpi_trend).toEqual(expect.objectContaining({
      mode: 'auto-kpi-trend',
      mode_filter: 'all'
    }));
  });

  test('provides spec status and instructions json interfaces', async () => {
    const specDir = path.join(tempDir, '.sce', 'specs', '121-00-agent-interface');
    await fs.ensureDir(specDir);
    await fs.writeFile(path.join(specDir, 'requirements.md'), '# Requirements\n\nDeliver feature X.\n', 'utf8');
    await fs.writeFile(path.join(specDir, 'design.md'), '# Design\n\nUse modular design.\n', 'utf8');
    await fs.writeFile(path.join(specDir, 'tasks.md'), [
      '- [x] bootstrap',
      '- [ ] implement API',
      '- [ ] add tests'
    ].join('\n'), 'utf8');
    await fs.writeJson(path.join(specDir, 'collaboration.json'), {
      type: 'sub',
      dependencies: [{ spec: '121-00-foundation', type: 'requires-completion' }],
      status: {
        current: 'in-progress'
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node', 'sce', 'auto', 'spec', 'status', '121-00-agent-interface', '--json'
    ]);
    const statusPayload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(statusPayload.mode).toBe('auto-spec-status');
    expect(statusPayload.docs.all_required_present).toBe(true);
    expect(statusPayload.task_progress.total).toBe(3);
    expect(statusPayload.task_progress.closed).toBe(1);
    expect(statusPayload.collaboration.status).toBe('in-progress');

    logSpy.mockClear();
    await program.parseAsync([
      'node', 'sce', 'auto', 'spec', 'instructions', '121-00-agent-interface', '--json'
    ]);
    const instructionsPayload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(instructionsPayload.mode).toBe('auto-spec-instructions');
    expect(instructionsPayload.instructions.next_actions.length).toBeGreaterThanOrEqual(2);
    expect(instructionsPayload.instructions.priority_open_tasks).toEqual(expect.arrayContaining([
      'implement API',
      'add tests'
    ]));
  });

  test('checks schema compatibility across autonomous archives', async () => {
    const closeLoopSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    const batchSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-batch-summaries');
    const controllerSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    const governanceSessionDir = path.join(tempDir, '.sce', 'auto', 'governance-close-loop-sessions');
    await fs.ensureDir(closeLoopSessionDir);
    await fs.ensureDir(batchSessionDir);
    await fs.ensureDir(controllerSessionDir);
    await fs.ensureDir(governanceSessionDir);

    await fs.writeJson(path.join(closeLoopSessionDir, 'schema-missing.json'), {
      session_id: 'schema-missing',
      status: 'completed',
      portfolio: { master_spec: '121-00-a', sub_specs: [] }
    }, { spaces: 2 });
    await fs.writeJson(path.join(batchSessionDir, 'schema-compatible.json'), {
      schema_version: '1.0',
      status: 'completed'
    }, { spaces: 2 });
    await fs.writeJson(path.join(controllerSessionDir, 'schema-incompatible.json'), {
      schema_version: '0.9',
      status: 'completed'
    }, { spaces: 2 });
    await fs.writeFile(path.join(governanceSessionDir, 'schema-invalid.json'), '{ invalid json', 'utf8');

    const program = buildProgram();
    await program.parseAsync(['node', 'sce', 'auto', 'schema', 'check', '--json']);
    const parsed = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(parsed.mode).toBe('auto-schema-check');
    expect(parsed.summary.total_files).toBe(4);
    expect(parsed.summary.compatible_files).toBe(1);
    expect(parsed.summary.missing_schema_version_files).toBe(1);
    expect(parsed.summary.incompatible_files).toBe(1);
    expect(parsed.summary.parse_error_files).toBe(1);
  });

  test('migrates schema_version in dry-run and apply modes', async () => {
    const closeLoopSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-sessions');
    const controllerSessionDir = path.join(tempDir, '.sce', 'auto', 'close-loop-controller-sessions');
    await fs.ensureDir(closeLoopSessionDir);
    await fs.ensureDir(controllerSessionDir);

    const closeLoopFile = path.join(closeLoopSessionDir, 'migrate-close-loop.json');
    const controllerFile = path.join(controllerSessionDir, 'migrate-controller.json');
    await fs.writeJson(closeLoopFile, {
      session_id: 'migrate-close-loop',
      status: 'completed',
      portfolio: { master_spec: '121-00-m', sub_specs: [] }
    }, { spaces: 2 });
    await fs.writeJson(controllerFile, {
      schema_version: '0.9',
      status: 'completed'
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'schema',
      'migrate',
      '--only',
      'close-loop-session,controller-session',
      '--json'
    ]);
    const dryRunPayload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(dryRunPayload.mode).toBe('auto-schema-migrate');
    expect(dryRunPayload.dry_run).toBe(true);
    expect(dryRunPayload.summary.candidate_files).toBe(2);
    expect((await fs.readJson(closeLoopFile)).schema_version).toBeUndefined();

    logSpy.mockClear();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'schema',
      'migrate',
      '--only',
      'close-loop-session,controller-session',
      '--apply',
      '--json'
    ]);
    const applyPayload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(applyPayload.dry_run).toBe(false);
    expect(applyPayload.summary.updated_files).toBe(2);
    expect((await fs.readJson(closeLoopFile)).schema_version).toBe('1.0');
    expect((await fs.readJson(controllerFile)).schema_version).toBe('1.0');
  });

  test('builds handoff integration plan from manifest in json mode', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: [
        { name: '60-06-project-wbs-management' },
        '60-02-sales-lifecycle-enhancement'
      ],
      templates: [
        { name: 'moqui-domain-extension' }
      ],
      known_gaps: ['project milestone approval rule not fully automated']
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'plan',
      '--manifest',
      manifestFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-plan');
    expect(payload.source_project).toBe('E:/workspace/331-poc');
    expect(payload.handoff.spec_count).toBe(2);
    expect(payload.handoff.template_count).toBe(1);
    expect(payload.validation.is_valid).toBe(true);
    expect(payload.phases).toHaveLength(4);
    expect(payload.phases[1]).toEqual(expect.objectContaining({
      id: 'spec-validation'
    }));
    expect(payload.phases[1].commands).toEqual(expect.arrayContaining([
      'sce auto spec status 60-06-project-wbs-management --json',
      'sce scene package-validate --spec 60-06-project-wbs-management --spec-package custom/scene-package.json --strict --json'
    ]));
  });

  test('builds dependency batches from handoff spec descriptors in plan output', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: [
        {
          name: '60-21-dependent-spec',
          depends_on: ['60-20-base-spec']
        },
        {
          name: '60-20-base-spec'
        }
      ],
      templates: ['moqui-domain-extension']
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'plan',
      '--manifest',
      manifestFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-plan');
    expect(payload.handoff.dependency_batches.batch_count).toBe(2);
    expect(payload.handoff.dependency_batches.batches[0].specs).toEqual(['60-20-base-spec']);
    expect(payload.handoff.dependency_batches.batches[1].specs).toEqual(['60-21-dependent-spec']);
  });

  test('generates handoff queue goals and writes queue file', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    const queueFile = path.join(tempDir, '.sce', 'auto', 'handoff-goals.lines');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-07-service-support-repair'],
      templates: ['moqui-full-capability-closure-program'],
      known_gaps: ['service SLA exception policy']
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'queue',
      '--manifest',
      manifestFile,
      '--out',
      queueFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-queue');
    expect(payload.goal_count).toBeGreaterThanOrEqual(4);
    expect(payload.output_file).toBe(queueFile);
    const queueContent = await fs.readFile(queueFile, 'utf8');
    expect(queueContent).toContain('integrate handoff spec 60-07-service-support-repair');
    expect(queueContent).toContain('remediate handoff known gap: service SLA exception policy');
  });

  test('supports dry-run queue generation without known gaps', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    const queueFile = path.join(tempDir, '.sce', 'auto', 'handoff-goals.lines');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-11-reporting-audit-ops'],
      templates: ['moqui-domain-extension'],
      known_gaps: ['auditing KPI mismatch']
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'queue',
      '--manifest',
      manifestFile,
      '--out',
      queueFile,
      '--no-include-known-gaps',
      '--dry-run',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-queue');
    expect(payload.dry_run).toBe(true);
    expect(payload.include_known_gaps).toBe(false);
    expect(payload.goals.join('\n')).not.toContain('auditing KPI mismatch');
    expect(await fs.pathExists(queueFile)).toBe(false);
  });

  test('diffs handoff templates against local template registry', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-22-template-diff-spec'],
      templates: ['tpl-a', 'tpl-b']
    }, { spaces: 2 });

    await fs.ensureDir(path.join(tempDir, '.sce', 'templates', 'exports', 'tpl-a'));
    await fs.ensureDir(path.join(tempDir, '.sce', 'templates', 'scene-packages', 'tpl-c'));
    await fs.writeJson(
      path.join(tempDir, '.sce', 'templates', 'scene-packages', 'registry.json'),
      {
        templates: [
          { name: 'tpl-c' },
          { name: 'tpl-d' }
        ]
      },
      { spaces: 2 }
    );

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'template-diff',
      '--manifest',
      manifestFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-template-diff');
    expect(payload.compatibility).toBe('needs-sync');
    expect(payload.diff.matched).toContain('tpl-a');
    expect(payload.diff.missing_in_local).toContain('tpl-b');
    expect(payload.diff.extra_in_local).toEqual(expect.arrayContaining(['tpl-c', 'tpl-d']));
  });

  test('builds handoff capability matrix in json mode and writes remediation queue', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    const remediationQueueFile = path.join(tempDir, '.sce', 'auto', 'matrix-remediation.lines');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-23-capability-matrix'],
      templates: ['tpl-matrix'],
      capabilities: ['order-fulfillment', 'inventory-allocation'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const templateDir = path.join(tempDir, '.sce', 'templates', 'scene-packages', 'tpl-matrix');
    await fs.ensureDir(templateDir);
    await fs.writeJson(path.join(templateDir, 'scene-package.json'), {
      capabilities: {
        provides: ['inventory-allocation']
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'capability-matrix',
      '--manifest',
      manifestFile,
      '--remediation-queue-out',
      remediationQueueFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-capability-matrix');
    expect(payload.gates.passed).toBe(false);
    expect(payload.capability_coverage.summary).toEqual(expect.objectContaining({
      total_capabilities: 2,
      covered_capabilities: 1,
      uncovered_capabilities: 1,
      coverage_percent: 50,
      min_required_percent: 100,
      passed: false
    }));
    expect(payload.remediation_queue).toEqual(expect.objectContaining({
      file: remediationQueueFile,
      goal_count: expect.any(Number)
    }));
    expect(payload.remediation_queue.goal_count).toBeGreaterThanOrEqual(2);
    expect(await fs.pathExists(remediationQueueFile)).toBe(true);
    const queueContent = await fs.readFile(remediationQueueFile, 'utf8');
    expect(queueContent).toContain('order-fulfillment');
    expect(payload.recommendations.some(item => item.includes('sce auto close-loop-batch'))).toBe(true);
  });

  test('supports handoff capability matrix profile selection', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-23-capability-matrix-profile'],
      templates: ['tpl-matrix-profile'],
      capabilities: ['erp-order-query-read'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const templateDir = path.join(tempDir, '.sce', 'templates', 'scene-packages', 'tpl-matrix-profile');
    await fs.ensureDir(templateDir);
    await fs.writeJson(path.join(templateDir, 'scene-package.json'), {
      capabilities: {
        provides: ['erp-order-query-read']
      },
      governance_contract: {
        business_rules: [
          { id: 'rule.order.query' }
        ],
        decision_logic: [
          { id: 'decision.order.query-path' }
        ]
      },
      ontology_model: {
        entities: [
          { id: 'order_header' }
        ],
        relations: [
          { source: 'order_header', target: 'order_projection', type: 'produces' }
        ]
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'capability-matrix',
      '--manifest',
      manifestFile,
      '--profile',
      'moqui',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-capability-matrix');
    expect(payload.policy).toEqual(expect.objectContaining({
      profile: 'moqui'
    }));
    expect(payload.gates.passed).toBe(true);
  });

  test('adds phased remediation one-shot recommendations when capability matrix sees Moqui regressions', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-23-capability-matrix-regression'],
      templates: ['tpl-matrix-regression'],
      capabilities: ['order-fulfillment', 'inventory-allocation'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const baselineScript = path.join(tempDir, 'scripts', 'moqui-template-baseline-report.js');
    await fs.writeFile(
      baselineScript,
      `'use strict';
const fs = require('fs');
const path = require('path');
const readArg = flag => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
};
const outFile = readArg('--out');
const markdownFile = readArg('--markdown-out');
const payload = {
  mode: 'moqui-template-baseline',
  generated_at: '2026-02-17T00:00:00.000Z',
  summary: {
    total_templates: 3,
    scoped_templates: 3,
    avg_score: 92,
    valid_rate_percent: 100,
    baseline_passed: 3,
    baseline_failed: 0,
    portfolio_passed: true
  },
  compare: {
    coverage_matrix_regressions: [
      { metric: 'business_rule_closed', delta_rate_percent: -25 }
    ],
    coverage_matrix_deltas: {
      business_rule_closed: { count: -1, rate_percent: -25 }
    }
  }
};
if (outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
}
if (markdownFile) {
  fs.mkdirSync(path.dirname(markdownFile), { recursive: true });
  fs.writeFileSync(markdownFile, '# Mock Moqui Baseline Regression\\n', 'utf8');
}
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(payload));
}
`,
      'utf8'
    );

    const templateDir = path.join(tempDir, '.sce', 'templates', 'scene-packages', 'tpl-matrix-regression');
    await fs.ensureDir(templateDir);
    await fs.writeJson(path.join(templateDir, 'scene-package.json'), {
      capabilities: {
        provides: ['inventory-allocation']
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'capability-matrix',
      '--manifest',
      manifestFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-capability-matrix');
    expect(payload.recommendations.some(item => item.includes('Recover Moqui matrix regressions'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('moqui-matrix-remediation-phased-runner.js'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('run:matrix-remediation-from-baseline'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('run:matrix-remediation-clusters-phased'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('matrix-remediation.capability-clusters.json'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('run:matrix-remediation-clusters'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('Step 1 (Cluster phased):'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('Step 2 (Baseline phased):'))).toBe(true);
  });

  test('infers manifest capabilities from templates when capabilities are not declared', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-23b-capability-matrix-inferred'],
      templates: ['order-management'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const templateDir = path.join(tempDir, '.sce', 'templates', 'scene-packages', 'order-management');
    await fs.ensureDir(templateDir);
    await fs.writeJson(path.join(templateDir, 'scene-package.json'), {
      capabilities: {
        provides: ['erp-order-management']
      },
      governance_contract: {
        business_rules: [
          { id: 'rule.order.status' }
        ],
        decision_logic: [
          { id: 'decision.order.route' }
        ]
      },
      ontology_model: {
        entities: [
          { id: 'order_header' }
        ],
        relations: [
          { source: 'order_header', target: 'order_projection', type: 'produces' }
        ]
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'capability-matrix',
      '--manifest',
      manifestFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-capability-matrix');
    expect(payload.handoff).toEqual(expect.objectContaining({
      capability_count: 1,
      capability_source: 'inferred-from-templates',
      capabilities: ['erp-order-management']
    }));
    expect(payload.handoff.capability_inference).toEqual(expect.objectContaining({
      applied: true,
      inferred_count: 1,
      unresolved_template_count: 0
    }));
    expect(payload.capability_coverage.summary).toEqual(expect.objectContaining({
      total_capabilities: 1,
      covered_capabilities: 1,
      coverage_percent: 100,
      passed: true,
      semantic_complete_percent: 100,
      semantic_passed: true
    }));
    expect(payload.gates.passed).toBe(true);
  });

  test('supports capability matrix markdown format output file', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    const outFile = path.join(tempDir, '.sce', 'reports', 'handoff-capability-matrix.md');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-24-capability-matrix-markdown'],
      templates: ['tpl-matrix-ready'],
      capabilities: ['erp-order-query-read'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const templateDir = path.join(tempDir, '.sce', 'templates', 'scene-packages', 'tpl-matrix-ready');
    await fs.ensureDir(templateDir);
    await fs.writeJson(path.join(templateDir, 'scene-package.json'), {
      capabilities: {
        provides: ['erp-order-query-read']
      },
      governance_contract: {
        business_rules: [
          { id: 'rule.query.filter' }
        ],
        decision_logic: [
          { id: 'decision.query.empty' }
        ]
      },
      ontology_model: {
        entities: [
          { id: 'order_header' }
        ],
        relations: [
          { source: 'order_header', target: 'order_projection', type: 'produces' }
        ]
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'capability-matrix',
      '--manifest',
      manifestFile,
      '--format',
      'markdown',
      '--out',
      outFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-capability-matrix');
    expect(payload.report_format).toBe('markdown');
    expect(payload.gates.passed).toBe(true);
    expect(payload.output_file).toBe(outFile);
    expect(await fs.pathExists(outFile)).toBe(true);
    const markdown = await fs.readFile(outFile, 'utf8');
    expect(markdown).toContain('# Auto Handoff Capability Matrix');
    expect(markdown).toContain('## Capability Coverage');
    expect(markdown).toContain('| Capability | Covered | Semantic Complete | Missing Semantic Dimensions | Matched Templates |');
    expect(markdown).toContain('erp-order-query-read');
  });

  test('supports --fail-on-gap for handoff capability matrix', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-25-capability-matrix-fail-gap'],
      templates: ['tpl-matrix-fail'],
      capabilities: ['order-fulfillment'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const templateDir = path.join(tempDir, '.sce', 'templates', 'scene-packages', 'tpl-matrix-fail');
    await fs.ensureDir(templateDir);
    await fs.writeJson(path.join(templateDir, 'scene-package.json'), {
      capabilities: {
        provides: ['erp-order-query-read']
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'capability-matrix',
        '--manifest',
        manifestFile,
        '--fail-on-gap',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-capability-matrix');
    expect(payload.gates.passed).toBe(false);
    expect(payload.gates.reasons.some(item => item.includes('capability-coverage:capability_coverage_percent'))).toBe(true);
  });

  test('validates handoff capability matrix profile option', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-25b-capability-matrix-profile-invalid'],
      templates: ['tpl-matrix-fail'],
      capabilities: ['order-fulfillment'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'capability-matrix',
        '--manifest',
        manifestFile,
        '--profile',
        'unknown-profile',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.error).toContain('--profile must be one of: default, moqui, enterprise.');
  });

  test('fails capability matrix semantic gate by default when semantic dimensions are missing', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-26-capability-matrix-semantic-default'],
      templates: ['tpl-matrix-semantic-missing'],
      capabilities: ['erp-order-query-read'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const templateDir = path.join(tempDir, '.sce', 'templates', 'scene-packages', 'tpl-matrix-semantic-missing');
    await fs.ensureDir(templateDir);
    await fs.writeJson(path.join(templateDir, 'scene-package.json'), {
      capabilities: {
        provides: ['erp-order-query-read']
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'capability-matrix',
      '--manifest',
      manifestFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-capability-matrix');
    expect(payload.capability_coverage.summary).toEqual(expect.objectContaining({
      coverage_percent: 100,
      passed: true,
      semantic_complete_percent: 0,
      semantic_passed: false
    }));
    expect(payload.gates.passed).toBe(false);
    expect(payload.gates.reasons.some(item => item.includes('capability-semantic:capability_semantic_percent'))).toBe(true);
  });

  test('allows bypassing capability semantic gate with --no-require-capability-semantic', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-27-capability-matrix-semantic-bypass'],
      templates: ['tpl-matrix-semantic-bypass'],
      capabilities: ['erp-order-query-read'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const templateDir = path.join(tempDir, '.sce', 'templates', 'scene-packages', 'tpl-matrix-semantic-bypass');
    await fs.ensureDir(templateDir);
    await fs.writeJson(path.join(templateDir, 'scene-package.json'), {
      capabilities: {
        provides: ['erp-order-query-read']
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'capability-matrix',
      '--manifest',
      manifestFile,
      '--no-require-capability-semantic',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-capability-matrix');
    expect(payload.capability_coverage.summary).toEqual(expect.objectContaining({
      coverage_percent: 100,
      semantic_complete_percent: 0,
      semantic_passed: false
    }));
    expect(payload.gates.capability_semantic.passed).toBe(true);
    expect(payload.gates.passed).toBe(true);
  });

  test('runs handoff pipeline end-to-end and archives run report', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    const queueFile = path.join(tempDir, '.sce', 'auto', 'handoff-goals.lines');
    const governanceSessionDir = path.join(tempDir, '.sce', 'auto', 'governance-close-loop-sessions');
    await fs.ensureDir(governanceSessionDir);
    const governanceSeedFile = path.join(governanceSessionDir, 'handoff-observability-seed.json');
    await fs.writeJson(governanceSeedFile, {
      mode: 'auto-governance-close-loop',
      status: 'failed',
      stop_reason: 'release-gate-blocked',
      stop_detail: {
        type: 'release-gate-block',
        reasons: [
          'weekly-ops-latest-blocked',
          'weekly-ops-config-warnings-positive:1',
          'weekly-ops-auth-tier-block-rate-high:58',
          'weekly-ops-dialogue-authorization-block-rate-high:66',
          'weekly-ops-runtime-block-rate-high:55',
          'weekly-ops-runtime-ui-mode-violations-positive:1'
        ]
      },
      governance_session: {
        id: 'handoff-observability-seed',
        file: governanceSeedFile
      },
      final_assessment: {
        health: {
          risk_level: 'high',
          release_gate: {
            available: true,
            latest_gate_passed: false,
            pass_rate_percent: 60,
            scene_package_batch_pass_rate_percent: 70,
            drift_alert_rate_percent: 0,
            drift_blocked_runs: 0
          }
        }
      }
    }, { spaces: 2 });

    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-08-inventory-procurement'],
      templates: ['moqui-domain-extension'],
      known_gaps: ['inventory reconciliation pending'],
      ontology_validation: {
        status: 'passed',
        executed_at: '2026-02-16T08:00:00.000Z'
      }
    }, { spaces: 2 });

    runAutoCloseLoop.mockResolvedValue({
      status: 'completed',
      portfolio: {
        master_spec: '160-00-handoff',
        sub_specs: ['160-01-sub']
      }
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'run',
      '--manifest',
      manifestFile,
      '--queue-out',
      queueFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('completed');
    expect(payload.gates.passed).toBe(true);
    expect(payload.phases.find(item => item.id === 'observability')).toEqual(expect.objectContaining({
      status: 'completed',
      details: expect.objectContaining({
        weekly_ops_stop_sessions: 1,
        weekly_ops_high_pressure_sessions: 1,
        weekly_ops_config_warning_positive_sessions: 1,
        weekly_ops_auth_tier_pressure_sessions: 1,
        weekly_ops_dialogue_authorization_pressure_sessions: 1,
        weekly_ops_runtime_block_rate_high_sessions: 1,
        weekly_ops_runtime_ui_mode_violation_high_sessions: 1,
        weekly_ops_runtime_ui_mode_violation_total_sum: 0
      })
    }));
    expect(payload.queue.output_file).toBe(queueFile);
    expect(payload.output_file).toContain(path.join('.sce', 'reports', 'handoff-runs'));
    expect(payload.moqui_baseline).toEqual(expect.objectContaining({
      status: 'passed',
      generated: true
    }));
    expect(payload.moqui_baseline.summary).toEqual(expect.objectContaining({
      scope_breakdown: expect.objectContaining({
        moqui_erp: 2,
        scene_orchestration: 1
      }),
      coverage_matrix: expect.objectContaining({
        entity_coverage: expect.objectContaining({ rate_percent: 100 }),
        business_rule_closed: expect.objectContaining({ rate_percent: 100 }),
        decision_closed: expect.objectContaining({ rate_percent: 100 })
      })
    }));
    expect(Array.isArray(payload.recommendations)).toBe(true);
    expect(payload.recommendations.some(item => item.includes('sce auto handoff regression --session-id'))).toBe(true);
    expect(payload.recommendations).toEqual(expect.arrayContaining([
      'node scripts/release-ops-weekly-summary.js --json',
      'node scripts/release-weekly-ops-gate.js',
      'node scripts/interactive-governance-report.js --period weekly --fail-on-alert --json'
    ]));
    expect(payload.failure_summary.highlights).toEqual(expect.arrayContaining([
      expect.stringContaining('observability_weekly_ops_stop: sessions=1')
    ]));
    expect(payload.release_evidence).toEqual(expect.objectContaining({
      mode: 'auto-handoff-release-evidence',
      merged: true,
      updated_existing: false,
      latest_session_id: payload.session_id,
      total_runs: 1
    }));
    expect(payload.release_evidence.trend_window).toEqual(expect.objectContaining({
      window: expect.objectContaining({
        requested: 5
      })
    }));
    expect(await fs.pathExists(payload.output_file)).toBe(true);
    expect(await fs.pathExists(queueFile)).toBe(true);
    expect(runAutoCloseLoop).toHaveBeenCalledTimes(payload.queue.goal_count);
    const releaseEvidenceFile = path.join(tempDir, '.sce', 'reports', 'release-evidence', 'handoff-runs.json');
    expect(payload.release_evidence.file).toBe(releaseEvidenceFile);
    expect(await fs.pathExists(releaseEvidenceFile)).toBe(true);
    const releaseEvidence = await fs.readJson(releaseEvidenceFile);
    expect(releaseEvidence.mode).toBe('auto-handoff-release-evidence');
    expect(releaseEvidence.total_runs).toBe(1);
    expect(releaseEvidence.latest_session_id).toBe(payload.session_id);
    expect(releaseEvidence.latest_trend_window).toEqual(expect.objectContaining({
      window: expect.objectContaining({
        requested: 5
      })
    }));
    expect(releaseEvidence.sessions[0]).toEqual(expect.objectContaining({
      session_id: payload.session_id,
      status: 'completed',
      manifest_path: manifestFile
    }));
    expect(releaseEvidence.sessions[0].moqui_baseline).toEqual(expect.objectContaining({
      status: 'passed',
      generated: true
    }));
    expect(releaseEvidence.sessions[0].moqui_baseline.summary).toEqual(expect.objectContaining({
      coverage_matrix: expect.objectContaining({
        relation_coverage: expect.objectContaining({ rate_percent: 100 })
      })
    }));
    expect(releaseEvidence.sessions[0].moqui_baseline.compare).toEqual(expect.objectContaining({
      coverage_matrix_deltas: expect.objectContaining({
        business_rule_closed: expect.objectContaining({ rate_percent: 0 })
      }),
      coverage_matrix_regressions: []
    }));
    expect(releaseEvidence.sessions[0].handoff_report_file).toContain('.sce/reports/handoff-runs/');
    expect(releaseEvidence.sessions[0].trend_window).toEqual(expect.objectContaining({
      window: expect.objectContaining({
        requested: 5
      })
    }));
  });

  test('applies enterprise handoff run profile defaults', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    const releaseGateHistoryFile = path.join(
      tempDir,
      '.sce',
      'reports',
      'release-evidence',
      'release-gate-history.json'
    );
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-08-enterprise-profile'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });
    await fs.ensureDir(path.dirname(releaseGateHistoryFile));
    await fs.writeJson(releaseGateHistoryFile, {
      mode: 'auto-handoff-release-gate-history',
      total_entries: 1,
      latest: {
        tag: 'v3.0.8',
        gate_passed: true,
        risk_level: 'low'
      },
      aggregates: {
        pass_rate_percent: 100,
        scene_package_batch_pass_rate_percent: 100,
        scene_package_batch_failed_count: 0,
        drift_alert_rate_percent: 0,
        drift_alert_runs: 0,
        drift_blocked_runs: 0
      },
      entries: [
        {
          tag: 'v3.0.8',
          gate_passed: true,
          risk_level: 'low'
        }
      ]
    }, { spaces: 2 });

    runAutoCloseLoop.mockResolvedValue({
      status: 'completed',
      portfolio: {
        master_spec: '160-00-handoff-enterprise-profile',
        sub_specs: ['160-01-sub']
      }
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'run',
      '--manifest',
      manifestFile,
      '--profile',
      'enterprise',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('completed');
    expect(payload.policy).toEqual(expect.objectContaining({
      profile: 'enterprise',
      max_risk_level: 'medium',
      require_release_gate_preflight: true,
      release_evidence_window: 10
    }));
    expect(payload.release_gate_preflight).toEqual(expect.objectContaining({
      available: true,
      blocked: false
    }));
  });

  test('runs handoff preflight-check in pass state with default hard-gate policy', async () => {
    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'preflight-check',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-preflight-check');
    expect(payload.status).toBe('pass');
    expect(payload.policy).toEqual(expect.objectContaining({
      profile: 'default',
      require_release_gate_preflight: true
    }));
    expect(payload.release_gate_preflight).toEqual(expect.objectContaining({
      available: true,
      blocked: false
    }));
    expect(Array.isArray(payload.recommended_commands)).toBe(true);
  });

  test('fails handoff preflight-check with --require-pass when preflight is blocked', async () => {
    const releaseGateHistoryFile = path.join(
      tempDir,
      '.sce',
      'reports',
      'release-evidence',
      'release-gate-history.json'
    );
    await fs.writeJson(releaseGateHistoryFile, {
      mode: 'auto-handoff-release-gate-history',
      total_entries: 1,
      latest: {
        tag: 'v9.9.9',
        gate_passed: false,
        risk_level: 'high',
        weekly_ops_runtime_block_rate_percent: 55,
        weekly_ops_runtime_ui_mode_violation_total: 2,
        weekly_ops_runtime_ui_mode_violation_rate_percent: 20
      },
      aggregates: {
        pass_rate_percent: 0,
        scene_package_batch_pass_rate_percent: 0,
        drift_alert_rate_percent: 100,
        drift_alert_runs: 1,
        drift_blocked_runs: 1,
        weekly_ops_runtime_block_rate_max_percent: 55,
        weekly_ops_runtime_ui_mode_violation_total: 2,
        weekly_ops_runtime_ui_mode_violation_run_rate_percent: 100,
        weekly_ops_runtime_ui_mode_violation_rate_max_percent: 20
      },
      entries: [
        {
          tag: 'v9.9.9',
          gate_passed: false,
          risk_level: 'high',
          weekly_ops_runtime_block_rate_percent: 55,
          weekly_ops_runtime_ui_mode_violation_total: 2,
          weekly_ops_runtime_ui_mode_violation_rate_percent: 20
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'preflight-check',
        '--require-pass',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-preflight-check');
    expect(payload.status).toBe('blocked');
    expect(payload.reasons.some(item => item.includes('release gate preflight blocked'))).toBe(true);
    expect(payload.release_gate_preflight).toEqual(expect.objectContaining({
      available: true,
      blocked: true
    }));
  });

  test('supports advisory preflight-check mode via --no-require-release-gate-preflight', async () => {
    const releaseGateHistoryFile = path.join(
      tempDir,
      '.sce',
      'reports',
      'release-evidence',
      'release-gate-history.json'
    );
    await fs.writeJson(releaseGateHistoryFile, {
      mode: 'auto-handoff-release-gate-history',
      total_entries: 1,
      latest: {
        tag: 'v9.9.8',
        gate_passed: false,
        risk_level: 'high'
      },
      aggregates: {
        pass_rate_percent: 0,
        scene_package_batch_pass_rate_percent: 0,
        drift_alert_rate_percent: 100,
        drift_alert_runs: 1,
        drift_blocked_runs: 1
      },
      entries: []
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'preflight-check',
      '--no-require-release-gate-preflight',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-preflight-check');
    expect(payload.status).toBe('warning');
    expect(payload.policy.require_release_gate_preflight).toBe(false);
    expect(payload.reasons.some(item => item.includes('advisory mode'))).toBe(true);
  });

  test('validates handoff run profile option', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-08-run-profile-invalid'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--profile',
        'invalid-profile',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.error).toContain('--profile must be one of: default, moqui, enterprise.');
  });

  test('runs handoff by dependency batches before post-spec goals', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: [
        {
          name: '60-31-dependent-spec',
          depends_on: ['60-30-base-spec']
        },
        {
          name: '60-30-base-spec'
        }
      ],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    runAutoCloseLoop.mockResolvedValue({
      status: 'completed',
      portfolio: {
        master_spec: '161-00-handoff',
        sub_specs: []
      }
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'run',
      '--manifest',
      manifestFile,
      '--no-require-scene-package-batch',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('completed');
    expect(payload.dependency_execution.dependency_plan.batch_count).toBe(2);
    expect(runAutoCloseLoop.mock.calls[0][0]).toContain('integrate handoff spec 60-30-base-spec');
    expect(runAutoCloseLoop.mock.calls[1][0]).toContain('integrate handoff spec 60-31-dependent-spec');
  });

  test('updates existing release evidence entry when session id repeats', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-32-repeatable-session'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    runAutoCloseLoop.mockResolvedValue({
      status: 'completed',
      portfolio: {
        master_spec: '161-10-handoff-repeat',
        sub_specs: []
      }
    });

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-16T12:34:56.000Z'));
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.42424);

    try {
      const firstProgram = buildProgram();
      await firstProgram.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--json'
      ]);
      const firstPayload = JSON.parse(`${logSpy.mock.calls[logSpy.mock.calls.length - 1][0]}`);

      logSpy.mockClear();
      const secondProgram = buildProgram();
      await secondProgram.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--json'
      ]);
      const secondPayload = JSON.parse(`${logSpy.mock.calls[logSpy.mock.calls.length - 1][0]}`);

      expect(secondPayload.session_id).toBe(firstPayload.session_id);
      expect(secondPayload.release_evidence).toEqual(expect.objectContaining({
        mode: 'auto-handoff-release-evidence',
        merged: true,
        updated_existing: true,
        total_runs: 1
      }));
      const releaseEvidenceFile = path.join(tempDir, '.sce', 'reports', 'release-evidence', 'handoff-runs.json');
      const releaseEvidence = await fs.readJson(releaseEvidenceFile);
      expect(releaseEvidence.total_runs).toBe(1);
      expect(releaseEvidence.sessions).toHaveLength(1);
      expect(releaseEvidence.sessions[0].session_id).toBe(firstPayload.session_id);
    } finally {
      randomSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  test('supports custom release evidence trend window size', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-33-release-evidence-window'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    runAutoCloseLoop.mockResolvedValue({
      status: 'completed',
      portfolio: {
        master_spec: '161-11-handoff-window',
        sub_specs: []
      }
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'run',
      '--manifest',
      manifestFile,
      '--release-evidence-window',
      '3',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.status).toBe('completed');
    expect(payload.release_evidence.trend_window).toEqual(expect.objectContaining({
      window: expect.objectContaining({
        requested: 3
      })
    }));
    const releaseEvidenceFile = path.join(tempDir, '.sce', 'reports', 'release-evidence', 'handoff-runs.json');
    const releaseEvidence = await fs.readJson(releaseEvidenceFile);
    expect(releaseEvidence.latest_trend_window).toEqual(expect.objectContaining({
      window: expect.objectContaining({
        requested: 3
      })
    }));
  });

  test('continues handoff run from latest report with pending goals only', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-40-base-spec', '60-41-dependent-spec'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const reportDir = path.join(tempDir, '.sce', 'reports', 'handoff-runs');
    await fs.ensureDir(reportDir);
    await fs.writeJson(path.join(reportDir, 'handoff-previous.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-previous',
      manifest_path: manifestFile,
      status: 'failed',
      batch_summary: {
        status: 'partial-failed',
        total_goals: 4,
        processed_goals: 4,
        completed_goals: 2,
        failed_goals: 1,
        results: [
          {
            index: 1,
            goal: 'integrate handoff spec 60-40-base-spec with scene package validation, ontology consistency checks, and close-loop completion',
            status: 'completed'
          },
          {
            index: 2,
            goal: 'integrate handoff spec 60-41-dependent-spec with scene package validation, ontology consistency checks, and close-loop completion',
            status: 'failed'
          },
          {
            index: 3,
            goal: 'validate handoff template moqui-domain-extension for template registry compatibility and release readiness',
            status: 'completed'
          },
          {
            index: 4,
            goal: 'generate unified observability snapshot and governance follow-up recommendations for this handoff batch',
            status: 'planned'
          }
        ]
      }
    }, { spaces: 2 });

    runAutoCloseLoop.mockResolvedValue({
      status: 'completed',
      portfolio: {
        master_spec: '162-00-handoff-continue',
        sub_specs: []
      }
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'run',
      '--manifest',
      manifestFile,
      '--continue-from',
      'latest',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('completed');
    expect(payload.continued_from).toEqual(expect.objectContaining({
      session_id: 'handoff-previous',
      strategy: 'pending'
    }));
    expect(payload.recommendations.some(item => item.includes(`--continue-from ${payload.session_id}`))).toBe(false);
    expect(payload.queue.goal_count).toBe(2);
    expect(runAutoCloseLoop).toHaveBeenCalledTimes(2);
    expect(runAutoCloseLoop.mock.calls[0][0]).toContain('integrate handoff spec 60-41-dependent-spec');
    expect(runAutoCloseLoop.mock.calls[1][0]).toContain('generate unified observability snapshot');
  });

  test('supports failed-only continue strategy for handoff run', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-42-service-spec'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const reportDir = path.join(tempDir, '.sce', 'reports', 'handoff-runs');
    await fs.ensureDir(reportDir);
    await fs.writeJson(path.join(reportDir, 'handoff-failed-only.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-failed-only',
      manifest_path: manifestFile,
      status: 'failed',
      batch_summary: {
        status: 'partial-failed',
        total_goals: 2,
        processed_goals: 2,
        completed_goals: 0,
        failed_goals: 1,
        results: [
          {
            index: 1,
            goal: 'integrate handoff spec 60-42-service-spec with scene package validation, ontology consistency checks, and close-loop completion',
            status: 'failed'
          },
          {
            index: 2,
            goal: 'generate unified observability snapshot and governance follow-up recommendations for this handoff batch',
            status: 'planned'
          }
        ]
      }
    }, { spaces: 2 });

    runAutoCloseLoop.mockResolvedValue({
      status: 'completed',
      portfolio: {
        master_spec: '163-00-handoff-continue',
        sub_specs: []
      }
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'run',
      '--manifest',
      manifestFile,
      '--continue-from',
      'handoff-failed-only',
      '--continue-strategy',
      'failed-only',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('completed');
    expect(payload.queue.goal_count).toBe(1);
    expect(payload.continued_from).toEqual(expect.objectContaining({
      session_id: 'handoff-failed-only',
      strategy: 'failed-only'
    }));
    expect(runAutoCloseLoop).toHaveBeenCalledTimes(1);
    expect(runAutoCloseLoop.mock.calls[0][0]).toContain('integrate handoff spec 60-42-service-spec');
  });

  test('auto continue strategy resolves to failed-only when only failed goals remain', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-44-only-failed'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const reportDir = path.join(tempDir, '.sce', 'reports', 'handoff-runs');
    await fs.ensureDir(reportDir);
    await fs.writeJson(path.join(reportDir, 'handoff-auto-failed-only.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-auto-failed-only',
      manifest_path: manifestFile,
      status: 'failed',
      batch_summary: {
        status: 'failed',
        total_goals: 1,
        processed_goals: 1,
        completed_goals: 0,
        failed_goals: 1,
        results: [
          {
            index: 1,
            goal: 'integrate handoff spec 60-44-only-failed with scene package validation, ontology consistency checks, and close-loop completion',
            status: 'failed'
          }
        ]
      }
    }, { spaces: 2 });

    runAutoCloseLoop.mockResolvedValue({
      status: 'completed',
      portfolio: {
        master_spec: '164-00-handoff-continue',
        sub_specs: []
      }
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'run',
      '--manifest',
      manifestFile,
      '--continue-from',
      'handoff-auto-failed-only',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('completed');
    expect(payload.queue.goal_count).toBe(1);
    expect(payload.continued_from).toEqual(expect.objectContaining({
      session_id: 'handoff-auto-failed-only',
      strategy: 'failed-only',
      strategy_requested: 'auto'
    }));
    expect(runAutoCloseLoop).toHaveBeenCalledTimes(1);
    expect(runAutoCloseLoop.mock.calls[0][0]).toContain('integrate handoff spec 60-44-only-failed');
  });

  test('fails handoff continue-from when manifest does not match previous run', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    const anotherManifest = path.join(tempDir, 'handoff-manifest-other.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-43-current-spec'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });
    await fs.writeJson(anotherManifest, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-43-previous-spec'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const reportDir = path.join(tempDir, '.sce', 'reports', 'handoff-runs');
    await fs.ensureDir(reportDir);
    await fs.writeJson(path.join(reportDir, 'handoff-mismatch.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-mismatch',
      manifest_path: anotherManifest,
      status: 'failed',
      batch_summary: {
        status: 'failed',
        total_goals: 1,
        processed_goals: 1,
        completed_goals: 0,
        failed_goals: 1,
        results: [
          {
            index: 1,
            goal: 'integrate handoff spec 60-43-previous-spec with scene package validation, ontology consistency checks, and close-loop completion',
            status: 'failed'
          }
        ]
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--continue-from',
        'handoff-mismatch',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('failed');
    expect(payload.error).toContain('--continue-from manifest mismatch');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('supports handoff run dry-run without executing close-loop-batch', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    const queueFile = path.join(tempDir, '.sce', 'auto', 'handoff-goals.lines');
    const releaseGateHistoryFile = path.join(
      tempDir,
      '.sce',
      'reports',
      'release-evidence',
      'release-gate-history.json'
    );
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-09-order-fulfillment'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      },
      known_gaps: ['delivery anomaly triage']
    }, { spaces: 2 });
    await fs.ensureDir(path.dirname(releaseGateHistoryFile));
    await fs.writeJson(releaseGateHistoryFile, {
      mode: 'auto-handoff-release-gate-history',
      total_entries: 4,
      latest: {
        tag: 'v1.47.35',
        gate_passed: false,
        risk_level: 'high',
        weekly_ops_runtime_block_rate_percent: 55,
        weekly_ops_runtime_ui_mode_violation_total: 2,
        weekly_ops_runtime_ui_mode_violation_rate_percent: 25
      },
      aggregates: {
        pass_rate_percent: 55,
        scene_package_batch_pass_rate_percent: 60,
        drift_alert_rate_percent: 100,
        drift_alert_runs: 2,
        drift_blocked_runs: 1,
        weekly_ops_runtime_block_rate_max_percent: 55,
        weekly_ops_runtime_ui_mode_violation_total: 2,
        weekly_ops_runtime_ui_mode_violation_run_rate_percent: 50,
        weekly_ops_runtime_ui_mode_violation_rate_max_percent: 25
      },
      entries: []
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'run',
      '--manifest',
      manifestFile,
      '--queue-out',
      queueFile,
      '--dry-run',
      '--no-require-release-gate-preflight',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('dry-run');
    expect(payload.policy.require_release_gate_preflight).toBe(false);
    expect(payload.phases.find(item => item.id === 'execution').status).toBe('skipped');
    expect(payload.phases.find(item => item.id === 'observability').status).toBe('skipped');
    expect(payload.release_gate_preflight).toEqual(expect.objectContaining({
      available: true,
      blocked: true,
      latest_gate_passed: false,
      latest_weekly_ops_runtime_block_rate_percent: 55,
      latest_weekly_ops_runtime_ui_mode_violation_total: 2,
      latest_weekly_ops_runtime_ui_mode_violation_rate_percent: 25
    }));
    expect(payload.phases.find(item => item.id === 'precheck').details.release_gate_preflight).toEqual(
      expect.objectContaining({
        available: true,
        blocked: true,
        latest_weekly_ops_runtime_block_rate_percent: 55,
        latest_weekly_ops_runtime_ui_mode_violation_total: 2
      })
    );
    expect(Array.isArray(payload.warnings)).toBe(true);
    expect(payload.warnings.some(item => item.includes('release gate preflight is blocked'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('sce auto handoff evidence --window 5 --json'))).toBe(true);
    expect(await fs.pathExists(queueFile)).toBe(false);
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
    expect(await fs.pathExists(payload.output_file)).toBe(true);
    expect(payload.release_evidence).toEqual(expect.objectContaining({
      mode: 'auto-handoff-release-evidence',
      merged: false,
      skipped: true,
      reason: 'dry-run'
    }));
    const releaseEvidenceFile = path.join(tempDir, '.sce', 'reports', 'release-evidence', 'handoff-runs.json');
    expect(await fs.pathExists(releaseEvidenceFile)).toBe(false);
  });

  test('adds Moqui matrix regression recommendations when baseline trend degrades', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-09-moqui-matrix-regression'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const baselineScript = path.join(tempDir, 'scripts', 'moqui-template-baseline-report.js');
    await fs.writeFile(
      baselineScript,
      `'use strict';
const fs = require('fs');
const path = require('path');
const readArg = flag => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
};
const outFile = readArg('--out');
const markdownFile = readArg('--markdown-out');
const payload = {
  mode: 'moqui-template-baseline',
  generated_at: '2026-02-17T00:00:00.000Z',
  summary: {
    total_templates: 4,
    scoped_templates: 4,
    avg_score: 92,
    valid_rate_percent: 100,
    baseline_passed: 4,
    baseline_failed: 0,
    portfolio_passed: true,
    scope_breakdown: {
      moqui_erp: 2,
      scene_orchestration: 2,
      other: 0
    },
    coverage_matrix: {
      entity_coverage: { count: 4, rate_percent: 100 },
      relation_coverage: { count: 4, rate_percent: 100 },
      business_rule_coverage: { count: 4, rate_percent: 100 },
      business_rule_closed: { count: 3, rate_percent: 75 },
      decision_coverage: { count: 4, rate_percent: 100 },
      decision_closed: { count: 3, rate_percent: 75 }
    },
    gap_frequency: []
  },
  compare: {
    previous_generated_at: '2026-02-16T00:00:00.000Z',
    deltas: {
      scoped_templates: 0,
      avg_score: 0,
      valid_rate_percent: 0,
      baseline_passed: 0,
      baseline_failed: 0
    },
    coverage_matrix_deltas: {
      entity_coverage: { count: 0, rate_percent: 0 },
      relation_coverage: { count: 0, rate_percent: 0 },
      business_rule_closed: { count: -1, rate_percent: -25 },
      decision_closed: { count: -1, rate_percent: -25 }
    },
    failed_templates: {
      previous: [],
      current: [],
      newly_failed: [],
      recovered: []
    }
  }
};
if (outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
}
if (markdownFile) {
  fs.mkdirSync(path.dirname(markdownFile), { recursive: true });
  fs.writeFileSync(markdownFile, '# Mock Moqui Baseline Regression\\n', 'utf8');
}
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(payload));
}
`,
      'utf8'
    );

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'run',
      '--manifest',
      manifestFile,
      '--max-moqui-matrix-regressions',
      '5',
      '--dry-run',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.status).toBe('dry-run');
    expect(payload.policy.max_moqui_matrix_regressions).toBe(5);
    expect(payload.recommendations.some(item => item.includes('Recover Moqui matrix regressions'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('moqui-matrix-remediation-phased-runner.js'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('run:matrix-remediation-from-baseline'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('run:matrix-remediation-clusters-phased'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('matrix-remediation.capability-clusters.json'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('run:matrix-remediation-clusters'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('Step 1 (Cluster phased):'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('Step 2 (Baseline phased):'))).toBe(true);
    const clusterPhasedIndex = payload.recommendations.findIndex(item => item.includes('run:matrix-remediation-clusters-phased'));
    const baselinePhasedIndex = payload.recommendations.findIndex(item => item.includes('run:matrix-remediation-from-baseline'));
    const step1Index = payload.recommendations.findIndex(item => item.includes('Step 1 (Cluster phased):'));
    const step2Index = payload.recommendations.findIndex(item => item.includes('Step 2 (Baseline phased):'));
    expect(clusterPhasedIndex).toBeGreaterThanOrEqual(0);
    expect(baselinePhasedIndex).toBeGreaterThanOrEqual(0);
    expect(clusterPhasedIndex).toBeLessThan(baselinePhasedIndex);
    expect(step1Index).toBeGreaterThanOrEqual(0);
    expect(step2Index).toBeGreaterThanOrEqual(0);
    expect(step1Index).toBeLessThan(step2Index);
    expect(payload.failure_summary).toEqual(expect.objectContaining({
      moqui_matrix_regressions: expect.arrayContaining([
        expect.objectContaining({
          metric: 'business_rule_closed',
          delta_rate_percent: -25
        })
      ])
    }));
    expect(payload.remediation_queue).toEqual(expect.objectContaining({
      goal_count: expect.any(Number)
    }));
    expect(await fs.pathExists(payload.remediation_queue.file)).toBe(true);
    const queueContent = await fs.readFile(payload.remediation_queue.file, 'utf8');
    expect(queueContent).toContain('recover moqui matrix regression business-rule-closed (-25%)');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('fails handoff run when Moqui matrix regressions exceed default gate', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-09-moqui-matrix-regression-hard-gate'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const baselineScript = path.join(tempDir, 'scripts', 'moqui-template-baseline-report.js');
    await fs.writeFile(
      baselineScript,
      `'use strict';
const fs = require('fs');
const path = require('path');
const readArg = flag => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
};
const outFile = readArg('--out');
const markdownFile = readArg('--markdown-out');
const payload = {
  mode: 'moqui-template-baseline',
  generated_at: '2026-02-17T00:00:00.000Z',
  summary: {
    total_templates: 3,
    scoped_templates: 3,
    avg_score: 93,
    valid_rate_percent: 100,
    baseline_passed: 3,
    baseline_failed: 0,
    portfolio_passed: true,
    scope_breakdown: {
      moqui_erp: 2,
      scene_orchestration: 1,
      other: 0
    },
    coverage_matrix: {
      entity_coverage: { count: 3, rate_percent: 100 },
      relation_coverage: { count: 3, rate_percent: 100 },
      business_rule_coverage: { count: 3, rate_percent: 100 },
      business_rule_closed: { count: 2, rate_percent: 66.67 },
      decision_coverage: { count: 3, rate_percent: 100 },
      decision_closed: { count: 2, rate_percent: 66.67 }
    },
    gap_frequency: []
  },
  compare: {
    previous_generated_at: '2026-02-16T00:00:00.000Z',
    deltas: {
      scoped_templates: 0,
      avg_score: 0,
      valid_rate_percent: 0,
      baseline_passed: 0,
      baseline_failed: 0
    },
    coverage_matrix_deltas: {
      entity_coverage: { count: 0, rate_percent: 0 },
      relation_coverage: { count: 0, rate_percent: 0 },
      business_rule_closed: { count: -1, rate_percent: -33.33 },
      decision_closed: { count: -1, rate_percent: -33.33 }
    },
    failed_templates: {
      previous: [],
      current: [],
      newly_failed: [],
      recovered: []
    }
  }
};
if (outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
}
if (markdownFile) {
  fs.mkdirSync(path.dirname(markdownFile), { recursive: true });
  fs.writeFileSync(markdownFile, '# Mock Moqui Baseline Regression\\n', 'utf8');
}
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(payload));
}
`,
      'utf8'
    );

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--dry-run',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.status).toBe('failed');
    expect(payload.error).toContain('moqui baseline matrix regressions');
    expect(payload.gates).toBeNull();
    expect(payload.policy.max_moqui_matrix_regressions).toBe(0);
    expect(payload.failure_summary).toEqual(expect.objectContaining({
      moqui_matrix_regressions: expect.arrayContaining([
        expect.objectContaining({
          metric: 'business_rule_closed'
        })
      ])
    }));
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('enforces release gate preflight when --require-release-gate-preflight is set', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    const releaseGateHistoryFile = path.join(
      tempDir,
      '.sce',
      'reports',
      'release-evidence',
      'release-gate-history.json'
    );
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-09-release-gate-hard-gate'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });
    await fs.ensureDir(path.dirname(releaseGateHistoryFile));
    await fs.writeJson(releaseGateHistoryFile, {
      mode: 'auto-handoff-release-gate-history',
      total_entries: 4,
      latest: {
        tag: 'v1.47.35',
        gate_passed: false,
        risk_level: 'high',
        weekly_ops_runtime_block_rate_percent: 48,
        weekly_ops_runtime_ui_mode_violation_total: 1,
        weekly_ops_runtime_ui_mode_violation_rate_percent: 20
      },
      aggregates: {
        pass_rate_percent: 55,
        scene_package_batch_pass_rate_percent: 60,
        drift_alert_rate_percent: 100,
        drift_alert_runs: 2,
        drift_blocked_runs: 1,
        weekly_ops_runtime_block_rate_max_percent: 48,
        weekly_ops_runtime_ui_mode_violation_total: 1,
        weekly_ops_runtime_ui_mode_violation_run_rate_percent: 25,
        weekly_ops_runtime_ui_mode_violation_rate_max_percent: 20
      },
      entries: []
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--dry-run',
        '--require-release-gate-preflight',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('failed');
    expect(payload.policy.require_release_gate_preflight).toBe(true);
    expect(payload.error).toContain('handoff release gate preflight failed');
    expect(payload.release_gate_preflight).toEqual(expect.objectContaining({
      available: true,
      blocked: true,
      latest_weekly_ops_runtime_block_rate_percent: 48,
      latest_weekly_ops_runtime_ui_mode_violation_total: 1
    }));
    expect(payload.recommendations.some(item => item.includes('sce auto handoff evidence --window 5 --json'))).toBe(true);
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('does not fail handoff run when release evidence merge errors', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-13-evidence-merge-resilience'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    runAutoCloseLoop.mockResolvedValue({
      status: 'completed',
      portfolio: {
        master_spec: '160-13-evidence-merge-resilience',
        sub_specs: []
      }
    });

    const blockedEvidenceFile = path.join(tempDir, '.sce', 'reports', 'release-evidence', 'handoff-runs.json');
    await fs.ensureDir(blockedEvidenceFile);

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'run',
      '--manifest',
      manifestFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('completed');
    expect(payload.release_evidence).toEqual(expect.objectContaining({
      mode: 'auto-handoff-release-evidence',
      merged: false,
      file: blockedEvidenceFile
    }));
    expect(payload.release_evidence.error).toContain('failed to read release evidence JSON');
    expect(Array.isArray(payload.warnings)).toBe(true);
    expect(payload.warnings.some(item => item.includes('release evidence merge failed'))).toBe(true);
    expect(await fs.pathExists(payload.output_file)).toBe(true);
  });

  test('fails handoff run early when ontology validation is missing (default gate enabled)', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    const releaseGateHistoryFile = path.join(
      tempDir,
      '.sce',
      'reports',
      'release-evidence',
      'release-gate-history.json'
    );
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-10-service-quality'],
      templates: ['moqui-domain-extension'],
      known_gaps: ['quality baseline missing']
    }, { spaces: 2 });
    await fs.ensureDir(path.dirname(releaseGateHistoryFile));
    await fs.writeJson(releaseGateHistoryFile, {
      mode: 'auto-handoff-release-gate-history',
      total_entries: 4,
      latest: {
        tag: 'v1.47.35',
        gate_passed: false,
        risk_level: 'high'
      },
      aggregates: {
        pass_rate_percent: 50,
        scene_package_batch_pass_rate_percent: 60,
        drift_alert_rate_percent: 100,
        drift_alert_runs: 3,
        drift_blocked_runs: 1
      },
      entries: []
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('failed');
    expect(payload.error).toContain('handoff ontology validation gate failed');
    expect(payload.release_gate_preflight).toEqual(expect.objectContaining({
      available: true,
      blocked: true
    }));
    expect(payload.failure_summary).toEqual(expect.objectContaining({
      gate_failed: false,
      release_gate_preflight_blocked: true
    }));
    expect(payload.failure_summary.highlights).toEqual(expect.arrayContaining([
      expect.stringContaining('release_gate_preflight')
    ]));
    expect(payload.recommendations.some(item => item.includes('Ensure manifest ontology_validation is present and passed'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('sce auto handoff evidence --window 5 --json'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('--continue-from'))).toBe(false);
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('allows disabling ontology validation gate via --no-require-ontology-validation', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-10-service-quality'],
      templates: ['moqui-domain-extension']
    }, { spaces: 2 });

    runAutoCloseLoop.mockResolvedValue({
      status: 'completed',
      portfolio: {
        master_spec: '160-10-service-quality',
        sub_specs: []
      }
    });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'run',
      '--manifest',
      manifestFile,
      '--no-require-ontology-validation',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.status).toBe('completed');
    expect(payload.policy.require_ontology_validation).toBe(false);
    expect(runAutoCloseLoop).toHaveBeenCalled();
  });

  test('fails handoff run early when Moqui baseline script is missing (default gate enabled)', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-10-moqui-baseline-gate'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    await fs.remove(path.join(tempDir, 'scripts', 'moqui-template-baseline-report.js'));

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('failed');
    expect(payload.error).toContain('handoff moqui baseline gate failed');
    expect(payload.error).toContain('baseline script missing');
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('allows disabling Moqui baseline gate via --no-require-moqui-baseline', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-10-moqui-baseline-bypass'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    await fs.remove(path.join(tempDir, 'scripts', 'moqui-template-baseline-report.js'));

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'run',
      '--manifest',
      manifestFile,
      '--dry-run',
      '--no-require-moqui-baseline',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('dry-run');
    expect(payload.policy.require_moqui_baseline).toBe(false);
    expect(payload.moqui_baseline).toEqual(expect.objectContaining({
      status: 'skipped',
      generated: false
    }));
    expect(payload.gates.passed).toBe(true);
  });

  test('fails handoff run early when scene package publish-batch dry-run gate fails (default gate enabled)', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: [
        {
          id: '60-10-scene-batch-gate',
          spec: '60-10-scene-batch-gate',
          status: 'completed'
        }
      ],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('failed');
    expect(payload.error).toContain('handoff scene package batch gate failed');
    expect(payload.scene_package_batch).toEqual(expect.objectContaining({
      status: 'failed',
      generated: true,
      summary: expect.objectContaining({
        selected: 1,
        failed: 1
      })
    }));
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('allows disabling scene package publish-batch dry-run gate via --no-require-scene-package-batch', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: [
        {
          id: '60-10-scene-batch-gate-bypass',
          spec: '60-10-scene-batch-gate-bypass',
          status: 'completed'
        }
      ],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'run',
      '--manifest',
      manifestFile,
      '--dry-run',
      '--no-require-scene-package-batch',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('dry-run');
    expect(payload.policy.require_scene_package_batch).toBe(false);
    expect(payload.scene_package_batch).toEqual(expect.objectContaining({
      status: 'failed',
      generated: true
    }));
    expect(payload.gates.passed).toBe(true);
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('fails handoff run when capability coverage is below default threshold and writes remediation queue', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-10-capability-gate'],
      templates: ['moqui-domain-extension'],
      capabilities: ['order-fulfillment', 'inventory-allocation'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const templateDir = path.join(tempDir, '.sce', 'templates', 'scene-packages', 'tpl-capability');
    await fs.ensureDir(templateDir);
    await fs.writeJson(path.join(templateDir, 'scene-package.json'), {
      capabilities: {
        provides: ['inventory-allocation']
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('failed');
    expect(payload.error).toContain('handoff capability coverage gate failed');
    expect(payload.error).toContain('capability_coverage_percent');
    expect(payload.moqui_capability_coverage).toEqual(expect.objectContaining({
      status: 'evaluated',
      summary: expect.objectContaining({
        total_capabilities: 2,
        covered_capabilities: 1,
        uncovered_capabilities: 1,
        coverage_percent: 50,
        min_required_percent: 100,
        passed: false
      })
    }));
    expect(payload.remediation_queue).toEqual(expect.objectContaining({
      goal_count: expect.any(Number)
    }));
    expect(payload.remediation_queue.goal_count).toBeGreaterThanOrEqual(2);
    expect(await fs.pathExists(payload.remediation_queue.file)).toBe(true);
    const queueContent = await fs.readFile(payload.remediation_queue.file, 'utf8');
    expect(queueContent).toContain('order-fulfillment');
    expect(payload.recommendations.some(item => item.includes('sce auto close-loop-batch'))).toBe(true);
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('normalizes capability aliases and deprecated aliases through Moqui lexicon', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-10-capability-lexicon-normalization'],
      templates: ['moqui-domain-extension'],
      capabilities: ['order-query-read', 'order-fulfillment', 'inventory-adjustment'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const templateDir = path.join(tempDir, '.sce', 'templates', 'scene-packages', 'tpl-capability-lexicon');
    await fs.ensureDir(templateDir);
    await fs.writeJson(path.join(templateDir, 'scene-package.json'), {
      capabilities: {
        provides: [
          'erp-order-query-read',
          'erp-order-fulfillment-workflow',
          'erp-inventory-reserve-adjust'
        ]
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'run',
      '--manifest',
      manifestFile,
      '--dry-run',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('dry-run');
    expect(payload.gates.passed).toBe(true);
    expect(payload.moqui_capability_coverage.summary).toEqual(expect.objectContaining({
      covered_capabilities: 3,
      uncovered_capabilities: 0,
      coverage_percent: 100,
      passed: true
    }));
    expect(payload.moqui_capability_coverage.normalization).toEqual(expect.objectContaining({
      expected_alias_mapped: expect.arrayContaining([
        expect.objectContaining({ raw: 'order-query-read', canonical: 'erp-order-query-read' }),
        expect.objectContaining({ raw: 'order-fulfillment', canonical: 'erp-order-fulfillment-workflow' })
      ]),
      expected_deprecated_aliases: expect.arrayContaining([
        expect.objectContaining({ raw: 'inventory-adjustment', canonical: 'erp-inventory-reserve-adjust' })
      ]),
      expected_unknown: []
    }));
    expect(payload.moqui_capability_coverage.warnings.some(item => item.includes('deprecated'))).toBe(true);
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('normalizes expanded 331 capability aliases through Moqui lexicon', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-18T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['64-05-suite-capability-observability'],
      templates: ['suite-capability-observability'],
      capabilities: ['party-master', 'workflow-approval', 'audit-ops'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const templateDir = path.join(tempDir, '.sce', 'templates', 'scene-packages', 'tpl-capability-lexicon-331');
    await fs.ensureDir(templateDir);
    await fs.writeJson(path.join(templateDir, 'scene-package.json'), {
      capabilities: {
        provides: [
          'erp-party-management',
          'platform-workflow-approval-engine',
          'platform-reporting-audit-ops'
        ]
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'run',
      '--manifest',
      manifestFile,
      '--dry-run',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('dry-run');
    expect(payload.gates.passed).toBe(true);
    expect(payload.moqui_capability_coverage.summary).toEqual(expect.objectContaining({
      covered_capabilities: 3,
      uncovered_capabilities: 0,
      coverage_percent: 100,
      passed: true
    }));
    expect(payload.moqui_capability_coverage.normalization).toEqual(expect.objectContaining({
      expected_alias_mapped: expect.arrayContaining([
        expect.objectContaining({ raw: 'party-master', canonical: 'erp-party-management' }),
        expect.objectContaining({ raw: 'workflow-approval', canonical: 'platform-workflow-approval-engine' }),
        expect.objectContaining({ raw: 'audit-ops', canonical: 'platform-reporting-audit-ops' })
      ]),
      expected_unknown: []
    }));
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('fails handoff run when template provides unknown capability aliases under lexicon gate', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-18T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-10-capability-lexicon-provided-unknown'],
      templates: ['moqui-domain-extension'],
      capabilities: ['erp-order-query-read'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const templateDir = path.join(tempDir, '.sce', 'templates', 'scene-packages', 'tpl-capability-lexicon-provided-unknown');
    await fs.ensureDir(templateDir);
    await fs.writeJson(path.join(templateDir, 'scene-package.json'), {
      capabilities: {
        provides: ['erp-order-query-read', 'template-capability-unknown']
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--dry-run',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('failed');
    expect(payload.error).toContain('handoff capability lexicon gate failed');
    expect(payload.error).toContain('capability_lexicon_provided_unknown_count 1 > allowed 0');
    expect(payload.moqui_capability_coverage.summary).toEqual(expect.objectContaining({
      covered_capabilities: 1,
      uncovered_capabilities: 0,
      coverage_percent: 100,
      passed: true
    }));
    expect(payload.moqui_capability_coverage.normalization.provided_unknown).toEqual(expect.arrayContaining([
      expect.objectContaining({ raw: 'template-capability-unknown', canonical: 'template-capability-unknown' })
    ]));
    expect(payload.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('node scripts/moqui-lexicon-audit.js')
    ]));
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('records unknown manifest capabilities in lexicon normalization warnings', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-10-capability-lexicon-unknown'],
      templates: ['moqui-domain-extension'],
      capabilities: ['mystery-capability'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const templateDir = path.join(tempDir, '.sce', 'templates', 'scene-packages', 'tpl-capability-lexicon-unknown');
    await fs.ensureDir(templateDir);
    await fs.writeJson(path.join(templateDir, 'scene-package.json'), {
      capabilities: {
        provides: ['erp-order-query-read']
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--dry-run',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('failed');
    expect(payload.error).toContain('handoff capability coverage gate failed');
    expect(payload.moqui_capability_coverage.normalization.expected_unknown).toEqual(expect.arrayContaining([
      expect.objectContaining({ raw: 'mystery-capability', canonical: 'mystery-capability' })
    ]));
    expect(payload.moqui_capability_coverage.warnings.some(item => item.includes('unknown to Moqui lexicon'))).toBe(true);
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('fails handoff run early when ontology quality score is below threshold', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-11-ontology-quality'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed',
        quality_score: 62,
        business_rules: {
          total: 4,
          mapped: 3
        },
        decision_logic: {
          total: 3,
          resolved: 2
        }
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--min-ontology-score',
        '80',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('failed');
    expect(payload.error).toContain('ontology_quality_score');
    expect(payload.recommendations.some(item => item.includes('--min-ontology-score 80'))).toBe(true);
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('fails handoff run early when unmapped rules and undecided decisions exceed thresholds', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-11-ontology-governance'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed',
        quality_score: 88,
        business_rules: {
          total: 5,
          mapped: 4
        },
        decision_logic: {
          total: 4,
          resolved: 3
        }
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--max-unmapped-rules',
        '0',
        '--max-undecided-decisions',
        '0',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('failed');
    expect(payload.error).toContain('business_rule_unmapped');
    expect(payload.error).toContain('decision_undecided');
    expect(payload.recommendations.some(item => item.includes('--max-unmapped-rules 0'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('--max-undecided-decisions 0'))).toBe(true);
    expect(runAutoCloseLoop).not.toHaveBeenCalled();
  });

  test('fails handoff run gate when spec success rate is below threshold', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-12-warranty-claims'],
      templates: ['moqui-domain-extension'],
      known_gaps: ['claims SLA overdue'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    runAutoCloseLoop.mockImplementation(async goal => {
      if (`${goal}`.startsWith('integrate handoff spec 60-12-warranty-claims')) {
        return {
          status: 'failed',
          portfolio: {
            master_spec: '160-00-warranty',
            sub_specs: []
          }
        };
      }
      return {
        status: 'completed',
        portfolio: {
          master_spec: '160-00-generic',
          sub_specs: []
        }
      };
    });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--min-spec-success-rate',
        '90',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-run');
    expect(payload.status).toBe('failed');
    expect(payload.gates.passed).toBe(false);
    expect(payload.gates.reasons.join(' ')).toContain('spec_success_rate_percent');
    expect(payload.recommendations.some(item => item.includes(`--continue-from ${payload.session_id}`))).toBe(true);
    expect(runAutoCloseLoop).toHaveBeenCalled();
  });

  test('validates handoff ontology gate option ranges', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-11-ontology-validation-options'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--min-ontology-score',
        '120',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');
    let payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.error).toContain('--min-ontology-score must be a number between 0 and 100.');

    logSpy.mockClear();
    const secondProgram = buildProgram();
    await expect(
      secondProgram.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--max-unmapped-rules',
        '-1',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');
    payload = JSON.parse(`${logSpy.mock.calls[logSpy.mock.calls.length - 1][0]}`);
    expect(payload.error).toContain('--max-unmapped-rules must be an integer >= 0.');

    logSpy.mockClear();
    const thirdProgram = buildProgram();
    await expect(
      thirdProgram.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--max-moqui-matrix-regressions',
        '-1',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');
    payload = JSON.parse(`${logSpy.mock.calls[logSpy.mock.calls.length - 1][0]}`);
    expect(payload.error).toContain('--max-moqui-matrix-regressions must be an integer >= 0.');
  });

  test('validates handoff release evidence window option range', async () => {
    const manifestFile = path.join(tempDir, 'handoff-manifest.json');
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-16T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['60-11-release-evidence-window-option'],
      templates: ['moqui-domain-extension'],
      ontology_validation: {
        status: 'passed'
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'run',
        '--manifest',
        manifestFile,
        '--release-evidence-window',
        '1',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.error).toContain('--release-evidence-window must be an integer between 2 and 50.');
  });

  test('builds handoff regression by comparing latest run report with previous one', async () => {
    const reportDir = path.join(tempDir, '.sce', 'reports', 'handoff-runs');
    await fs.ensureDir(reportDir);
    await fs.writeJson(path.join(reportDir, 'handoff-old.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-old',
      status: 'completed',
      generated_at: '2026-02-16T00:00:00.000Z',
      elapsed_ms: 5000,
      spec_status: {
        success_rate_percent: 80
      },
      gates: {
        actual: {
          risk_level: 'medium'
        }
      },
      batch_summary: {
        failed_goals: 2
      }
    }, { spaces: 2 });
    await new Promise(resolve => setTimeout(resolve, 20));
    await fs.writeJson(path.join(reportDir, 'handoff-new.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-new',
      status: 'completed',
      generated_at: '2026-02-16T01:00:00.000Z',
      elapsed_ms: 4000,
      spec_status: {
        success_rate_percent: 100
      },
      gates: {
        actual: {
          risk_level: 'low'
        }
      },
      batch_summary: {
        failed_goals: 0
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'regression',
      '--session-id',
      'latest',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-regression');
    expect(payload.current.session_id).toBe('handoff-new');
    expect(payload.previous.session_id).toBe('handoff-old');
    expect(payload.trend).toBe('improved');
    expect(payload.delta.spec_success_rate_percent).toBe(20);
    expect(payload.delta.risk_level_rank).toBe(-1);
  });

  test('includes ontology quality and rule/decision metrics in handoff regression output', async () => {
    const reportDir = path.join(tempDir, '.sce', 'reports', 'handoff-runs');
    await fs.ensureDir(reportDir);
    await fs.writeJson(path.join(reportDir, 'handoff-old-ontology.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-old-ontology',
      status: 'completed',
      generated_at: '2026-02-16T00:00:00.000Z',
      spec_status: {
        success_rate_percent: 90
      },
      ontology_validation: {
        quality_score: 72,
        metrics: {
          business_rule_unmapped: 2,
          decision_undecided: 1,
          business_rule_pass_rate_percent: 75,
          decision_resolved_rate_percent: 70
        }
      },
      scene_package_batch: {
        status: 'failed',
        summary: {
          batch_gate_failure_count: 2
        }
      },
      batch_summary: {
        failed_goals: 1
      }
    }, { spaces: 2 });
    await new Promise(resolve => setTimeout(resolve, 20));
    await fs.writeJson(path.join(reportDir, 'handoff-new-ontology.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-new-ontology',
      status: 'completed',
      generated_at: '2026-02-16T01:00:00.000Z',
      spec_status: {
        success_rate_percent: 96
      },
      ontology_validation: {
        quality_score: 88,
        metrics: {
          business_rule_unmapped: 0,
          decision_undecided: 0,
          business_rule_pass_rate_percent: 100,
          decision_resolved_rate_percent: 100
        }
      },
      scene_package_batch: {
        status: 'passed',
        summary: {
          batch_gate_failure_count: 0
        }
      },
      batch_summary: {
        failed_goals: 0
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'regression',
      '--session-id',
      'latest',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-regression');
    expect(payload.current.ontology_quality_score).toBe(88);
    expect(payload.current.ontology_unmapped_rules).toBe(0);
    expect(payload.current.ontology_undecided_decisions).toBe(0);
    expect(payload.delta.ontology_quality_score).toBe(16);
    expect(payload.delta.ontology_unmapped_rules).toBe(-2);
    expect(payload.delta.ontology_undecided_decisions).toBe(-1);
    expect(payload.current.scene_package_batch_passed).toBe(true);
    expect(payload.current.scene_package_batch_failure_count).toBe(0);
    expect(payload.delta.scene_package_batch_failure_count).toBe(-2);
    expect(payload.aggregates.avg_ontology_quality_score).toBe(80);
    expect(payload.aggregates.scene_package_batch_pass_rate_percent).toBe(50);
  });

  test('builds handoff regression trend series within custom window', async () => {
    const reportDir = path.join(tempDir, '.sce', 'reports', 'handoff-runs');
    await fs.ensureDir(reportDir);
    await fs.writeJson(path.join(reportDir, 'handoff-oldest.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-oldest',
      status: 'completed',
      generated_at: '2026-02-15T22:00:00.000Z',
      elapsed_ms: 7000,
      spec_status: {
        success_rate_percent: 70
      },
      gates: {
        actual: {
          risk_level: 'high'
        }
      },
      batch_summary: {
        failed_goals: 3
      }
    }, { spaces: 2 });
    await new Promise(resolve => setTimeout(resolve, 20));
    await fs.writeJson(path.join(reportDir, 'handoff-middle.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-middle',
      status: 'completed',
      generated_at: '2026-02-15T23:00:00.000Z',
      elapsed_ms: 5200,
      spec_status: {
        success_rate_percent: 80
      },
      gates: {
        actual: {
          risk_level: 'medium'
        }
      },
      batch_summary: {
        failed_goals: 1
      }
    }, { spaces: 2 });
    await new Promise(resolve => setTimeout(resolve, 20));
    await fs.writeJson(path.join(reportDir, 'handoff-latest.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-latest',
      status: 'completed',
      generated_at: '2026-02-16T00:00:00.000Z',
      elapsed_ms: 4300,
      spec_status: {
        success_rate_percent: 90
      },
      gates: {
        actual: {
          risk_level: 'low'
        }
      },
      batch_summary: {
        failed_goals: 0
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'regression',
      '--session-id',
      'latest',
      '--window',
      '3',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-regression');
    expect(payload.window).toEqual(expect.objectContaining({
      requested: 3,
      actual: 3
    }));
    expect(payload.series).toHaveLength(3);
    expect(payload.current.session_id).toBe('handoff-latest');
    expect(payload.previous.session_id).toBe('handoff-middle');
    expect(payload.window_trend.trend).toBe('improved');
    expect(payload.window_trend.delta.spec_success_rate_percent).toBe(20);
    expect(payload.window_trend.delta.risk_level_rank).toBe(-2);
    expect(payload.aggregates).toEqual(expect.objectContaining({
      avg_spec_success_rate_percent: 80,
      min_spec_success_rate_percent: 70,
      max_spec_success_rate_percent: 90
    }));
    expect(payload.aggregates.risk_levels).toEqual(expect.objectContaining({
      low: 1,
      medium: 1,
      high: 1
    }));
    expect(payload.risk_layers).toEqual(expect.objectContaining({
      low: expect.objectContaining({
        count: 1,
        sessions: ['handoff-latest'],
        avg_spec_success_rate_percent: 90
      }),
      medium: expect.objectContaining({
        count: 1,
        sessions: ['handoff-middle'],
        avg_spec_success_rate_percent: 80
      }),
      high: expect.objectContaining({
        count: 1,
        sessions: ['handoff-oldest'],
        avg_spec_success_rate_percent: 70
      })
    }));
  });

  test('validates regression window range', async () => {
    const reportDir = path.join(tempDir, '.sce', 'reports', 'handoff-runs');
    await fs.ensureDir(reportDir);
    await fs.writeJson(path.join(reportDir, 'handoff-one.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-one',
      status: 'completed',
      generated_at: '2026-02-16T00:00:00.000Z',
      spec_status: {
        success_rate_percent: 100
      },
      batch_summary: {
        failed_goals: 0
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'regression',
        '--window',
        '1',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.error).toContain('--window must be an integer between 2 and 50.');
  });

  test('adds regression recommendations when trend degrades', async () => {
    const reportDir = path.join(tempDir, '.sce', 'reports', 'handoff-runs');
    await fs.ensureDir(reportDir);
    await fs.writeJson(path.join(reportDir, 'handoff-good.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-good',
      status: 'completed',
      generated_at: '2026-02-16T00:00:00.000Z',
      spec_status: {
        success_rate_percent: 100
      },
      gates: {
        actual: {
          risk_level: 'low'
        }
      },
      batch_summary: {
        failed_goals: 0
      }
    }, { spaces: 2 });
    await new Promise(resolve => setTimeout(resolve, 20));
    await fs.writeJson(path.join(reportDir, 'handoff-bad.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-bad',
      status: 'failed',
      generated_at: '2026-02-16T01:00:00.000Z',
      spec_status: {
        success_rate_percent: 80
      },
      gates: {
        actual: {
          risk_level: 'high',
          moqui_matrix_regression_count: 1
        }
      },
      batch_summary: {
        failed_goals: 3
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'regression',
      '--session-id',
      'latest',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-regression');
    expect(payload.trend).toBe('degraded');
    expect(payload.recommendations.some(item => item.includes('--continue-from handoff-bad'))).toBe(true);
    expect(payload.recommendations).toContain('sce auto governance stats --days 14 --json');
    expect(payload.recommendations.some(item => item.includes('moqui-matrix-remediation-phased-runner.js'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('run:matrix-remediation-from-baseline'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('run:matrix-remediation-clusters-phased'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('matrix-remediation.capability-clusters.json'))).toBe(true);
    expect(payload.recommendations.some(item => item.includes('run:matrix-remediation-clusters'))).toBe(true);
  });

  test('supports handoff regression out file option', async () => {
    const reportDir = path.join(tempDir, '.sce', 'reports', 'handoff-runs');
    const outFile = path.join(tempDir, '.sce', 'reports', 'handoff-regression.json');
    await fs.ensureDir(reportDir);
    await fs.writeJson(path.join(reportDir, 'handoff-old.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-old',
      status: 'completed',
      generated_at: '2026-02-16T00:00:00.000Z',
      spec_status: {
        success_rate_percent: 90
      },
      batch_summary: {
        failed_goals: 1
      }
    }, { spaces: 2 });
    await new Promise(resolve => setTimeout(resolve, 20));
    await fs.writeJson(path.join(reportDir, 'handoff-new.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-new',
      status: 'completed',
      generated_at: '2026-02-16T01:00:00.000Z',
      spec_status: {
        success_rate_percent: 100
      },
      batch_summary: {
        failed_goals: 0
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'regression',
      '--out',
      outFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-regression');
    expect(payload.output_file).toBe(outFile);
    expect(await fs.pathExists(outFile)).toBe(true);
    const saved = await fs.readJson(outFile);
    expect(saved.mode).toBe('auto-handoff-regression');
    expect(saved.current.session_id).toBe('handoff-new');
  });

  test('supports handoff regression markdown format output file', async () => {
    const reportDir = path.join(tempDir, '.sce', 'reports', 'handoff-runs');
    const outFile = path.join(tempDir, '.sce', 'reports', 'handoff-regression.md');
    await fs.ensureDir(reportDir);
    await fs.writeJson(path.join(reportDir, 'handoff-old.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-old',
      status: 'completed',
      generated_at: '2026-02-16T00:00:00.000Z',
      spec_status: {
        success_rate_percent: 90
      },
      batch_summary: {
        failed_goals: 1
      }
    }, { spaces: 2 });
    await new Promise(resolve => setTimeout(resolve, 20));
    await fs.writeJson(path.join(reportDir, 'handoff-new.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-new',
      status: 'completed',
      generated_at: '2026-02-16T01:00:00.000Z',
      spec_status: {
        success_rate_percent: 100
      },
      batch_summary: {
        failed_goals: 0
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'regression',
      '--format',
      'markdown',
      '--out',
      outFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-regression');
    expect(payload.report_format).toBe('markdown');
    expect(payload.output_file).toBe(outFile);
    expect(await fs.pathExists(outFile)).toBe(true);
    const markdown = await fs.readFile(outFile, 'utf8');
    expect(markdown).toContain('# Auto Handoff Regression Report');
    expect(markdown).toContain('- Session: handoff-new');
    expect(markdown).toContain('## Trend Series');
    expect(markdown).toContain('## Risk Layer View');
    expect(markdown).toContain('success=');
    expect(markdown).toContain('scene-batch=');
    expect(markdown).toContain('low: count=');
    expect(markdown).toContain('## Recommendations');
  });

  test('validates regression format option', async () => {
    const reportDir = path.join(tempDir, '.sce', 'reports', 'handoff-runs');
    await fs.ensureDir(reportDir);
    await fs.writeJson(path.join(reportDir, 'handoff-one.json'), {
      mode: 'auto-handoff-run',
      session_id: 'handoff-one',
      status: 'completed',
      generated_at: '2026-02-16T00:00:00.000Z',
      spec_status: {
        success_rate_percent: 100
      },
      batch_summary: {
        failed_goals: 0
      }
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'regression',
        '--format',
        'html',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.error).toContain('--format must be one of: json, markdown.');
  });

  test('builds handoff release evidence review summary in json mode', async () => {
    const evidenceFile = path.join(tempDir, '.sce', 'reports', 'release-evidence', 'handoff-runs.json');
    await fs.ensureDir(path.dirname(evidenceFile));
    await fs.writeJson(evidenceFile, {
      mode: 'auto-handoff-release-evidence',
      generated_at: '2026-02-16T00:00:00.000Z',
      updated_at: '2026-02-16T01:00:00.000Z',
      latest_session_id: 'handoff-new',
      total_runs: 2,
      sessions: [
        {
          session_id: 'handoff-old',
          merged_at: '2026-02-16T00:00:00.000Z',
          status: 'failed',
          manifest_path: 'handoff-manifest-old.json',
          gate: {
            passed: false,
            actual: {
              spec_success_rate_percent: 75,
              risk_level: 'high',
              ontology_quality_score: 70,
              ontology_business_rule_unmapped: 2,
              ontology_decision_undecided: 1
            }
          },
          ontology_validation: {
            status: 'passed',
            quality_score: 70,
            metrics: {
              business_rule_unmapped: 2,
              decision_undecided: 1
            }
          },
          regression: {
            trend: 'degraded',
            delta: {
              spec_success_rate_percent: -20
            }
          },
          scene_package_batch: {
            status: 'failed',
            generated: true,
            summary: {
              selected: 2,
              failed: 1,
              batch_gate_passed: false,
              batch_gate_failure_count: 1
            },
            batch_ontology_gate: {
              passed: false,
              failures: [
                {
                  id: 'ontology_min_average_score',
                  message: 'ontology average score 68 is below minimum 70'
                }
              ]
            },
            output: {
              json: '.sce/reports/release-evidence/scene-package-publish-batch-dry-run.json'
            }
          },
          batch_summary: {
            failed_goals: 2
          }
        },
        {
          session_id: 'handoff-new',
          merged_at: '2026-02-16T01:00:00.000Z',
          status: 'completed',
          manifest_path: 'handoff-manifest-new.json',
          gate: {
            passed: true,
            actual: {
              spec_success_rate_percent: 100,
              risk_level: 'low',
              ontology_quality_score: 92,
              ontology_business_rule_unmapped: 0,
              ontology_decision_undecided: 0
            }
          },
          ontology_validation: {
            status: 'passed',
            quality_score: 92,
            metrics: {
              business_rule_unmapped: 0,
              decision_undecided: 0
            }
          },
          regression: {
            trend: 'improved',
            delta: {
              spec_success_rate_percent: 25
            }
          },
          moqui_baseline: {
            status: 'passed',
            generated: true,
            summary: {
              total_templates: 3,
              scoped_templates: 3,
              avg_score: 95,
              valid_rate_percent: 100,
              baseline_passed: 3,
              baseline_failed: 0,
              portfolio_passed: true,
              scope_breakdown: {
                moqui_erp: 2,
                scene_orchestration: 1,
                other: 0
              },
              coverage_matrix: {
                entity_coverage: { count: 3, rate_percent: 100 },
                relation_coverage: { count: 3, rate_percent: 100 },
                business_rule_coverage: { count: 3, rate_percent: 100 },
                business_rule_closed: { count: 3, rate_percent: 100 },
                decision_coverage: { count: 3, rate_percent: 100 },
                decision_closed: { count: 3, rate_percent: 100 }
              },
              gap_frequency: []
            },
            compare: {
              deltas: {
                avg_score: 2,
                valid_rate_percent: 0
              },
              coverage_matrix_deltas: {
                entity_coverage: { count: 0, rate_percent: 0 },
                business_rule_closed: { count: 1, rate_percent: 33.33 },
                decision_closed: { count: 0, rate_percent: 0 }
              },
              failed_templates: {
                newly_failed: [],
                recovered: ['sce.scene--legacy-order--0.1.0']
              }
            },
            output: {
              json: '.sce/reports/release-evidence/moqui-template-baseline.json',
              markdown: '.sce/reports/release-evidence/moqui-template-baseline.md'
            }
          },
          scene_package_batch: {
            status: 'passed',
            generated: true,
            summary: {
              selected: 2,
              failed: 0,
              batch_gate_passed: true,
              batch_gate_failure_count: 0
            },
            batch_ontology_gate: {
              passed: true,
              failures: []
            },
            output: {
              json: '.sce/reports/release-evidence/scene-package-publish-batch-dry-run.json'
            }
          },
          batch_summary: {
            failed_goals: 0
          }
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'evidence',
      '--file',
      evidenceFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-evidence-review');
    expect(payload.current.session_id).toBe('handoff-new');
    expect(payload.current_overview.gate.passed).toBe(true);
    expect(payload.current_overview.moqui_baseline).toEqual(expect.objectContaining({
      status: 'passed',
      summary: expect.objectContaining({
        portfolio_passed: true,
        coverage_matrix: expect.objectContaining({
          entity_coverage: expect.objectContaining({
            rate_percent: 100
          })
        })
      })
    }));
    expect(payload.current_overview.scene_package_batch).toEqual(expect.objectContaining({
      status: 'passed',
      summary: expect.objectContaining({
        batch_gate_passed: true
      })
    }));
    expect(payload.window).toEqual(expect.objectContaining({
      requested: 5,
      actual: 2
    }));
    expect(payload.aggregates.status_counts).toEqual(expect.objectContaining({
      completed: 1,
      failed: 1
    }));
    expect(payload.aggregates.gate_pass_rate_percent).toBe(50);
    expect(payload.aggregates.scene_package_batch_pass_rate_percent).toBe(50);
    expect(payload.risk_layers).toEqual(expect.objectContaining({
      low: expect.objectContaining({
        count: 1,
        sessions: ['handoff-new']
      }),
      high: expect.objectContaining({
        count: 1,
        sessions: ['handoff-old']
      })
    }));
    expect(payload.governance_snapshot).toEqual(expect.objectContaining({
      mode: 'auto-governance-stats',
      health: expect.objectContaining({
        risk_level: expect.any(String)
      })
    }));
  });

  test('supports handoff evidence markdown format output file', async () => {
    const evidenceFile = path.join(tempDir, '.sce', 'reports', 'release-evidence', 'handoff-runs.json');
    const outFile = path.join(tempDir, '.sce', 'reports', 'handoff-evidence.md');
    await fs.ensureDir(path.dirname(evidenceFile));
    await fs.writeJson(evidenceFile, {
      mode: 'auto-handoff-release-evidence',
      generated_at: '2026-02-16T00:00:00.000Z',
      updated_at: '2026-02-16T01:00:00.000Z',
      latest_session_id: 'handoff-one',
      total_runs: 1,
      sessions: [
        {
          session_id: 'handoff-one',
          merged_at: '2026-02-16T01:00:00.000Z',
          status: 'completed',
          policy: {
            max_moqui_matrix_regressions: 0,
            require_release_gate_preflight: false
          },
          gate: {
            passed: true,
            actual: {
              spec_success_rate_percent: 95,
              risk_level: 'low',
              ontology_quality_score: 88
            }
          },
          release_gate_preflight: {
            available: true,
            blocked: false,
            latest_tag: 'v1.47.35',
            latest_gate_passed: true,
            reasons: []
          },
          failure_summary: {
            gate_failed: false,
            release_gate_preflight_blocked: false,
            highlights: []
          },
          ontology_validation: {
            status: 'passed',
            quality_score: 88,
            metrics: {
              business_rule_unmapped: 0,
              decision_undecided: 0
            }
          },
          regression: {
            trend: 'baseline',
            delta: {}
          },
          batch_summary: {
            failed_goals: 0
          }
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'evidence',
      '--file',
      evidenceFile,
      '--format',
      'markdown',
      '--out',
      outFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-evidence-review');
    expect(payload.report_format).toBe('markdown');
    expect(payload.output_file).toBe(outFile);
    expect(await fs.pathExists(outFile)).toBe(true);
    const markdown = await fs.readFile(outFile, 'utf8');
    expect(markdown).toContain('# Auto Handoff Release Evidence Review');
    expect(markdown).toContain('## Current Gate');
    expect(markdown).toContain('## Current Release Gate Preflight');
    expect(markdown).toContain('## Current Failure Summary');
    expect(markdown).toContain('## Current Ontology');
    expect(markdown).toContain('## Current Regression');
    expect(markdown).toContain('## Current Moqui Baseline');
    expect(markdown).toContain('## Current Scene Package Batch');
    expect(markdown).toContain('## Risk Layer View');
    expect(markdown).toContain('## Governance Snapshot');
  });

  test('validates handoff evidence window option range', async () => {
    const evidenceFile = path.join(tempDir, '.sce', 'reports', 'release-evidence', 'handoff-runs.json');
    await fs.ensureDir(path.dirname(evidenceFile));
    await fs.writeJson(evidenceFile, {
      mode: 'auto-handoff-release-evidence',
      sessions: [
        {
          session_id: 'handoff-one',
          merged_at: '2026-02-16T01:00:00.000Z',
          status: 'completed',
          gate: {
            passed: true,
            actual: {
              spec_success_rate_percent: 100,
              risk_level: 'low',
              ontology_quality_score: 95
            }
          },
          ontology_validation: {
            status: 'passed',
            quality_score: 95,
            metrics: {}
          },
          regression: {
            trend: 'baseline',
            delta: {}
          },
          batch_summary: {
            failed_goals: 0
          }
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'evidence',
        '--file',
        evidenceFile,
        '--window',
        '0',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.error).toContain('--window must be an integer between 1 and 50.');
  });

  test('writes handoff release draft and evidence review files', async () => {
    const evidenceFile = path.join(tempDir, '.sce', 'reports', 'release-evidence', 'handoff-runs.json');
    const releaseDraftFile = path.join(tempDir, 'docs', 'releases', 'v9.9.9-draft.md');
    await fs.ensureDir(path.dirname(evidenceFile));
    await fs.writeJson(evidenceFile, {
      mode: 'auto-handoff-release-evidence',
      generated_at: '2026-02-16T00:00:00.000Z',
      updated_at: '2026-02-16T01:00:00.000Z',
      latest_session_id: 'handoff-one',
      total_runs: 1,
      sessions: [
        {
          session_id: 'handoff-one',
          merged_at: '2026-02-16T01:00:00.000Z',
          status: 'completed',
          handoff_report_file: '.sce/reports/handoff-runs/handoff-one.json',
          policy: {
            max_moqui_matrix_regressions: 0,
            require_release_gate_preflight: true
          },
          gate: {
            passed: true,
            actual: {
              spec_success_rate_percent: 97,
              risk_level: 'low',
              ontology_quality_score: 91
            }
          },
          release_gate_preflight: {
            available: true,
            blocked: true,
            latest_tag: 'v1.47.35',
            latest_gate_passed: false,
            latest_weekly_ops_runtime_block_rate_percent: 45,
            latest_weekly_ops_runtime_ui_mode_violation_total: 1,
            latest_weekly_ops_runtime_ui_mode_violation_rate_percent: 20,
            weekly_ops_runtime_block_rate_max_percent: 45,
            weekly_ops_runtime_ui_mode_violation_total: 1,
            weekly_ops_runtime_ui_mode_violation_run_rate_percent: 100,
            weekly_ops_runtime_ui_mode_violation_rate_max_percent: 20,
            reasons: ['latest-release-gate-failed', 'drift-alert-rate-positive:100']
          },
          failure_summary: {
            gate_failed: false,
            release_gate_preflight_blocked: true,
            highlights: ['release_gate_preflight: latest-release-gate-failed']
          },
          ontology_validation: {
            status: 'passed',
            quality_score: 91,
            metrics: {
              business_rule_unmapped: 0,
              decision_undecided: 0
            }
          },
          regression: {
            trend: 'improved',
            delta: {
              spec_success_rate_percent: 12
            }
          },
          moqui_baseline: {
            status: 'passed',
            generated: true,
            summary: {
              total_templates: 6,
              scoped_templates: 6,
              avg_score: 91,
              valid_rate_percent: 100,
              baseline_passed: 6,
              baseline_failed: 0,
              portfolio_passed: true,
              scope_breakdown: {
                moqui_erp: 3,
                scene_orchestration: 3,
                other: 0
              },
              coverage_matrix: {
                entity_coverage: { count: 6, rate_percent: 100 },
                relation_coverage: { count: 6, rate_percent: 100 },
                business_rule_coverage: { count: 6, rate_percent: 100 },
                business_rule_closed: { count: 5, rate_percent: 83.33 },
                decision_coverage: { count: 6, rate_percent: 100 },
                decision_closed: { count: 6, rate_percent: 100 }
              },
              gap_frequency: [
                { gap: 'unmapped business rules remain', count: 1 }
              ]
            },
            compare: {
              deltas: {
                avg_score: 2,
                valid_rate_percent: 0
              },
              coverage_matrix_deltas: {
                entity_coverage: { count: 0, rate_percent: 0 },
                business_rule_closed: { count: 1, rate_percent: 16.67 },
                decision_closed: { count: 0, rate_percent: 0 }
              },
              failed_templates: {
                newly_failed: [],
                recovered: []
              }
            },
            output: {
              json: '.sce/reports/release-evidence/moqui-template-baseline.json',
              markdown: '.sce/reports/release-evidence/moqui-template-baseline.md'
            }
          },
          batch_summary: {
            failed_goals: 0
          }
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'evidence',
      '--file',
      evidenceFile,
      '--release-draft',
      releaseDraftFile,
      '--release-version',
      '9.9.9',
      '--release-date',
      '2026-02-17',
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-evidence-review');
    expect(payload.release_draft).toEqual(expect.objectContaining({
      file: releaseDraftFile,
      version: 'v9.9.9',
      release_date: '2026-02-17'
    }));
    expect(await fs.pathExists(releaseDraftFile)).toBe(true);
    expect(await fs.pathExists(payload.release_draft.review_file)).toBe(true);

    const releaseDraft = await fs.readFile(releaseDraftFile, 'utf8');
    expect(releaseDraft).toContain('# Release Notes Draft: v9.9.9');
    expect(releaseDraft).toContain('Release date: 2026-02-17');
    expect(releaseDraft).toContain('## Handoff Evidence Summary');
    expect(releaseDraft).toContain('Release gate preflight blocked: yes');
    expect(releaseDraft).toContain('Release gate preflight hard-gate: enabled');
    expect(releaseDraft).toContain('Release gate runtime block rate (latest/max): 45/45%');
    expect(releaseDraft).toContain('Release gate runtime ui-mode violations (latest/total): 1/1');
    expect(releaseDraft).toContain('Moqui entity coverage: 100%');
    expect(releaseDraft).toContain('Moqui business-rule closed: 83.33%');
    expect(releaseDraft).toContain('Moqui business-rule closed delta: 16.67%');
    expect(releaseDraft).toContain('Moqui matrix regression count: 0');
    expect(releaseDraft).toContain('Moqui matrix regression gate (max): 0');
    expect(releaseDraft).toContain('Moqui matrix regressions: none');
    expect(releaseDraft).toContain('Moqui top baseline gaps: unmapped business rules remain:1');
    expect(releaseDraft).toContain('## Risk Layer Snapshot');
    expect(releaseDraft).toContain('## Governance Snapshot');
    expect(releaseDraft).toContain('## Release Evidence Artifacts');

    const reviewMarkdown = await fs.readFile(payload.release_draft.review_file, 'utf8');
    expect(reviewMarkdown).toContain('# Auto Handoff Release Evidence Review');
    expect(reviewMarkdown).toContain('## Current Gate');
    expect(reviewMarkdown).toContain('## Current Release Gate Preflight');
    expect(reviewMarkdown).toContain('Runtime block rate (latest/max): 45/45%');
    expect(reviewMarkdown).toContain('Runtime ui-mode violations (latest/total): 1/1');
    expect(reviewMarkdown).toContain('## Current Failure Summary');
    expect(reviewMarkdown).toContain('Delta business-rule closed: 16.67%');
    expect(reviewMarkdown).toContain('Matrix regression gate (max): 0');
    expect(reviewMarkdown).toContain('Matrix regressions: none');
  });

  test('builds release gate history index by merging reports with seed history', async () => {
    const evidenceDir = path.join(tempDir, '.sce', 'reports', 'release-evidence');
    const outFile = path.join(evidenceDir, 'release-gate-history.json');
    await fs.ensureDir(evidenceDir);

    await fs.writeJson(path.join(evidenceDir, 'release-gate-v1.2.0.json'), {
      mode: 'advisory',
      enforce: false,
      evidence_used: true,
      require_evidence: false,
      require_gate_pass: true,
      thresholds: {
        min_spec_success_rate: 90,
        max_risk_level: 'medium'
      },
      signals: [
        'risk_level=medium',
        'spec_success_rate=88',
        'gate_passed=true',
        'scene_package_batch_passed=true',
        'scene_package_batch_failure_count=0',
        'capability_expected_unknown_count=0',
        'capability_provided_unknown_count=0',
        'release_gate_preflight_available=true',
        'release_gate_preflight_blocked=false',
        'require_release_gate_preflight=false'
      ],
      violations: [],
      config_warnings: [],
      gate_passed: true,
      weekly_ops: {
        blocked: false,
        violations: [],
        warnings: [
          'weekly summary generated in advisory mode'
        ],
        config_warnings: [
          'invalid number RELEASE_WEEKLY_OPS_MAX_DIALOGUE_AUTHORIZATION_BLOCK_RATE_PERCENT=abc, fallback=default'
        ],
        signals: {
          risk: 'medium',
          governance_status: 'ok',
          authorization_tier_block_rate_percent: 35,
          dialogue_authorization_block_rate_percent: 30,
          runtime_block_rate_percent: 15,
          runtime_ui_mode_violation_total: 0,
          runtime_ui_mode_violation_rate_percent: 0,
          matrix_regression_positive_rate_percent: 10
        }
      },
      drift: {
        enforce: false,
        alert_count: 0,
        blocked: false,
        evaluated_at: '2026-02-17T01:10:00.000Z'
      },
      evaluated_at: '2026-02-17T01:00:00.000Z'
    }, { spaces: 2 });

    await fs.writeJson(path.join(evidenceDir, 'release-gate-v1.3.0.json'), {
      mode: 'enforce',
      enforce: true,
      evidence_used: true,
      require_evidence: true,
      require_gate_pass: true,
      thresholds: {
        min_spec_success_rate: 95,
        max_risk_level: 'medium'
      },
      signals: [
        'risk_level=high',
        'spec_success_rate=70',
        'gate_passed=false',
        'scene_package_batch_passed=false',
        'scene_package_batch_failure_count=2',
        'capability_expected_unknown_count=1',
        'capability_provided_unknown_count=2',
        'release_gate_preflight_available=true',
        'release_gate_preflight_blocked=true',
        'require_release_gate_preflight=true'
      ],
      violations: [
        'risk level high exceeds max medium'
      ],
      config_warnings: [],
      gate_passed: false,
      weekly_ops: {
        blocked: true,
        violations: [
          'weekly ops dialogue-authorization block rate 66% exceeds max 40%'
        ],
        warnings: [],
        config_warnings: [
          'invalid number RELEASE_WEEKLY_OPS_MAX_DIALOGUE_AUTHORIZATION_BLOCK_RATE_PERCENT=xyz, fallback=default',
          'invalid number RELEASE_WEEKLY_OPS_MAX_MATRIX_REGRESSION_RATE_PERCENT=bad-value, fallback=default'
        ],
        signals: {
          risk: 'high',
          governance_status: 'alert',
          authorization_tier_block_rate_percent: 55,
          dialogue_authorization_block_rate_percent: 66,
          runtime_block_rate_percent: 52,
          runtime_ui_mode_violation_total: 2,
          runtime_ui_mode_violation_rate_percent: 25,
          matrix_regression_positive_rate_percent: 40
        }
      },
      drift: {
        enforce: true,
        alert_count: 2,
        blocked: true,
        evaluated_at: '2026-02-17T02:10:00.000Z'
      },
      evaluated_at: '2026-02-17T02:00:00.000Z'
    }, { spaces: 2 });

    await fs.writeJson(outFile, {
      mode: 'auto-handoff-release-gate-history',
      entries: [
        {
          tag: 'v1.1.0',
          evaluated_at: '2026-02-17T00:00:00.000Z',
          gate_passed: true,
          enforce: false,
          evidence_used: false,
          risk_level: 'unknown',
          scene_package_batch_passed: true,
          scene_package_batch_failure_count: 0,
          capability_expected_unknown_count: 0,
          capability_provided_unknown_count: 0,
          violations_count: 0,
          config_warning_count: 0,
          thresholds: {}
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'gate-index',
      '--dir',
      evidenceDir,
      '--out',
      outFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-release-gate-history');
    expect(payload.total_entries).toBe(3);
    expect(payload.latest).toEqual(expect.objectContaining({
      tag: 'v1.3.0',
      gate_passed: false,
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
      drift_alert_count: 2,
      drift_blocked: true
    }));
    expect(payload.aggregates).toEqual(expect.objectContaining({
      gate_passed_count: 2,
      gate_failed_count: 1,
      enforce_count: 1,
      pass_rate_percent: 66.67,
      scene_package_batch_pass_rate_percent: 66.67,
      scene_package_batch_failed_count: 1,
      avg_scene_package_batch_failure_count: 0.67,
      capability_expected_unknown_known_runs: 3,
      capability_expected_unknown_positive_runs: 1,
      capability_expected_unknown_positive_rate_percent: 33.33,
      avg_capability_expected_unknown_count: 0.33,
      max_capability_expected_unknown_count: 1,
      capability_provided_unknown_known_runs: 3,
      capability_provided_unknown_positive_runs: 1,
      capability_provided_unknown_positive_rate_percent: 33.33,
      avg_capability_provided_unknown_count: 0.67,
      max_capability_provided_unknown_count: 2,
      drift_alert_runs: 1,
      drift_blocked_runs: 1,
      drift_alert_rate_percent: 50,
      drift_block_rate_percent: 50,
      weekly_ops_known_runs: 2,
      weekly_ops_blocked_runs: 1,
      weekly_ops_block_rate_percent: 50,
      weekly_ops_violations_total: 1,
      weekly_ops_warnings_total: 1,
      weekly_ops_config_warnings_total: 3,
      weekly_ops_config_warning_runs: 2,
      weekly_ops_config_warning_run_rate_percent: 100,
      weekly_ops_authorization_tier_block_rate_avg_percent: 45,
      weekly_ops_authorization_tier_block_rate_max_percent: 55,
      weekly_ops_dialogue_authorization_block_rate_avg_percent: 48,
      weekly_ops_dialogue_authorization_block_rate_max_percent: 66,
      weekly_ops_matrix_regression_positive_rate_avg_percent: 25,
      weekly_ops_matrix_regression_positive_rate_max_percent: 40,
      weekly_ops_runtime_block_rate_avg_percent: 33.5,
      weekly_ops_runtime_block_rate_max_percent: 52,
      weekly_ops_runtime_ui_mode_violation_known_runs: 2,
      weekly_ops_runtime_ui_mode_violation_runs: 1,
      weekly_ops_runtime_ui_mode_violation_run_rate_percent: 50,
      weekly_ops_runtime_ui_mode_violation_total: 2,
      weekly_ops_runtime_ui_mode_violation_rate_avg_percent: 12.5,
      weekly_ops_runtime_ui_mode_violation_rate_max_percent: 25,
      release_gate_preflight_known_runs: 2,
      release_gate_preflight_available_runs: 2,
      release_gate_preflight_blocked_runs: 1,
      release_gate_preflight_hard_gate_runs: 1,
      release_gate_preflight_availability_rate_percent: 100,
      release_gate_preflight_block_rate_percent: 50
    }));
    expect(payload.entries[0]).toEqual(expect.objectContaining({
      tag: 'v1.3.0',
      risk_level: 'high',
      scene_package_batch_passed: false,
      scene_package_batch_failure_count: 2,
      capability_expected_unknown_count: 1,
      capability_provided_unknown_count: 2,
      release_gate_preflight_available: true,
      release_gate_preflight_blocked: true,
      require_release_gate_preflight: true,
      weekly_ops_blocked: true,
      weekly_ops_dialogue_authorization_block_rate_percent: 66,
      weekly_ops_config_warning_count: 2,
      weekly_ops_runtime_block_rate_percent: 52,
      weekly_ops_runtime_ui_mode_violation_total: 2,
      weekly_ops_runtime_ui_mode_violation_rate_percent: 25,
      drift_alert_count: 2,
      drift_blocked: true
    }));
    expect(payload.output_file).toBe(outFile);

    const written = await fs.readJson(outFile);
    expect(written.mode).toBe('auto-handoff-release-gate-history');
    expect(written.entries).toHaveLength(3);
  });

  test('writes gate-index markdown trend card when --markdown-out is provided', async () => {
    const evidenceDir = path.join(tempDir, '.sce', 'reports', 'release-evidence');
    const outFile = path.join(evidenceDir, 'release-gate-history.json');
    const markdownFile = path.join(evidenceDir, 'release-gate-history.md');
    await fs.ensureDir(evidenceDir);
    await fs.writeJson(path.join(evidenceDir, 'release-gate-v1.0.0.json'), {
      mode: 'advisory',
      enforce: false,
      evidence_used: true,
      gate_passed: true,
      signals: [
        'risk_level=low',
        'spec_success_rate=98',
        'scene_package_batch_passed=true',
        'scene_package_batch_failure_count=0',
        'release_gate_preflight_available=true',
        'release_gate_preflight_blocked=false',
        'require_release_gate_preflight=true'
      ],
      evaluated_at: '2026-02-17T03:00:00.000Z'
    }, { spaces: 2 });

    const program = buildProgram();
    await program.parseAsync([
      'node',
      'sce',
      'auto',
      'handoff',
      'gate-index',
      '--dir',
      evidenceDir,
      '--out',
      outFile,
      '--markdown-out',
      markdownFile,
      '--json'
    ]);

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.mode).toBe('auto-handoff-release-gate-history');
    expect(payload.markdown_file).toBe(markdownFile);
    expect(await fs.pathExists(markdownFile)).toBe(true);

    const markdown = await fs.readFile(markdownFile, 'utf8');
    expect(markdown).toContain('# Auto Handoff Release Gate History');
    expect(markdown).toContain('## Aggregates');
    expect(markdown).toContain('## Recent Entries');
    expect(markdown).toContain('Scene package batch pass rate');
    expect(markdown).toContain('scene-batch=');
    expect(markdown).toContain('Drift alert runs');
    expect(markdown).toContain('Release preflight blocked runs');
    expect(markdown).toContain('Weekly ops known runs');
    expect(markdown).toContain('Weekly ops config warnings total');
    expect(markdown).toContain('Weekly ops runtime ui-mode violations total');
    expect(markdown).toContain('drift-alerts=');
    expect(markdown).toContain('weekly-blocked=');
    expect(markdown).toContain('weekly-config-warnings=');
    expect(markdown).toContain('weekly-runtime-ui-mode=');
    expect(markdown).toContain('capability-unknown=');
    expect(markdown).toContain('preflight-blocked=');
    expect(markdown).toContain('hard-gate=');
    expect(markdown).toContain('v1.0.0');
  });

  test('validates handoff gate-index keep option range', async () => {
    const evidenceDir = path.join(tempDir, '.sce', 'reports', 'release-evidence');
    await fs.ensureDir(evidenceDir);
    await fs.writeJson(path.join(evidenceDir, 'release-gate-v1.0.0.json'), {
      gate_passed: true,
      evaluated_at: '2026-02-17T00:00:00.000Z'
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'gate-index',
        '--dir',
        evidenceDir,
        '--keep',
        '0',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.error).toContain('--keep must be an integer between 1 and 5000.');
  });

  test('validates handoff evidence release date format', async () => {
    const evidenceFile = path.join(tempDir, '.sce', 'reports', 'release-evidence', 'handoff-runs.json');
    await fs.ensureDir(path.dirname(evidenceFile));
    await fs.writeJson(evidenceFile, {
      mode: 'auto-handoff-release-evidence',
      sessions: [
        {
          session_id: 'handoff-one',
          merged_at: '2026-02-16T01:00:00.000Z',
          status: 'completed',
          gate: {
            passed: true,
            actual: {
              spec_success_rate_percent: 100,
              risk_level: 'low',
              ontology_quality_score: 95
            }
          },
          ontology_validation: {
            status: 'passed',
            quality_score: 95,
            metrics: {}
          },
          regression: {
            trend: 'baseline',
            delta: {}
          },
          batch_summary: {
            failed_goals: 0
          }
        }
      ]
    }, { spaces: 2 });

    const program = buildProgram();
    await expect(
      program.parseAsync([
        'node',
        'sce',
        'auto',
        'handoff',
        'evidence',
        '--file',
        evidenceFile,
        '--release-draft',
        path.join(tempDir, 'docs', 'releases', 'invalid-date.md'),
        '--release-date',
        '2026/02/17',
        '--json'
      ])
    ).rejects.toThrow('process.exit called');

    const payload = JSON.parse(`${logSpy.mock.calls[0][0]}`);
    expect(payload.error).toContain('--release-date must be in YYYY-MM-DD format.');
  });
});
