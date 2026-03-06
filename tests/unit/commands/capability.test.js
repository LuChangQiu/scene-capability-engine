const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  runCapabilityExtractCommand,
  runCapabilityScoreCommand,
  runCapabilityMapCommand,
  runCapabilityRegisterCommand,
  enrichCapabilityTemplateForUi,
  filterCapabilityCatalogEntries
} = require('../../../lib/commands/capability');

describe('capability commands', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-capability-'));
    await fs.ensureDir(path.join(tempDir, '.sce', 'spec-governance'));
    await fs.ensureDir(path.join(tempDir, '.sce', 'specs', '01-00-demo'));

    await fs.writeJson(path.join(tempDir, '.sce', 'spec-governance', 'scene-index.json'), {
      schema_version: '1.0',
      generated_at: new Date().toISOString(),
      scene_filter: null,
      scenes: {
        'scene.demo': {
          total_specs: 1,
          active_specs: 1,
          completed_specs: 0,
          stale_specs: 0,
          spec_ids: ['01-00-demo'],
          active_spec_ids: ['01-00-demo'],
          stale_spec_ids: []
        }
      }
    }, { spaces: 2 });

    await fs.writeFile(
      path.join(tempDir, '.sce', 'specs', '01-00-demo', 'tasks.md'),
      [
        '- [x] 1. Prepare baseline',
        '- [ ] 2. Implement feature',
        '- [-] 3. Validate release'
      ].join('\n'),
      'utf8'
    );

    await fs.ensureDir(path.join(tempDir, '.sce', 'specs', '01-00-demo', 'custom'));
    await fs.writeJson(path.join(tempDir, '.sce', 'specs', '01-00-demo', 'custom', 'problem-domain-chain.json'), {
      api_version: 'sce.problem-domain-chain/v0.1',
      scene_id: 'scene.demo',
      spec_id: '01-00-demo',
      ontology: {
        entity: ['Order'],
        relation: ['Order->Customer'],
        business_rule: ['OrderApproval'],
        decision_policy: ['RiskPolicy']
      }
    }, { spaces: 2 });
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('extracts capability candidate from scene', async () => {
    const result = await runCapabilityExtractCommand({
      scene: 'scene.demo',
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs
    });

    expect(result.mode).toBe('capability-extract');
    expect(result.scene_id).toBe('scene.demo');
    expect(result.summary).toEqual(expect.objectContaining({
      spec_count: 1,
      task_total: 3,
      task_completed: 1,
      ontology_triads_ready: true
    }));
    expect(result.ontology_scope).toEqual(expect.objectContaining({
      entities: ['Order'],
      relations: ['Order->Customer'],
      business_rules: ['OrderApproval'],
      decisions: ['RiskPolicy']
    }));
  });

  test('scores, maps, and registers capability template', async () => {
    const candidate = await runCapabilityExtractCommand({
      scene: 'scene.demo',
      json: true,
      out: '.sce/reports/capability-iteration/scene.demo.candidate.json'
    }, {
      projectPath: tempDir,
      fileSystem: fs
    });

    const score = await runCapabilityScoreCommand({
      input: candidate.output_file,
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs
    });
    expect(score.mode).toBe('capability-score');
    expect(score.scores).toEqual(expect.objectContaining({
      value_score: expect.any(Number),
      ontology_core_score: 100
    }));
    expect(score.scores.ontology_core.ready).toBe(true);

    await fs.ensureDir(path.join(tempDir, '.sce', 'ontology'));
    await fs.writeJson(path.join(tempDir, '.sce', 'ontology', 'mapping.json'), {
      ontology_scope: {
        domains: ['commerce'],
        entities: ['Order'],
        relations: ['Order->Customer'],
        business_rules: ['OrderApproval'],
        decisions: ['RiskPolicy']
      }
    }, { spaces: 2 });

    const mapped = await runCapabilityMapCommand({
      input: candidate.output_file,
      mapping: '.sce/ontology/mapping.json',
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs
    });
    expect(mapped.mode).toBe('capability-map');
    expect(mapped.template.ontology_scope.entities).toContain('Order');
    expect(mapped.release_readiness.ready).toBe(true);

    const registered = await runCapabilityRegisterCommand({
      input: mapped.output_file,
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs
    });
    expect(registered.mode).toBe('capability-register');
    expect(registered.ontology_core.ready).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, registered.files[0]))).toBe(true);
  });

  test('exposes publish readiness UI state for capability templates', () => {
    const readyTemplate = enrichCapabilityTemplateForUi({
      id: 'ready-template',
      ontology_scope: {
        entities: ['Order'],
        relations: ['Order->Customer'],
        business_rules: ['OrderApproval'],
        decisions: ['RiskPolicy']
      }
    });
    expect(readyTemplate.release_readiness_ui).toEqual(expect.objectContaining({
      publish_ready: true,
      blocking_count: 0
    }));

    const blockedTemplate = enrichCapabilityTemplateForUi({
      id: 'blocked-template',
      ontology_scope: {
        entities: ['Order'],
        relations: ['Order->Customer'],
        business_rules: [],
        decisions: []
      }
    });
    expect(blockedTemplate.release_readiness_ui).toEqual(expect.objectContaining({
      publish_ready: false,
      blocking_count: 1,
      blocking_ids: expect.arrayContaining(['ontology-core-triads']),
      blocking_missing: expect.arrayContaining(['business_rules', 'decision_strategy'])
    }));
  });

  test('filters capability catalog entries by publish readiness and missing triad', () => {
    const templates = [
      enrichCapabilityTemplateForUi({
        id: 'ready-template',
        ontology_scope: {
          entities: ['Order'],
          relations: ['Order->Customer'],
          business_rules: ['OrderApproval'],
          decisions: ['RiskPolicy']
        }
      }),
      enrichCapabilityTemplateForUi({
        id: 'missing-decision',
        ontology_scope: {
          entities: ['Order'],
          relations: ['Order->Customer'],
          business_rules: ['OrderApproval'],
          decisions: []
        }
      })
    ];

    expect(filterCapabilityCatalogEntries(templates, { releaseReady: 'true' }).map((item) => item.id)).toEqual(['ready-template']);
    expect(filterCapabilityCatalogEntries(templates, { missingTriad: 'decision_strategy' }).map((item) => item.id)).toEqual(['missing-decision']);
  });

  test('blocks register when ontology triads are incomplete', async () => {
    const incompletePath = path.join(tempDir, '.sce', 'reports', 'capability-iteration', 'incomplete.template.json');
    await fs.ensureDir(path.dirname(incompletePath));
    await fs.writeJson(incompletePath, {
      template: {
        template_id: 'incomplete-demo',
        name: 'Incomplete Demo',
        description: 'Missing decision strategy',
        category: 'capability',
        scene_id: 'scene.demo',
        ontology_scope: {
          entities: ['Order'],
          relations: ['Order->Customer'],
          business_rules: ['OrderApproval'],
          decisions: []
        }
      }
    }, { spaces: 2 });

    await expect(runCapabilityRegisterCommand({
      input: '.sce/reports/capability-iteration/incomplete.template.json',
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs
    })).rejects.toMatchObject({
      code: 'CAPABILITY_REGISTER_BLOCKED',
      details: {
        release_readiness: expect.objectContaining({
          ready: false,
          blockers: expect.arrayContaining([
            expect.objectContaining({
              id: 'ontology-core-triads',
              severity: 'blocking',
              missing: expect.arrayContaining(['decision_strategy'])
            })
          ])
        })
      }
    });
  });
});
