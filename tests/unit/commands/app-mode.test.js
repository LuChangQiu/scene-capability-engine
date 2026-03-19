const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { SceStateStore } = require('../../../lib/state/sce-state-store');
const {
  runAppBundleListCommand,
  runAppBundleShowCommand,
  runAppBundleRegisterCommand,
  runAppRegistryStatusCommand,
  runAppRegistryConfigureCommand,
  runAppRegistrySyncBundlesCommand,
  runAppRegistrySyncCatalogCommand,
  runAppRuntimeShowCommand,
  runAppRuntimeReleasesCommand,
  runAppRuntimeInstallCommand,
  runAppRuntimeActivateCommand,
  runAppRuntimeUninstallCommand,
  runAppEngineeringPreviewCommand,
  runAppEngineeringOwnershipCommand,
  runAppEngineeringOpenCommand,
  runAppEngineeringImportCommand,
  runAppEngineeringShowCommand,
  runAppEngineeringAttachCommand,
  runAppEngineeringHydrateCommand,
  runAppEngineeringScaffoldCommand,
  runAppEngineeringActivateCommand
} = require('../../../lib/commands/app');
const {
  runModeHomeCommand
} = require('../../../lib/commands/mode');

describe('app and mode commands', () => {
  let tempDir;
  let originalLog;
  let stateStore;
  const testEnv = { NODE_ENV: 'test' };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-app-command-'));
    originalLog = console.log;
    console.log = jest.fn();
    stateStore = new SceStateStore(tempDir, {
      fileSystem: fs,
      env: testEnv,
      sqliteModule: {}
    });
  });

  afterEach(async () => {
    console.log = originalLog;
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('registers, lists, shows, and projects app bundle payloads', async () => {
    const inputFile = path.join(tempDir, 'bundle.json');
    await fs.writeJson(inputFile, {
      app_id: 'app.customer-order-demo',
      app_key: 'customer-order-demo',
      app_name: 'Customer Order Demo',
      environment: 'dev',
      status: 'active',
      runtime: {
        release_id: 'rel.customer-order-demo.20260308123015',
        runtime_version: 'v0.4.2',
        release_status: 'published',
        release_channel: 'dev',
        runtime_status: 'ready',
        entrypoint: '/apps/customer-order'
      },
      ontology: {
        ontology_bundle_id: 'onto.customer-order-demo.r12',
        ontology_version: '0.4.2',
        triad_status: 'complete',
        publish_readiness: 'ready'
      },
      engineering: {
        engineering_project_id: 'eng.customer-order-demo',
        project_name: 'Customer Order Demo',
        repo_url: 'https://git.example.com/customer-order-demo.git',
        current_branch: 'main',
        code_version: 'main@7e12a8f',
        dirty_state: false
      },
      default_scene_id: 'scene.customer-order'
    }, { spaces: 2 });

    const registered = await runAppBundleRegisterCommand({ input: inputFile, json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(registered.mode).toBe('app-bundle-register');
    expect(registered.bundle.app_id).toBe('app.customer-order-demo');

    const listed = await runAppBundleListCommand({ json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(listed.items).toHaveLength(1);

    const shown = await runAppBundleShowCommand({ app: 'customer-order-demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(shown.summary).toEqual(expect.objectContaining({
      runtime_version: 'v0.4.2',
      code_version: 'main@7e12a8f'
    }));

    const applicationHome = await runModeHomeCommand('application', { app: 'customer-order-demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(applicationHome.view_model.entrypoint).toBe('/apps/customer-order');

    await stateStore.upsertPmRequirement({
      requirement_id: 'REQ-001',
      title: '需求清单字段规范与落库设计',
      source_request: '整理 requirement 对象',
      status: 'clarifying',
      priority: 'P1'
    });
    await stateStore.upsertOntologyErAsset({
      entity_id: 'Requirement',
      name: 'Requirement',
      display_name: '需求',
      description: '交付推进中的主锚点对象',
      status: 'active'
    });
    await stateStore.upsertOntologyBrRule({
      rule_id: 'BR-001',
      title: '需求标题必须规范化',
      scope: '需求清单',
      condition: '原始输入涉及多件事时不得直接作为标题',
      consequence: '必须拆分需求并保留 source_request',
      status: 'active'
    });
    await stateStore.upsertOntologyDlChain({
      chain_id: 'DL-001',
      title: '用户输入转规范化需求标题',
      trigger: '新建需求',
      decision_nodes: [{ order: 1, name: '识别主目标' }],
      outputs: ['requirement.title', 'source_request'],
      status: 'active'
    });
    await stateStore.upsertPmIssue({
      issue_id: 'BUG-001',
      title: '工程模式未接入真实主数据',
      source: 'review',
      severity: 'medium',
      status: 'resolved'
    });
    await stateStore.upsertAssuranceResourceSnapshot({
      snapshot_id: 'RES-001',
      resource_type: 'service',
      resource_name: 'moqui-runtime',
      status: 'healthy'
    });

    const ontologyHome = await runModeHomeCommand('ontology', { app: 'customer-order-demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(ontologyHome.summary.triad_status).toBe('complete');
    expect(ontologyHome.ontology_core_ui.coverage_percent).toBeGreaterThan(0);
    expect(ontologyHome.starter_seed).toBeNull();

    const engineeringHome = await runModeHomeCommand('engineering', { app: 'customer-order-demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(engineeringHome.summary.code_version).toBe('main@7e12a8f');
    expect(engineeringHome.summary.requirement_count).toBe(1);
    expect(engineeringHome.summary.issue_count).toBe(1);
    expect(engineeringHome.summary.assurance_resource_count).toBe(1);
  });

  test('reuses short-lived mode home projection cache for repeated reads', async () => {
    await stateStore.registerAppBundle({
      app_id: 'app.cache-demo',
      app_key: 'cache-demo',
      app_name: 'Cache Demo',
      environment: 'dev',
      status: 'active',
      runtime: {
        release_id: 'rel.cache-demo.1',
        runtime_version: 'v1.0.0',
        release_status: 'published',
        runtime_status: 'ready'
      }
    });

    const first = await runModeHomeCommand('application', { app: 'cache-demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(first.cache).toEqual(expect.objectContaining({ hit: false }));

    const second = await runModeHomeCommand('application', { app: 'cache-demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(second.cache).toEqual(expect.objectContaining({ hit: true }));
    expect(second.summary.runtime_version).toBe('v1.0.0');
  });

  test('provides ontology starter seed guidance when ontology home is empty', async () => {
    await stateStore.registerAppBundle({
      app_id: 'app.customer-order-demo-empty',
      app_key: 'customer-order-demo',
      app_name: 'Customer Order Demo',
      environment: 'dev',
      status: 'active'
    });

    const ontologyHome = await runModeHomeCommand('ontology', { app: 'customer-order-demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });

    expect(ontologyHome.ontology_core_ui.ready).toBe(false);
    expect(ontologyHome.starter_seed).toEqual(expect.objectContaining({
      recommended_profile: 'customer-order-demo'
    }));
    expect(ontologyHome.view_model.starter_seed).toEqual(expect.objectContaining({
      recommended_profile: 'customer-order-demo'
    }));
  });

  test('configures registries, syncs bundle/catalog, and projects install/activate/uninstall runtime state', async () => {
    const bundleDir = path.join(tempDir, 'bundle-registry', 'bundles', 'demo');
    const catalogDir = path.join(tempDir, 'service-catalog', 'catalog', 'apps');
    await fs.ensureDir(bundleDir);
    await fs.ensureDir(catalogDir);

    await fs.writeJson(path.join(tempDir, 'bundle-registry', 'bundles', 'index.json'), {
      version: '1.0',
      generated_at: '2026-03-08T00:00:00.000Z',
      bundles: [
        { app_id: 'app.demo', app_key: 'demo', file: 'demo/bundle.json' }
      ]
    }, { spaces: 2 });
    await fs.writeJson(path.join(bundleDir, 'bundle.json'), {
      app_id: 'app.demo',
      app_key: 'demo',
      app_name: 'Demo App',
      environment: 'dev',
      status: 'active',
      default_scene_id: 'scene.demo',
      ontology: {
        ontology_bundle_id: 'onto.demo.r1',
        ontology_version: '0.1.0',
        triad_status: 'partial',
        publish_readiness: 'draft'
      }
    }, { spaces: 2 });

    await fs.writeJson(path.join(tempDir, 'service-catalog', 'catalog', 'index.json'), {
      version: '1.0',
      generated_at: '2026-03-08T00:00:00.000Z',
      apps: [
        { app_id: 'app.demo', app_key: 'demo', file: 'apps/demo.json' }
      ]
    }, { spaces: 2 });
    await fs.writeJson(path.join(catalogDir, 'demo.json'), {
      app_id: 'app.demo',
      app_key: 'demo',
      app_name: 'Demo App',
      default_release_id: 'rel.demo.2026030801',
      releases: [
        {
          release_id: 'rel.demo.2026030801',
          runtime_version: 'v0.1.0',
          release_channel: 'dev',
          release_status: 'published',
          runtime_status: 'ready',
          entrypoint: '/apps/demo'
        },
        {
          release_id: 'rel.demo.2026030802',
          runtime_version: 'v0.1.1',
          release_channel: 'beta',
          release_status: 'published',
          runtime_status: 'ready',
          entrypoint: '/apps/demo-beta'
        }
      ]
    }, { spaces: 2 });

    const configured = await runAppRegistryConfigureCommand({
      bundleIndexUrl: path.join(tempDir, 'bundle-registry', 'bundles', 'index.json'),
      serviceIndexUrl: path.join(tempDir, 'service-catalog', 'catalog', 'index.json'),
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(configured.mode).toBe('app-registry-configure');

    const status = await runAppRegistryStatusCommand({ json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(status.config.bundle_registry.index_url).toContain('bundle-registry');

    const syncedBundles = await runAppRegistrySyncBundlesCommand({ json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(syncedBundles.synced_count).toBe(1);

    const syncedCatalog = await runAppRegistrySyncCatalogCommand({ json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(syncedCatalog.synced_count).toBe(1);

    const runtimeReleases = await runAppRuntimeReleasesCommand({ app: 'demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(runtimeReleases.items).toHaveLength(2);
    expect(runtimeReleases.summary).toEqual(expect.objectContaining({
      installed_release_id: null,
      active_release_id: 'rel.demo.2026030801'
    }));
    expect(runtimeReleases.items[0]).toEqual(expect.objectContaining({
      release_id: 'rel.demo.2026030801',
      active: true,
      installed: false,
      can_uninstall: false
    }));

    const installRoot = path.join(tempDir, '.sce', 'apps', 'demo', 'runtime', 'rel.demo.2026030802');
    const installed = await runAppRuntimeInstallCommand({
      app: 'demo',
      release: 'rel.demo.2026030802',
      installRoot,
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(installed.runtime_installation).toEqual(expect.objectContaining({
      status: 'installed',
      release_id: 'rel.demo.2026030802'
    }));
    expect(await fs.pathExists(installRoot)).toBe(true);

    const shownAfterInstall = await runAppRuntimeShowCommand({ app: 'demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(shownAfterInstall.summary).toEqual(expect.objectContaining({
      install_status: 'installed',
      installed_release_id: 'rel.demo.2026030802',
      active_release_id: 'rel.demo.2026030801',
      release_count: 2
    }));

    const appHomeAfterInstall = await runModeHomeCommand('application', { app: 'demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(appHomeAfterInstall.summary).toEqual(expect.objectContaining({
      install_status: 'installed',
      installed_release_id: 'rel.demo.2026030802',
      active_release_id: 'rel.demo.2026030801'
    }));
    expect(appHomeAfterInstall.view_model).toEqual(expect.objectContaining({
      current_release: 'rel.demo.2026030801',
      installed_release_id: 'rel.demo.2026030802',
      active_release_id: 'rel.demo.2026030801'
    }));

    const releasesAfterInstall = await runAppRuntimeReleasesCommand({ app: 'demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(releasesAfterInstall.items[0]).toEqual(expect.objectContaining({
      release_id: 'rel.demo.2026030801',
      active: true,
      installed: false,
      can_uninstall: false
    }));
    expect(releasesAfterInstall.items[1]).toEqual(expect.objectContaining({
      release_id: 'rel.demo.2026030802',
      active: false,
      installed: true,
      can_uninstall: true
    }));

    const uninstalled = await runAppRuntimeUninstallCommand({
      app: 'demo',
      release: 'rel.demo.2026030802',
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(uninstalled.summary).toEqual(expect.objectContaining({
      install_status: 'not-installed',
      installed_release_id: null,
      active_release_id: 'rel.demo.2026030801'
    }));
    expect(uninstalled.runtime_installation).toEqual(expect.objectContaining({
      status: 'not-installed',
      previous_release_id: 'rel.demo.2026030802'
    }));
    expect(await fs.pathExists(installRoot)).toBe(false);

    const reinstalled = await runAppRuntimeInstallCommand({
      app: 'demo',
      release: 'rel.demo.2026030802',
      installRoot,
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(reinstalled.runtime_installation).toEqual(expect.objectContaining({
      status: 'installed',
      release_id: 'rel.demo.2026030802'
    }));

    const activated = await runAppRuntimeActivateCommand({
      app: 'demo',
      release: 'rel.demo.2026030802',
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(activated.runtime_release).toEqual(expect.objectContaining({
      release_id: 'rel.demo.2026030802',
      runtime_version: 'v0.1.1'
    }));

    const shown = await runAppRuntimeShowCommand({ app: 'demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(shown.summary).toEqual(expect.objectContaining({
      install_status: 'installed',
      installed_release_id: 'rel.demo.2026030802',
      active_release_id: 'rel.demo.2026030802',
      release_count: 2
    }));

    const releasesAfterActivate = await runAppRuntimeReleasesCommand({ app: 'demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(releasesAfterActivate.items[1]).toEqual(expect.objectContaining({
      release_id: 'rel.demo.2026030802',
      active: true,
      installed: true,
      can_uninstall: false
    }));
  });

  test('blocks uninstall of the active runtime release', async () => {
    await stateStore.registerAppBundle({
      app_id: 'app.demo',
      app_key: 'demo',
      app_name: 'Demo App',
      status: 'active',
      environment: 'dev',
      runtime_release_id: 'rel.demo.2026030802',
      metadata: {
        service_catalog: {
          default_release_id: 'rel.demo.2026030801',
          releases: [
            {
              release_id: 'rel.demo.2026030801',
              runtime_version: 'v0.1.0',
              release_channel: 'dev',
              release_status: 'published',
              runtime_status: 'ready'
            },
            {
              release_id: 'rel.demo.2026030802',
              runtime_version: 'v0.1.1',
              release_channel: 'beta',
              release_status: 'published',
              runtime_status: 'ready'
            }
          ]
        },
        runtime_installation: {
          status: 'installed',
          release_id: 'rel.demo.2026030802',
          install_root: path.join(tempDir, '.sce', 'apps', 'demo', 'runtime', 'rel.demo.2026030802')
        },
        runtime_activation: {
          active_release_id: 'rel.demo.2026030802'
        }
      },
      runtime: {
        release_id: 'rel.demo.2026030802',
        runtime_version: 'v0.1.1',
        release_channel: 'beta',
        release_status: 'published',
        runtime_status: 'ready'
      }
    });

    await expect(runAppRuntimeUninstallCommand({
      app: 'demo',
      release: 'rel.demo.2026030802',
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    })).rejects.toThrow('cannot uninstall active runtime release rel.demo.2026030802; activate another release first');
  });

  test('previews engineering readiness and next actions before activation', async () => {
    await stateStore.registerAppBundle({
      app_id: 'app.demo',
      app_key: 'demo',
      app_name: 'Demo App',
      status: 'active',
      environment: 'dev',
      default_scene_id: 'scene.demo'
    });

    const initialPreview = await runAppEngineeringPreviewCommand({ app: 'demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(initialPreview.mode).toBe('app-engineering-preview');
    expect(initialPreview.summary).toEqual(expect.objectContaining({
      attached: false,
      hydrated: false,
      active: false,
      sourceKnown: false,
      projectionReady: false
    }));
    expect(initialPreview.summary.readinessReasonCodes).toEqual([
      'engineering.source_missing',
      'engineering.projection_missing',
      'engineering.workspace_unavailable'
    ]);
    expect(initialPreview.summary.nextActions).toEqual(['attach', 'hydrate']);

    const attached = await runAppEngineeringAttachCommand({
      app: 'demo',
      repo: 'https://git.example.com/demo.git',
      branch: 'main',
      projectName: 'Demo App Project',
      codeVersion: 'main@abc123',
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(attached.summary).toEqual(expect.objectContaining({
      sourceKnown: true,
      projectionReady: false,
      hydrated: false,
      active: false
    }));
    expect(attached.summary.readinessReasonCodes).toEqual([
      'engineering.projection_missing',
      'engineering.workspace_unavailable'
    ]);
    expect(attached.summary.nextActions).toEqual(['hydrate']);
  });

  test('projects conservative engineering ownership relations without inventing missing links', async () => {
    await stateStore.registerAppBundle({
      app_id: 'app.demo',
      app_key: 'demo',
      app_name: 'Demo App',
      workspace_id: 'sales',
      status: 'active',
      environment: 'dev',
      engineering: {
        engineering_project_id: 'eng.demo',
        workspace_path: path.join(tempDir, 'workspace'),
        metadata: {
          ownership: {
            shared_policy: 'team-readonly'
          }
        }
      }
    });

    const owned = await runAppEngineeringOwnershipCommand({ app: 'demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(owned.mode).toBe('app-engineering-ownership');
    expect(owned.summary).toEqual(expect.objectContaining({
      appKey: 'demo',
      workspaceId: 'sales',
      userId: null,
      ownershipType: 'shared',
      sharedPolicy: 'team-readonly'
    }));
    expect(owned.summary.deviceId).toBeNull();

    await stateStore.registerAppBundle({
      app_id: 'app.local-demo',
      app_key: 'local-demo',
      app_name: 'Local Demo',
      status: 'active',
      environment: 'dev',
      engineering: {
        engineering_project_id: 'eng.local-demo',
        workspace_path: path.join(tempDir, 'local-workspace')
      }
    });

    const local = await runAppEngineeringOwnershipCommand({ app: 'local-demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(local.summary.ownershipType).toBe('local');
    expect(local.summary.deviceId).toBeTruthy();
    expect(local.summary.userId).toBeNull();
    expect(local.summary.sharedPolicy).toBeNull();

    await stateStore.registerAppBundle({
      app_id: 'app.unresolved-demo',
      app_key: 'unresolved-demo',
      app_name: 'Unresolved Demo',
      status: 'active',
      environment: 'dev',
      engineering: {
        engineering_project_id: 'eng.unresolved-demo'
      }
    });

    const unresolved = await runAppEngineeringOwnershipCommand({ app: 'unresolved-demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(unresolved.summary).toEqual(expect.objectContaining({
      appKey: 'unresolved-demo',
      workspaceId: null,
      userId: null,
      deviceId: null,
      ownershipType: 'unresolved',
      sharedPolicy: null
    }));
  });

  test('returns canonical open/import envelopes with ordered step statuses', async () => {
    await stateStore.registerAppBundle({
      app_id: 'app.demo',
      app_key: 'demo',
      app_name: 'Demo App',
      status: 'active',
      environment: 'dev',
      default_scene_id: 'scene.demo'
    });

    const openedBeforeAttach = await runAppEngineeringOpenCommand({ app: 'demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(openedBeforeAttach.mode).toBe('open');
    expect(openedBeforeAttach.success).toBe(false);
    expect(openedBeforeAttach.steps).toEqual([
      expect.objectContaining({ key: 'register', status: 'done' }),
      expect.objectContaining({ key: 'attach', status: 'pending', reasonCode: 'engineering.source_missing' }),
      expect.objectContaining({ key: 'hydrate', status: 'skipped', reasonCode: 'engineering.source_missing' }),
      expect.objectContaining({ key: 'activate', status: 'skipped', reasonCode: 'engineering.source_missing' })
    ]);

    const hydratePath = path.join(tempDir, '.sce', 'apps', 'demo', 'engineering');
    await runAppEngineeringAttachCommand({
      app: 'demo',
      repo: 'https://git.example.com/demo.git',
      branch: 'main',
      projectName: 'Demo App Project',
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    await runAppEngineeringHydrateCommand({
      app: 'demo',
      workspacePath: hydratePath,
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });

    const imported = await runAppEngineeringImportCommand({ app: 'demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(imported.mode).toBe('import');
    expect(imported.success).toBe(true);
    expect(imported.preview).toEqual(expect.objectContaining({
      attached: true,
      hydrated: true,
      active: false,
      workspacePath: hydratePath
    }));
    expect(imported.steps).toEqual([
      expect.objectContaining({ key: 'register', status: 'done' }),
      expect.objectContaining({ key: 'attach', status: 'done' }),
      expect.objectContaining({ key: 'hydrate', status: 'done' }),
      expect.objectContaining({ key: 'activate', status: 'skipped' })
    ]);

    const openedAfterHydrate = await runAppEngineeringOpenCommand({ app: 'demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(openedAfterHydrate.success).toBe(false);
    expect(openedAfterHydrate.steps[3]).toEqual(expect.objectContaining({
      key: 'activate',
      status: 'pending',
      reasonCode: 'engineering.activate_required'
    }));
  });

  test('scaffolds SCE baseline files into the engineering workspace with idempotent reporting', async () => {
    await stateStore.registerAppBundle({
      app_id: 'app.demo',
      app_key: 'demo',
      app_name: 'Demo App',
      status: 'active',
      environment: 'dev',
      default_scene_id: 'scene.demo',
      engineering: {
        engineering_project_id: 'eng.demo',
        repo_url: 'https://git.example.com/demo.git',
        workspace_path: path.join(tempDir, 'workspace')
      }
    });

    const templateRoot = path.join(tempDir, 'template', '.sce');
    await fs.ensureDir(path.join(templateRoot, 'config'));
    await fs.ensureDir(path.join(templateRoot, 'steering'));
    await fs.ensureDir(path.join(templateRoot, 'knowledge', 'problem'));
    await fs.ensureDir(path.join(templateRoot, 'specs'));
    await fs.writeFile(path.join(templateRoot, 'README.md'), 'template readme\n', 'utf8');
    await fs.writeFile(path.join(templateRoot, 'config', 'studio-intake-policy.json'), '{}\n', 'utf8');
    await fs.writeFile(path.join(templateRoot, 'steering', 'CORE_PRINCIPLES.md'), '# Core\n', 'utf8');
    await fs.writeFile(path.join(templateRoot, 'knowledge', 'problem', 'project-shared-problems.json'), '[]\n', 'utf8');
    await fs.writeFile(path.join(templateRoot, 'specs', 'SPEC_WORKFLOW_GUIDE.md'), '# Workflow\n', 'utf8');

    const first = await runAppEngineeringScaffoldCommand({
      app: 'demo',
      overwritePolicy: 'missing-only',
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore,
      templateRoot
    });
    expect(first.mode).toBe('app-engineering-scaffold');
    expect(first.success).toBe(true);
    expect(first.summary).toEqual(expect.objectContaining({
      workspacePath: path.join(tempDir, 'workspace'),
      createdDirectoryCount: 6,
      skippedDirectoryCount: 0,
      failedDirectoryCount: 0,
      createdFileCount: 5,
      skippedFileCount: 0,
      failedFileCount: 0,
      overwritePolicy: 'missing-only'
    }));
    expect(await fs.pathExists(path.join(tempDir, 'workspace', '.sce', 'README.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, 'workspace', '.sce', 'config', 'studio-intake-policy.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, 'workspace', '.sce', 'steering', 'CORE_PRINCIPLES.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, 'workspace', '.sce', 'knowledge', 'problem', 'project-shared-problems.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, 'workspace', '.sce', 'specs', 'SPEC_WORKFLOW_GUIDE.md'))).toBe(true);

    const second = await runAppEngineeringScaffoldCommand({
      app: 'demo',
      overwritePolicy: 'missing-only',
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore,
      templateRoot
    });
    expect(second.success).toBe(true);
    expect(second.summary).toEqual(expect.objectContaining({
      createdDirectoryCount: 0,
      skippedDirectoryCount: 6,
      failedDirectoryCount: 0,
      createdFileCount: 0,
      skippedFileCount: 5,
      failedFileCount: 0,
      overwritePolicy: 'missing-only'
    }));
  });

  test('attaches, hydrates, activates, previews, and shows engineering projection', async () => {
    await stateStore.registerAppBundle({
      app_id: 'app.demo',
      app_key: 'demo',
      app_name: 'Demo App',
      status: 'active',
      environment: 'dev',
      default_scene_id: 'scene.demo'
    });

    const attached = await runAppEngineeringAttachCommand({
      app: 'demo',
      repo: 'https://git.example.com/demo.git',
      branch: 'main',
      projectName: 'Demo App Project',
      codeVersion: 'main@abc123',
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(attached.engineering_project).toEqual(expect.objectContaining({
      engineering_project_id: 'eng.demo',
      repo_url: 'https://git.example.com/demo.git'
    }));

    const hydratePath = path.join(tempDir, '.sce', 'apps', 'demo', 'engineering');
    const hydrated = await runAppEngineeringHydrateCommand({
      app: 'demo',
      workspacePath: hydratePath,
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(await fs.pathExists(hydratePath)).toBe(true);
    expect(hydrated.hydrated_workspace_path).toBe(hydratePath);

    const activated = await runAppEngineeringActivateCommand({
      app: 'demo',
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(activated.activated_workspace_path).toBe(hydratePath);

    const preview = await runAppEngineeringPreviewCommand({ app: 'demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(preview.mode).toBe('app-engineering-preview');
    expect(preview.summary).toEqual(expect.objectContaining({
      attached: true,
      hydrated: true,
      active: true,
      sourceKnown: true,
      projectionReady: true,
      workspacePath: hydratePath
    }));
    expect(preview.summary.readinessReasonCodes).toEqual([]);
    expect(preview.summary.nextActions).toEqual([]);
    expect(preview.preview).toEqual(preview.summary);

    const opened = await runAppEngineeringOpenCommand({ app: 'demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(opened.mode).toBe('open');
    expect(opened.success).toBe(true);
    expect(opened.steps).toEqual([
      expect.objectContaining({ key: 'register', status: 'done' }),
      expect.objectContaining({ key: 'attach', status: 'done' }),
      expect.objectContaining({ key: 'hydrate', status: 'done' }),
      expect.objectContaining({ key: 'activate', status: 'done' })
    ]);

    const imported = await runAppEngineeringImportCommand({ app: 'demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(imported.mode).toBe('import');
    expect(imported.success).toBe(true);
    expect(imported.steps).toEqual([
      expect.objectContaining({ key: 'register', status: 'done' }),
      expect.objectContaining({ key: 'attach', status: 'done' }),
      expect.objectContaining({ key: 'hydrate', status: 'done' }),
      expect.objectContaining({ key: 'activate', status: 'done' })
    ]);

    const shown = await runAppEngineeringShowCommand({ app: 'demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(shown.mode).toBe('app-engineering-show');
    expect(shown.summary).toEqual(expect.objectContaining({
      attached: true,
      hydrated: true,
      active: true,
      sourceKnown: true,
      projectionReady: true,
      workspacePath: hydratePath
    }));
    expect(shown.preview).toEqual(shown.summary);
    expect(shown.summary.readinessReasonCodes).toEqual([]);
    expect(shown.summary.nextActions).toEqual([]);
    expect(shown.summary).not.toHaveProperty('workspace_path');
    expect(shown.summary).not.toHaveProperty('engineering_project_id');
    expect(shown.engineering_project).toEqual(expect.objectContaining({
      engineering_project_id: 'eng.demo',
      workspace_path: hydratePath
    }));
  });
});
