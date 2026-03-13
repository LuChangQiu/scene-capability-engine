const {
  normalizeSceneStatsOptions,
  validateSceneStatsOptions,
  runSceneStatsCommand
} = require('../../../lib/commands/scene');

describe('Scene stats command', () => {
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

  test('normalizeSceneStatsOptions returns defaults and validateSceneStatsOptions returns null', () => {
    expect(normalizeSceneStatsOptions()).toEqual({
      registry: '.sce/registry',
      json: false
    });
    expect(normalizeSceneStatsOptions({ registry: ' ./custom ', json: true })).toEqual({
      registry: './custom',
      json: true
    });
    expect(validateSceneStatsOptions({})).toBeNull();
  });

  test('runSceneStatsCommand computes aggregate counts for a populated registry', async () => {
    const index = {
      apiVersion: 'sce.scene.registry/v0.1',
      packages: {
        alpha: {
          owner: 'team-a',
          tags: { stable: '1.0.0', latest: '1.1.0' },
          versions: {
            '1.0.0': { published_at: '2026-03-10T00:00:00.000Z' },
            '1.1.0': { published_at: '2026-03-11T00:00:00.000Z' }
          }
        },
        beta: {
          owner: '',
          deprecated: true,
          versions: {
            '2.0.0': { published_at: '2026-03-12T09:00:00.000Z' }
          }
        }
      }
    };
    const fileSystem = {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockResolvedValue(index)
    };

    const payload = await runSceneStatsCommand({ json: true }, {
      projectRoot: '/workspace',
      fileSystem
    });

    expect(payload).toEqual({
      success: true,
      totalPackages: 2,
      totalVersions: 3,
      totalTags: 2,
      packagesWithOwner: 1,
      packagesWithoutOwner: 1,
      deprecatedPackages: 1,
      mostRecentlyPublished: {
        package: 'beta',
        version: '2.0.0',
        publishedAt: '2026-03-12T09:00:00.000Z'
      },
      registry: '.sce/registry'
    });
    expect(JSON.parse(console.log.mock.calls[0][0])).toEqual(payload);
  });

  test('runSceneStatsCommand returns zeros for an empty registry', async () => {
    const fileSystem = {
      pathExists: jest.fn().mockResolvedValue(false),
      readJson: jest.fn()
    };

    const payload = await runSceneStatsCommand({}, {
      projectRoot: '/workspace',
      fileSystem
    });

    expect(payload).toEqual({
      success: true,
      totalPackages: 0,
      totalVersions: 0,
      totalTags: 0,
      packagesWithOwner: 0,
      packagesWithoutOwner: 0,
      deprecatedPackages: 0,
      mostRecentlyPublished: null,
      registry: '.sce/registry'
    });
  });

  test('runSceneStatsCommand treats missing tags as zero and empty owner as without owner', async () => {
    const index = {
      apiVersion: 'sce.scene.registry/v0.1',
      packages: {
        gamma: {
          owner: '   ',
          versions: {
            '1.0.0': { published_at: '2026-03-11T00:00:00.000Z' }
          }
        }
      }
    };
    const fileSystem = {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockResolvedValue(index)
    };

    const payload = await runSceneStatsCommand({ json: true }, {
      projectRoot: '/workspace',
      fileSystem
    });

    expect(payload.totalTags).toBe(0);
    expect(payload.packagesWithOwner).toBe(0);
    expect(payload.packagesWithoutOwner).toBe(1);
  });

  test('runSceneStatsCommand returns null and sets exit code when registry cannot be read', async () => {
    const fileSystem = {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockRejectedValue(new Error('broken registry'))
    };

    const payload = await runSceneStatsCommand({}, {
      projectRoot: '/workspace',
      fileSystem
    });

    expect(payload).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(console.error.mock.calls.join(' ')).toContain('broken registry');
  });
});
