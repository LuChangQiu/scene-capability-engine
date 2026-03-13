const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const {
  normalizeSceneDeprecateOptions,
  validateSceneDeprecateOptions,
  printSceneDeprecateSummary,
  printSceneInfoSummary,
  runSceneDeprecateCommand,
  runSceneInfoCommand,
  runSceneInstallCommand,
  createTarBuffer
} = require('../../../lib/commands/scene');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildRegistryIndex(versions, latest = '1.2.0') {
  return {
    apiVersion: 'sce.scene.registry/v0.1',
    packages: {
      'demo-scene': {
        name: 'demo-scene',
        group: 'sce.scene',
        description: 'Demo package',
        latest,
        versions
      }
    }
  };
}

describe('Scene deprecate command helpers', () => {
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

  test('normalizeSceneDeprecateOptions trims values and applies defaults', () => {
    expect(normalizeSceneDeprecateOptions({
      name: ' demo-scene ',
      version: ' 1.2.0 ',
      message: ' superseded ',
      registry: ' custom/registry ',
      json: true,
      undo: true
    })).toEqual({
      name: 'demo-scene',
      version: '1.2.0',
      message: 'superseded',
      registry: 'custom/registry',
      json: true,
      undo: true
    });

    expect(normalizeSceneDeprecateOptions()).toEqual({
      name: undefined,
      version: undefined,
      message: undefined,
      registry: '.sce/registry',
      json: false,
      undo: false
    });
  });

  test('validateSceneDeprecateOptions enforces name and message requirements', () => {
    expect(validateSceneDeprecateOptions({})).toBe('--name is required');
    expect(validateSceneDeprecateOptions({ name: 'demo-scene' }))
      .toBe('--message is required (unless --undo is used)');
    expect(validateSceneDeprecateOptions({ name: 'demo-scene', undo: true })).toBeNull();
    expect(validateSceneDeprecateOptions({ name: 'demo-scene', message: 'superseded' })).toBeNull();
  });

  test('printSceneDeprecateSummary outputs JSON payload when requested', () => {
    const logs = [];
    console.log = jest.fn((value) => logs.push(value));

    printSceneDeprecateSummary(
      { json: true },
      {
        success: true,
        action: 'deprecate',
        package: 'demo-scene',
        versions: ['1.2.0'],
        message: 'superseded',
        registry: '.sce/registry'
      }
    );

    expect(JSON.parse(logs[0])).toEqual({
      success: true,
      action: 'deprecate',
      package: 'demo-scene',
      versions: ['1.2.0'],
      message: 'superseded',
      registry: '.sce/registry'
    });
  });

  test('runSceneDeprecateCommand deprecates a single version', async () => {
    const liveIndex = buildRegistryIndex({
      '1.0.0': {
        published_at: '2026-03-01T00:00:00.000Z',
        integrity: 'sha256-old'
      },
      '1.2.0': {
        published_at: '2026-03-12T00:00:00.000Z',
        integrity: 'sha256-new'
      }
    });
    const mockFs = {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockResolvedValue(liveIndex),
      writeJson: jest.fn().mockResolvedValue(undefined)
    };

    const result = await runSceneDeprecateCommand(
      { name: 'demo-scene', version: '1.2.0', message: 'use 2.0.0' },
      { fileSystem: mockFs, projectRoot: '/project' }
    );

    expect(result).toEqual({
      success: true,
      action: 'deprecate',
      package: 'demo-scene',
      versions: ['1.2.0'],
      message: 'use 2.0.0',
      registry: '.sce/registry'
    });
    expect(liveIndex.packages['demo-scene'].versions['1.2.0'].deprecated).toBe('use 2.0.0');
    expect(liveIndex.packages['demo-scene'].versions['1.0.0'].deprecated).toBeUndefined();
    expect(mockFs.writeJson).toHaveBeenCalledWith(
      path.join('/project', '.sce/registry', 'registry-index.json'),
      liveIndex,
      { spaces: 2 }
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('runSceneDeprecateCommand deprecates all versions when version is omitted', async () => {
    const liveIndex = buildRegistryIndex({
      '1.0.0': {
        published_at: '2026-03-01T00:00:00.000Z',
        integrity: 'sha256-old'
      },
      '1.1.0': {
        published_at: '2026-03-05T00:00:00.000Z',
        integrity: 'sha256-mid'
      },
      '1.2.0': {
        published_at: '2026-03-12T00:00:00.000Z',
        integrity: 'sha256-new'
      }
    });
    const mockFs = {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockResolvedValue(liveIndex),
      writeJson: jest.fn().mockResolvedValue(undefined)
    };

    const result = await runSceneDeprecateCommand(
      { name: 'demo-scene', message: 'package retired' },
      { fileSystem: mockFs, projectRoot: '/project' }
    );

    expect(result.versions.sort()).toEqual(['1.0.0', '1.1.0', '1.2.0']);
    expect(result.message).toBe('package retired');
    expect(Object.values(liveIndex.packages['demo-scene'].versions).every((entry) => entry.deprecated === 'package retired'))
      .toBe(true);
  });

  test('runSceneDeprecateCommand undoes a single deprecated version', async () => {
    const liveIndex = buildRegistryIndex({
      '1.0.0': {
        published_at: '2026-03-01T00:00:00.000Z',
        integrity: 'sha256-old',
        deprecated: 'old warning'
      },
      '1.2.0': {
        published_at: '2026-03-12T00:00:00.000Z',
        integrity: 'sha256-new',
        deprecated: 'use 2.0.0'
      }
    });
    const mockFs = {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockResolvedValue(liveIndex),
      writeJson: jest.fn().mockResolvedValue(undefined)
    };

    const result = await runSceneDeprecateCommand(
      { name: 'demo-scene', version: '1.2.0', undo: true },
      { fileSystem: mockFs, projectRoot: '/project' }
    );

    expect(result).toEqual({
      success: true,
      action: 'undeprecate',
      package: 'demo-scene',
      versions: ['1.2.0'],
      message: null,
      registry: '.sce/registry'
    });
    expect(liveIndex.packages['demo-scene'].versions['1.2.0'].deprecated).toBeUndefined();
    expect(liveIndex.packages['demo-scene'].versions['1.0.0'].deprecated).toBe('old warning');
  });

  test('runSceneDeprecateCommand undoes all deprecated versions when version is omitted', async () => {
    const liveIndex = buildRegistryIndex({
      '1.0.0': {
        published_at: '2026-03-01T00:00:00.000Z',
        integrity: 'sha256-old',
        deprecated: 'old warning'
      },
      '1.2.0': {
        published_at: '2026-03-12T00:00:00.000Z',
        integrity: 'sha256-new',
        deprecated: 'use 2.0.0'
      }
    });
    const mockFs = {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockResolvedValue(liveIndex),
      writeJson: jest.fn().mockResolvedValue(undefined)
    };

    const result = await runSceneDeprecateCommand(
      { name: 'demo-scene', undo: true },
      { fileSystem: mockFs, projectRoot: '/project' }
    );

    expect(result.versions.sort()).toEqual(['1.0.0', '1.2.0']);
    expect(result.message).toBeNull();
    expect(Object.values(liveIndex.packages['demo-scene'].versions).every((entry) => entry.deprecated === undefined))
      .toBe(true);
  });

  test('runSceneDeprecateCommand reports missing packages without writing the registry', async () => {
    const liveIndex = { apiVersion: 'sce.scene.registry/v0.1', packages: {} };
    const snapshot = clone(liveIndex);
    const mockFs = {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockResolvedValue(liveIndex),
      writeJson: jest.fn().mockResolvedValue(undefined)
    };

    const result = await runSceneDeprecateCommand(
      { name: 'missing-scene', message: 'superseded' },
      { fileSystem: mockFs, projectRoot: '/project' }
    );

    expect(result).toBeNull();
    expect(liveIndex).toEqual(snapshot);
    expect(mockFs.writeJson).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalled();
  });

  test('runSceneDeprecateCommand reports missing versions without writing the registry', async () => {
    const liveIndex = buildRegistryIndex({
      '1.0.0': {
        published_at: '2026-03-01T00:00:00.000Z',
        integrity: 'sha256-old'
      }
    }, '1.0.0');
    const snapshot = clone(liveIndex);
    const mockFs = {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockResolvedValue(liveIndex),
      writeJson: jest.fn().mockResolvedValue(undefined)
    };

    const result = await runSceneDeprecateCommand(
      { name: 'demo-scene', version: '9.9.9', message: 'superseded' },
      { fileSystem: mockFs, projectRoot: '/project' }
    );

    expect(result).toBeNull();
    expect(liveIndex).toEqual(snapshot);
    expect(mockFs.writeJson).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalled();
  });

  test('runSceneDeprecateCommand reports validation failures through exitCode', async () => {
    const result = await runSceneDeprecateCommand({ name: 'demo-scene' });

    expect(result).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalled();
  });

  test('runSceneInstallCommand warns when installing a deprecated version and still returns a payload', async () => {
    const logs = [];
    console.log = jest.fn((...args) => logs.push(args.join(' ')));

    const tarballBuffer = zlib.gzipSync(createTarBuffer([
      { relativePath: 'scene.yaml', content: Buffer.from('kind: scene', 'utf8') }
    ]));
    const integrity = `sha256-${crypto.createHash('sha256').update(tarballBuffer).digest('hex')}`;
    const mockFs = {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockResolvedValue(buildRegistryIndex({
        '1.1.0': {
          published_at: '2026-03-05T00:00:00.000Z',
          integrity,
          deprecated: 'use 2.0.0'
        }
      }, '1.1.0')),
      readFile: jest.fn().mockResolvedValue(tarballBuffer)
    };

    const result = await runSceneInstallCommand(
      { name: 'demo-scene', version: '1.1.0', dryRun: true },
      { fileSystem: mockFs, projectRoot: '/project' }
    );

    expect(result).not.toBeNull();
    expect(result.installed).toBe(false);
    expect(result.dry_run).toBe(true);
    expect(result.package).toEqual({ name: 'demo-scene', version: '1.1.0' });
    expect(logs.some((line) => line.includes('WARNING: demo-scene@1.1.0 is deprecated: use 2.0.0')))
      .toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  test('runSceneInfoCommand includes deprecated fields in the payload', async () => {
    const mockFs = {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockResolvedValue(buildRegistryIndex({
        '1.0.0': {
          published_at: '2026-03-01T00:00:00.000Z',
          integrity: 'sha256-old'
        },
        '1.2.0': {
          published_at: '2026-03-12T00:00:00.000Z',
          integrity: 'sha256-new',
          deprecated: 'use 2.0.0'
        }
      }))
    };

    const result = await runSceneInfoCommand(
      { name: 'demo-scene', json: true },
      { fileSystem: mockFs, projectRoot: '/project' }
    );

    expect(result.versions).toEqual([
      {
        version: '1.2.0',
        publishedAt: '2026-03-12T00:00:00.000Z',
        integrity: 'sha256-new',
        deprecated: 'use 2.0.0'
      },
      {
        version: '1.0.0',
        publishedAt: '2026-03-01T00:00:00.000Z',
        integrity: 'sha256-old',
        deprecated: undefined
      }
    ]);
  });

  test('printSceneInfoSummary appends a deprecated marker in human-readable output', () => {
    const logs = [];
    console.log = jest.fn((...args) => logs.push(args.join(' ')));

    printSceneInfoSummary(
      { json: false, versionsOnly: false },
      {
        name: 'demo-scene',
        group: 'sce.scene',
        description: 'Demo package',
        latest: '1.2.0',
        versionCount: 2,
        versions: [
          {
            version: '1.2.0',
            publishedAt: '2026-03-12T00:00:00.000Z',
            integrity: 'sha256-new',
            deprecated: 'use 2.0.0'
          },
          {
            version: '1.0.0',
            publishedAt: '2026-03-01T00:00:00.000Z',
            integrity: 'sha256-old',
            deprecated: undefined
          }
        ]
      }
    );

    expect(logs.some((line) => line.includes('[DEPRECATED: use 2.0.0]'))).toBe(true);
  });
});
