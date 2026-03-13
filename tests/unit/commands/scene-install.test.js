'use strict';

const path = require('path');

const {
  normalizeSceneInstallOptions,
  validateSceneInstallOptions,
  buildInstallManifest,
  printSceneInstallSummary,
  runSceneInstallCommand
} = require('../../../lib/commands/scene');
const {
  createTarballBundle,
  buildRegistryIndex,
  createInstallFs,
  buildTarballPath
} = require('../utils/scene-install-fixture');

describe('Scene install helpers', () => {
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

  test('normalizeSceneInstallOptions trims values and applies defaults', () => {
    expect(normalizeSceneInstallOptions({
      name: ' demo-scene ',
      version: ' 1.2.0 ',
      out: ' scenes/demo ',
      registry: ' custom/registry ',
      force: true,
      dryRun: true,
      json: true
    })).toEqual({
      name: 'demo-scene',
      version: '1.2.0',
      out: 'scenes/demo',
      registry: 'custom/registry',
      force: true,
      dryRun: true,
      json: true
    });

    expect(normalizeSceneInstallOptions()).toEqual({
      name: undefined,
      version: undefined,
      out: undefined,
      registry: '.sce/registry',
      force: false,
      dryRun: false,
      json: false
    });
  });

  test('validateSceneInstallOptions enforces name and version rules', () => {
    expect(validateSceneInstallOptions({})).toBe('--name is required');
    expect(validateSceneInstallOptions({ name: 'demo-scene', version: 'banana' })).toBe('--version "banana" is not valid semver');
    expect(validateSceneInstallOptions({ name: 'demo-scene' })).toBeNull();
    expect(validateSceneInstallOptions({ name: 'demo-scene', version: 'latest' })).toBeNull();
    expect(validateSceneInstallOptions({ name: 'demo-scene', version: '1.2.3' })).toBeNull();
  });

  test('buildInstallManifest returns all required fields', () => {
    const manifest = buildInstallManifest(
      'demo-scene',
      '1.2.3',
      '.sce/registry',
      'sha256-abc',
      ['scene.yaml', 'README.md']
    );

    expect(manifest).toEqual({
      packageName: 'demo-scene',
      version: '1.2.3',
      installedAt: expect.any(String),
      registryDir: '.sce/registry',
      integrity: 'sha256-abc',
      files: ['scene.yaml', 'README.md']
    });
  });

  test('printSceneInstallSummary prints human and json forms', () => {
    const logs = [];
    console.log = jest.fn((value) => logs.push(value));
    const payload = {
      installed: true,
      dry_run: false,
      overwritten: true,
      coordinate: 'sce.scene/demo-scene@1.2.0',
      target_dir: 'demo-scene',
      file_count: 2,
      integrity: 'sha256-abc'
    };

    printSceneInstallSummary({ json: false }, payload);
    expect(logs.join('\n')).toContain('sce.scene/demo-scene@1.2.0');
    expect(logs.join('\n')).toContain('sha256-abc');

    logs.length = 0;
    printSceneInstallSummary({ json: true }, payload);
    expect(JSON.parse(logs[0])).toEqual(payload);
  });
});

describe('runSceneInstallCommand', () => {
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

  function createHappyFixture(overrides = {}) {
    const projectRoot = overrides.projectRoot || '/project';
    const registry = overrides.registry || '.sce/registry';
    const packageName = overrides.packageName || 'demo-scene';
    const version = overrides.version || '1.2.0';
    const tarballBundle = createTarballBundle(overrides.files || [
      { relativePath: 'scene.yaml', content: 'kind: scene\n' },
      { relativePath: 'docs/readme.md', content: '# Demo\n' }
    ]);
    const registryRoot = path.join(projectRoot, registry);
    const tarballPath = buildTarballPath(registryRoot, packageName, version);
    const versions = overrides.versions || {
      [version]: {
        published_at: '2026-03-01T00:00:00.000Z',
        integrity: overrides.integrity || tarballBundle.integrity,
        tarball: path.relative(registryRoot, tarballPath).replace(/\\/g, '/')
      }
    };
    const index = overrides.index || buildRegistryIndex(
      versions,
      overrides.latest || version,
      packageName
    );

    const fsFixture = createInstallFs({
      projectRoot,
      registry,
      index,
      tarballs: {
        [tarballPath]: tarballBundle.tarball
      },
      existingPaths: overrides.existingPaths || []
    });

    return {
      ...fsFixture,
      projectRoot,
      registry,
      packageName,
      version,
      tarballBundle
    };
  }

  test('installs a published package, extracts files, and writes an install manifest', async () => {
    const fixture = createHappyFixture();

    const payload = await runSceneInstallCommand(
      { name: fixture.packageName },
      { fileSystem: fixture.fileSystem, projectRoot: fixture.projectRoot }
    );
    const targetDir = path.join(fixture.projectRoot, fixture.packageName);
    const manifestPath = path.join(targetDir, 'scene-install-manifest.json');
    const installedScenePath = path.join(targetDir, 'scene.yaml');
    const installedDocPath = path.join(targetDir, 'docs', 'readme.md');
    const manifest = JSON.parse(fixture.writtenFiles.get(path.normalize(manifestPath)).toString('utf8'));

    expect(payload).toEqual({
      installed: true,
      dry_run: false,
      overwritten: false,
      coordinate: `sce.scene/${fixture.packageName}@${fixture.version}`,
      package: {
        name: fixture.packageName,
        version: fixture.version
      },
      target_dir: fixture.packageName,
      file_count: 2,
      files: ['scene.yaml', 'docs/readme.md'],
      integrity: fixture.tarballBundle.integrity,
      registry: {
        index_path: '.sce/registry/registry-index.json'
      }
    });
    expect(fixture.writtenFiles.get(path.normalize(installedScenePath)).toString('utf8')).toBe('kind: scene\n');
    expect(fixture.writtenFiles.get(path.normalize(installedDocPath)).toString('utf8')).toBe('# Demo\n');
    expect(manifest.packageName).toBe(fixture.packageName);
    expect(manifest.version).toBe(fixture.version);
    expect(manifest.registryDir).toBe('.sce/registry');
    expect(manifest.integrity).toBe(fixture.tarballBundle.integrity);
    expect(manifest.files).toEqual(['scene.yaml', 'docs/readme.md']);
  });

  test('reports package not found, version not found, integrity mismatch, and target conflict errors', async () => {
    const baseFixture = createHappyFixture();
    const missingPackage = await runSceneInstallCommand(
      { name: 'missing-scene' },
      {
        fileSystem: createInstallFs({
          projectRoot: baseFixture.projectRoot,
          registry: baseFixture.registry,
          index: buildRegistryIndex({}, null, baseFixture.packageName),
          tarballs: {}
        }).fileSystem,
        projectRoot: baseFixture.projectRoot
      }
    );

    const missingVersionFixture = createHappyFixture();
    const missingVersion = await runSceneInstallCommand(
      { name: missingVersionFixture.packageName, version: '9.9.9' },
      { fileSystem: missingVersionFixture.fileSystem, projectRoot: missingVersionFixture.projectRoot }
    );

    const integrityFixture = createHappyFixture({ integrity: 'sha256-deadbeef' });
    const integrityError = await runSceneInstallCommand(
      { name: integrityFixture.packageName, version: integrityFixture.version },
      { fileSystem: integrityFixture.fileSystem, projectRoot: integrityFixture.projectRoot }
    );

    const conflictTargetDir = path.join(baseFixture.projectRoot, baseFixture.packageName);
    const conflictFixture = createHappyFixture({
      existingPaths: [conflictTargetDir]
    });
    const conflictError = await runSceneInstallCommand(
      { name: conflictFixture.packageName, version: conflictFixture.version },
      { fileSystem: conflictFixture.fileSystem, projectRoot: conflictFixture.projectRoot }
    );

    expect(missingPackage).toBeNull();
    expect(missingVersion).toBeNull();
    expect(integrityError).toBeNull();
    expect(conflictError).toBeNull();
    expect(process.exitCode).toBe(1);
  });

  test('dry-run verifies and returns files without writing', async () => {
    const fixture = createHappyFixture();

    const payload = await runSceneInstallCommand(
      { name: fixture.packageName, dryRun: true },
      { fileSystem: fixture.fileSystem, projectRoot: fixture.projectRoot }
    );

    expect(payload.installed).toBe(false);
    expect(payload.dry_run).toBe(true);
    expect(payload.files).toEqual(['scene.yaml', 'docs/readme.md']);
    expect(fixture.fileSystem.writeFileSync).not.toHaveBeenCalled();
    expect(fixture.writtenFiles.size).toBe(0);
  });

  test('force mode overwrites an existing target directory', async () => {
    const targetDir = path.join('/project', 'demo-scene');
    const fixture = createHappyFixture({
      existingPaths: [targetDir]
    });

    const payload = await runSceneInstallCommand(
      { name: fixture.packageName, force: true },
      { fileSystem: fixture.fileSystem, projectRoot: fixture.projectRoot }
    );

    expect(payload.installed).toBe(true);
    expect(payload.overwritten).toBe(true);
    expect(fixture.fileSystem.writeFileSync).toHaveBeenCalled();
  });

  test('resolves latest version when version is omitted or set to latest', async () => {
    const projectRoot = '/project';
    const registry = '.sce/registry';
    const packageName = 'demo-scene';
    const latestBundle = createTarballBundle([
      { relativePath: 'scene.yaml', content: 'kind: scene\n' }
    ]);
    const oldBundle = createTarballBundle([
      { relativePath: 'scene.yaml', content: 'kind: old\n' }
    ]);
    const registryRoot = path.join(projectRoot, registry);
    const latestTarballPath = buildTarballPath(registryRoot, packageName, '1.2.0');
    const oldTarballPath = buildTarballPath(registryRoot, packageName, '1.1.0');
    const fixture = createInstallFs({
      projectRoot,
      registry,
      index: buildRegistryIndex({
        '1.1.0': {
          published_at: '2026-02-01T00:00:00.000Z',
          integrity: oldBundle.integrity,
          tarball: 'packages/demo-scene/1.1.0/demo-scene-1.1.0.tgz'
        },
        '1.2.0': {
          published_at: '2026-03-01T00:00:00.000Z',
          integrity: latestBundle.integrity,
          tarball: 'packages/demo-scene/1.2.0/demo-scene-1.2.0.tgz'
        }
      }, '1.2.0', packageName),
      tarballs: {
        [latestTarballPath]: latestBundle.tarball,
        [oldTarballPath]: oldBundle.tarball
      }
    });

    const omitted = await runSceneInstallCommand(
      { name: packageName, dryRun: true },
      { fileSystem: fixture.fileSystem, projectRoot }
    );
    const latest = await runSceneInstallCommand(
      { name: packageName, version: 'latest', dryRun: true },
      { fileSystem: fixture.fileSystem, projectRoot }
    );

    expect(omitted.package.version).toBe('1.2.0');
    expect(latest.package.version).toBe('1.2.0');
  });
});
