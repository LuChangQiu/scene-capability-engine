const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const chalk = require('chalk');

const { runSpecPipeline, _parseSpecTargets } = require('../../../lib/commands/spec-pipeline');
const { SessionStore } = require('../../../lib/runtime/session-store');

describe('spec-pipeline command', () => {
  let tempDir;
  let originalLog;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-spec-pipeline-'));
    await fs.ensureDir(path.join(tempDir, '.sce', 'specs', '110-01-pipeline-test'));
    await fs.ensureDir(path.join(tempDir, '.sce', 'specs', '110-02-pipeline-test'));

    originalLog = console.log;
    console.log = jest.fn();

    const sessionStore = new SessionStore(tempDir);
    await sessionStore.beginSceneSession({
      sceneId: 'scene.test-default',
      objective: 'default scene for spec-pipeline tests'
    });
  });

  afterEach(async () => {
    console.log = originalLog;
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('runs full stage flow successfully and writes output', async () => {
    const adapters = {
      requirements: jest.fn(async () => ({ success: true })),
      design: jest.fn(async () => ({ success: true })),
      tasks: jest.fn(async () => ({ success: true })),
      gate: jest.fn(async () => ({ success: true }))
    };

    const strategyAssessor = jest.fn(async () => ({
      decision: 'single-spec',
      decision_reason: 'pipeline scope is bounded',
      next_actions: ['continue']
    }));
    const result = await runSpecPipeline({
      spec: '110-01-pipeline-test',
      json: true,
      out: 'reports/pipeline-result.json',
      continueOnWarning: true
    }, {
      projectPath: tempDir,
      adapters,
      strategyAssessor
    });

    expect(result.status).toBe('completed');
    expect(result.stage_results).toHaveLength(4);
    expect(result).toHaveProperty('strategy_assessment.decision', 'single-spec');
    expect(adapters.requirements).toHaveBeenCalled();
    expect(adapters.gate).toHaveBeenCalled();
    expect(strategyAssessor).toHaveBeenCalledWith({
      spec: '110-01-pipeline-test'
    }, expect.objectContaining({
      projectPath: tempDir
    }));

    const outPath = path.join(tempDir, 'reports', 'pipeline-result.json');
    expect(await fs.pathExists(outPath)).toBe(true);
  });

  test('supports resume from latest unfinished stage', async () => {
    let firstDesignRun = true;

    const adapters = {
      requirements: jest.fn(async () => ({ success: true })),
      design: jest.fn(async () => {
        if (firstDesignRun) {
          firstDesignRun = false;
          return { success: false, error: 'design failed once' };
        }

        return { success: true };
      }),
      tasks: jest.fn(async () => ({ success: true })),
      gate: jest.fn(async () => ({ success: true }))
    };

    const firstRun = await runSpecPipeline({
      spec: '110-01-pipeline-test',
      json: true
    }, {
      projectPath: tempDir,
      adapters
    });

    expect(firstRun.status).toBe('failed');
    expect(firstRun.failure.stage).toBe('design');

    const resumedRun = await runSpecPipeline({
      spec: '110-01-pipeline-test',
      resume: true,
      continueOnWarning: true,
      json: true
    }, {
      projectPath: tempDir,
      adapters
    });

    expect(resumedRun.status).toBe('completed');
    expect(resumedRun.run_id).toBe(firstRun.run_id);
    expect(resumedRun.stage_results.find(item => item.name === 'requirements').status).toBe('skipped');
  });

  test('propagates downstream stage failure with structured reason', async () => {
    const adapters = {
      requirements: jest.fn(async () => ({ success: true })),
      design: jest.fn(async () => ({ success: true })),
      tasks: jest.fn(async () => ({ success: true })),
      gate: jest.fn(async () => ({ success: false, error: 'gate rejected' }))
    };

    const result = await runSpecPipeline({
      spec: '110-01-pipeline-test',
      json: true
    }, {
      projectPath: tempDir,
      adapters
    });

    expect(result.status).toBe('failed');
    expect(result.failure.stage).toBe('gate');
    expect(result.failure.error).toContain('gate rejected');
  });

  test('defaults to orchestrate mode for multi-spec targets', async () => {
    const runOrchestration = jest.fn(async () => ({
      status: 'completed',
      totalSpecs: 2,
      completedSpecs: 2,
      failedSpecs: 0
    }));

    const result = await runSpecPipeline({
      specs: '110-01-pipeline-test,110-02-pipeline-test',
      json: true,
      maxParallel: 4
    }, {
      projectPath: tempDir,
      runOrchestration
    });

    expect(runOrchestration).toHaveBeenCalledWith(expect.objectContaining({
      specs: '110-01-pipeline-test,110-02-pipeline-test',
      maxParallel: 4,
      silent: true
    }), expect.any(Object));

    expect(result.mode).toBe('orchestrate');
    expect(result.status).toBe('completed');
    expect(result.spec_ids).toEqual(['110-01-pipeline-test', '110-02-pipeline-test']);
  });

  test('parses --spec and --specs into de-duplicated targets', () => {
    const targets = _parseSpecTargets({
      spec: '110-01-pipeline-test',
      specs: '110-01-pipeline-test, 110-02-pipeline-test , '
    });

    expect(targets).toEqual(['110-01-pipeline-test', '110-02-pipeline-test']);
  });

  test('binds pipeline spec as a child session when scene primary session is active', async () => {
    const sessionStore = new SessionStore(tempDir);
    const sceneSession = await sessionStore.beginSceneSession({
      sceneId: 'scene.pipeline-integration',
      objective: 'pipeline scene'
    });

    const adapters = {
      requirements: jest.fn(async () => ({ success: true })),
      design: jest.fn(async () => ({ success: true })),
      tasks: jest.fn(async () => ({ success: true })),
      gate: jest.fn(async () => ({ success: true }))
    };

    const result = await runSpecPipeline({
      spec: '110-01-pipeline-test',
      scene: 'scene.pipeline-integration',
      json: true
    }, {
      projectPath: tempDir,
      adapters,
      sessionStore
    });

    expect(result.scene_session).toEqual(expect.objectContaining({
      bound: true,
      scene_id: 'scene.pipeline-integration',
      scene_session_id: sceneSession.session.session_id
    }));
    expect(result.scene_session.spec_session_id).toBeTruthy();

    const parent = await sessionStore.getSession(sceneSession.session.session_id);
    expect(parent.children.spec_sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        spec_id: '110-01-pipeline-test',
        status: 'completed'
      })
    ]));
  });

  test('fails when no active scene primary session exists', async () => {
    const isolated = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-spec-pipeline-no-scene-'));
    const specId = '110-09-pipeline-no-scene';
    await fs.ensureDir(path.join(isolated, '.sce', 'specs', specId));
    await fs.writeFile(path.join(isolated, '.sce', 'specs', specId, 'requirements.md'), '# Requirements\n', 'utf8');
    await fs.writeFile(path.join(isolated, '.sce', 'specs', specId, 'design.md'), '# Design\n## Requirement Mapping\n', 'utf8');
    await fs.writeFile(path.join(isolated, '.sce', 'specs', specId, 'tasks.md'), '- [ ] 1. Test task\n', 'utf8');

    await expect(runSpecPipeline({
      spec: specId,
      json: true
    }, {
      projectPath: isolated
    })).rejects.toThrow('No active scene session found');

    await fs.remove(isolated);
  });

  test('prints strategy advisory in text mode when pipeline spec should escalate', async () => {
    const adapters = {
      requirements: jest.fn(async () => ({ success: true })),
      design: jest.fn(async () => ({ success: true })),
      tasks: jest.fn(async () => ({ success: true })),
      gate: jest.fn(async () => ({ success: true }))
    };
    const strategyAssessor = jest.fn(async () => ({
      decision: 'multi-spec-program',
      decision_reason: 'implementation tracks should be split explicitly',
      next_actions: [
        'create a coordinated multi-Spec portfolio with explicit dependencies'
      ]
    }));

    await runSpecPipeline({
      spec: '110-01-pipeline-test'
    }, {
      projectPath: tempDir,
      adapters,
      strategyAssessor
    });

    expect(console.log).toHaveBeenCalledWith(chalk.yellow('⚠ Strategy Advisory'));
    expect(console.log).toHaveBeenCalledWith('  multi-spec-program: implementation tracks should be split explicitly');
    expect(console.log).toHaveBeenCalledWith('  - create a coordinated multi-Spec portfolio with explicit dependencies');
  });
});
