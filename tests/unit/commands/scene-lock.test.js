const path = require('path');

const {
  normalizeSceneLockOptions,
  validateSceneLockOptions,
  printSceneLockSummary,
  runSceneLockCommand
} = require('../../../lib/commands/scene');

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

describe('Scene lock command helpers', () => {
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

  test('normalizeSceneLockOptions trims values and applies defaults', () => {
    expect(normalizeSceneLockOptions({
      action: ' set ',
      name: ' demo-scene ',
      version: ' 1.0.0 ',
      registry: ' custom/registry ',
      json: true
    })).toEqual({
      action: 'set',
      name: 'demo-scene',
      version: '1.0.0',
      registry: 'custom/registry',
      json: true
    });

    expect(normalizeSceneLockOptions()).toEqual({
      action: undefined,
      name: undefined,
      version: undefined,
      registry: '.sce/registry',
      json: false
    });
  });

  test('validateSceneLockOptions enforces per-action required options', () => {
    expect(validateSceneLockOptions({})).toBe('--action is required');
    expect(validateSceneLockOptions({ action: 'bad' })).toContain('invalid action');
    expect(validateSceneLockOptions({ action: 'set', name: 'demo' })).toBe('--version is required');
    expect(validateSceneLockOptions({ action: 'rm' })).toBe('--name is required');
    expect(validateSceneLockOptions({ action: 'ls' })).toBe('--name is required');
    expect(validateSceneLockOptions({ action: 'set', name: 'demo', version: '1.0.0' })).toBeNull();
  });

  test('runSceneLockCommand set persists locked=true and ls returns locked versions', async () => {
    const ctx = createLockFs({
      packages: {
        'demo-scene': { versions: { '1.0.0': {}, '1.1.0': {} } }
      }
    });

    const setResult = await runSceneLockCommand(
      { action: 'set', name: 'demo-scene', version: '1.0.0' },
      { fileSystem: ctx.fileSystem, projectRoot: '/project' }
    );
    expect(setResult.version).toBe('1.0.0');
    expect(ctx.liveIndex.packages['demo-scene'].versions['1.0.0'].locked).toBe(true);
    expect(ctx.fileSystem.writeJson).toHaveBeenCalledWith(
      path.join('/project', '.sce/registry', 'registry-index.json'),
      ctx.liveIndex,
      { spaces: 2 }
    );

    const lsResult = await runSceneLockCommand(
      { action: 'ls', name: 'demo-scene' },
      { fileSystem: ctx.fileSystem, projectRoot: '/project' }
    );
    expect(lsResult.lockedVersions).toEqual(['1.0.0']);
  });

  test('runSceneLockCommand set rejects already locked or missing versions/packages', async () => {
    const alreadyLocked = createLockFs({
      packages: {
        'demo-scene': { versions: { '1.0.0': { locked: true } } }
      }
    });
    const alreadyLockedResult = await runSceneLockCommand(
      { action: 'set', name: 'demo-scene', version: '1.0.0' },
      { fileSystem: alreadyLocked.fileSystem, projectRoot: '/project' }
    );
    expect(alreadyLockedResult).toBeNull();
    expect(process.exitCode).toBe(1);

    delete process.exitCode;
    const missingPackage = createLockFs({ packages: {} });
    const missingPackageResult = await runSceneLockCommand(
      { action: 'set', name: 'missing-scene', version: '1.0.0' },
      { fileSystem: missingPackage.fileSystem, projectRoot: '/project' }
    );
    expect(missingPackageResult).toBeNull();
    expect(process.exitCode).toBe(1);

    delete process.exitCode;
    const missingVersion = createLockFs({
      packages: { 'demo-scene': { versions: {} } }
    });
    const missingVersionResult = await runSceneLockCommand(
      { action: 'set', name: 'demo-scene', version: '9.9.9' },
      { fileSystem: missingVersion.fileSystem, projectRoot: '/project' }
    );
    expect(missingVersionResult).toBeNull();
    expect(process.exitCode).toBe(1);
  });

  test('runSceneLockCommand rm removes locked property and rejects unlocked versions', async () => {
    const ctx = createLockFs({
      packages: {
        'demo-scene': { versions: { '1.0.0': { locked: true }, '1.1.0': {} } }
      }
    });
    const removed = await runSceneLockCommand(
      { action: 'rm', name: 'demo-scene', version: '1.0.0' },
      { fileSystem: ctx.fileSystem, projectRoot: '/project' }
    );
    expect(removed.version).toBe('1.0.0');
    expect(ctx.liveIndex.packages['demo-scene'].versions['1.0.0'].locked).toBeUndefined();

    delete process.exitCode;
    const unlocked = await runSceneLockCommand(
      { action: 'rm', name: 'demo-scene', version: '1.1.0' },
      { fileSystem: ctx.fileSystem, projectRoot: '/project' }
    );
    expect(unlocked).toBeNull();
    expect(process.exitCode).toBe(1);
  });

  test('runSceneLockCommand ls returns empty list when no versions are locked', async () => {
    const ctx = createLockFs({
      packages: {
        'demo-scene': { versions: { '1.0.0': {}, '1.1.0': {} } }
      }
    });
    const result = await runSceneLockCommand(
      { action: 'ls', name: 'demo-scene' },
      { fileSystem: ctx.fileSystem, projectRoot: '/project' }
    );
    expect(result.lockedVersions).toEqual([]);
  });

  test('printSceneLockSummary outputs JSON payload unchanged', () => {
    const logs = [];
    console.log = jest.fn((value) => logs.push(value));
    const payload = {
      success: true,
      action: 'ls',
      package: 'demo-scene',
      lockedVersions: ['1.0.0'],
      registry: '.sce/registry'
    };
    printSceneLockSummary({ json: true }, payload);
    expect(JSON.parse(logs[0])).toEqual(payload);
  });
});
