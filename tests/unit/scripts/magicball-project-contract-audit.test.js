'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  auditMagicBallProjectContract,
  parseArgs
} = require('../../../scripts/magicball-project-contract-audit');

async function seedProject(rootDir) {
  const files = {
    'README.md': '`sce project portfolio show|target resolve|supervision show`',
    'README.zh.md': '`sce project portfolio show|target resolve|supervision show`',
    'docs/command-reference.md': [
      'sce project portfolio show [options]',
      'sce project target resolve [options]',
      'sce project supervision show --project <id> [options]'
    ].join('\n'),
    'docs/magicball-sce-adaptation-guide.md': [
      '`docs/magicball-project-portfolio-contract.md`',
      '`sce project portfolio show`',
      '`sce project target resolve`',
      '`sce project supervision show`'
    ].join('\n'),
    'docs/magicball-integration-doc-index.md': [
      '`docs/magicball-project-portfolio-contract.md`',
      '| `magicball-project-portfolio-contract.md` | multi-project payload contract | medium |'
    ].join('\n'),
    'docs/magicball-project-portfolio-contract.md': [
      'sce project portfolio show --json',
      'sce project target resolve --json',
      'sce project supervision show --project <project-id> --json'
    ].join('\n'),
    'docs/magicball-frontend-state-and-command-mapping.md': [
      'projectPortfolio: Record<string, unknown> | null',
      '`sce project portfolio show --json`',
      '`sce project target resolve --request <text> --current-project <project-id> --json`',
      '`sce project supervision show --project <project-id> --json`'
    ].join('\n'),
    'docs/magicball-cli-invocation-examples.md': [
      'sce project portfolio show --json',
      'sce project target resolve --request "continue customer-order-demo" --json',
      'sce project supervision show --project workspace:customer-order-demo --json'
    ].join('\n'),
    'docs/magicball-adaptation-task-checklist-v1.md': [
      '## Phase 0: Multi-project Workspace Shell',
      'sce project portfolio show --json',
      'sce project target resolve --request "<text>" --current-project <project-id> --json',
      'sce project supervision show --project <project-id> --json'
    ].join('\n'),
    'docs/magicball-ui-surface-checklist.md': [
      '- `docs/magicball-project-portfolio-contract.md`',
      '- project switcher from `project portfolio show`',
      '- project health summary from `project supervision show`'
    ].join('\n'),
    'docs/magicball-integration-issue-tracker.md': [
      '- `project portfolio show/target resolve/supervision show`',
      '5. treat `project portfolio / target resolve / supervision` as the default multi-project shell truth'
    ].join('\n'),
    'docs/release-checklist.md': [
      'npm run audit:magicball-project-contract',
      '- `audit:magicball-project-contract` passes'
    ].join('\n'),
    'docs/zh/release-checklist.md': [
      'npm run audit:magicball-project-contract',
      '- `audit:magicball-project-contract` 通过'
    ].join('\n')
  };

  await Promise.all(Object.entries(files).map(async ([relativePath, content]) => {
    const target = path.join(rootDir, relativePath);
    await fs.ensureDir(path.dirname(target));
    await fs.writeFile(target, content, 'utf8');
  }));
}

describe('magicball-project-contract-audit script', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-magicball-project-audit-'));
    await seedProject(tempDir);
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('parseArgs supports audit flags', () => {
    const parsed = parseArgs([
      '--project-path', tempDir,
      '--json',
      '--fail-on-violation',
      '--out', path.join(tempDir, 'report.json')
    ]);

    expect(parsed.projectPath).toBe(path.resolve(tempDir));
    expect(parsed.json).toBe(true);
    expect(parsed.failOnViolation).toBe(true);
    expect(parsed.out).toBe(path.resolve(path.join(tempDir, 'report.json')));
  });

  test('passes when the project contract baseline is present', () => {
    const report = auditMagicBallProjectContract({ projectPath: tempDir });

    expect(report.passed).toBe(true);
    expect(report.violation_count).toBe(0);
  });

  test('flags missing required snippets', async () => {
    await fs.writeFile(
      path.join(tempDir, 'docs', 'magicball-project-portfolio-contract.md'),
      'sce project portfolio show --json\n',
      'utf8'
    );

    const report = auditMagicBallProjectContract({ projectPath: tempDir });

    expect(report.passed).toBe(false);
    expect(report.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'missing_required_snippet',
        file: 'docs/magicball-project-portfolio-contract.md'
      })
    ]));
  });
});
