'use strict';

const path = require('path');

const {
  normalizeSceneVersionOptions,
  validateSceneVersionOptions,
  printSceneVersionSummary,
  runSceneVersionCommand
} = require('../../../lib/commands/scene');
const {
  createValidContract,
  clone
} = require('../utils/scene-package-fixture');

function createVersionFs({
  packageDir = '/workspace/pkg',
  version = '1.2.3',
  name = 'demo-scene',
  readJsonError = null,
  writeJsonError = null
} = {}) {
  const packageJsonPath = path.join(packageDir, 'scene-package.json');
  const packageData = createValidContract({
    metadata: {
      name,
      version
    }
  });

  return {
    packageJsonPath,
    packageData,
    fileSystem: {
      readJson: jest.fn(async (targetPath) => {
        if (path.normalize(targetPath) !== path.normalize(packageJsonPath)) {
          throw new Error(`unexpected path: ${targetPath}`);
        }
        if (readJsonError) {
          throw readJsonError;
        }
        return clone(packageData);
      }),
      writeJson: jest.fn(async (_targetPath, nextValue) => {
        if (writeJsonError) {
          throw writeJsonError;
        }
        return nextValue;
      })
    }
  };
}

describe('Scene version command helpers', () => {
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

  test('normalizeSceneVersionOptions trims values and applies defaults', () => {
    expect(normalizeSceneVersionOptions({
      package: ' pkg ',
      bump: ' MINOR ',
      dryRun: true,
      json: true
    })).toEqual({
      package: 'pkg',
      bump: 'minor',
      dryRun: true,
      json: true
    });

    expect(normalizeSceneVersionOptions()).toEqual({
      package: '.',
      bump: undefined,
      dryRun: false,
      json: false
    });
  });

  test('validateSceneVersionOptions rejects missing and invalid bumps', () => {
    expect(validateSceneVersionOptions({})).toBe('--bump is required (major, minor, patch, or explicit semver)');
    expect(validateSceneVersionOptions({ bump: 'banana' })).toBe('--bump "banana" is not a valid bump type or semver version');
    expect(validateSceneVersionOptions({ bump: 'patch' })).toBeNull();
    expect(validateSceneVersionOptions({ bump: '2.0.0' })).toBeNull();
  });

  test('printSceneVersionSummary emits human and json output with dry-run indicator', () => {
    const logs = [];
    console.log = jest.fn((value) => logs.push(value));
    const payload = {
      success: true,
      name: 'demo-scene',
      oldVersion: '1.2.3',
      newVersion: '1.3.0',
      packageDir: 'pkg',
      dryRun: true
    };

    printSceneVersionSummary({ json: false }, payload);
    expect(logs.join('\n')).toContain('demo-scene');
    expect(logs.join('\n')).toContain('1.2.3');
    expect(logs.join('\n')).toContain('1.3.0');

    logs.length = 0;
    printSceneVersionSummary({ json: true }, payload);
    expect(JSON.parse(logs[0])).toEqual(payload);
  });
});

describe('runSceneVersionCommand', () => {
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

  test('supports patch, minor, and major bumps', async () => {
    const patchFs = createVersionFs({ version: '1.2.3' });
    const minorFs = createVersionFs({ version: '1.2.3' });
    const majorFs = createVersionFs({ version: '1.2.3' });

    const patch = await runSceneVersionCommand(
      { package: '/workspace/pkg', bump: 'patch' },
      { fileSystem: patchFs.fileSystem, projectRoot: '/workspace' }
    );
    const minor = await runSceneVersionCommand(
      { package: '/workspace/pkg', bump: 'minor' },
      { fileSystem: minorFs.fileSystem, projectRoot: '/workspace' }
    );
    const major = await runSceneVersionCommand(
      { package: '/workspace/pkg', bump: 'major' },
      { fileSystem: majorFs.fileSystem, projectRoot: '/workspace' }
    );

    expect(patch.newVersion).toBe('1.2.4');
    expect(minor.newVersion).toBe('1.3.0');
    expect(major.newVersion).toBe('2.0.0');
    expect(patchFs.fileSystem.writeJson).toHaveBeenCalled();
    expect(minorFs.fileSystem.writeJson).toHaveBeenCalled();
    expect(majorFs.fileSystem.writeJson).toHaveBeenCalled();
  });

  test('supports explicit version bumps greater than the current version', async () => {
    const { fileSystem } = createVersionFs({ version: '1.2.3' });

    const payload = await runSceneVersionCommand(
      { package: '/workspace/pkg', bump: '2.0.0' },
      { fileSystem, projectRoot: '/workspace' }
    );

    expect(payload.newVersion).toBe('2.0.0');
    expect(fileSystem.writeJson).toHaveBeenCalledWith(
      path.join('/workspace/pkg', 'scene-package.json'),
      expect.objectContaining({
        metadata: expect.objectContaining({
          version: '2.0.0'
        })
      }),
      { spaces: 2 }
    );
  });

  test('dry-run computes the new version without writing the package file', async () => {
    const { fileSystem } = createVersionFs({ version: '1.2.3' });

    const payload = await runSceneVersionCommand(
      { package: '/workspace/pkg', bump: 'minor', dryRun: true },
      { fileSystem, projectRoot: '/workspace' }
    );

    expect(payload.newVersion).toBe('1.3.0');
    expect(payload.dryRun).toBe(true);
    expect(fileSystem.writeJson).not.toHaveBeenCalled();
  });

  test('returns null and exitCode 1 when scene-package.json cannot be read', async () => {
    const { fileSystem } = createVersionFs({
      readJsonError: new Error('ENOENT')
    });

    const payload = await runSceneVersionCommand(
      { package: '/workspace/pkg', bump: 'patch' },
      { fileSystem, projectRoot: '/workspace' }
    );

    expect(payload).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalled();
  });

  test('returns null and exitCode 1 for invalid current versions and non-increasing explicit versions', async () => {
    const invalidCurrentFs = createVersionFs({ version: 'bad-version' });
    const staleExplicitFs = createVersionFs({ version: '1.2.3' });

    const invalidCurrent = await runSceneVersionCommand(
      { package: '/workspace/pkg', bump: 'patch' },
      { fileSystem: invalidCurrentFs.fileSystem, projectRoot: '/workspace' }
    );
    const staleExplicit = await runSceneVersionCommand(
      { package: '/workspace/pkg', bump: '1.2.3' },
      { fileSystem: staleExplicitFs.fileSystem, projectRoot: '/workspace' }
    );

    expect(invalidCurrent).toBeNull();
    expect(staleExplicit).toBeNull();
    expect(process.exitCode).toBe(1);
  });

  test('returns null and exitCode 1 when writing the updated package fails', async () => {
    const { fileSystem } = createVersionFs({
      writeJsonError: new Error('disk full')
    });

    const payload = await runSceneVersionCommand(
      { package: '/workspace/pkg', bump: 'patch' },
      { fileSystem, projectRoot: '/workspace' }
    );

    expect(payload).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalled();
  });
});
