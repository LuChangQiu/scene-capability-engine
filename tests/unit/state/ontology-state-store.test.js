const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { SceStateStore } = require('../../../lib/state/sce-state-store');

describe('sce-state-store ontology data plane', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-ontology-store-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('upserts ER/BR/DL assets and builds triad summary in memory fallback', async () => {
    const store = new SceStateStore(tempDir, {
      fileSystem: fs,
      env: { NODE_ENV: 'test' },
      sqliteModule: {}
    });

    const er = await store.upsertOntologyErAsset({
      entity_id: 'Requirement',
      name: 'Requirement',
      display_name: '需求',
      description: '交付推进中的主锚点对象',
      status: 'draft',
      key_fields: ['requirement_id', 'title', 'status']
    });
    const br = await store.upsertOntologyBrRule({
      rule_id: 'BR-001',
      title: '需求标题必须规范化',
      scope: '需求清单',
      condition: '原始输入涉及多件事时不得直接作为标题',
      consequence: '必须拆分需求并保留 source_request',
      status: 'active',
      severity: 'high'
    });
    const dl = await store.upsertOntologyDlChain({
      chain_id: 'DL-001',
      title: '用户输入转规范化需求标题',
      trigger: '新建需求',
      decision_nodes: [{ order: 1, name: '识别主目标' }],
      outputs: ['requirement.title', 'source_request'],
      status: 'active'
    });

    expect(er.entity_id).toBe('Requirement');
    expect(br.rule_id).toBe('BR-001');
    expect(dl.chain_id).toBe('DL-001');

    const summary = await store.buildOntologyTriadSummary({ limit: 100 });
    expect(summary.ontology_core_ui).toEqual(expect.objectContaining({
      ready: true,
      coverage_percent: 100
    }));
    expect(summary.counts).toEqual(expect.objectContaining({
      entity_relation: 1,
      business_rules: 1,
      decision_strategy: 1
    }));
  });
});
