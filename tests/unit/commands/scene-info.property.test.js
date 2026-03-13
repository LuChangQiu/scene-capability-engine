const fc = require('fast-check');

const { runSceneInfoCommand } = require('../../../lib/commands/scene');

const semverArb = fc
  .tuple(
    fc.integer({ min: 0, max: 5 }),
    fc.integer({ min: 0, max: 10 }),
    fc.integer({ min: 0, max: 10 })
  )
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

const versionDetailsArb = fc.record({
  published_at: fc.integer({ min: 946684800000, max: 4102444800000 })
    .map((value) => new Date(value).toISOString()),
  integrity: fc.stringMatching(/^sha256-[a-z0-9]{8}$/)
});

const versionsArb = fc.dictionary(semverArb, versionDetailsArb, {
  minKeys: 1,
  maxKeys: 8
});

describe('Scene info properties', () => {
  let originalLog;

  beforeEach(() => {
    originalLog = console.log;
    console.log = jest.fn();
  });

  afterEach(() => {
    console.log = originalLog;
  });

  test('runSceneInfoCommand returns exactly the versions present in the registry entry', async () => {
    await fc.assert(
      fc.asyncProperty(versionsArb, async (versions) => {
        const mockFs = {
          pathExists: jest.fn().mockResolvedValue(true),
          readJson: jest.fn().mockResolvedValue({
            packages: {
              'demo-scene': {
                name: 'demo-scene',
                group: 'sce.scene',
                description: 'Demo package',
                versions
              }
            }
          })
        };

        const result = await runSceneInfoCommand(
          { name: 'demo-scene', json: true },
          { fileSystem: mockFs, projectRoot: '/project' }
        );

        expect(result).not.toBeNull();
        expect(result.versionCount).toBe(Object.keys(versions).length);
        expect(result.versions.map((entry) => entry.version).sort())
          .toEqual(Object.keys(versions).sort());
      }),
      { numRuns: 100 }
    );
  });
});
