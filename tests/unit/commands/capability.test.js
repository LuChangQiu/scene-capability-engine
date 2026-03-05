const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  runCapabilityExtractCommand,
  runCapabilityScoreCommand,
  runCapabilityMapCommand,
  runCapabilityRegisterCommand
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
      task_completed: 1
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
      value_score: expect.any(Number)
    }));

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

    const registered = await runCapabilityRegisterCommand({
      input: mapped.output_file,
      json: true
    }, {
      projectPath: tempDir,
      fileSystem: fs
    });
    expect(registered.mode).toBe('capability-register');
    expect(await fs.pathExists(path.join(tempDir, registered.files[0]))).toBe(true);
  });
});
