const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const {
  applyTakeoverBaseline,
  TAKEOVER_DEFAULTS,
  CLARIFICATION_FIRST_CORE_PRINCIPLE_HEADING,
  NO_BLIND_FIX_CORE_PRINCIPLE_HEADING,
  STEERING_CHANGE_EVALUATION_CORE_PRINCIPLE_HEADING,
  BACKEND_API_PRECEDENCE_CORE_PRINCIPLE_HEADING,
  DELIVERY_SYNC_REQUIRED_LINES,
  LARGE_FILE_REFACTOR_CORE_PRINCIPLE_HEADING,
  REQUIRED_CORE_PRINCIPLE_SECTIONS,
  ERRORBOOK_REGISTRY_DEFAULTS,
  ERRORBOOK_CONVERGENCE_DEFAULTS
} = require('../../../lib/workspace/takeover-baseline');
const {
  DEFAULT_CONFIG: MULTI_AGENT_CONFIG_DEFAULTS
} = require('../../../lib/collab/multi-agent-config');

describe('takeover-baseline', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-takeover-baseline-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test('applies baseline defaults for adopted projects and writes report', async () => {
    await fs.ensureDir(path.join(tempDir, '.sce'));
    await fs.writeJson(path.join(tempDir, '.sce', 'version.json'), {
      'sce-version': '3.3.0',
      'template-version': '3.3.0'
    }, { spaces: 2 });

    const report = await applyTakeoverBaseline(tempDir, {
      apply: true,
      writeReport: true,
      sceVersion: '3.4.0'
    });

    expect(report.detected_project).toBe(true);
    expect(report.apply).toBe(true);
    expect(report.passed).toBe(true);
    expect(report.drift_count).toBe(0);
    expect(report.summary.created).toBeGreaterThan(0);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'adoption-config.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'auto', 'config.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'config', 'takeover-baseline.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'config', 'errorbook-registry.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'config', 'multi-agent.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'config', 'session-governance.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'config', 'spec-domain-policy.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'config', 'problem-eval-policy.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'config', 'problem-closure-policy.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'config', 'studio-intake-policy.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'config', 'state-storage-policy.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'errorbook', 'project-intake', 'custom-mechanism-inventory.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'steering', 'manifest.yaml'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'steering', 'CORE_PRINCIPLES.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'reports', 'takeover-baseline-latest.json'))).toBe(true);

    const adoptionConfig = await fs.readJson(path.join(tempDir, '.sce', 'adoption-config.json'));
    expect(adoptionConfig.takeover).toEqual(expect.objectContaining({
      managed: true,
      auto_detect_on_startup: true,
      legacy_kiro_supported: false
    }));
    expect(adoptionConfig.multiUserMode).toBe(true);
    expect(adoptionConfig.defaults).toEqual(TAKEOVER_DEFAULTS);
    expect(adoptionConfig.defaults.errorbook_convergence).toEqual(ERRORBOOK_CONVERGENCE_DEFAULTS);
    expect(adoptionConfig.defaults.collaboration).toEqual(expect.objectContaining({
      multi_user_mode: true,
      multi_agent: MULTI_AGENT_CONFIG_DEFAULTS
    }));

    const autoConfig = await fs.readJson(path.join(tempDir, '.sce', 'auto', 'config.json'));
    expect(autoConfig.mode).toBe('aggressive');
    expect(autoConfig.takeover).toEqual(expect.objectContaining({
      managed: true,
      require_step_confirmation: false,
      apply_all_work_by_default: true
    }));

    const errorbookRegistry = await fs.readJson(path.join(tempDir, '.sce', 'config', 'errorbook-registry.json'));
    expect(errorbookRegistry).toEqual(ERRORBOOK_REGISTRY_DEFAULTS);

    const multiAgentConfig = await fs.readJson(path.join(tempDir, '.sce', 'config', 'multi-agent.json'));
    expect(multiAgentConfig).toEqual(MULTI_AGENT_CONFIG_DEFAULTS);

    const errorbookInventory = await fs.readJson(
      path.join(tempDir, '.sce', 'errorbook', 'project-intake', 'custom-mechanism-inventory.json')
    );
    expect(errorbookInventory.summary.detected_custom_mechanisms).toBe(0);
    expect(errorbookInventory.strategy).toBe('absorb_into_sce_errorbook');

    const corePrinciples = await fs.readFile(path.join(tempDir, '.sce', 'steering', 'CORE_PRINCIPLES.md'), 'utf8');
    expect(corePrinciples).toContain(CLARIFICATION_FIRST_CORE_PRINCIPLE_HEADING);
    expect(corePrinciples).toContain(NO_BLIND_FIX_CORE_PRINCIPLE_HEADING);
    expect(corePrinciples).toContain(STEERING_CHANGE_EVALUATION_CORE_PRINCIPLE_HEADING);
    expect(corePrinciples).toContain(BACKEND_API_PRECEDENCE_CORE_PRINCIPLE_HEADING);
    expect(corePrinciples).toContain(LARGE_FILE_REFACTOR_CORE_PRINCIPLE_HEADING);
    DELIVERY_SYNC_REQUIRED_LINES.forEach((line) => {
      expect(corePrinciples).toContain(line);
    });
  });

  test('audit mode reports drift without mutating project files', async () => {
    await fs.ensureDir(path.join(tempDir, '.sce'));

    const report = await applyTakeoverBaseline(tempDir, {
      apply: false,
      writeReport: false,
      sceVersion: '3.4.0'
    });

    expect(report.detected_project).toBe(true);
    expect(report.apply).toBe(false);
    expect(report.passed).toBe(false);
    expect(report.drift_count).toBeGreaterThan(0);
    expect(report.summary.pending).toBeGreaterThan(0);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'adoption-config.json'))).toBe(false);
    expect(await fs.pathExists(path.join(tempDir, '.sce', 'steering', 'manifest.yaml'))).toBe(false);
    expect(report.files.some((item) => item.status === 'pending')).toBe(true);
    expect(report.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '.sce/steering/CORE_PRINCIPLES.md', status: 'pending' })
    ]));
  });

  test('is idempotent after baseline is already aligned', async () => {
    await fs.ensureDir(path.join(tempDir, '.sce'));

    const first = await applyTakeoverBaseline(tempDir, {
      apply: true,
      writeReport: false,
      sceVersion: '3.4.0'
    });
    expect(first.passed).toBe(true);

    const second = await applyTakeoverBaseline(tempDir, {
      apply: true,
      writeReport: false,
      sceVersion: '3.4.0'
    });

    expect(second.detected_project).toBe(true);
    expect(second.passed).toBe(true);
    expect(second.summary.created).toBe(0);
    expect(second.summary.updated).toBe(0);
    expect(second.summary.pending).toBe(0);
    expect(second.files.every((item) => item.status === 'unchanged')).toBe(true);

    const corePrinciples = await fs.readFile(path.join(tempDir, '.sce', 'steering', 'CORE_PRINCIPLES.md'), 'utf8');
    REQUIRED_CORE_PRINCIPLE_SECTIONS.forEach(({ heading }) => {
      expect(corePrinciples.match(new RegExp(heading, 'g'))).toHaveLength(1);
    });
  });

  test('repairs missing required core principles for existing steering file', async () => {
    await fs.ensureDir(path.join(tempDir, '.sce', 'steering'));
    await fs.writeFile(
      path.join(tempDir, '.sce', 'steering', 'CORE_PRINCIPLES.md'),
      '# 核心开发原则（基准规则）\n\n## 1. Existing Rule\n\n- keep durable rules only.\n',
      'utf8'
    );

    const report = await applyTakeoverBaseline(tempDir, {
      apply: true,
      writeReport: false,
      sceVersion: '3.6.46'
    });

    expect(report.passed).toBe(true);
    expect(report.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '.sce/steering/CORE_PRINCIPLES.md', status: 'updated' })
    ]));

    const corePrinciples = await fs.readFile(path.join(tempDir, '.sce', 'steering', 'CORE_PRINCIPLES.md'), 'utf8');
    expect(corePrinciples).toContain('## 1. Existing Rule');
    expect(corePrinciples).toContain(CLARIFICATION_FIRST_CORE_PRINCIPLE_HEADING);
    expect(corePrinciples).toContain(NO_BLIND_FIX_CORE_PRINCIPLE_HEADING);
    expect(corePrinciples).toContain(STEERING_CHANGE_EVALUATION_CORE_PRINCIPLE_HEADING);
    expect(corePrinciples).toContain(BACKEND_API_PRECEDENCE_CORE_PRINCIPLE_HEADING);
    expect(corePrinciples).toContain(LARGE_FILE_REFACTOR_CORE_PRINCIPLE_HEADING);
    DELIVERY_SYNC_REQUIRED_LINES.forEach((line) => {
      expect(corePrinciples).toContain(line);
    });
  });

  test('inventories project-defined mistake-book style artifacts into SCE errorbook convergence intake', async () => {
    await fs.ensureDir(path.join(tempDir, '.sce'));
    await fs.ensureDir(path.join(tempDir, 'docs'));
    await fs.ensureDir(path.join(tempDir, 'postmortem'));
    await fs.writeFile(path.join(tempDir, 'docs', '支付故障复盘.md'), '# payment retrospective\n', 'utf8');
    await fs.writeFile(path.join(tempDir, 'postmortem', 'checkout-incident.md'), '# postmortem\n', 'utf8');

    const report = await applyTakeoverBaseline(tempDir, {
      apply: true,
      writeReport: false,
      sceVersion: '3.6.46'
    });

    expect(report.errorbook_convergence).toEqual(expect.objectContaining({
      canonical_mechanism: 'errorbook',
      strategy: 'absorb_into_sce_errorbook',
      detected_custom_mechanism_count: 3
    }));

    const inventory = await fs.readJson(
      path.join(tempDir, '.sce', 'errorbook', 'project-intake', 'custom-mechanism-inventory.json')
    );
    expect(inventory.summary.detected_custom_mechanisms).toBe(3);
    expect(inventory.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'docs/支付故障复盘.md', kind: 'file', action: 'absorb_into_sce_errorbook' }),
      expect.objectContaining({ path: 'postmortem', kind: 'directory', action: 'absorb_into_sce_errorbook' }),
      expect.objectContaining({ path: 'postmortem/checkout-incident.md', kind: 'file', action: 'absorb_into_sce_errorbook' })
    ]));
  });

  test('skips takeover when .sce directory is missing', async () => {
    const report = await applyTakeoverBaseline(tempDir, {
      apply: true,
      writeReport: true,
      sceVersion: '3.4.0'
    });

    expect(report.detected_project).toBe(false);
    expect(report.passed).toBe(true);
    expect(report.files).toHaveLength(0);
  });
});
