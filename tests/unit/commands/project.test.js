const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const WorkspaceStateManager = require('../../../lib/workspace/multi/workspace-state-manager');
const {
  runProjectCandidateInspectCommand,
  runProjectOnboardingImportCommand,
  runProjectPortfolioShowCommand,
  runProjectTargetResolveCommand,
  runProjectSupervisionShowCommand
} = require('../../../lib/commands/project');

describe('project portfolio show command', () => {
  let tempDir;
  let originalLog;
  let stateManager;
  let statePath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-project-command-'));
    originalLog = console.log;
    console.log = jest.fn();
    statePath = path.join(tempDir, 'workspace-state.json');
    stateManager = new WorkspaceStateManager(statePath);
  });

  afterEach(async () => {
    console.log = originalLog;
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  async function seedWorkspaceProject(projectRoot, options = {}) {
    await fs.ensureDir(path.join(projectRoot, '.sce', 'specs'));
    await fs.ensureDir(path.join(projectRoot, '.sce', 'session-governance'));

    const specIds = Array.isArray(options.specIds) ? options.specIds : [];
    for (const specId of specIds) {
      await fs.ensureDir(path.join(projectRoot, '.sce', 'specs', specId));
    }

    const scenes = options.scenes || {};
    await fs.writeJson(path.join(projectRoot, '.sce', 'session-governance', 'scene-index.json'), {
      schema_version: '1.0',
      updated_at: options.updatedAt || '2026-03-19T09:00:00.000Z',
      scenes
    }, { spaces: 2 });
  }

  test('projects registered workspaces into one caller-aware portfolio envelope', async () => {
    const alphaRoot = path.join(tempDir, 'alpha');
    const betaRoot = path.join(tempDir, 'beta');
    await seedWorkspaceProject(alphaRoot, {
      specIds: ['01-00-alpha'],
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
      }
    });
    await seedWorkspaceProject(betaRoot, {
      specIds: ['02-00-beta'],
      scenes: {
        'scene.beta': {
          scene_id: 'scene.beta',
          active_session_id: null,
          active_cycle: null,
          latest_completed_session_id: 'scene-beta-c1',
          last_cycle: 1,
          cycles: [
            {
              cycle: 1,
              session_id: 'scene-beta-c1',
              status: 'completed',
              started_at: '2026-03-18T08:00:00.000Z',
              completed_at: '2026-03-18T08:15:00.000Z'
            }
          ]
        }
      }
    });

    await stateManager.createWorkspace('alpha', alphaRoot);
    await stateManager.createWorkspace('beta', betaRoot);
    await stateManager.switchWorkspace('alpha');

    const payload = await runProjectPortfolioShowCommand({ json: true }, {
      projectPath: alphaRoot,
      fileSystem: fs,
      stateManager
    });

    expect(payload.activeProjectId).toBe('workspace:alpha');
    expect(payload.callerContext).toEqual(expect.objectContaining({
      workspaceId: 'alpha',
      projectId: 'workspace:alpha',
      deviceId: expect.any(String)
    }));
    expect(payload.projects).toHaveLength(2);
    expect(payload.projects[0]).toEqual(expect.objectContaining({
      projectId: 'workspace:alpha',
      workspaceId: 'alpha',
      provenance: 'registered',
      readiness: 'ready',
      status: 'active',
      availability: 'accessible',
      activeSessionCount: 1,
      summary: expect.objectContaining({
        sceneCount: 1,
        specCount: 1
      }),
      partial: false
    }));
    expect(payload.projects[1]).toEqual(expect.objectContaining({
      projectId: 'workspace:beta',
      workspaceId: 'beta',
      provenance: 'registered',
      readiness: 'ready',
      status: 'idle',
      availability: 'accessible',
      activeSessionCount: 0,
      summary: expect.objectContaining({
        sceneCount: 1,
        specCount: 1
      }),
      partial: false
    }));
    expect(JSON.parse(console.log.mock.calls[0][0])).toEqual(payload);
  });

  test('surfaces inaccessible registered workspaces and current unregistered project explicitly', async () => {
    const registeredRoot = path.join(tempDir, 'registered-missing');
    const localRoot = path.join(tempDir, 'local-current');

    await seedWorkspaceProject(registeredRoot, {
      specIds: ['03-00-missing']
    });
    await stateManager.createWorkspace('missing', registeredRoot);
    await fs.remove(path.join(registeredRoot, '.sce'));

    await seedWorkspaceProject(localRoot, {
      specIds: ['04-00-local'],
      scenes: {
        'scene.local': {
          scene_id: 'scene.local',
          active_session_id: null,
          active_cycle: null,
          latest_completed_session_id: null,
          last_cycle: 0,
          cycles: []
        }
      }
    });

    const payload = await runProjectPortfolioShowCommand({ json: true }, {
      projectPath: localRoot,
      fileSystem: fs,
      stateManager
    });

    expect(payload.activeProjectId).toMatch(/^local:/);
    expect(payload.callerContext).toEqual(expect.objectContaining({
      projectId: payload.activeProjectId
    }));
    expect(payload.callerContext.workspaceId).toBeUndefined();
    expect(payload.projects).toHaveLength(2);

    const localProject = payload.projects.find((item) => item.projectId === payload.activeProjectId);
    const missingProject = payload.projects.find((item) => item.projectId === 'workspace:missing');

    expect(localProject).toEqual(expect.objectContaining({
      provenance: 'discovered',
      readiness: 'partial',
      status: 'active',
      availability: 'degraded',
      partial: true,
      partialReasons: expect.arrayContaining(['unregistered_project']),
      summary: expect.objectContaining({
        sceneCount: 1,
        specCount: 1
      })
    }));
    expect(missingProject).toEqual(expect.objectContaining({
      provenance: 'registered',
      readiness: 'unknown',
      status: 'inaccessible',
      availability: 'inaccessible',
      partial: true,
      partialReasons: expect.arrayContaining(['workspace_root_unavailable']),
      activeSessionCount: 0,
      summary: expect.objectContaining({
        sceneCount: 0,
        specCount: 0
      })
    }));
  });

  test('honors explicit workspace resolution without mutating caller selection', async () => {
    const alphaRoot = path.join(tempDir, 'alpha-explicit');
    const betaRoot = path.join(tempDir, 'beta-explicit');
    await seedWorkspaceProject(alphaRoot, { specIds: ['01-00-alpha'] });
    await seedWorkspaceProject(betaRoot, { specIds: ['02-00-beta'] });

    await stateManager.createWorkspace('alpha', alphaRoot);
    await stateManager.createWorkspace('beta', betaRoot);
    await stateManager.switchWorkspace('alpha');

    const payload = await runProjectPortfolioShowCommand({
      workspace: 'beta',
      json: true
    }, {
      projectPath: alphaRoot,
      fileSystem: fs,
      stateManager
    });

    expect(payload.activeProjectId).toBe('workspace:beta');
    expect(payload.callerContext).toEqual(expect.objectContaining({
      workspaceId: 'beta',
      projectId: 'workspace:beta'
    }));

    const activeWorkspace = await stateManager.getActiveWorkspace();
    expect(activeWorkspace.name).toBe('alpha');
  });

  test('classifies workspace-backed, local-sce, directory, and invalid roots canonically', async () => {
    const registeredRoot = path.join(tempDir, 'registered-root');
    const localRoot = path.join(tempDir, 'local-root');
    const ordinaryRoot = path.join(tempDir, 'ordinary-root');
    const invalidMetadataRoot = path.join(tempDir, 'invalid-metadata-root');

    await seedWorkspaceProject(registeredRoot, { specIds: ['01-00-registered'] });
    await seedWorkspaceProject(localRoot, { specIds: ['02-00-local'] });
    await fs.ensureDir(ordinaryRoot);
    await fs.ensureDir(path.join(invalidMetadataRoot, '.sce'));
    await fs.writeFile(path.join(invalidMetadataRoot, '.sce', 'version.json'), '{broken', 'utf8');

    await stateManager.createWorkspace('registered-root', registeredRoot);

    const workspaceCandidate = await runProjectCandidateInspectCommand({ root: registeredRoot, json: true }, {
      fileSystem: fs,
      stateManager
    });
    expect(workspaceCandidate).toEqual(expect.objectContaining({
      kind: 'workspace-backed',
      workspaceId: 'registered-root',
      projectId: 'workspace:registered-root',
      readiness: 'ready',
      availability: 'accessible',
      localCandidate: false
    }));
    expect(workspaceCandidate.reasonCodes).toEqual(expect.arrayContaining([
      'project.workspace.registered',
      'project.root.accessible',
      'project.sce.present'
    ]));

    const localCandidate = await runProjectCandidateInspectCommand({ root: localRoot, json: true }, {
      fileSystem: fs,
      stateManager
    });
    expect(localCandidate).toEqual(expect.objectContaining({
      kind: 'local-sce-candidate',
      readiness: 'partial',
      availability: 'degraded',
      localCandidate: true
    }));
    expect(localCandidate.reasonCodes).toEqual(expect.arrayContaining([
      'project.root.accessible',
      'project.sce.unregistered',
      'project.sce.present'
    ]));

    const ordinaryCandidate = await runProjectCandidateInspectCommand({ root: ordinaryRoot, json: true }, {
      fileSystem: fs,
      stateManager
    });
    expect(ordinaryCandidate).toEqual(expect.objectContaining({
      kind: 'directory-candidate',
      readiness: 'pending',
      availability: 'accessible',
      localCandidate: true
    }));
    expect(ordinaryCandidate.reasonCodes).toEqual(expect.arrayContaining([
      'project.root.accessible',
      'project.root.not_initialized'
    ]));

    const invalidMetadataCandidate = await runProjectCandidateInspectCommand({ root: invalidMetadataRoot, json: true }, {
      fileSystem: fs,
      stateManager
    });
    expect(invalidMetadataCandidate).toEqual(expect.objectContaining({
      kind: 'local-sce-candidate',
      readiness: 'blocked',
      availability: 'degraded',
      localCandidate: true
    }));
    expect(invalidMetadataCandidate.reasonCodes).toEqual(expect.arrayContaining([
      'project.metadata.invalid'
    ]));
  });

  test('imports an ordinary root by adopting it and registering a workspace without forcing activation', async () => {
    const importRoot = path.join(tempDir, 'candidate-import');
    await fs.ensureDir(importRoot);

    const payload = await runProjectOnboardingImportCommand({ root: importRoot, json: true }, {
      fileSystem: fs,
      stateManager
    });

    expect(payload.mode).toBe('import');
    expect(payload.success).toBe(true);
    expect(payload.preview).toEqual(expect.objectContaining({
      rootDir: importRoot.replace(/\\/g, '/'),
      kind: 'workspace-backed',
      workspaceId: 'candidate-import',
      projectId: 'workspace:candidate-import',
      localCandidate: false
    }));
    expect(payload.steps).toEqual([
      expect.objectContaining({ key: 'register', status: 'done' }),
      expect.objectContaining({ key: 'attach', status: 'done' }),
      expect.objectContaining({ key: 'hydrate', status: 'done' }),
      expect.objectContaining({
        key: 'publish',
        status: 'done',
        reasonCode: 'project.onboarding.published'
      }),
      expect.objectContaining({
        key: 'activate',
        status: 'skipped',
        reasonCode: 'project.onboarding.import_no_activate'
      }),
      expect.objectContaining({ key: 'scaffold', status: 'done' })
    ]);
    expect(payload.publication).toEqual(expect.objectContaining({
      status: 'published',
      visibleInPortfolio: true,
      rootDir: importRoot.replace(/\\/g, '/'),
      projectId: 'workspace:candidate-import',
      workspaceId: 'candidate-import',
      publishedAt: payload.generated_at
    }));
    expect(await fs.pathExists(path.join(importRoot, '.sce'))).toBe(true);

    const registeredWorkspace = await stateManager.getWorkspace('candidate-import');
    expect(registeredWorkspace).not.toBeNull();
    expect(registeredWorkspace.path).toBe(importRoot.replace(/\\/g, '/'));
  });

  test('imports an existing local .sce root by registering it without rewriting scaffold content', async () => {
    const localRoot = path.join(tempDir, 'existing-local-import');
    await seedWorkspaceProject(localRoot, { specIds: ['06-00-existing'] });

    const payload = await runProjectOnboardingImportCommand({ root: localRoot, json: true }, {
      fileSystem: fs,
      stateManager
    });

    expect(payload.success).toBe(true);
    expect(payload.preview).toEqual(expect.objectContaining({
      kind: 'workspace-backed',
      workspaceId: 'existing-local-import',
      projectId: 'workspace:existing-local-import'
    }));
    expect(payload.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'register', status: 'done' }),
      expect.objectContaining({ key: 'hydrate', status: 'done', reasonCode: 'project.sce.present' }),
      expect.objectContaining({ key: 'publish', status: 'done', reasonCode: 'project.onboarding.published' }),
      expect.objectContaining({ key: 'scaffold', status: 'skipped', reasonCode: 'project.onboarding.scaffold_reused' })
    ]));
    expect(payload.publication).toEqual(expect.objectContaining({
      status: 'published',
      visibleInPortfolio: true,
      rootDir: localRoot.replace(/\\/g, '/'),
      projectId: 'workspace:existing-local-import',
      workspaceId: 'existing-local-import',
      publishedAt: payload.generated_at
    }));
  });

  test('resolves current project when no routing request is provided', async () => {
    const alphaRoot = path.join(tempDir, 'alpha-current');
    await seedWorkspaceProject(alphaRoot, { specIds: ['01-00-alpha'] });
    await stateManager.createWorkspace('alpha', alphaRoot);
    await stateManager.switchWorkspace('alpha');

    const payload = await runProjectTargetResolveCommand({ json: true }, {
      projectPath: alphaRoot,
      fileSystem: fs,
      stateManager
    });

    expect(payload).toEqual(expect.objectContaining({
      status: 'current-project',
      currentProjectId: 'workspace:alpha',
      resolvedProjectId: 'workspace:alpha',
      confidence: 1,
      reasonCode: 'target.current_project',
      callerContext: expect.objectContaining({
        currentProjectId: 'workspace:alpha',
        workspaceId: 'alpha'
      })
    }));
    expect(JSON.parse(console.log.mock.calls[0][0])).toEqual(payload);
  });

  test('resolves another visible project from request text without mutating active workspace', async () => {
    const alphaRoot = path.join(tempDir, 'alpha-route');
    const betaRoot = path.join(tempDir, 'beta-route');
    await seedWorkspaceProject(alphaRoot, { specIds: ['01-00-alpha'] });
    await seedWorkspaceProject(betaRoot, { specIds: ['02-00-beta'] });
    await stateManager.createWorkspace('alpha', alphaRoot);
    await stateManager.createWorkspace('beta', betaRoot);
    await stateManager.switchWorkspace('alpha');

    const payload = await runProjectTargetResolveCommand({
      request: 'please continue beta project delivery',
      device: 'device-cli',
      toolInstanceId: 'tool-123',
      json: true
    }, {
      projectPath: alphaRoot,
      fileSystem: fs,
      stateManager
    });

    expect(payload).toEqual(expect.objectContaining({
      status: 'resolved-other-project',
      currentProjectId: 'workspace:alpha',
      resolvedProjectId: 'workspace:beta',
      reasonCode: 'target.alias_contained_match',
      callerContext: expect.objectContaining({
        currentProjectId: 'workspace:alpha',
        workspaceId: 'alpha',
        deviceId: 'device-cli',
        toolInstanceId: 'tool-123'
      }),
      candidates: [
        expect.objectContaining({
          projectId: 'workspace:beta',
          workspaceId: 'beta'
        })
      ]
    }));

    const activeWorkspace = await stateManager.getActiveWorkspace();
    expect(activeWorkspace.name).toBe('alpha');
  });

  test('returns ambiguous when request text matches multiple visible projects equally', async () => {
    const demoApiRoot = path.join(tempDir, 'demo-api');
    const demoWebRoot = path.join(tempDir, 'demo-web');
    await seedWorkspaceProject(demoApiRoot, { specIds: ['01-00-demo-api'] });
    await seedWorkspaceProject(demoWebRoot, { specIds: ['02-00-demo-web'] });
    await stateManager.createWorkspace('demo-api', demoApiRoot);
    await stateManager.createWorkspace('demo-web', demoWebRoot);

    const payload = await runProjectTargetResolveCommand({
      request: 'demo',
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs,
      stateManager
    });

    expect(payload).toEqual(expect.objectContaining({
      status: 'ambiguous',
      reasonCode: 'target.ambiguous',
      candidates: expect.arrayContaining([
        expect.objectContaining({ projectId: 'workspace:demo-api' }),
        expect.objectContaining({ projectId: 'workspace:demo-web' })
      ])
    }));
  });

  test('builds project supervision snapshot with blocked, handoff, risk, and active items', async () => {
    const alphaRoot = path.join(tempDir, 'alpha-supervision');
    const specRoot = path.join(alphaRoot, '.sce', 'specs', '01-00-alpha');
    await seedWorkspaceProject(alphaRoot, {
      specIds: ['01-00-alpha'],
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
      }
    });
    await fs.ensureDir(specRoot);
    await fs.writeFile(path.join(specRoot, 'tasks.md'), [
      '- [x] 1.1 Done work',
      '- [-] 1.2 Continue work'
    ].join('\n'), 'utf8');
    await fs.ensureDir(path.join(alphaRoot, '.sce', 'spec-governance'));
    await fs.writeJson(path.join(alphaRoot, '.sce', 'spec-governance', 'scene-index.json'), {
      scenes: {
        'scene.alpha': {
          scene_id: 'scene.alpha',
          stale_specs: 1
        }
      }
    }, { spaces: 2 });
    await fs.ensureDir(path.join(alphaRoot, '.sce', 'reports', 'handoff-runs'));
    await fs.writeJson(path.join(alphaRoot, '.sce', 'reports', 'handoff-runs', 'handoff-alpha.json'), {
      session_id: 'handoff-alpha',
      generated_at: '2026-03-19T09:00:00.000Z',
      status: 'completed',
      domain_chain: {
        spec_id: '01-00-alpha',
        context: {
          scene_id: 'scene.alpha'
        }
      }
    }, { spaces: 2 });
    await fs.ensureDir(path.join(alphaRoot, '.sce', 'reports', 'studio'));
    await fs.writeJson(path.join(alphaRoot, '.sce', 'reports', 'studio', 'verify-alpha.json'), {
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
    }, { spaces: 2 });

    await stateManager.createWorkspace('alpha', alphaRoot);

    const payload = await runProjectSupervisionShowCommand({
      project: 'workspace:alpha',
      cursor: 'stale-cursor',
      json: true
    }, {
      projectPath: alphaRoot,
      fileSystem: fs,
      stateManager
    });

    expect(payload.projectId).toBe('workspace:alpha');
    expect(payload.cursor).toEqual(expect.any(String));
    expect(payload.summary).toEqual(expect.objectContaining({
      blockedCount: 1,
      handoffCount: 1,
      riskCount: 1,
      activeSceneCount: 1,
      activeSpecCount: 1,
      activeTaskCount: 1,
      latestEventAt: '2026-03-19T09:10:00.000Z'
    }));
    expect(payload.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'blocked',
        sceneId: 'scene.alpha',
        specId: '01-00-alpha',
        reasonCode: 'problem-closure-gate'
      }),
      expect.objectContaining({
        kind: 'handoff',
        sceneId: 'scene.alpha',
        specId: '01-00-alpha',
        requestId: 'handoff-alpha'
      }),
      expect.objectContaining({
        kind: 'risk',
        sceneId: 'scene.alpha',
        reasonCode: 'project.stale_specs_present'
      }),
      expect.objectContaining({
        kind: 'active',
        sceneId: 'scene.alpha',
        eventId: 'scene-alpha-c1'
      })
    ]));
  });
});
