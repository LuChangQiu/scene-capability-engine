'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  auditReleaseDocs,
  extractLatestChangelogRelease,
  parseArgs
} = require('../../../scripts/release-doc-version-audit');

async function writeReleaseDocFixture(rootDir, overrides = {}) {
  const defaults = {
    'package.json': JSON.stringify({
      name: 'release-doc-audit-fixture',
      version: '3.6.48'
    }, null, 2),
    'CHANGELOG.md': [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '## [3.6.48] - 2026-03-14',
      '',
      '### Changed',
      '- fixture entry'
    ].join('\n'),
    'README.md': [
      '# Fixture',
      '',
      '**Version**: 3.6.48',
      '**Last Updated**: 2026-03-14'
    ].join('\n'),
    'README.zh.md': [
      '# Fixture',
      '',
      '**版本**：3.6.48',
      '**最后更新**：2026-03-14'
    ].join('\n'),
    '.sce/README.md': [
      '# Fixture',
      '',
      '## sce Capabilities',
      '',
      '**sce Version**: 3.6.48',
      '**Last Updated**: 2026-03-14'
    ].join('\n'),
    'template/.sce/README.md': [
      '# Fixture',
      '',
      '## sce Capabilities',
      '',
      '**sce Version**: 3.6.48',
      '**Last Updated**: 2026-03-14'
    ].join('\n')
  };

  const files = { ...defaults, ...overrides };
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, relativePath);
    await fs.ensureDir(path.dirname(absolutePath));
    await fs.writeFile(absolutePath, content, 'utf8');
  }
}

describe('release-doc-version-audit script', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-release-doc-audit-'));
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
      '--out', path.join(tempDir, 'report.json')
    ]);

    expect(parsed.projectPath).toBe(path.resolve(tempDir));
    expect(parsed.json).toBe(true);
    expect(parsed.failOnError).toBe(true);
    expect(parsed.out).toBe(path.resolve(path.join(tempDir, 'report.json')));
  });

  test('extractLatestChangelogRelease resolves the latest released entry', () => {
    expect(extractLatestChangelogRelease([
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '## [3.6.48] - 2026-03-14',
      '',
      '## [3.6.47] - 2026-03-13'
    ].join('\n'))).toEqual({
      version: '3.6.48',
      date: '2026-03-14'
    });
  });

  test('passes when release docs match package and changelog metadata', async () => {
    await writeReleaseDocFixture(tempDir);

    const result = auditReleaseDocs({ projectPath: tempDir });

    expect(result.passed).toBe(true);
    expect(result.error_count).toBe(0);
    expect(result.violations).toEqual([]);
  });

  test('flags stale doc version and updated date drift', async () => {
    await writeReleaseDocFixture(tempDir, {
      'README.md': [
        '# Fixture',
        '',
        '**Version**: 3.6.34',
        '**Last Updated**: 2026-03-08'
      ].join('\n')
    });

    const result = auditReleaseDocs({ projectPath: tempDir });

    expect(result.passed).toBe(false);
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'README.md', rule: 'stale_doc_version' }),
      expect.objectContaining({ file: 'README.md', rule: 'stale_doc_updated_date' })
    ]));
  });

  test('flags changelog/package mismatch before checking README footers', async () => {
    await writeReleaseDocFixture(tempDir, {
      'package.json': JSON.stringify({
        name: 'release-doc-audit-fixture',
        version: '3.6.49'
      }, null, 2)
    });

    const result = auditReleaseDocs({ projectPath: tempDir });

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'CHANGELOG.md', rule: 'stale_latest_release_entry' }),
      expect.objectContaining({ file: 'README.md', rule: 'stale_doc_version' }),
      expect.objectContaining({ file: 'README.zh.md', rule: 'stale_doc_version' })
    ]));
  });

  test('flags version-stamped capability headings in long-lived project guides', async () => {
    await writeReleaseDocFixture(tempDir, {
      '.sce/README.md': [
        '# Fixture',
        '',
        '## sce Capabilities (v1.45.x)',
        '### Agent Orchestrator (v1.45.0)',
        '',
        '**sce Version**: 3.6.48',
        '**Last Updated**: 2026-03-14'
      ].join('\n')
    });

    const result = auditReleaseDocs({ projectPath: tempDir });

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: '.sce/README.md',
        rule: 'versioned_capability_headings'
      })
    ]));
  });
});
