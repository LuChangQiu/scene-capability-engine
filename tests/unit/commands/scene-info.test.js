const {
  normalizeSceneInfoOptions,
  validateSceneInfoOptions,
  printSceneInfoSummary,
  runSceneInfoCommand
} = require('../../../lib/commands/scene');

describe('Scene info command helpers', () => {
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

  test('normalizeSceneInfoOptions trims values and applies defaults', () => {
    expect(normalizeSceneInfoOptions({
      name: ' demo ',
      registry: ' custom/registry ',
      json: true,
      versionsOnly: true
    })).toEqual({
      name: 'demo',
      registry: 'custom/registry',
      json: true,
      versionsOnly: true
    });

    expect(normalizeSceneInfoOptions()).toEqual({
      name: undefined,
      registry: '.sce/registry',
      json: false,
      versionsOnly: false
    });
  });

  test('validateSceneInfoOptions requires package name', () => {
    expect(validateSceneInfoOptions({})).toBe('--name is required');
    expect(validateSceneInfoOptions({ name: 'demo' })).toBeNull();
  });

  test('printSceneInfoSummary supports versions-only mode', () => {
    const logs = [];
    console.log = jest.fn((...args) => logs.push(args.join(' ')));

    printSceneInfoSummary(
      { versionsOnly: true, json: false },
      {
        name: 'demo',
        group: 'sce.scene',
        description: 'Demo package',
        latest: '1.1.0',
        versionCount: 2,
        versions: [
          { version: '1.1.0', publishedAt: '2026-03-12T10:00:00.000Z', integrity: 'sha256-new' },
          { version: '1.0.0', publishedAt: '2026-03-01T10:00:00.000Z', integrity: 'sha256-old' }
        ]
      }
    );

    expect(logs).toEqual([
      '1.1.0  2026-03-12T10:00:00.000Z',
      '1.0.0  2026-03-01T10:00:00.000Z'
    ]);
  });

  test('runSceneInfoCommand returns package metadata with versions sorted descending', async () => {
    const mockFs = {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockResolvedValue({
        packages: {
          'demo-scene': {
            name: 'demo-scene',
            group: 'sce.scene',
            description: 'Demo package',
            latest: '1.2.0',
            versions: {
              '1.0.0': {
                published_at: '2026-02-01T00:00:00.000Z',
                integrity: 'sha256-old'
              },
              '1.2.0': {
                published_at: '2026-03-01T00:00:00.000Z',
                integrity: 'sha256-new'
              },
              '1.1.0': {
                published_at: '2026-02-15T00:00:00.000Z',
                integrity: 'sha256-mid',
                deprecated: 'use 1.2.0'
              }
            }
          }
        }
      })
    };

    const result = await runSceneInfoCommand(
      { name: 'demo-scene' },
      { fileSystem: mockFs, projectRoot: '/project' }
    );

    expect(result).toEqual({
      success: true,
      name: 'demo-scene',
      group: 'sce.scene',
      description: 'Demo package',
      latest: '1.2.0',
      versionCount: 3,
      versions: [
        {
          version: '1.2.0',
          publishedAt: '2026-03-01T00:00:00.000Z',
          integrity: 'sha256-new',
          deprecated: undefined
        },
        {
          version: '1.1.0',
          publishedAt: '2026-02-15T00:00:00.000Z',
          integrity: 'sha256-mid',
          deprecated: 'use 1.2.0'
        },
        {
          version: '1.0.0',
          publishedAt: '2026-02-01T00:00:00.000Z',
          integrity: 'sha256-old',
          deprecated: undefined
        }
      ]
    });
    expect(process.exitCode).toBeUndefined();
  });

  test('runSceneInfoCommand reports missing packages through exitCode', async () => {
    const mockFs = {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockResolvedValue({ packages: {} })
    };

    const result = await runSceneInfoCommand(
      { name: 'missing-scene' },
      { fileSystem: mockFs, projectRoot: '/project' }
    );

    expect(result).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalled();
  });
});
