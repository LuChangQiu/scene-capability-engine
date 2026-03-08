const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { SceStateStore } = require('../../../lib/state/sce-state-store');

describe('sce-state-store app bundle phase1', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-app-bundle-store-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('registers and resolves app bundle graph in memory fallback', async () => {
    const store = new SceStateStore(tempDir, {
      fileSystem: fs,
      env: { NODE_ENV: 'test' },
      sqliteModule: {}
    });

    const graph = await store.registerAppBundle({
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
        publish_readiness: 'ready',
        capability_set: ['customer', 'order', 'inventory']
      },
      engineering: {
        engineering_project_id: 'eng.customer-order-demo',
        project_name: 'Customer Order Demo',
        repo_url: 'https://git.example.com/customer-order-demo.git',
        current_branch: 'main',
        code_version: 'main@7e12a8f',
        dirty_state: false
      },
      default_scene_id: 'scene.customer-order',
      scene_bindings: [
        { scene_id: 'scene.customer-order', binding_role: 'default' },
        { scene_id: 'scene.customer-order-runtime', binding_role: 'runtime-home' }
      ]
    });

    expect(graph.bundle).toEqual(expect.objectContaining({
      app_id: 'app.customer-order-demo',
      app_key: 'customer-order-demo',
      status: 'active'
    }));
    expect(graph.runtime_release).toEqual(expect.objectContaining({
      release_id: 'rel.customer-order-demo.20260308123015',
      runtime_version: 'v0.4.2'
    }));
    expect(graph.ontology_bundle).toEqual(expect.objectContaining({
      ontology_bundle_id: 'onto.customer-order-demo.r12',
      triad_status: 'complete'
    }));
    expect(graph.engineering_project).toEqual(expect.objectContaining({
      engineering_project_id: 'eng.customer-order-demo',
      code_version: 'main@7e12a8f'
    }));
    expect(graph.scene_bindings).toHaveLength(2);

    const listed = await store.listAppBundles({ limit: 10 });
    expect(listed).toHaveLength(1);
    expect(listed[0].app_id).toBe('app.customer-order-demo');

    const loaded = await store.getAppBundleGraph('customer-order-demo');
    expect(loaded.bundle.app_name).toBe('Customer Order Demo');
    expect(loaded.scene_bindings.some((item) => item.binding_role === 'runtime-home')).toBe(true);
  });
});
