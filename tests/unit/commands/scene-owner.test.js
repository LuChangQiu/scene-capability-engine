const path = require('path');

const {
  normalizeSceneOwnerOptions,
  validateSceneOwnerOptions,
  printSceneOwnerSummary,
  runSceneOwnerCommand
} = require('../../../lib/commands/scene');

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

describe('Scene owner command helpers', () => {
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

  test('normalizeSceneOwnerOptions trims values and applies defaults', () => {
    expect(normalizeSceneOwnerOptions({
      action: ' set ',
      name: ' demo-scene ',
      owner: ' alice ',
      from: ' old ',
      to: ' new ',
      remove: true,
      registry: ' custom/registry ',
      json: true
    })).toEqual({
      action: 'set',
      name: 'demo-scene',
      owner: 'alice',
      from: 'old',
      to: 'new',
      remove: true,
      registry: 'custom/registry',
      json: true
    });

    expect(normalizeSceneOwnerOptions()).toEqual({
      action: undefined,
      name: undefined,
      owner: undefined,
      from: undefined,
      to: undefined,
      remove: false,
      registry: '.sce/registry',
      json: false
    });
  });

  test('validateSceneOwnerOptions enforces per-action required options', () => {
    expect(validateSceneOwnerOptions({})).toBe('--action is required');
    expect(validateSceneOwnerOptions({ action: 'bad' })).toContain('invalid action');
    expect(validateSceneOwnerOptions({ action: 'set', name: 'demo' })).toBe('--owner or --remove is required');
    expect(validateSceneOwnerOptions({ action: 'show' })).toBe('--name is required');
    expect(validateSceneOwnerOptions({ action: 'list' })).toBe('--owner is required');
    expect(validateSceneOwnerOptions({ action: 'transfer', name: 'demo' })).toBe('--from is required');
    expect(validateSceneOwnerOptions({ action: 'transfer', name: 'demo', from: 'alice' })).toBe('--to is required');
    expect(validateSceneOwnerOptions({ action: 'set', name: 'demo', owner: 'alice' })).toBeNull();
  });

  test('runSceneOwnerCommand set persists owner value', async () => {
    const { liveIndex, fileSystem } = createOwnerFs({
      packages: {
        'demo-scene': { versions: {} }
      }
    });

    const result = await runSceneOwnerCommand(
      { action: 'set', name: 'demo-scene', owner: 'alice' },
      { fileSystem, projectRoot: '/project' }
    );

    expect(result).toEqual({
      success: true,
      action: 'set',
      package: 'demo-scene',
      owner: 'alice',
      removed: false,
      registry: '.sce/registry'
    });
    expect(liveIndex.packages['demo-scene'].owner).toBe('alice');
    expect(fileSystem.writeJson).toHaveBeenCalledWith(
      path.join('/project', '.sce/registry', 'registry-index.json'),
      liveIndex,
      { spaces: 2 }
    );
  });

  test('runSceneOwnerCommand removes owner with empty string or --remove', async () => {
    const baseIndex = {
      packages: {
        'demo-scene': { owner: 'alice', versions: {} }
      }
    };

    const emptyStringCase = createOwnerFs(baseIndex);
    const emptyResult = await runSceneOwnerCommand(
      { action: 'set', name: 'demo-scene', owner: '' },
      { fileSystem: emptyStringCase.fileSystem, projectRoot: '/project' }
    );
    expect(emptyResult.removed).toBe(true);
    expect(emptyStringCase.liveIndex.packages['demo-scene'].owner).toBeUndefined();

    const removeCase = createOwnerFs(baseIndex);
    const removeResult = await runSceneOwnerCommand(
      { action: 'set', name: 'demo-scene', remove: true },
      { fileSystem: removeCase.fileSystem, projectRoot: '/project' }
    );
    expect(removeResult.removed).toBe(true);
    expect(removeCase.liveIndex.packages['demo-scene'].owner).toBeUndefined();
  });

  test('runSceneOwnerCommand show returns current owner or null', async () => {
    const withOwner = createOwnerFs({
      packages: {
        'demo-scene': { owner: 'alice', versions: {} }
      }
    });
    const ownerResult = await runSceneOwnerCommand(
      { action: 'show', name: 'demo-scene' },
      { fileSystem: withOwner.fileSystem, projectRoot: '/project' }
    );
    expect(ownerResult.owner).toBe('alice');

    const withoutOwner = createOwnerFs({
      packages: {
        'demo-scene': { versions: {} }
      }
    });
    const nullResult = await runSceneOwnerCommand(
      { action: 'show', name: 'demo-scene' },
      { fileSystem: withoutOwner.fileSystem, projectRoot: '/project' }
    );
    expect(nullResult.owner).toBeNull();
  });

  test('runSceneOwnerCommand list filters packages case-insensitively', async () => {
    const { fileSystem } = createOwnerFs({
      packages: {
        'demo-scene': { owner: 'Alice', versions: {} },
        'other-scene': { owner: 'alice', versions: {} },
        'third-scene': { owner: 'bob', versions: {} }
      }
    });

    const result = await runSceneOwnerCommand(
      { action: 'list', owner: 'ALICE' },
      { fileSystem, projectRoot: '/project' }
    );

    expect(result.packages.sort()).toEqual(['demo-scene', 'other-scene']);
  });

  test('runSceneOwnerCommand transfer updates owner when from matches case-insensitively', async () => {
    const { liveIndex, fileSystem } = createOwnerFs({
      packages: {
        'demo-scene': { owner: 'Alice', versions: {} }
      }
    });

    const result = await runSceneOwnerCommand(
      { action: 'transfer', name: 'demo-scene', from: 'alice', to: 'bob' },
      { fileSystem, projectRoot: '/project' }
    );

    expect(result).toEqual({
      success: true,
      action: 'transfer',
      package: 'demo-scene',
      from: 'alice',
      to: 'bob',
      registry: '.sce/registry'
    });
    expect(liveIndex.packages['demo-scene'].owner).toBe('bob');
  });

  test('runSceneOwnerCommand transfer fails on mismatch and missing owner', async () => {
    const mismatchCase = createOwnerFs({
      packages: {
        'demo-scene': { owner: 'alice', versions: {} }
      }
    });
    const mismatchResult = await runSceneOwnerCommand(
      { action: 'transfer', name: 'demo-scene', from: 'bob', to: 'carol' },
      { fileSystem: mismatchCase.fileSystem, projectRoot: '/project' }
    );
    expect(mismatchResult).toBeNull();
    expect(process.exitCode).toBe(1);

    delete process.exitCode;
    const noOwnerCase = createOwnerFs({
      packages: {
        'demo-scene': { versions: {} }
      }
    });
    const noOwnerResult = await runSceneOwnerCommand(
      { action: 'transfer', name: 'demo-scene', from: 'alice', to: 'bob' },
      { fileSystem: noOwnerCase.fileSystem, projectRoot: '/project' }
    );
    expect(noOwnerResult).toBeNull();
    expect(process.exitCode).toBe(1);
  });

  test('runSceneOwnerCommand reports package-not-found for set/show/transfer', async () => {
    for (const options of [
      { action: 'set', name: 'missing-scene', owner: 'alice' },
      { action: 'show', name: 'missing-scene' },
      { action: 'transfer', name: 'missing-scene', from: 'alice', to: 'bob' }
    ]) {
      delete process.exitCode;
      const { fileSystem } = createOwnerFs({ packages: {} });
      const result = await runSceneOwnerCommand(options, { fileSystem, projectRoot: '/project' });
      expect(result).toBeNull();
      expect(process.exitCode).toBe(1);
    }
  });

  test('printSceneOwnerSummary outputs JSON payload unchanged', () => {
    const logs = [];
    console.log = jest.fn((value) => logs.push(value));

    const payload = {
      success: true,
      action: 'show',
      package: 'demo-scene',
      owner: 'alice',
      registry: '.sce/registry'
    };
    printSceneOwnerSummary({ json: true }, payload);
    expect(JSON.parse(logs[0])).toEqual(payload);
  });
});
