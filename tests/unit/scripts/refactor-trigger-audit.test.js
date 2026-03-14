'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  auditRefactorTriggers,
  buildRecommendedThresholds,
  classifyFile,
  parseArgs,
  THRESHOLD_PROFILES
} = require('../../../scripts/refactor-trigger-audit');

function makeLines(count) {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n');
}

async function writeFile(rootDir, relativePath, lineCount) {
  const absolutePath = path.join(rootDir, relativePath);
  await fs.ensureDir(path.dirname(absolutePath));
  await fs.writeFile(absolutePath, makeLines(lineCount), 'utf8');
}

describe('refactor-trigger-audit script', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-refactor-trigger-audit-'));
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
      '--fail-on-redline',
      '--scan-dir', 'custom-src',
      '--out', path.join(tempDir, 'report.json')
    ]);

    expect(parsed.projectPath).toBe(path.resolve(tempDir));
    expect(parsed.json).toBe(true);
    expect(parsed.failOnRedline).toBe(true);
    expect(parsed.scanDirs).toContain('custom-src');
    expect(parsed.out).toBe(path.resolve(path.join(tempDir, 'report.json')));
  });

  test('classifies test files separately from source files', () => {
    expect(classifyFile('tests/unit/demo.test.js')).toBe('test');
    expect(classifyFile('lib/demo.js')).toBe('source');
  });

  test('recommends tighter project-specific thresholds for smaller projects', () => {
    const thresholds = buildRecommendedThresholds({
      count: 4,
      max: 900,
      p50: 500,
      p90: 900,
      p95: 900
    }, THRESHOLD_PROFILES.source);

    expect(thresholds.assessment).toBeLessThan(THRESHOLD_PROFILES.source.defaults.assessment);
    expect(thresholds.refactor).toBeLessThanOrEqual(THRESHOLD_PROFILES.source.defaults.refactor);
    expect(thresholds.redline).toBeLessThanOrEqual(THRESHOLD_PROFILES.source.defaults.redline);
  });

  test('flags source files that cross assessment and refactor thresholds', async () => {
    await writeFile(tempDir, 'lib/a.js', 120);
    await writeFile(tempDir, 'lib/b.js', 240);
    await writeFile(tempDir, 'lib/c.js', 2200);
    await writeFile(tempDir, 'lib/d.js', 4500);

    const result = auditRefactorTriggers({ projectPath: tempDir });

    expect(result.summary.offender_count).toBeGreaterThan(0);
    expect(result.offenders).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'lib/c.js' }),
      expect.objectContaining({ file: 'lib/d.js' })
    ]));
    expect(result.offenders.some((item) => item.file === 'lib/c.js' && item.trigger === 'assessment')).toBe(true);
    expect(result.offenders.some((item) => item.file === 'lib/d.js' && item.trigger === 'refactor')).toBe(true);
  });

  test('caps legacy large-project thresholds at SCE defaults and detects redline files', async () => {
    await writeFile(tempDir, 'lib/mega.js', 11050);
    await writeFile(tempDir, 'tests/unit/mega.test.js', 15100);

    const result = auditRefactorTriggers({ projectPath: tempDir });

    expect(result.thresholds.source).toEqual({
      assessment: 2000,
      refactor: 4000,
      redline: 10000
    });
    expect(result.thresholds.test).toEqual({
      assessment: 3000,
      refactor: 6000,
      redline: 15000
    });
    expect(result.summary.redline_count).toBe(2);
    expect(result.passed).toBe(false);
  });
});
