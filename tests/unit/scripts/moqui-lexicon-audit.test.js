const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  createMoquiCoreRegressionWorkspace
} = require('../../helpers/moqui-core-regression-workspace-fixture');

describe('moqui-lexicon-audit script', () => {
  let tempDir;
  let fixtureWorkspace;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-moqui-lexicon-audit-'));
    fixtureWorkspace = path.join(tempDir, 'fixture-workspace');
    await createMoquiCoreRegressionWorkspace(fixtureWorkspace);
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('audits fixture manifest and template capabilities against lexicon', async () => {
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const scriptPath = path.join(projectRoot, 'scripts', 'moqui-lexicon-audit.js');
    const outFile = path.join(tempDir, 'moqui-lexicon-audit.json');
    const markdownFile = path.join(tempDir, 'moqui-lexicon-audit.md');

    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        '--manifest',
        'docs/handoffs/handoff-manifest.json',
        '--template-dir',
        '.sce/templates/scene-packages',
        '--lexicon',
        path.join(projectRoot, 'lib', 'data', 'moqui-capability-lexicon.json'),
        '--out',
        outFile,
        '--markdown-out',
        markdownFile,
        '--json',
      ],
      {
        cwd: fixtureWorkspace,
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(`${result.stdout}`.trim());
    expect(payload.mode).toBe('moqui-lexicon-audit');
    expect(payload.summary).toEqual(expect.objectContaining({
      expected_total: 3,
      expected_unknown_count: 0,
      provided_unknown_count: 0,
      uncovered_expected_count: 0,
      passed: true,
    }));
    expect(payload.template_scope).toEqual(expect.objectContaining({
      manifest_templates_total: 1,
      matched_templates_count: 1,
      using_manifest_scope: true,
    }));
    expect(payload.coverage.coverage_percent).toBe(100);
    expect(await fs.pathExists(outFile)).toBe(true);
    expect(await fs.pathExists(markdownFile)).toBe(true);
  });

  test('filters provided capabilities to manifest template scope with sce prefix normalization', async () => {
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const scriptPath = path.join(projectRoot, 'scripts', 'moqui-lexicon-audit.js');
    const workspace = path.join(tempDir, 'workspace');
    const manifestFile = path.join(workspace, 'docs', 'handoffs', 'handoff-manifest.json');
    const templateRoot = path.join(workspace, '.sce', 'templates', 'scene-packages');
    const targetTemplateDir = path.join(templateRoot, 'sce.scene--erp-order-query-read--0.1.0');
    const noiseTemplateDir = path.join(templateRoot, 'sce.scene--scene-package-contract-declaration--0.2.0');
    const outFile = path.join(tempDir, 'moqui-lexicon-audit-scoped.json');

    await fs.ensureDir(path.dirname(manifestFile));
    await fs.ensureDir(targetTemplateDir);
    await fs.ensureDir(noiseTemplateDir);
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-18T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['66-01-gap-sample'],
      templates: ['sce.scene--erp-order-query-read--0.1.0'],
      capabilities: ['erp-order-query-read']
    }, { spaces: 2 });
    await fs.writeJson(path.join(targetTemplateDir, 'scene-package.json'), {
      capabilities: {
        provides: ['erp-order-query-read']
      }
    }, { spaces: 2 });
    await fs.writeJson(path.join(noiseTemplateDir, 'scene-package.json'), {
      capabilities: {
        provides: ['scene.scene-domain-profile.core']
      }
    }, { spaces: 2 });

    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        '--manifest',
        'docs/handoffs/handoff-manifest.json',
        '--template-dir',
        '.sce/templates/scene-packages',
        '--lexicon',
        path.join(projectRoot, 'lib', 'data', 'moqui-capability-lexicon.json'),
        '--out',
        outFile,
        '--json',
        '--fail-on-gap',
      ],
      {
        cwd: workspace,
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(`${result.stdout}`.trim());
    expect(payload.summary.passed).toBe(true);
    expect(payload.summary.provided_unknown_count).toBe(0);
    expect(payload.coverage.coverage_percent).toBe(100);
    expect(payload.template_scope).toEqual(expect.objectContaining({
      manifest_templates_total: 1,
      matched_templates_count: 1,
      using_manifest_scope: true,
    }));
    expect(payload.templates).toHaveLength(1);
    expect(payload.templates[0].template_id).toBe('sce.scene--erp-order-query-read--0.1.0');
  });

  test('infers expected capabilities from manifest templates when capabilities are missing', async () => {
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const scriptPath = path.join(projectRoot, 'scripts', 'moqui-lexicon-audit.js');
    const workspace = path.join(tempDir, 'workspace');
    const manifestFile = path.join(workspace, 'docs', 'handoffs', 'handoff-manifest.json');
    const templateRoot = path.join(workspace, '.sce', 'templates', 'scene-packages');
    const templateDir = path.join(templateRoot, 'sce.scene--erp-order-query-read--0.1.0');
    const outFile = path.join(tempDir, 'moqui-lexicon-audit-infer.json');

    await fs.ensureDir(path.dirname(manifestFile));
    await fs.ensureDir(templateDir);
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-18T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['66-01-infer-sample'],
      templates: ['sce.scene--erp-order-query-read--0.1.0'],
      capabilities: []
    }, { spaces: 2 });
    await fs.writeJson(path.join(templateDir, 'scene-package.json'), {
      capabilities: {
        provides: ['erp-order-query-read']
      }
    }, { spaces: 2 });

    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        '--manifest',
        'docs/handoffs/handoff-manifest.json',
        '--template-dir',
        '.sce/templates/scene-packages',
        '--lexicon',
        path.join(projectRoot, 'lib', 'data', 'moqui-capability-lexicon.json'),
        '--out',
        outFile,
        '--json',
        '--fail-on-gap',
      ],
      {
        cwd: workspace,
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(`${result.stdout}`.trim());
    expect(payload.summary.passed).toBe(true);
    expect(payload.summary.expected_total).toBe(1);
    expect(payload.summary.expected_source).toBe('manifest.templates');
    expect(payload.coverage.coverage_percent).toBe(100);
    expect(payload.expected_scope).toEqual(expect.objectContaining({
      source: 'manifest.templates',
      declared_count: 0,
      inferred_count: 1,
      unresolved_template_count: 0,
    }));
  });

  test('fails with exit code 2 when unknown lexicon gaps exist and --fail-on-gap is set', async () => {
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const scriptPath = path.join(projectRoot, 'scripts', 'moqui-lexicon-audit.js');
    const workspace = path.join(tempDir, 'workspace');
    const manifestFile = path.join(workspace, 'docs', 'handoffs', 'handoff-manifest.json');
    const templateDir = path.join(workspace, '.sce', 'templates', 'scene-packages', 'tpl-a');
    const outFile = path.join(tempDir, 'moqui-lexicon-audit-gap.json');

    await fs.ensureDir(path.dirname(manifestFile));
    await fs.ensureDir(templateDir);
    await fs.writeJson(manifestFile, {
      timestamp: '2026-02-18T00:00:00.000Z',
      source_project: 'E:/workspace/331-poc',
      specs: ['66-01-gap-sample'],
      templates: ['tpl-a'],
      capabilities: ['mystery-capability']
    }, { spaces: 2 });
    await fs.writeJson(path.join(templateDir, 'scene-package.json'), {
      capabilities: {
        provides: ['mystery-capability']
      }
    }, { spaces: 2 });

    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        '--manifest',
        'docs/handoffs/handoff-manifest.json',
        '--template-dir',
        '.sce/templates/scene-packages',
        '--lexicon',
        path.join(projectRoot, 'lib', 'data', 'moqui-capability-lexicon.json'),
        '--out',
        outFile,
        '--json',
        '--fail-on-gap',
      ],
      {
        cwd: workspace,
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(2);
    const payload = JSON.parse(`${result.stdout}`.trim());
    expect(payload.mode).toBe('moqui-lexicon-audit');
    expect(payload.summary.passed).toBe(false);
    expect(payload.summary.expected_unknown_count).toBe(1);
    expect(payload.summary.provided_unknown_count).toBe(1);
  });
});
