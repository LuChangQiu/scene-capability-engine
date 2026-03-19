'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  auditMagicBallEngineeringContract,
  parseArgs
} = require('../../../scripts/magicball-engineering-contract-audit');

async function seedProject(rootDir) {
  const files = {
    'README.md': [
      '- `sce scene delivery show`',
      '- `sce app engineering preview|ownership|open|import|show|attach|hydrate|scaffold|activate`'
    ].join('\n'),
    'README.zh.md': [
      '- `sce scene delivery show`',
      '- `sce app engineering preview|ownership|open|import|show|attach|hydrate|scaffold|activate`'
    ].join('\n'),
    'docs/command-reference.md': [
      'sce scene delivery show --scene scene.demo --json',
      'sce app engineering preview --app customer-order-demo --json',
      'sce app engineering ownership --app customer-order-demo --json',
      'sce app engineering open --app customer-order-demo --json',
      'sce app engineering import --app customer-order-demo --json',
      'sce app engineering scaffold --app customer-order-demo --overwrite-policy missing-only --json'
    ].join('\n'),
    'docs/magicball-sce-adaptation-guide.md': [
      '`docs/magicball-engineering-projection-contract.md`',
      '`scene delivery show`',
      '`app engineering preview`',
      '`app engineering ownership`',
      '`sce app engineering preview/ownership/open/import/show/attach/hydrate/scaffold/activate`'
    ].join('\n'),
    'docs/magicball-integration-doc-index.md': [
      '`docs/magicball-engineering-projection-contract.md`',
      '| `magicball-engineering-projection-contract.md` | engineering payload contract | medium |'
    ].join('\n'),
    'docs/magicball-engineering-projection-contract.md': [
      'sce scene delivery show --scene <scene-id> --json',
      'sce app engineering preview --app <app-key> --json',
      'sce app engineering ownership --app <app-key> --json',
      'sce app engineering open --app <app-key> --json',
      'sce app engineering import --app <app-key> --json',
      'sce app engineering scaffold --app <app-key> --overwrite-policy missing-only --json'
    ].join('\n'),
    'docs/magicball-frontend-state-and-command-mapping.md': [
      'sceneDelivery: Record<string, unknown> | null',
      'engineeringPreview: Record<string, unknown> | null',
      'engineeringOwnership: Record<string, unknown> | null',
      '`sce scene delivery show --scene <scene-id> --json`',
      '`sce app engineering preview --app <app-key> --json`',
      '`sce app engineering ownership --app <app-key> --json`'
    ].join('\n'),
    'docs/magicball-cli-invocation-examples.md': [
      'sce scene delivery show --scene scene.customer-order-demo --json',
      'sce app engineering preview --app customer-order-demo --json',
      'sce app engineering ownership --app customer-order-demo --json',
      'sce app engineering open --app customer-order-demo --json',
      'sce app engineering import --app customer-order-demo --json',
      'sce app engineering scaffold --app customer-order-demo --overwrite-policy missing-only --json'
    ].join('\n'),
    'docs/magicball-write-auth-adaptation-guide.md': [
      '- `app:engineering:scaffold`',
      '| Scaffold engineering workspace baseline | `sce app engineering scaffold` | `app:engineering:scaffold` |',
      'sce auth grant --scope app:engineering:attach,app:engineering:hydrate,app:engineering:scaffold,app:engineering:activate --reason "initialize engineering workspace" --json'
    ].join('\n'),
    'docs/magicball-mode-home-and-ontology-empty-state-playbook.md': [
      '4. `sce scene delivery show --scene <scene-id> --json`',
      '5. `sce app engineering preview --app <app-key> --json`',
      '6. `sce app engineering ownership --app <app-key> --json`'
    ].join('\n'),
    'docs/magicball-adaptation-task-checklist-v1.md': [
      'frontend loads them sequentially in this order: application -> ontology -> engineering -> scene delivery -> engineering preview -> engineering ownership',
      'sce app engineering scaffold --app customer-order-demo --overwrite-policy missing-only --json',
      '- `sce app engineering scaffold`'
    ].join('\n'),
    'docs/magicball-ui-surface-checklist.md': [
      '- `docs/magicball-engineering-projection-contract.md`',
      '- delivery column from `scene delivery show`',
      '- engineering readiness state from `app engineering preview`',
      '- engineering ownership state from `app engineering ownership`'
    ].join('\n'),
    'docs/magicball-integration-issue-tracker.md': [
      '- `scene delivery show`',
      '- `app engineering preview/ownership/open/import/show/attach/hydrate/scaffold/activate`',
      '4. scene delivery show',
      '5. engineering preview',
      '6. engineering ownership'
    ].join('\n')
  };

  await Promise.all(Object.entries(files).map(async ([relativePath, content]) => {
    const target = path.join(rootDir, relativePath);
    await fs.ensureDir(path.dirname(target));
    await fs.writeFile(target, content, 'utf8');
  }));
}

describe('magicball-engineering-contract-audit script', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-magicball-engineering-audit-'));
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

  test('passes when the engineering contract baseline is present', () => {
    const report = auditMagicBallEngineeringContract({ projectPath: tempDir });

    expect(report.passed).toBe(true);
    expect(report.violation_count).toBe(0);
  });

  test('flags missing required snippets', async () => {
    await fs.writeFile(
      path.join(tempDir, 'docs', 'magicball-engineering-projection-contract.md'),
      'sce app engineering preview --app <app-key> --json\n',
      'utf8'
    );

    const report = auditMagicBallEngineeringContract({ projectPath: tempDir });

    expect(report.passed).toBe(false);
    expect(report.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'missing_required_snippet',
        file: 'docs/magicball-engineering-projection-contract.md'
      })
    ]));
  });

  test('flags stale bootstrap sequence in active docs', async () => {
    await fs.writeFile(
      path.join(tempDir, 'docs', 'magicball-mode-home-and-ontology-empty-state-playbook.md'),
      'frontend loads them sequentially in this order: application -> ontology -> engineering -> engineering show\n',
      'utf8'
    );

    const report = auditMagicBallEngineeringContract({ projectPath: tempDir });

    expect(report.passed).toBe(false);
    expect(report.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'prohibited_stale_magicball_engineering_phrase',
        file: 'docs/magicball-mode-home-and-ontology-empty-state-playbook.md'
      })
    ]));
  });
});
