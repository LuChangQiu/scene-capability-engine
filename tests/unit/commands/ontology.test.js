const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { SceStateStore } = require('../../../lib/state/sce-state-store');
const {
  runOntologyErListCommand,
  runOntologyErShowCommand,
  runOntologyErUpsertCommand,
  runOntologyBrListCommand,
  runOntologyDlListCommand,
  runOntologyTriadSummaryCommand,
  runOntologySeedListCommand,
  runOntologySeedShowCommand,
  runOntologySeedApplyCommand
} = require('../../../lib/commands/ontology');

describe('ontology commands', () => {
  let tempDir;
  let originalLog;
  let stateStore;
  const testEnv = { NODE_ENV: 'test' };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-ontology-command-'));
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

  test('lists, shows, and applies built-in ontology seed profiles', async () => {
    const listed = await runOntologySeedListCommand({ json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(listed.items.some((item) => item.profile === 'customer-order-demo')).toBe(true);

    const shown = await runOntologySeedShowCommand({ profile: 'customer-order-demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(shown.summary).toEqual(expect.objectContaining({
      er_count: expect.any(Number),
      br_count: expect.any(Number),
      dl_count: expect.any(Number)
    }));

    const applied = await runOntologySeedApplyCommand({ profile: 'customer-order-demo', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(applied.summary).toEqual(expect.objectContaining({
      er_written: expect.any(Number),
      br_written: expect.any(Number),
      dl_written: expect.any(Number)
    }));
    expect(applied.triad.ontology_core_ui).toEqual(expect.objectContaining({
      ready: true,
      coverage_percent: 100
    }));
  });

  test('upserts ontology assets and returns triad-oriented view_model payloads', async () => {
    const erFile = path.join(tempDir, 'er.json');
    await fs.writeJson(erFile, {
      entity_id: 'Requirement',
      name: 'Requirement',
      display_name: '需求',
      description: '交付推进中的主锚点对象',
      status: 'draft',
      key_fields: ['requirement_id', 'title', 'status']
    }, { spaces: 2 });

    const er = await runOntologyErUpsertCommand({ input: erFile, json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(er.item.entity_id).toBe('Requirement');
    expect(er.item.mb_status).toBeDefined();

    await stateStore.upsertOntologyBrRule({
      rule_id: 'BR-001',
      title: '需求标题必须规范化',
      scope: '需求清单',
      condition: '原始输入涉及多件事时不得直接作为标题',
      consequence: '必须拆分需求并保留 source_request',
      status: 'active',
      severity: 'high'
    });
    await stateStore.upsertOntologyDlChain({
      chain_id: 'DL-001',
      title: '用户输入转规范化需求标题',
      trigger: '新建需求',
      decision_nodes: [{ order: 1, name: '识别主目标' }],
      outputs: ['requirement.title', 'source_request'],
      status: 'active'
    });

    const erList = await runOntologyErListCommand({ json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(erList.view_model.type).toBe('table');
    expect(erList.items[0].name).toBe('Requirement');

    const erShow = await runOntologyErShowCommand({ id: 'Requirement', json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(erShow.item.display_name).toBe('需求');

    const brList = await runOntologyBrListCommand({ json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(brList.items[0].rule_id).toBe('BR-001');

    const dlList = await runOntologyDlListCommand({ json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(dlList.items[0].chain_id).toBe('DL-001');
    expect(dlList.items[0].decision_nodes_summary).toContain('1');

    const triad = await runOntologyTriadSummaryCommand({ json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(triad.ontology_core_ui).toEqual(expect.objectContaining({
      ready: true,
      coverage_percent: 100
    }));
    expect(triad.view_model.type).toBe('triad-summary');
  });
});
