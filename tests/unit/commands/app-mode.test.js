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
  runAppEngineeringShowCommand,
  runAppEngineeringAttachCommand,
  runAppEngineeringHydrateCommand,
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

  test('configures registries, syncs bundle/catalog, and installs runtime', async () => {
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
      active_release_id: 'rel.demo.2026030802',
      release_count: 2
    }));
  });

  test('attaches, hydrates, activates, and shows engineering projection', async () => {
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

    const shown = await runAppEngineeringShowCommand({ app: 'demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(shown.summary).toEqual(expect.objectContaining({
      hydrated: true,
      active: true,
      workspace_path: hydratePath
    }));
  });
});
