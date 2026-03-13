'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  collectRuntimeScriptFiles,
  evaluatePackageRuntimeAssets,
  extractPackedFilePaths
} = require('../../../scripts/npm-package-runtime-asset-check');

describe('npm-package-runtime-asset-check', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-npm-runtime-assets-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('collectRuntimeScriptFiles discovers root scripts recursively', async () => {
    await fs.ensureDir(path.join(tempDir, 'scripts', 'nested'));
    await fs.writeFile(path.join(tempDir, 'scripts', 'alpha.js'), 'module.exports = 1;\n', 'utf8');
    await fs.writeFile(path.join(tempDir, 'scripts', 'nested', 'beta.js'), 'module.exports = 2;\n', 'utf8');
    await fs.writeFile(path.join(tempDir, 'scripts', 'notes.txt'), 'ignore\n', 'utf8');

    const result = collectRuntimeScriptFiles(tempDir);

    expect(result).toEqual(['scripts/alpha.js', 'scripts/nested/beta.js']);
  });

  test('extractPackedFilePaths parses npm pack --json output', () => {
    const result = extractPackedFilePaths(JSON.stringify([{
      files: [
        { path: 'bin/scene-capability-engine.js' },
        { path: 'scripts/git-managed-gate.js' }
      ]
    }]));

    expect(result).toEqual(['bin/scene-capability-engine.js', 'scripts/git-managed-gate.js']);
  });

  test('passes when every runtime script is present in pack payload', () => {
    const result = evaluatePackageRuntimeAssets(tempDir, {
      failOnViolation: true,
      expectedScripts: ['scripts/a.js', 'scripts/b.js']
    }, {
      packRunner: () => ({
        status: 0,
        stdout: JSON.stringify([{
          files: [
            { path: 'scripts/a.js' },
            { path: 'scripts/b.js' },
            { path: 'bin/scene-capability-engine.js' }
          ]
        }]),
        stderr: ''
      })
    });

    expect(result.exit_code).toBe(0);
    expect(result.passed).toBe(true);
    expect(result.payload.missing_runtime_scripts).toEqual([]);
  });

  test('fails when pack payload omits runtime scripts', () => {
    const result = evaluatePackageRuntimeAssets(tempDir, {
      failOnViolation: true,
      expectedScripts: ['scripts/git-managed-gate.js', 'scripts/problem-closure-gate.js']
    }, {
      packRunner: () => ({
        status: 0,
        stdout: JSON.stringify([{
          files: [
            { path: 'scripts/git-managed-gate.js' }
          ]
        }]),
        stderr: ''
      })
    });

    expect(result.exit_code).toBe(1);
    expect(result.passed).toBe(false);
    expect(result.violations).toContain(
      'missing runtime script from npm package: scripts/problem-closure-gate.js'
    );
  });

  test('surfaces pack execution errors when dry-run fails', () => {
    const result = evaluatePackageRuntimeAssets(tempDir, {
      failOnViolation: true,
      expectedScripts: ['scripts/git-managed-gate.js']
    }, {
      packRunner: () => ({
        status: 1,
        stdout: '',
        stderr: '',
        error: 'spawnSync npm.cmd EINVAL'
      })
    });

    expect(result.exit_code).toBe(1);
    expect(result.passed).toBe(false);
    expect(result.payload.pack_error).toBe('spawnSync npm.cmd EINVAL');
    expect(result.violations).toEqual([
      'npm pack --dry-run failed: spawnSync npm.cmd EINVAL'
    ]);
  });
});
