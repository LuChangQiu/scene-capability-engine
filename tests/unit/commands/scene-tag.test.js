const path = require('path');

const {
  normalizeSceneTagOptions,
  validateSceneTagOptions,
  printSceneTagSummary,
  runSceneTagCommand
} = require('../../../lib/commands/scene');

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

describe('Scene tag command helpers', () => {
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

  test('normalizeSceneTagOptions trims values and applies defaults', () => {
    expect(normalizeSceneTagOptions({
      action: ' add ',
      name: ' demo-scene ',
      tag: ' beta ',
      version: ' 1.0.0 ',
      registry: ' custom/registry ',
      json: true
    })).toEqual({
      action: 'add',
      name: 'demo-scene',
      tag: 'beta',
      version: '1.0.0',
      registry: 'custom/registry',
      json: true
    });

    expect(normalizeSceneTagOptions()).toEqual({
      action: undefined,
      name: undefined,
      tag: undefined,
      version: undefined,
      registry: '.sce/registry',
      json: false
    });
  });

  test('validateSceneTagOptions enforces per-action required options and protected latest tag', () => {
    expect(validateSceneTagOptions({})).toBe('--action is required');
    expect(validateSceneTagOptions({ action: 'bad' })).toContain('invalid action');
    expect(validateSceneTagOptions({ action: 'add', name: 'demo' })).toBe('--tag is required');
    expect(validateSceneTagOptions({ action: 'add', name: 'demo', tag: 'beta' })).toBe('--version is required');
    expect(validateSceneTagOptions({ action: 'add', name: 'demo', tag: 'latest', version: '1.0.0' })).toContain('"latest"');
    expect(validateSceneTagOptions({ action: 'rm', name: 'demo', tag: 'latest' })).toContain('"latest"');
    expect(validateSceneTagOptions({ action: 'ls' })).toBe('--name is required');
    expect(validateSceneTagOptions({ action: 'add', name: 'demo', tag: 'beta', version: '1.0.0' })).toBeNull();
  });

  test('runSceneTagCommand add persists and overwrites tag values', async () => {
    const ctx = createTagFs({
      packages: {
        'demo-scene': {
          versions: { '1.0.0': {}, '1.1.0': {} },
          tags: { beta: '1.0.0' },
          latest: '1.1.0'
        }
      }
    });

    const result = await runSceneTagCommand(
      { action: 'add', name: 'demo-scene', tag: 'beta', version: '1.1.0' },
      { fileSystem: ctx.fileSystem, projectRoot: '/project' }
    );

    expect(result).toEqual({
      success: true,
      action: 'add',
      package: 'demo-scene',
      tag: 'beta',
      version: '1.1.0',
      registry: '.sce/registry'
    });
    expect(ctx.liveIndex.packages['demo-scene'].tags.beta).toBe('1.1.0');
    expect(ctx.fileSystem.writeJson).toHaveBeenCalledWith(
      path.join('/project', '.sce/registry', 'registry-index.json'),
      ctx.liveIndex,
      { spaces: 2 }
    );
  });

  test('runSceneTagCommand add rejects missing package or version', async () => {
    const missingPackage = createTagFs({ packages: {} });
    const missingPackageResult = await runSceneTagCommand(
      { action: 'add', name: 'missing-scene', tag: 'beta', version: '1.0.0' },
      { fileSystem: missingPackage.fileSystem, projectRoot: '/project' }
    );
    expect(missingPackageResult).toBeNull();
    expect(process.exitCode).toBe(1);

    delete process.exitCode;
    const missingVersion = createTagFs({
      packages: { 'demo-scene': { versions: {}, tags: {} } }
    });
    const missingVersionResult = await runSceneTagCommand(
      { action: 'add', name: 'demo-scene', tag: 'beta', version: '9.9.9' },
      { fileSystem: missingVersion.fileSystem, projectRoot: '/project' }
    );
    expect(missingVersionResult).toBeNull();
    expect(process.exitCode).toBe(1);
  });

  test('runSceneTagCommand rm removes tags and reports missing tags', async () => {
    const removeCase = createTagFs({
      packages: {
        'demo-scene': { versions: { '1.0.0': {} }, tags: { beta: '1.0.0' } }
      }
    });
    const removed = await runSceneTagCommand(
      { action: 'rm', name: 'demo-scene', tag: 'beta' },
      { fileSystem: removeCase.fileSystem, projectRoot: '/project' }
    );
    expect(removed.tag).toBe('beta');
    expect(removeCase.liveIndex.packages['demo-scene'].tags.beta).toBeUndefined();

    delete process.exitCode;
    const missingTag = createTagFs({
      packages: {
        'demo-scene': { versions: { '1.0.0': {} }, tags: {} }
      }
    });
    const missingTagResult = await runSceneTagCommand(
      { action: 'rm', name: 'demo-scene', tag: 'beta' },
      { fileSystem: missingTag.fileSystem, projectRoot: '/project' }
    );
    expect(missingTagResult).toBeNull();
    expect(process.exitCode).toBe(1);
  });

  test('runSceneTagCommand ls returns tags and latest or empty tags', async () => {
    const withTags = createTagFs({
      packages: {
        'demo-scene': {
          versions: { '1.0.0': {}, '1.1.0': {} },
          latest: '1.1.0',
          tags: { beta: '1.0.0', stable: '1.1.0' }
        }
      }
    });
    const listed = await runSceneTagCommand(
      { action: 'ls', name: 'demo-scene' },
      { fileSystem: withTags.fileSystem, projectRoot: '/project' }
    );
    expect(listed.latest).toBe('1.1.0');
    expect(listed.tags).toEqual({ beta: '1.0.0', stable: '1.1.0' });

    const emptyTags = createTagFs({
      packages: {
        'demo-scene': { versions: { '1.0.0': {} } }
      }
    });
    const emptyListed = await runSceneTagCommand(
      { action: 'ls', name: 'demo-scene' },
      { fileSystem: emptyTags.fileSystem, projectRoot: '/project' }
    );
    expect(emptyListed.latest).toBeNull();
    expect(emptyListed.tags).toEqual({});
  });

  test('printSceneTagSummary outputs JSON payload unchanged', () => {
    const logs = [];
    console.log = jest.fn((value) => logs.push(value));
    const payload = {
      success: true,
      action: 'ls',
      package: 'demo-scene',
      latest: '1.1.0',
      tags: { beta: '1.0.0' },
      registry: '.sce/registry'
    };
    printSceneTagSummary({ json: true }, payload);
    expect(JSON.parse(logs[0])).toEqual(payload);
  });
});
