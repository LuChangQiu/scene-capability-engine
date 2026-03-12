const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

describe('moqui-metadata-extract script', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-moqui-metadata-extract-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('extracts entity/service/screen/form/rule/decision metadata from Moqui xml files', async () => {
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const scriptPath = path.join(projectRoot, 'scripts', 'moqui-metadata-extract.js');
    const moquiProject = path.join(
      projectRoot,
      'tests',
      'fixtures',
      'moqui-metadata-extract',
      'project'
    );
    const outFile = path.join(tempDir, 'metadata-catalog.json');
    const markdownFile = path.join(tempDir, 'metadata-catalog.md');

    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        '--project-dir',
        moquiProject,
        '--out',
        outFile,
        '--markdown-out',
        markdownFile,
        '--json'
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8'
      }
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(`${result.stdout}`.trim());
    expect(payload.mode).toBe('moqui-metadata-extract');
    expect(payload.summary).toEqual(expect.objectContaining({
      entities: 2,
      services: 2,
      screens: 1,
      forms: 1,
      business_rules: 1,
      decisions: 1
    }));
    expect(payload.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'mantle.order.OrderHeader'
      })
    ]));
    expect(payload.services).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'mantle.order.OrderServices.create#OrderHeader'
      })
    ]));
    expect(payload.forms).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'OrderEntryForm',
        field_count: 3
      })
    ]));
    expect(payload.business_rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'order-must-have-customer' })
    ]));
    expect(payload.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'order-priority-routing' })
    ]));

    expect(await fs.pathExists(outFile)).toBe(true);
    expect(await fs.pathExists(markdownFile)).toBe(true);
  });

  test('extracts metadata from scene-package and handoff evidence when xml sources are missing', async () => {
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const scriptPath = path.join(projectRoot, 'scripts', 'moqui-metadata-extract.js');
    const mockProjectDir = path.join(tempDir, 'mock-331');
    const scenePackagePath = path.join(
      mockProjectDir,
      '.sce',
      'specs',
      '70-00-demo',
      'docs',
      'scene-package.json'
    );
    const handoffManifestPath = path.join(mockProjectDir, 'docs', 'handoffs', 'handoff-manifest.json');
    const matrixPath = path.join(mockProjectDir, 'docs', 'handoffs', 'capability-matrix.md');
    const evidencePath = path.join(mockProjectDir, 'docs', 'handoffs', 'evidence', 'ontology', 'summary-master.json');
    const outFile = path.join(tempDir, 'metadata-catalog-fallback.json');
    const markdownFile = path.join(tempDir, 'metadata-catalog-fallback.md');

    await fs.ensureDir(path.dirname(scenePackagePath));
    await fs.ensureDir(path.dirname(handoffManifestPath));
    await fs.ensureDir(path.dirname(evidencePath));
    await fs.writeJson(scenePackagePath, {
      metadata: {
        name: 'demo-order-closure'
      },
      capabilities: {
        provides: ['scene.order.closure'],
        requires: ['binding:http']
      },
      artifacts: {
        entry_scene: 'scene.yaml'
      },
      capability_contract: {
        bindings: [
          { type: 'query', ref: 'spec.order.query.header' },
          { type: 'invoke', ref: 'spec.order.invoke.close' }
        ]
      },
      governance_contract: {
        business_rules: [
          'rule.order.customer.required',
          'rule.order.amount.positive'
        ]
      },
      agent_hints: {
        decision_logic: [
          'decision.order.route.priority'
        ]
      },
      ontology_model: {
        entities: [
          { id: 'entity:mantle.order.OrderHeader', type: 'entity' }
        ],
        decision_logic: [
          { id: 'decision.order.recheck.policy' }
        ]
      }
    }, { spaces: 2 });

    await fs.writeJson(handoffManifestPath, {
      timestamp: '2026-02-19T00:00:00.000Z',
      source_project: 'mock-331',
      specs: [
        {
          id: '70-00-demo',
          status: 'completed',
          scene_package: '.sce/specs/70-00-demo/docs/scene-package.json'
        }
      ],
      templates: [
        '.sce/templates/exports/order-management',
        'sce.scene--moqui-page-copilot-dialog--0.1.0'
      ],
      capabilities: [
        'moqui-service-contract-core',
        'moqui-screen-flow-core'
      ],
      ontology_validation: {
        business_rules: { total: 2 },
        decision_logic: { total: 2 }
      }
    }, { spaces: 2 });

    await fs.writeFile(matrixPath, [
      '| Priority | Moqui Capability | Template ID | Status |',
      '| --- | --- | --- | --- |',
      '| P0 | Order read (`OrderHeader`, `query services`) | `sce.scene--moqui-screen-flow-core--0.1.0` | ready |'
    ].join('\n'), 'utf8');

    await fs.writeJson(evidencePath, {
      business_rules: {
        total: 2,
        mapped: 2
      },
      decision_logic: {
        total: 2,
        resolved: 2
      }
    }, { spaces: 2 });

    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        '--project-dir',
        mockProjectDir,
        '--out',
        outFile,
        '--markdown-out',
        markdownFile,
        '--json'
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8'
      }
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(`${result.stdout}`.trim());
    expect(payload.summary).toEqual(expect.objectContaining({
      entities: expect.any(Number),
      services: expect.any(Number),
      screens: expect.any(Number),
      forms: expect.any(Number),
      business_rules: expect.any(Number),
      decisions: expect.any(Number)
    }));
    expect(payload.summary.entities).toBeGreaterThan(0);
    expect(payload.summary.services).toBeGreaterThan(0);
    expect(payload.summary.screens).toBeGreaterThan(0);
    expect(payload.summary.business_rules).toBeGreaterThan(0);
    expect(payload.summary.decisions).toBeGreaterThan(0);
    expect(payload.scan).toEqual(expect.objectContaining({
      xml_file_count: 0,
      scene_package_file_count: 1,
      handoff_manifest_found: true,
      capability_matrix_found: true
    }));
    expect(payload.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'mantle.order.OrderHeader' })
    ]));
    expect(payload.services).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'spec.order.query.header' })
    ]));
    expect(payload.business_rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'rule.order.customer.required' })
    ]));
    expect(payload.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'decision.order.route.priority' })
    ]));

    expect(await fs.pathExists(outFile)).toBe(true);
    expect(await fs.pathExists(markdownFile)).toBe(true);
  });
});
