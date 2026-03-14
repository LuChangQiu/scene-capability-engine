'use strict';

const {
  parseArgs,
  runCollabGovernanceGate
} = require('../../../scripts/collab-governance-gate');

describe('collab-governance-gate script', () => {
  let originalStdoutWrite;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    process.stdout.write = jest.fn();
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  test('parseArgs supports core flags', () => {
    const parsed = parseArgs([
      '--project-path', 'E:\\workspace\\demo',
      '--fail-on-violation',
      '--json'
    ]);

    expect(parsed.projectPath).toMatch(/workspace[\\/]+demo$/);
    expect(parsed.failOnViolation).toBe(true);
    expect(parsed.json).toBe(true);
  });

  test('returns exit code 2 when collaboration governance violations exist', async () => {
    const payload = await runCollabGovernanceGate({
      projectPath: process.cwd(),
      failOnViolation: true,
      json: true
    }, {
      auditCollabGovernance: jest.fn().mockResolvedValue({
        passed: false,
        reason: 'violations',
        summary: {
          missing_gitignore_rules: 1,
          legacy_reference_count: 0
        },
        warnings: [],
        violations: ['missing ignore rule: .sce/config/coordination-log.json']
      })
    });

    expect(payload.passed).toBe(false);
    expect(payload.exit_code).toBe(2);
    expect(payload.violations).toContain('missing ignore rule: .sce/config/coordination-log.json');
  });

  test('passes when collaboration governance audit passes', async () => {
    const payload = await runCollabGovernanceGate({
      projectPath: process.cwd(),
      failOnViolation: true,
      json: true
    }, {
      auditCollabGovernance: jest.fn().mockResolvedValue({
        passed: true,
        reason: 'passed',
        summary: {
          missing_gitignore_rules: 0,
          legacy_reference_count: 0
        },
        warnings: [],
        violations: []
      })
    });

    expect(payload.passed).toBe(true);
    expect(payload.exit_code).toBe(0);
  });
});
