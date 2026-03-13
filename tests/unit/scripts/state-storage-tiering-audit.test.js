'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  auditStateStorageTiering,
  parseArgs
} = require('../../../scripts/state-storage-tiering-audit');
const {
  cloneStateStoragePolicyDefaults
} = require('../../../lib/state/state-storage-policy');

async function writePolicyFixture(rootDir, policyOverride = null, extraFiles = {}) {
  await fs.ensureDir(path.join(rootDir, '.sce', 'config'));
  await fs.ensureDir(path.join(rootDir, '.sce', 'reports'));
  await fs.ensureDir(path.join(rootDir, '.sce', 'audit'));

  const policy = policyOverride || cloneStateStoragePolicyDefaults();
  await fs.writeJson(path.join(rootDir, '.sce', 'config', 'state-storage-policy.json'), policy, { spaces: 2 });

  const defaults = {
    '.sce/reports/interactive-approval-events.jsonl': '{"event":"submit"}\n',
    '.sce/audit/operations.jsonl': '{"event":"apply"}\n'
  };

  for (const [relativePath, content] of Object.entries({ ...defaults, ...extraFiles })) {
    const absolutePath = path.join(rootDir, relativePath);
    await fs.ensureDir(path.dirname(absolutePath));
    await fs.writeFile(absolutePath, content, 'utf8');
  }
}

describe('state-storage-tiering-audit script', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-state-storage-audit-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('parseArgs supports project, policy, output, and warning flags', () => {
    const parsed = parseArgs([
      '--project-path', tempDir,
      '--policy', '.sce/config/state-storage-policy.json',
      '--json',
      '--fail-on-warning',
      '--out', path.join(tempDir, 'report.json')
    ]);

    expect(parsed.projectPath).toBe(path.resolve(tempDir));
    expect(parsed.policyPath).toBe(path.resolve(tempDir, '.sce/config/state-storage-policy.json'));
    expect(parsed.json).toBe(true);
    expect(parsed.failOnWarning).toBe(true);
    expect(parsed.out).toBe(path.resolve(path.join(tempDir, 'report.json')));
  });

  test('passes with the default selective storage policy', async () => {
    await writePolicyFixture(tempDir);

    const report = auditStateStorageTiering({ projectPath: tempDir });

    expect(report.passed).toBe(true);
    expect(report.error_count).toBe(0);
    expect(report.warning_count).toBe(0);
    expect(report.summary.component_scope_count).toBe(9);
  });

  test('fails when workspace state is not protected as file-source', async () => {
    const policy = cloneStateStoragePolicyDefaults();
    const workspaceRule = policy.resource_rules.find((rule) => rule.rule_id === 'workspace-personal-state');
    workspaceRule.tier = 'sqlite-index';

    await writePolicyFixture(tempDir, policy);

    const report = auditStateStorageTiering({ projectPath: tempDir });

    expect(report.passed).toBe(false);
    expect(report.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'workspace_state_wrong_tier' })
    ]));
  });

  test('warns when append-only streams are not covered by policy patterns', async () => {
    const policy = cloneStateStoragePolicyDefaults();
    policy.resource_rules = policy.resource_rules.filter((rule) => rule.rule_id !== 'append-only-audit-streams');

    await writePolicyFixture(tempDir, policy, {
      '.sce/audit/custom-ledger.jsonl': '{"event":"custom"}\n'
    });

    const report = auditStateStorageTiering({ projectPath: tempDir, failOnWarning: true });

    expect(report.passed).toBe(false);
    expect(report.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'missing_append_only_audit_rule' }),
      expect.objectContaining({ rule: 'uncovered_append_only_stream', path: '.sce/audit/custom-ledger.jsonl' })
    ]));
  });
});
