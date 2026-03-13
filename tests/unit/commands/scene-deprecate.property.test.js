const fc = require('fast-check');

const {
  runSceneDeprecateCommand,
  runSceneInfoCommand
} = require('../../../lib/commands/scene');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildRegistryIndex(versions) {
  const versionKeys = Object.keys(versions);
  const latest = versionKeys.slice().sort((left, right) => {
    const leftParts = left.split('.').map(Number);
    const rightParts = right.split('.').map(Number);
    for (let index = 0; index < 3; index += 1) {
      if (leftParts[index] !== rightParts[index]) {
        return rightParts[index] - leftParts[index];
      }
    }
    return 0;
  })[0];

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

const semverArb = fc
  .tuple(
    fc.integer({ min: 0, max: 4 }),
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 })
  )
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

const messageArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,18}$/);

const cleanVersionEntryArb = fc.record({
  published_at: fc.integer({ min: 946684800000, max: 4102444800000 })
    .map((value) => new Date(value).toISOString()),
  integrity: fc.stringMatching(/^sha256-[a-z0-9]{8}$/)
});

const deprecatedVersionEntryArb = fc
  .record({
    published_at: fc.integer({ min: 946684800000, max: 4102444800000 })
      .map((value) => new Date(value).toISOString()),
    integrity: fc.stringMatching(/^sha256-[a-z0-9]{8}$/),
    deprecated: fc.option(messageArb, { nil: undefined })
  })
  .map((entry) => {
    if (entry.deprecated === undefined) {
      return {
        published_at: entry.published_at,
        integrity: entry.integrity
      };
    }
    return entry;
  });

const cleanVersionsArb = fc.dictionary(semverArb, cleanVersionEntryArb, {
  minKeys: 1,
  maxKeys: 6
});

const mixedVersionsArb = fc.dictionary(semverArb, deprecatedVersionEntryArb, {
  minKeys: 1,
  maxKeys: 6
});

const deprecateCaseArb = cleanVersionsArb.chain((versions) => {
  const versionKeys = Object.keys(versions);
  return fc.record({
    versions: fc.constant(versions),
    message: messageArb,
    targetVersion: fc.option(fc.constantFrom(...versionKeys), { nil: undefined })
  });
});

describe('Scene deprecate properties', () => {
  let originalLog;
  let originalError;

  beforeEach(() => {
    originalLog = console.log;
    originalError = console.error;
    console.log = jest.fn();
    console.error = jest.fn();
    delete process.exitCode;
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  test('deprecate sets the marker on targeted versions', async () => {
    await fc.assert(
      fc.asyncProperty(deprecateCaseArb, async ({ versions, message, targetVersion }) => {
        const liveIndex = buildRegistryIndex(clone(versions));
        let savedIndex = null;
        const mockFs = {
          pathExists: jest.fn().mockResolvedValue(true),
          readJson: jest.fn().mockResolvedValue(liveIndex),
          writeJson: jest.fn(async (_targetPath, nextIndex) => {
            savedIndex = clone(nextIndex);
          })
        };

        const result = await runSceneDeprecateCommand(
          { name: 'demo-scene', version: targetVersion, message },
          { fileSystem: mockFs, projectRoot: '/project' }
        );

        expect(result).not.toBeNull();
        expect(savedIndex).not.toBeNull();

        const expectedTargets = targetVersion ? [targetVersion] : Object.keys(versions);
        for (const version of Object.keys(versions)) {
          const actual = savedIndex.packages['demo-scene'].versions[version].deprecated;
          if (expectedTargets.includes(version)) {
            expect(actual).toBe(message);
          } else {
            expect(actual).toBeUndefined();
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  test('deprecate then undo restores the original version state', async () => {
    await fc.assert(
      fc.asyncProperty(deprecateCaseArb, async ({ versions, message, targetVersion }) => {
        const originalVersions = clone(versions);
        const firstIndex = buildRegistryIndex(clone(versions));
        let deprecatedIndex = null;
        const deprecateFs = {
          pathExists: jest.fn().mockResolvedValue(true),
          readJson: jest.fn().mockResolvedValue(firstIndex),
          writeJson: jest.fn(async (_targetPath, nextIndex) => {
            deprecatedIndex = clone(nextIndex);
          })
        };

        await runSceneDeprecateCommand(
          { name: 'demo-scene', version: targetVersion, message },
          { fileSystem: deprecateFs, projectRoot: '/project' }
        );

        const secondIndex = clone(deprecatedIndex);
        let restoredIndex = null;
        const undoFs = {
          pathExists: jest.fn().mockResolvedValue(true),
          readJson: jest.fn().mockResolvedValue(secondIndex),
          writeJson: jest.fn(async (_targetPath, nextIndex) => {
            restoredIndex = clone(nextIndex);
          })
        };

        await runSceneDeprecateCommand(
          { name: 'demo-scene', version: targetVersion, undo: true },
          { fileSystem: undoFs, projectRoot: '/project' }
        );

        expect(restoredIndex.packages['demo-scene'].versions).toEqual(originalVersions);
      }),
      { numRuns: 100 }
    );
  });

  test('invalid package or version targets return errors without modifying the registry', async () => {
    await fc.assert(
      fc.asyncProperty(
        cleanVersionsArb.chain((versions) =>
          fc.record({
            versions: fc.constant(versions),
            missingPackage: fc.boolean(),
            missingVersion: semverArb.filter((candidate) => !Object.prototype.hasOwnProperty.call(versions, candidate)),
            message: messageArb
          })
        ),
        async ({ versions, missingPackage, missingVersion, message }) => {
          const liveIndex = buildRegistryIndex(clone(versions));
          const snapshot = clone(liveIndex);
          const mockFs = {
            pathExists: jest.fn().mockResolvedValue(true),
            readJson: jest.fn().mockResolvedValue(liveIndex),
            writeJson: jest.fn().mockResolvedValue(undefined)
          };

          const result = await runSceneDeprecateCommand(
            missingPackage
              ? { name: 'missing-scene', message }
              : { name: 'demo-scene', version: missingVersion, message },
            { fileSystem: mockFs, projectRoot: '/project' }
          );

          expect(result).toBeNull();
          expect(liveIndex).toEqual(snapshot);
          expect(mockFs.writeJson).not.toHaveBeenCalled();
          expect(process.exitCode).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('deprecating all versions reports the exact affected count', async () => {
    await fc.assert(
      fc.asyncProperty(cleanVersionsArb, messageArb, async (versions, message) => {
        const liveIndex = buildRegistryIndex(clone(versions));
        let savedIndex = null;
        const mockFs = {
          pathExists: jest.fn().mockResolvedValue(true),
          readJson: jest.fn().mockResolvedValue(liveIndex),
          writeJson: jest.fn(async (_targetPath, nextIndex) => {
            savedIndex = clone(nextIndex);
          })
        };

        const result = await runSceneDeprecateCommand(
          { name: 'demo-scene', message },
          { fileSystem: mockFs, projectRoot: '/project' }
        );

        expect(result.versions).toHaveLength(Object.keys(versions).length);
        expect(Object.values(savedIndex.packages['demo-scene'].versions).every((entry) => entry.deprecated === message))
          .toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test('info output includes deprecation data for deprecated versions', async () => {
    await fc.assert(
      fc.asyncProperty(mixedVersionsArb, async (versions) => {
        const mockFs = {
          pathExists: jest.fn().mockResolvedValue(true),
          readJson: jest.fn().mockResolvedValue(buildRegistryIndex(clone(versions)))
        };

        const result = await runSceneInfoCommand(
          { name: 'demo-scene', json: true },
          { fileSystem: mockFs, projectRoot: '/project' }
        );

        const payloadByVersion = Object.fromEntries(
          result.versions.map((entry) => [entry.version, entry.deprecated])
        );

        for (const version of Object.keys(versions)) {
          expect(payloadByVersion[version]).toBe(versions[version].deprecated || undefined);
        }
      }),
      { numRuns: 100 }
    );
  });
});
