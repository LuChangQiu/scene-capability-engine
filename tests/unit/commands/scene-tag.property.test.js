const fc = require('fast-check');

const { runSceneTagCommand } = require('../../../lib/commands/scene');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createTagFs(index) {
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
const tagArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/)
  .filter((value) => value !== 'latest');
const versionArb = fc
  .tuple(
    fc.integer({ min: 0, max: 3 }),
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 })
  )
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

describe('Scene tag properties', () => {
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

  test('add then ls returns the same tag mapping', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, tagArb, versionArb, async (packageName, tag, version) => {
        const ctx = createTagFs({
          packages: { [packageName]: { versions: { [version]: {} }, latest: version } }
        });
        await runSceneTagCommand(
          { action: 'add', name: packageName, tag, version },
          { fileSystem: ctx.fileSystem, projectRoot: '/project' }
        );
        const listed = await runSceneTagCommand(
          { action: 'ls', name: packageName },
          { fileSystem: ctx.fileSystem, projectRoot: '/project' }
        );
        expect(listed.tags[tag]).toBe(version);
      }),
      { numRuns: 100 }
    );
  });

  test('add then rm removes the tag again', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, tagArb, versionArb, async (packageName, tag, version) => {
        const ctx = createTagFs({
          packages: { [packageName]: { versions: { [version]: {} }, tags: {} } }
        });
        await runSceneTagCommand(
          { action: 'add', name: packageName, tag, version },
          { fileSystem: ctx.fileSystem, projectRoot: '/project' }
        );
        await runSceneTagCommand(
          { action: 'rm', name: packageName, tag },
          { fileSystem: ctx.fileSystem, projectRoot: '/project' }
        );
        expect(ctx.liveIndex.packages[packageName].tags[tag]).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  test('missing packages fail across add rm and ls', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, tagArb, versionArb, async (packageName, tag, version) => {
        for (const options of [
          { action: 'add', name: packageName, tag, version },
          { action: 'rm', name: packageName, tag },
          { action: 'ls', name: packageName }
        ]) {
          delete process.exitCode;
          const ctx = createTagFs({ packages: {} });
          const result = await runSceneTagCommand(options, { fileSystem: ctx.fileSystem, projectRoot: '/project' });
          expect(result).toBeNull();
          expect(process.exitCode).toBe(1);
        }
      }),
      { numRuns: 100 }
    );
  });

  test('missing versions fail for add', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, tagArb, versionArb, async (packageName, tag, version) => {
        const ctx = createTagFs({
          packages: { [packageName]: { versions: {}, tags: {} } }
        });
        delete process.exitCode;
        const result = await runSceneTagCommand(
          { action: 'add', name: packageName, tag, version },
          { fileSystem: ctx.fileSystem, projectRoot: '/project' }
        );
        expect(result).toBeNull();
        expect(process.exitCode).toBe(1);
      }),
      { numRuns: 100 }
    );
  });

  test('rm rejects non-existent tags exactly', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, tagArb, versionArb, async (packageName, tag, version) => {
        const ctx = createTagFs({
          packages: { [packageName]: { versions: { [version]: {} }, tags: {} } }
        });
        delete process.exitCode;
        const result = await runSceneTagCommand(
          { action: 'rm', name: packageName, tag },
          { fileSystem: ctx.fileSystem, projectRoot: '/project' }
        );
        expect(result).toBeNull();
        expect(process.exitCode).toBe(1);
      }),
      { numRuns: 100 }
    );
  });
});
