const fc = require('fast-check');

const { runSceneLockCommand } = require('../../../lib/commands/scene');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createLockFs(index) {
  const liveIndex = clone(index);
  return {
    liveIndex,
    fileSystem: {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockResolvedValue(liveIndex),
      writeJson: jest.fn().mockResolvedValue(undefined)
    }
  };
}

const packageNameArb = fc.stringMatching(/^pkg-[a-z0-9]{1,6}$/);
const versionArb = fc
  .tuple(
    fc.integer({ min: 0, max: 3 }),
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 })
  )
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

describe('Scene lock properties', () => {
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

  test('set then ls returns the locked version', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, versionArb, async (packageName, version) => {
        const ctx = createLockFs({ packages: { [packageName]: { versions: { [version]: {} } } } });
        await runSceneLockCommand(
          { action: 'set', name: packageName, version },
          { fileSystem: ctx.fileSystem, projectRoot: '/project' }
        );
        const listed = await runSceneLockCommand(
          { action: 'ls', name: packageName },
          { fileSystem: ctx.fileSystem, projectRoot: '/project' }
        );
        expect(listed.lockedVersions).toEqual([version]);
      }),
      { numRuns: 100 }
    );
  });

  test('set then rm removes the lock', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, versionArb, async (packageName, version) => {
        const ctx = createLockFs({ packages: { [packageName]: { versions: { [version]: {} } } } });
        await runSceneLockCommand(
          { action: 'set', name: packageName, version },
          { fileSystem: ctx.fileSystem, projectRoot: '/project' }
        );
        await runSceneLockCommand(
          { action: 'rm', name: packageName, version },
          { fileSystem: ctx.fileSystem, projectRoot: '/project' }
        );
        expect(ctx.liveIndex.packages[packageName].versions[version].locked).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  test('missing packages fail across set rm and ls', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, versionArb, async (packageName, version) => {
        for (const options of [
          { action: 'set', name: packageName, version },
          { action: 'rm', name: packageName, version },
          { action: 'ls', name: packageName }
        ]) {
          delete process.exitCode;
          const ctx = createLockFs({ packages: {} });
          const result = await runSceneLockCommand(options, { fileSystem: ctx.fileSystem, projectRoot: '/project' });
          expect(result).toBeNull();
          expect(process.exitCode).toBe(1);
        }
      }),
      { numRuns: 100 }
    );
  });

  test('missing versions fail for set and rm', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, versionArb, async (packageName, version) => {
        for (const action of ['set', 'rm']) {
          delete process.exitCode;
          const ctx = createLockFs({ packages: { [packageName]: { versions: {} } } });
          const result = await runSceneLockCommand(
            { action, name: packageName, version },
            { fileSystem: ctx.fileSystem, projectRoot: '/project' }
          );
          expect(result).toBeNull();
          expect(process.exitCode).toBe(1);
        }
      }),
      { numRuns: 100 }
    );
  });

  test('ls filtering returns exactly the locked versions', async () => {
    await fc.assert(
      fc.asyncProperty(
        packageNameArb,
        fc.uniqueArray(fc.record({
          version: versionArb,
          locked: fc.boolean()
        }), { selector: (entry) => entry.version, maxLength: 8 }),
        async (packageName, versions) => {
          const versionMap = Object.fromEntries(
            versions.map((entry) => [entry.version, entry.locked ? { locked: true } : {}])
          );
          const ctx = createLockFs({ packages: { [packageName]: { versions: versionMap } } });
          const result = await runSceneLockCommand(
            { action: 'ls', name: packageName },
            { fileSystem: ctx.fileSystem, projectRoot: '/project' }
          );
          const expected = versions.filter((entry) => entry.locked).map((entry) => entry.version).sort();
          expect(result.lockedVersions.slice().sort()).toEqual(expected);
        }
      ),
      { numRuns: 100 }
    );
  });
});
