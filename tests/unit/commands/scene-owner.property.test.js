const fc = require('fast-check');

const { runSceneOwnerCommand } = require('../../../lib/commands/scene');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createOwnerFs(index) {
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
const ownerArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9-]{0,10}$/);

describe('Scene owner properties', () => {
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

  test('set then show returns the same owner', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, ownerArb, async (packageName, owner) => {
        const ctx = createOwnerFs({ packages: { [packageName]: { versions: {} } } });
        await runSceneOwnerCommand(
          { action: 'set', name: packageName, owner },
          { fileSystem: ctx.fileSystem, projectRoot: '/project' }
        );
        const shown = await runSceneOwnerCommand(
          { action: 'show', name: packageName },
          { fileSystem: ctx.fileSystem, projectRoot: '/project' }
        );
        expect(shown.owner).toBe(owner);
      }),
      { numRuns: 100 }
    );
  });

  test('missing packages fail across set show and transfer', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, ownerArb, ownerArb, async (packageName, from, to) => {
        for (const options of [
          { action: 'set', name: packageName, owner: from },
          { action: 'show', name: packageName },
          { action: 'transfer', name: packageName, from, to }
        ]) {
          delete process.exitCode;
          const ctx = createOwnerFs({ packages: {} });
          const result = await runSceneOwnerCommand(options, { fileSystem: ctx.fileSystem, projectRoot: '/project' });
          expect(result).toBeNull();
          expect(process.exitCode).toBe(1);
        }
      }),
      { numRuns: 100 }
    );
  });

  test('list filtering matches exactly the packages owned by the requested owner', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.record({
          packageName: packageNameArb,
          owner: ownerArb
        }), { selector: (entry) => entry.packageName, maxLength: 8 }),
        ownerArb,
        async (entries, queryOwner) => {
          const packages = Object.fromEntries(entries.map((entry) => [entry.packageName, { owner: entry.owner, versions: {} }]));
          const ctx = createOwnerFs({ packages });
          const result = await runSceneOwnerCommand(
            { action: 'list', owner: queryOwner.toUpperCase() },
            { fileSystem: ctx.fileSystem, projectRoot: '/project' }
          );
          const expected = entries
            .filter((entry) => entry.owner.toLowerCase() === queryOwner.toLowerCase())
            .map((entry) => entry.packageName)
            .sort();
          expect(result.packages.slice().sort()).toEqual(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('transfer updates owner when from matches', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, ownerArb, ownerArb, async (packageName, from, to) => {
        const ctx = createOwnerFs({ packages: { [packageName]: { owner: from, versions: {} } } });
        const result = await runSceneOwnerCommand(
          { action: 'transfer', name: packageName, from: from.toUpperCase(), to },
          { fileSystem: ctx.fileSystem, projectRoot: '/project' }
        );
        expect(result).not.toBeNull();
        expect(ctx.liveIndex.packages[packageName].owner).toBe(to);
      }),
      { numRuns: 100 }
    );
  });

  test('transfer rejects mismatched from owner', async () => {
    await fc.assert(
      fc.asyncProperty(
        packageNameArb,
        ownerArb,
        ownerArb.filter((candidate) => candidate.toLowerCase() !== 'owner'),
        async (packageName, to, mismatchSeed) => {
          const currentOwner = 'Owner';
          const mismatch = mismatchSeed.toLowerCase() === currentOwner.toLowerCase() ? `${mismatchSeed}x` : mismatchSeed;
          const ctx = createOwnerFs({ packages: { [packageName]: { owner: currentOwner, versions: {} } } });
          delete process.exitCode;
          const result = await runSceneOwnerCommand(
            { action: 'transfer', name: packageName, from: mismatch, to },
            { fileSystem: ctx.fileSystem, projectRoot: '/project' }
          );
          expect(result).toBeNull();
          expect(process.exitCode).toBe(1);
          expect(ctx.liveIndex.packages[packageName].owner).toBe(currentOwner);
        }
      ),
      { numRuns: 100 }
    );
  });
});
