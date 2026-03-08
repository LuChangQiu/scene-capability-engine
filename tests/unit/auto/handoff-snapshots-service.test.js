const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const {
  buildAutoHandoffMoquiBaselineSnapshot,
  buildAutoHandoffScenePackageBatchSnapshot,
  buildAutoHandoffCapabilityCoverageSnapshot
} = require('../../../lib/auto/handoff-snapshots-service');

describe('auto handoff snapshots service', () => {
  test('builds moqui baseline snapshot from script output', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-handoff-snap-'));
    try {
      await fs.ensureDir(path.join(tempDir, 'scripts'));
      await fs.writeFile(path.join(tempDir, 'scripts', 'moqui-template-baseline-report.js'), 'module.exports={};', 'utf8');
      const result = await buildAutoHandoffMoquiBaselineSnapshot(tempDir, {
        fs,
        path,
        spawnSync: () => ({ status: 0, stdout: JSON.stringify({ summary: { portfolio_passed: true, total_templates: 1, scoped_templates: 1, avg_score: 90, valid_rate_percent: 100, baseline_passed: 1, baseline_failed: 0, scope_breakdown: {}, coverage_matrix: {}, gap_frequency: [] }, compare: { failed_templates: {} } }), stderr: '' }),
        toAutoHandoffCliPath: (_p, v) => v,
        buildAutoHandoffMoquiCoverageRegressions: () => [],
        AUTO_HANDOFF_MOQUI_BASELINE_JSON_FILE: '.sce/reports/release-evidence/moqui-template-baseline.json',
        AUTO_HANDOFF_MOQUI_BASELINE_MARKDOWN_FILE: '.sce/reports/release-evidence/moqui-template-baseline.md'
      });
      expect(result).toEqual(expect.objectContaining({ status: 'passed', generated: true }));
    } finally {
      await fs.remove(tempDir);
    }
  });

  test('builds scene package batch snapshot from JSON stdout', async () => {
    const result = await buildAutoHandoffScenePackageBatchSnapshot('proj', 'manifest.json', {
      fs: { pathExists: async () => true, ensureDir: async () => {} },
      path,
      spawnSync: () => ({ status: 0, stdout: JSON.stringify({ success: true, mode: 'dry-run', manifest: 'manifest.json', summary: { selected: 1, published: 0, planned: 1, failed: 0, skipped: 0 }, ontology_summary: { average_score: 90, valid_rate_percent: 100 }, batch_ontology_gate: { passed: true, failures: [] }, failures: [], ontology_task_queue: { output_path: 'queue.lines', task_count: 1 } }), stderr: '' }),
      normalizeHandoffText: (v) => String(v || '').trim(),
      toAutoHandoffCliPath: (_p, v) => v,
      parseAutoHandoffJsonFromCommandStdout: (v) => JSON.parse(v),
      AUTO_HANDOFF_CLI_SCRIPT_FILE: 'bin/sce.js',
      AUTO_HANDOFF_SCENE_PACKAGE_BATCH_JSON_FILE: '.sce/reports/release-evidence/scene-package-publish-batch-dry-run.json',
      AUTO_HANDOFF_SCENE_PACKAGE_BATCH_TASK_QUEUE_FILE: '.sce/auto/ontology-remediation.lines'
    });
    expect(result).toEqual(expect.objectContaining({ status: 'passed', generated: true }));
    expect(result.summary).toEqual(expect.objectContaining({ selected: 1, batch_gate_passed: true }));
  });

  test('builds capability coverage snapshot from template contracts', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-handoff-snap-'));
    try {
      const tplDir = path.join(tempDir, '.sce', 'templates', 'scene-packages', 'tpl');
      await fs.ensureDir(tplDir);
      await fs.writeJson(path.join(tplDir, 'scene-package.json'), {
        capabilities: { provides: ['inventory-allocation'] },
        governance_contract: { business_rules: [{}], decision_logic: [{}] },
        ontology_model: { entities: [{}], relations: [{}] }
      }, { spaces: 2 });
      const result = await buildAutoHandoffCapabilityCoverageSnapshot(tempDir, { capabilities: ['inventory-allocation'] }, { min_capability_coverage_percent: 100, min_capability_semantic_percent: 100 }, {
        fs,
        path,
        normalizeHandoffText: (v) => String(v || '').trim(),
        toAutoHandoffCliPath: (_p, v) => v,
        resolveMoquiCapabilityDescriptor: (v) => ({ raw: v, normalized: v, canonical: v, is_alias: false, is_deprecated_alias: false, is_known: true }),
        MOQUI_CAPABILITY_LEXICON_INDEX: {},
        moquiCapabilityMatch: (a, b) => a === b,
        AUTO_HANDOFF_MOQUI_CAPABILITY_COVERAGE_JSON_FILE: '.sce/reports/release-evidence/moqui-capability-coverage.json',
        AUTO_HANDOFF_MOQUI_CAPABILITY_COVERAGE_MARKDOWN_FILE: '.sce/reports/release-evidence/moqui-capability-coverage.md',
        renderMoquiCapabilityCoverageMarkdown: () => '# report'
      });
      expect(result.status).toBe('evaluated');
      expect(result.summary).toEqual(expect.objectContaining({ passed: true, semantic_passed: true }));
    } finally {
      await fs.remove(tempDir);
    }
  });
});

