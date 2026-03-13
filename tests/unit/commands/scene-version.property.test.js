'use strict';

const path = require('path');
const semver = require('semver');
const fc = require('fast-check');

const {
  normalizeSceneVersionOptions,
  validateSceneVersionOptions,
  runSceneVersionCommand
} = require('../../../lib/commands/scene');
const {
  createValidContract,
  clone
} = require('../utils/scene-package-fixture');

function createVersionFs(version) {
  const packageData = createValidContract({
    metadata: {
      name: 'demo-scene',
      version
    }
  });
  const packageJsonPath = path.join('/workspace/pkg', 'scene-package.json');
  let writtenValue = null;

  return {
    packageJsonPath,
    getWrittenValue: () => writtenValue,
    fileSystem: {
      readJson: jest.fn(async () => clone(packageData)),
      writeJson: jest.fn(async (_targetPath, nextValue) => {
        writtenValue = clone(nextValue);
      })
    }
  };
}

const semverArb = fc
  .tuple(
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 })
  )
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

describe('Scene version properties', () => {
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

  test('semver increment correctness matches semver.inc for major/minor/patch', async () => {
    await fc.assert(
      fc.asyncProperty(
        semverArb,
        fc.constantFrom('major', 'minor', 'patch'),
        async (currentVersion, bump) => {
          const fixture = createVersionFs(currentVersion);

          const payload = await runSceneVersionCommand(
            { package: '/workspace/pkg', bump },
            { fileSystem: fixture.fileSystem, projectRoot: '/workspace' }
          );

          expect(payload.newVersion).toBe(semver.inc(currentVersion, bump));
        }
      ),
      { numRuns: 100 }
    );
  });

  test('explicit version ordering is enforced exactly by semver.gt', async () => {
    await fc.assert(
      fc.asyncProperty(semverArb, semverArb, async (currentVersion, explicitVersion) => {
        const fixture = createVersionFs(currentVersion);

        const payload = await runSceneVersionCommand(
          { package: '/workspace/pkg', bump: explicitVersion },
          { fileSystem: fixture.fileSystem, projectRoot: '/workspace' }
        );

        if (semver.gt(explicitVersion, currentVersion)) {
          expect(payload.newVersion).toBe(explicitVersion);
        } else {
          expect(payload).toBeNull();
          expect(process.exitCode).toBe(1);
          delete process.exitCode;
        }
      }),
      { numRuns: 100 }
    );
  });

  test('version bump writes round-trip the computed metadata.version', async () => {
    await fc.assert(
      fc.asyncProperty(
        semverArb,
        fc.constantFrom('major', 'minor', 'patch'),
        async (currentVersion, bump) => {
          const fixture = createVersionFs(currentVersion);

          const payload = await runSceneVersionCommand(
            { package: '/workspace/pkg', bump },
            { fileSystem: fixture.fileSystem, projectRoot: '/workspace' }
          );

          expect(fixture.getWrittenValue().metadata.version).toBe(payload.newVersion);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('validation rejects non-semver values that are not supported bump types', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((value) => {
          const normalized = value.trim().toLowerCase();
          return normalized.length > 0
            && !['major', 'minor', 'patch'].includes(normalized)
            && !semver.valid(normalized);
        }),
        (invalidBump) => {
          const normalized = normalizeSceneVersionOptions({ bump: invalidBump });
          expect(validateSceneVersionOptions(normalized)).toContain('is not a valid bump type or semver version');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('json output always includes the required version bump fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        semverArb,
        fc.constantFrom('major', 'minor', 'patch'),
        fc.boolean(),
        async (currentVersion, bump, dryRun) => {
          const logs = [];
          console.log = jest.fn((value) => logs.push(value));
          const fixture = createVersionFs(currentVersion);

          const payload = await runSceneVersionCommand(
            { package: '/workspace/pkg', bump, json: true, dryRun },
            { fileSystem: fixture.fileSystem, projectRoot: '/workspace' }
          );
          const parsed = JSON.parse(logs[0]);

          expect(Object.keys(parsed).sort()).toEqual([
            'dryRun',
            'name',
            'newVersion',
            'oldVersion',
            'packageDir',
            'success'
          ]);
          expect(parsed).toEqual(payload);
        }
      ),
      { numRuns: 100 }
    );
  });
});
