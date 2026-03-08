const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { SceStateStore } = require('../../../lib/state/sce-state-store');
const {
  runAppBundleListCommand,
  runAppBundleShowCommand,
  runAppBundleRegisterCommand
} = require('../../../lib/commands/app');
const {
  runModeHomeCommand
} = require('../../../lib/commands/mode');

describe('app and mode commands', () => {
  let tempDir;
  let originalLog;
  let stateStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-app-command-'));
    originalLog = console.log;
    console.log = jest.fn();
    stateStore = new SceStateStore(tempDir, {
      fileSystem: fs,
      env: { NODE_ENV: 'test' },
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
      env: { NODE_ENV: 'test' },
      stateStore
    });
    expect(registered.mode).toBe('app-bundle-register');
    expect(registered.bundle.app_id).toBe('app.customer-order-demo');

    const listed = await runAppBundleListCommand({ json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: { NODE_ENV: 'test' },
      stateStore
    });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toEqual(expect.objectContaining({
      app_key: 'customer-order-demo'
    }));

    const shown = await runAppBundleShowCommand({ app: 'customer-order-demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: { NODE_ENV: 'test' },
      stateStore
    });
    expect(shown.summary).toEqual(expect.objectContaining({
      runtime_version: 'v0.4.2',
      code_version: 'main@7e12a8f'
    }));

    const applicationHome = await runModeHomeCommand('application', { app: 'customer-order-demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: { NODE_ENV: 'test' },
      stateStore
    });
    expect(applicationHome.mode).toBe('application-home');
    expect(applicationHome.view_model.entrypoint).toBe('/apps/customer-order');

    const ontologyHome = await runModeHomeCommand('ontology', { app: 'customer-order-demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: { NODE_ENV: 'test' },
      stateStore
    });
    expect(ontologyHome.mode).toBe('ontology-home');
    expect(ontologyHome.summary.triad_status).toBe('complete');

    const engineeringHome = await runModeHomeCommand('engineering', { app: 'customer-order-demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: { NODE_ENV: 'test' },
      stateStore
    });
    expect(engineeringHome.mode).toBe('engineering-home');
    expect(engineeringHome.summary.code_version).toBe('main@7e12a8f');
    expect(engineeringHome.view_model.primary_sections).toEqual([
      'source', 'timeline', 'diff', 'delivery', 'capability', 'assurance'
    ]);
  });
});
