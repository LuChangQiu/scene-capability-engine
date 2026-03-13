'use strict';

const path = require('path');
const fs = require('fs-extra');

const {
  normalizeSceneContributeOptions,
  runSceneContributeCommand,
  extractTarBuffer
} = require('../../../lib/commands/scene');
const {
  createScenePackageFixture
} = require('../utils/scene-package-fixture');

describe('Scene contribute command', () => {
  let originalLog;
  let originalError;
  let originalExitCode;

  beforeEach(() => {
    originalLog = console.log;
    originalError = console.error;
    originalExitCode = process.exitCode;
    console.log = jest.fn();
    console.error = jest.fn();
    delete process.exitCode;
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = originalExitCode;
  });

  test('normalizeSceneContributeOptions trims input and applies defaults', () => {
    expect(normalizeSceneContributeOptions({
      package: ' pkg ',
      registry: ' reg ',
      dryRun: true,
      strict: true,
      json: true,
      skipLint: true,
      force: true
    })).toEqual({
      package: 'pkg',
      registry: 'reg',
      dryRun: true,
      strict: true,
      json: true,
      skipLint: true,
      force: true
    });

    expect(normalizeSceneContributeOptions()).toEqual({
      package: '.',
      registry: '.sce/registry',
      dryRun: false,
      strict: false,
      json: false,
      skipLint: false,
      force: false
    });
  });

  test('runSceneContributeCommand publishes a valid package and updates the registry index', async () => {
    const workspace = await createScenePackageFixture({
      rootDir: path.join(require('os').tmpdir(), `sce-contribute-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      packageDirName: 'pkg'
    });

    try {
      const payload = await runSceneContributeCommand(
        { package: 'pkg', registry: 'registry' },
        { projectRoot: workspace.rootDir, fileSystem: fs }
      );
      const registryRoot = path.join(workspace.rootDir, 'registry');
      const tarballPath = path.join(registryRoot, 'packages', 'demo-scene', '1.0.0', 'demo-scene-1.0.0.tgz');
      const indexPath = path.join(registryRoot, 'registry-index.json');
      const index = await fs.readJson(indexPath);
      const tarball = await fs.readFile(tarballPath);
      const files = extractTarBuffer(require('zlib').gunzipSync(tarball));

      expect(payload.success).toBe(true);
      expect(payload.published).toBe(true);
      expect(payload.stages.validation.passed).toBe(true);
      expect(payload.stages.lint.passed).toBe(true);
      expect(payload.stages.score.passed).toBe(true);
      expect(payload.stages.publish.completed).toBe(true);
      expect(index.packages['demo-scene'].versions['1.0.0'].tarball).toBe('packages/demo-scene/1.0.0/demo-scene-1.0.0.tgz');
      expect(files.map((file) => file.relativePath).sort()).toEqual([
        'playbook.md',
        'scene-package.json',
        'scene.yaml',
        'scene.yaml'
      ]);
      expect(process.exitCode).toBeUndefined();
    } finally {
      await workspace.cleanup();
    }
  });

  test('runSceneContributeCommand dry-run skips publish side effects', async () => {
    const workspace = await createScenePackageFixture({
      rootDir: path.join(require('os').tmpdir(), `sce-contribute-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      packageDirName: 'pkg'
    });

    try {
      const payload = await runSceneContributeCommand(
        { package: 'pkg', registry: 'registry', dryRun: true },
        { projectRoot: workspace.rootDir, fileSystem: fs }
      );

      expect(payload.success).toBe(true);
      expect(payload.published).toBe(false);
      expect(payload.dry_run).toBe(true);
      expect(payload.stages.publish.skipped).toBe(true);
      expect(await fs.pathExists(path.join(workspace.rootDir, 'registry'))).toBe(false);
    } finally {
      await workspace.cleanup();
    }
  });

  test('runSceneContributeCommand skip-lint bypasses lint and score stages', async () => {
    const workspace = await createScenePackageFixture({
      rootDir: path.join(require('os').tmpdir(), `sce-contribute-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      packageDirName: 'pkg',
      contractOverrides: {
        metadata: {
          name: 'Bad Name'
        }
      }
    });

    try {
      const payload = await runSceneContributeCommand(
        { package: 'pkg', registry: 'registry', dryRun: true, skipLint: true },
        { projectRoot: workspace.rootDir, fileSystem: fs }
      );

      expect(payload.success).toBe(true);
      expect(payload.stages.validation.passed).toBe(true);
      expect(payload.stages.lint.skipped).toBe(true);
      expect(payload.stages.score.skipped).toBe(true);
    } finally {
      await workspace.cleanup();
    }
  });

  test('runSceneContributeCommand strict mode blocks warning-only packages', async () => {
    const workspace = await createScenePackageFixture({
      rootDir: path.join(require('os').tmpdir(), `sce-contribute-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      packageDirName: 'pkg',
      includeReadme: false,
      contractOverrides: {
        metadata: {
          description: ''
        }
      }
    });

    try {
      const payload = await runSceneContributeCommand(
        { package: 'pkg', registry: 'registry', strict: true, dryRun: true },
        { projectRoot: workspace.rootDir, fileSystem: fs }
      );

      expect(payload.success).toBe(false);
      expect(payload.stages.validation.passed).toBe(true);
      expect(payload.stages.lint.passed).toBe(false);
      expect(payload.stages.publish.completed).toBe(false);
      expect(process.exitCode).toBe(1);
    } finally {
      await workspace.cleanup();
    }
  });

  test('runSceneContributeCommand stops at validation failures', async () => {
    const workspace = await createScenePackageFixture({
      rootDir: path.join(require('os').tmpdir(), `sce-contribute-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      packageDirName: 'pkg',
      contractOverrides: {
        compatibility: null
      }
    });

    try {
      const payload = await runSceneContributeCommand(
        { package: 'pkg', registry: 'registry', dryRun: true },
        { projectRoot: workspace.rootDir, fileSystem: fs }
      );

      expect(payload.success).toBe(false);
      expect(payload.stages.validation.passed).toBe(false);
      expect(payload.stages.validation.errors).toContain('compatibility object is required');
      expect(payload.stages.lint.result).toBeNull();
      expect(payload.stages.publish.completed).toBe(false);
      expect(process.exitCode).toBe(1);
    } finally {
      await workspace.cleanup();
    }
  });

  test('runSceneContributeCommand stops at lint failures', async () => {
    const workspace = await createScenePackageFixture({
      rootDir: path.join(require('os').tmpdir(), `sce-contribute-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      packageDirName: 'pkg',
      contractOverrides: {
        metadata: {
          name: 'Bad Name'
        }
      }
    });

    try {
      const payload = await runSceneContributeCommand(
        { package: 'pkg', registry: 'registry', dryRun: true },
        { projectRoot: workspace.rootDir, fileSystem: fs }
      );

      expect(payload.success).toBe(false);
      expect(payload.stages.validation.passed).toBe(true);
      expect(payload.stages.lint.passed).toBe(false);
      expect(payload.stages.lint.result.errors.map((item) => item.code)).toContain('NAME_NOT_KEBAB');
      expect(payload.stages.score.result).toBeNull();
      expect(payload.stages.publish.completed).toBe(false);
      expect(process.exitCode).toBe(1);
    } finally {
      await workspace.cleanup();
    }
  });

  test('runSceneContributeCommand emits JSON payloads when requested', async () => {
    const logs = [];
    console.log = jest.fn((value) => logs.push(value));
    const workspace = await createScenePackageFixture({
      rootDir: path.join(require('os').tmpdir(), `sce-contribute-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      packageDirName: 'pkg'
    });

    try {
      const payload = await runSceneContributeCommand(
        { package: 'pkg', registry: 'registry', json: true, dryRun: true },
        { projectRoot: workspace.rootDir, fileSystem: fs }
      );

      expect(JSON.parse(logs[0])).toEqual(payload);
    } finally {
      await workspace.cleanup();
    }
  });

  test('runSceneContributeCommand catches unexpected publish errors and sets exitCode', async () => {
    const workspace = await createScenePackageFixture({
      rootDir: path.join(require('os').tmpdir(), `sce-contribute-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      packageDirName: 'pkg'
    });
    const fileSystem = {
      ...fs,
      writeJson: jest.fn(async () => {
        throw new Error('disk full');
      })
    };

    try {
      const payload = await runSceneContributeCommand(
        { package: 'pkg', registry: 'registry' },
        { projectRoot: workspace.rootDir, fileSystem }
      );

      expect(payload).toBeNull();
      expect(process.exitCode).toBe(1);
      expect(console.error).toHaveBeenCalled();
    } finally {
      await workspace.cleanup();
    }
  });
});
