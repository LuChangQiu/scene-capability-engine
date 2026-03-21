'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  auditSteeringContent,
  parseArgs
} = require('../../../scripts/steering-content-audit');

async function writeSteeringProject(rootDir, files = {}) {
  const steeringDir = path.join(rootDir, '.sce', 'steering');
  await fs.ensureDir(steeringDir);

  const manifest = `
schema_version: '1.0'
engine: sce
layers:
  core_principles: CORE_PRINCIPLES.md
  environment: ENVIRONMENT.md
  current_context: CURRENT_CONTEXT.md
  rules_guide: RULES_GUIDE.md
governance:
  files:
    CORE_PRINCIPLES.md:
      max_lines: 12
      max_headings: 6
      max_history_entries: 0
      allow_spec_refs: false
      allow_version_markers: false
      allow_checklists: false
    ENVIRONMENT.md:
      max_lines: 12
      max_headings: 6
      max_history_entries: 0
      allow_spec_refs: false
      allow_version_markers: false
      allow_checklists: false
    CURRENT_CONTEXT.md:
      max_lines: 12
      max_headings: 6
      max_history_entries: 2
      allow_spec_refs: true
      allow_version_markers: true
      allow_checklists: false
    RULES_GUIDE.md:
      max_lines: 12
      max_headings: 6
      max_history_entries: 0
      allow_spec_refs: false
      allow_version_markers: false
      allow_checklists: false
  canonical_terms:
    errorbook:
      aliases:
        - 错题本
      guidance: Reuse errorbook instead of creating a new mistake-book mode.
`;

  const defaults = {
    'manifest.yaml': manifest.trimStart(),
    'CORE_PRINCIPLES.md': '# Core\n\n- durable rules only\n',
    'ENVIRONMENT.md': '# Env\n\nrepo and release flow only\n',
    'CURRENT_CONTEXT.md': '# Context\n\n**版本**: `3.6.37`\n**当前主线**: keep it short\n',
    'RULES_GUIDE.md': '# Rules\n\nkeep steering lean\n'
  };

  for (const [fileName, content] of Object.entries({ ...defaults, ...files })) {
    await fs.writeFile(path.join(steeringDir, fileName), content, 'utf8');
  }

  await fs.writeJson(path.join(rootDir, 'package.json'), {
    name: 'steering-audit-fixture',
    version: '3.6.37'
  }, { spaces: 2 });
}

describe('steering-content-audit script', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-steering-audit-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('parseArgs supports core flags', () => {
    const parsed = parseArgs([
      '--project-path', tempDir,
      '--json',
      '--fail-on-error',
      '--fail-on-warning',
      '--out', path.join(tempDir, 'report.json')
    ]);

    expect(parsed.projectPath).toBe(path.resolve(tempDir));
    expect(parsed.json).toBe(true);
    expect(parsed.failOnError).toBe(true);
    expect(parsed.failOnWarning).toBe(true);
    expect(parsed.out).toBe(path.resolve(path.join(tempDir, 'report.json')));
  });

  test('passes for a lean steering set', async () => {
    await writeSteeringProject(tempDir);

    const result = auditSteeringContent({ projectPath: tempDir });

    expect(result.passed).toBe(true);
    expect(result.error_count).toBe(0);
    expect(result.warning_count).toBe(0);
  });

  test('does not fail when CURRENT_CONTEXT.md is absent in a clean checkout', async () => {
    await writeSteeringProject(tempDir);
    await fs.remove(path.join(tempDir, '.sce', 'steering', 'CURRENT_CONTEXT.md'));

    const result = auditSteeringContent({ projectPath: tempDir });

    expect(result.passed).toBe(true);
    expect(result.error_count).toBe(0);
    expect(result.warning_count).toBe(1);
    expect(result.violations).toEqual([
      expect.objectContaining({
        rule: 'missing_optional_context',
        file: 'CURRENT_CONTEXT.md'
      })
    ]);
  });

  test('flags line budgets and stale context history', async () => {
    await writeSteeringProject(tempDir, {
      'CURRENT_CONTEXT.md': [
        '# Context',
        '',
        '**版本**: `3.6.36`',
        '**当前主线**: too much history',
        '',
        'v1.0 | 2026-01-01 | a',
        'v2.0 | 2026-01-02 | b',
        'v3.0 | 2026-01-03 | c'
      ].join('\n')
    });

    const result = auditSteeringContent({ projectPath: tempDir });

    expect(result.passed).toBe(false);
    expect(result.error_count).toBe(1);
    expect(result.warning_count).toBe(1);
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'history_budget_exceeded', file: 'CURRENT_CONTEXT.md' }),
      expect.objectContaining({ rule: 'stale_context_version', file: 'CURRENT_CONTEXT.md' })
    ]));
  });

  test('flags stable-layer task state and spec references', async () => {
    await writeSteeringProject(tempDir, {
      'CORE_PRINCIPLES.md': [
        '# Core',
        '',
        '- [ ] finish Spec 119 cleanup',
        'Follow Spec 119 and 119-00-steering-self-governance now.',
        'v9.0 | 2026-03-12 | footer'
      ].join('\n')
    });

    const result = auditSteeringContent({ projectPath: tempDir });

    expect(result.error_count).toBe(2);
    expect(result.warning_count).toBeGreaterThanOrEqual(2);
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'task_checklist_in_steering', file: 'CORE_PRINCIPLES.md' }),
      expect.objectContaining({ rule: 'spec_reference_in_stable_layer', file: 'CORE_PRINCIPLES.md' }),
      expect.objectContaining({ rule: 'version_marker_in_stable_layer', file: 'CORE_PRINCIPLES.md' })
    ]));
  });

  test('flags non-canonical mechanism aliases', async () => {
    await writeSteeringProject(tempDir, {
      'CORE_PRINCIPLES.md': '# Core\n\n禁止再单独搞一套错题本流程。\n'
    });

    const result = auditSteeringContent({ projectPath: tempDir });

    expect(result.warning_count).toBe(1);
    expect(result.violations).toEqual([
      expect.objectContaining({
        rule: 'non_canonical_mechanism_alias',
        file: 'CORE_PRINCIPLES.md'
      })
    ]);
  });
});
