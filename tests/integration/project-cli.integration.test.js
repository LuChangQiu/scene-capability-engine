const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const WorkspaceStateManager = require('../../lib/workspace/multi/workspace-state-manager');
const { runCliWithRetry } = require('./cli-runner');

function runCli(args, options = {}) {
  return runCliWithRetry(args, {
    cwd: options.cwd || process.cwd(),
    timeoutMs: options.timeoutMs || 20000,
    skipSteeringCheck: options.skipSteeringCheck !== false,
    maxTransientRetries: options.maxTransientRetries || 1,
    env: options.env || {}
  });
}

jest.setTimeout(30000);

describe('project CLI integration', () => {
  let tempDir;
  let homeDir;
  let stateManager;
  let cliEnv;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-project-cli-'));
    homeDir = path.join(tempDir, 'home');
    await fs.ensureDir(homeDir);
    stateManager = new WorkspaceStateManager(path.join(homeDir, '.sce', 'workspace-state.json'));
    cliEnv = {
      HOME: homeDir,
      USERPROFILE: homeDir,
      HOMEDRIVE: '',
      HOMEPATH: ''
    };
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  async function seedWorkspaceProject(projectRoot, options = {}) {
    await fs.ensureDir(path.join(projectRoot, '.sce', 'specs'));
    await fs.ensureDir(path.join(projectRoot, '.sce', 'session-governance'));

    const specIds = Array.isArray(options.specIds) ? options.specIds : [];
    for (const specId of specIds) {
      const specRoot = path.join(projectRoot, '.sce', 'specs', specId);
      await fs.ensureDir(specRoot);
      if (options.tasksContent) {
        await fs.writeFile(path.join(specRoot, 'tasks.md'), options.tasksContent, 'utf8');
      }
    }

    await fs.writeJson(path.join(projectRoot, '.sce', 'session-governance', 'scene-index.json'), {
      schema_version: '1.0',
      updated_at: options.updatedAt || '2026-03-19T09:00:00.000Z',
      scenes: options.scenes || {}
    }, { spaces: 2 });

    if (options.specGovernance) {
      await fs.ensureDir(path.join(projectRoot, '.sce', 'spec-governance'));
      await fs.writeJson(path.join(projectRoot, '.sce', 'spec-governance', 'scene-index.json'), options.specGovernance, { spaces: 2 });
    }

    if (options.handoffReport) {
      await fs.ensureDir(path.join(projectRoot, '.sce', 'reports', 'handoff-runs'));
      await fs.writeJson(path.join(projectRoot, '.sce', 'reports', 'handoff-runs', 'handoff.json'), options.handoffReport, { spaces: 2 });
    }

    if (options.studioReport) {
      await fs.ensureDir(path.join(projectRoot, '.sce', 'reports', 'studio'));
      await fs.writeJson(path.join(projectRoot, '.sce', 'reports', 'studio', 'verify.json'), options.studioReport, { spaces: 2 });
    }
  }

  test('portfolio, target resolve, and supervision commands work through the CLI entrypoint', async () => {
    const alphaRoot = path.join(tempDir, 'alpha');
    const betaRoot = path.join(tempDir, 'beta');

    await seedWorkspaceProject(alphaRoot, {
      specIds: ['01-00-alpha'],
      tasksContent: '- [x] 1.1 Done\n- [-] 1.2 Continue\n',
      scenes: {
        'scene.alpha': {
          scene_id: 'scene.alpha',
          active_session_id: 'scene-alpha-c1',
          active_cycle: 1,
          latest_completed_session_id: null,
          last_cycle: 1,
          cycles: [
            {
              cycle: 1,
              session_id: 'scene-alpha-c1',
              status: 'active',
              started_at: '2026-03-19T08:00:00.000Z',
              completed_at: null
            }
          ]
        }
      },
      specGovernance: {
        scenes: {
          'scene.alpha': {
            scene_id: 'scene.alpha',
            stale_specs: 1
          }
        }
      },
      handoffReport: {
        session_id: 'handoff-alpha',
        generated_at: '2026-03-19T09:00:00.000Z',
        status: 'completed',
        domain_chain: {
          spec_id: '01-00-alpha',
          context: {
            scene_id: 'scene.alpha'
          }
        }
      },
      studioReport: {
        mode: 'studio-verify',
        passed: false,
        completed_at: '2026-03-19T09:10:00.000Z',
        steps: [
          { id: 'problem-closure-gate', status: 'failed' }
        ],
        domain_chain: {
          spec_id: '01-00-alpha',
          context: {
            scene_id: 'scene.alpha'
          }
        }
      }
    });

    await seedWorkspaceProject(betaRoot, {
      specIds: ['02-00-beta'],
      scenes: {
        'scene.beta': {
          scene_id: 'scene.beta',
          active_session_id: null,
          active_cycle: null,
          latest_completed_session_id: null,
          last_cycle: 0,
          cycles: []
        }
      }
    });

    await stateManager.createWorkspace('alpha', alphaRoot);
    await stateManager.createWorkspace('beta', betaRoot);
    await stateManager.switchWorkspace('alpha');

    const portfolioResult = await runCli(['project', 'portfolio', 'show', '--json'], {
      cwd: alphaRoot,
      env: cliEnv
    });
    expect(portfolioResult.exitCode).toBe(0);
    const portfolio = JSON.parse(`${portfolioResult.stdout}`.trim());
    expect(portfolio.activeProjectId).toBe('workspace:alpha');
    expect(portfolio.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectId: 'workspace:alpha', status: 'active' }),
      expect.objectContaining({ projectId: 'workspace:beta' })
    ]));

    const resolveResult = await runCli([
      'project',
      'target',
      'resolve',
      '--request',
      'continue beta project',
      '--current-project',
      'workspace:alpha',
      '--json'
    ], {
      cwd: alphaRoot,
      env: cliEnv
    });
    expect(resolveResult.exitCode).toBe(0);
    const resolution = JSON.parse(`${resolveResult.stdout}`.trim());
    expect(resolution).toEqual(expect.objectContaining({
      status: 'resolved-other-project',
      currentProjectId: 'workspace:alpha',
      resolvedProjectId: 'workspace:beta'
    }));

    const supervisionResult = await runCli([
      'project',
      'supervision',
      'show',
      '--project',
      'workspace:alpha',
      '--json'
    ], {
      cwd: alphaRoot,
      env: cliEnv
    });
    expect(supervisionResult.exitCode).toBe(0);
    const supervision = JSON.parse(`${supervisionResult.stdout}`.trim());
    expect(supervision.summary).toEqual(expect.objectContaining({
      blockedCount: 1,
      handoffCount: 1,
      riskCount: 1,
      activeSceneCount: 1
    }));
    expect(supervision.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'blocked', reasonCode: 'problem-closure-gate' }),
      expect.objectContaining({ kind: 'handoff', requestId: 'handoff-alpha' }),
      expect.objectContaining({ kind: 'risk', reasonCode: 'project.stale_specs_present' }),
      expect.objectContaining({ kind: 'active', eventId: 'scene-alpha-c1' })
    ]));
  });
});
