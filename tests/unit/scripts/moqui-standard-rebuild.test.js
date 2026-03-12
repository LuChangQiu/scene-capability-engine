const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

describe('moqui-standard-rebuild script', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-moqui-standard-rebuild-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('builds rebuild bundle from Moqui metadata without touching business project', async () => {
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const scriptPath = path.join(projectRoot, 'scripts', 'moqui-standard-rebuild.js');
    const metadataPath = path.join(
      projectRoot,
      'tests',
      'fixtures',
      'moqui-standard-rebuild',
      'metadata.json'
    );
    const outFile = path.join(tempDir, 'moqui-standard-rebuild.json');
    const markdownFile = path.join(tempDir, 'moqui-standard-rebuild.md');
    const bundleDir = path.join(tempDir, 'moqui-standard-bundle');

    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        '--metadata',
        metadataPath,
        '--out',
        outFile,
        '--markdown-out',
        markdownFile,
        '--bundle-out',
        bundleDir,
        '--json'
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8'
      }
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(`${result.stdout}`.trim());
    expect(payload.mode).toBe('moqui-standard-rebuild');
    expect(payload.inventory).toEqual(expect.objectContaining({
      entities: 2,
      services: 2,
      screens: 1,
      forms: 1,
      business_rules: 1,
      decisions: 1
    }));
    expect(payload.recovery.capabilities).toEqual(expect.arrayContaining([
      'moqui-entity-model-core',
      'moqui-service-contract-core',
      'moqui-screen-flow-core',
      'moqui-page-copilot-context-fix'
    ]));
    expect(payload.recovery.recommended_templates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'sce.scene--moqui-page-copilot-dialog--0.1.0' })
    ]));
    expect(payload.recovery.spec_plan).toEqual(expect.arrayContaining([
      expect.objectContaining({ spec_id: 'moqui-06-page-copilot-integration' })
    ]));
    expect(payload.recovery.readiness_summary).toEqual(expect.objectContaining({
      average_score: expect.any(Number),
      ready: expect.any(Number),
      partial: expect.any(Number),
      gap: expect.any(Number)
    }));
    expect(payload.recovery.readiness_matrix).toEqual(expect.arrayContaining([
      expect.objectContaining({ template_id: 'sce.scene--moqui-entity-model-core--0.1.0' }),
      expect.objectContaining({ template_id: 'sce.scene--moqui-page-copilot-dialog--0.1.0' })
    ]));
    expect(payload.recovery.readiness_matrix.length).toBe(6);
    expect(payload.recovery.prioritized_gaps).toEqual(expect.any(Array));

    expect(await fs.pathExists(outFile)).toBe(true);
    expect(await fs.pathExists(markdownFile)).toBe(true);
    expect(await fs.pathExists(path.join(bundleDir, 'handoff', 'handoff-manifest.json'))).toBe(true);
    expect(await fs.pathExists(path.join(bundleDir, 'ontology', 'moqui-ontology-seed.json'))).toBe(true);
    expect(await fs.pathExists(path.join(bundleDir, 'copilot', 'page-context-contract.json'))).toBe(true);
    expect(await fs.pathExists(path.join(bundleDir, 'copilot', 'conversation-playbook.md'))).toBe(true);
    expect(await fs.pathExists(path.join(bundleDir, 'rebuild', 'matrix-remediation.lines'))).toBe(true);
    expect(await fs.pathExists(path.join(bundleDir, 'rebuild', 'matrix-remediation-plan.json'))).toBe(true);
    expect(await fs.pathExists(path.join(bundleDir, 'rebuild', 'matrix-remediation-plan.md'))).toBe(true);
    expect(payload.output.remediation_queue).toContain('matrix-remediation.lines');
    expect(payload.output.remediation_plan_json).toContain('matrix-remediation-plan.json');
    expect(payload.output.remediation_plan_markdown).toContain('matrix-remediation-plan.md');

    const handoffPayload = await fs.readJson(path.join(bundleDir, 'handoff', 'handoff-manifest.json'));
    expect(handoffPayload.templates).toEqual(expect.arrayContaining([
      'sce.scene--moqui-page-copilot-dialog--0.1.0'
    ]));
    expect(handoffPayload.ontology_validation).toEqual(expect.objectContaining({
      status: 'pending',
      source: 'moqui-standard-rebuild'
    }));
    expect(Array.isArray(handoffPayload.known_gaps)).toBe(true);

    const remediationLines = await fs.readFile(path.join(bundleDir, 'rebuild', 'matrix-remediation.lines'), 'utf8');
    expect(remediationLines.length).toBeGreaterThan(0);

    const remediationPlan = await fs.readJson(path.join(bundleDir, 'rebuild', 'matrix-remediation-plan.json'));
    expect(remediationPlan.mode).toBe('moqui-matrix-remediation-plan');
    expect(remediationPlan.summary).toEqual(expect.objectContaining({
      total_gaps: expect.any(Number)
    }));
  });
});
