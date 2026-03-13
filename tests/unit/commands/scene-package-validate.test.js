const path = require('path');

const {
  validateScenePackageDirectory,
  runScenePackageValidateCommand
} = require('../../../lib/commands/scene');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createValidContract(overrides = {}) {
  const contract = {
    apiVersion: 'sce.scene.package/v0.1',
    kind: 'scene-template',
    metadata: {
      group: 'sce.scene',
      name: 'demo-scene',
      version: '1.0.0',
      description: 'Demo scene package'
    },
    compatibility: {
      min_sce_version: '>=1.0.0',
      scene_api_version: 'sce.scene/v0.2'
    },
    capabilities: {
      provides: ['scene.demo'],
      requires: []
    },
    parameters: [
      { id: 'env', type: 'string', required: true }
    ],
    artifacts: {
      entry_scene: 'scene.yaml',
      generates: ['scene.yaml', 'scene-package.json']
    },
    governance: {
      risk_level: 'low',
      approval_required: false,
      rollback_supported: true
    }
  };

  return {
    ...contract,
    ...overrides,
    metadata: { ...contract.metadata, ...(overrides.metadata || {}) },
    compatibility: { ...contract.compatibility, ...(overrides.compatibility || {}) },
    capabilities: { ...contract.capabilities, ...(overrides.capabilities || {}) },
    artifacts: { ...contract.artifacts, ...(overrides.artifacts || {}) },
    governance: { ...contract.governance, ...(overrides.governance || {}) }
  };
}

function createDirectoryFs({ packageDir = '/workspace/pkg', contract, existingFiles = ['scene.yaml', 'scene-package.json'], readJsonError = null }) {
  const manifestPath = path.join(packageDir, 'scene-package.json');
  const existing = new Set(existingFiles.map((file) => path.normalize(path.join(packageDir, file))));
  existing.add(path.normalize(packageDir));
  if (existingFiles.includes('scene-package.json')) {
    existing.add(path.normalize(manifestPath));
  }

  return {
    manifestPath,
    fileSystem: {
      readJson: jest.fn(async (targetPath) => {
        if (path.normalize(targetPath) !== path.normalize(manifestPath)) {
          throw new Error(`unexpected path: ${targetPath}`);
        }
        if (readJsonError) {
          throw readJsonError;
        }
        return clone(contract);
      }),
      stat: jest.fn(async (targetPath) => {
        const normalized = path.normalize(targetPath);
        if (!existing.has(normalized)) {
          throw new Error(`ENOENT: ${targetPath}`);
        }
        return {
          isDirectory: () => normalized === path.normalize(packageDir)
        };
      })
    }
  };
}

describe('Scene package validate directory helpers', () => {
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

  test('validateScenePackageDirectory reports missing scene-package.json', async () => {
    const { fileSystem } = createDirectoryFs({
      contract: createValidContract(),
      readJsonError: new Error('ENOENT')
    });

    const result = await validateScenePackageDirectory('/workspace/pkg', fileSystem);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('scene-package.json not found or not valid JSON');
  });

  test('validateScenePackageDirectory returns valid payload for a healthy package directory', async () => {
    const { fileSystem } = createDirectoryFs({
      contract: createValidContract()
    });

    const result = await validateScenePackageDirectory('/workspace/pkg', fileSystem);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.summary).toMatchObject({
      coordinate: 'sce.scene/demo-scene@1.0.0',
      kind: 'scene-template',
      parameter_count: 1,
      file_count: 3,
      files_checked: 3,
      files_missing: 0
    });
  });

  test('runScenePackageValidateCommand prints JSON payload for directory mode', async () => {
    const logs = [];
    console.log = jest.fn((value) => logs.push(value));
    const { fileSystem } = createDirectoryFs({
      contract: createValidContract()
    });

    const payload = await runScenePackageValidateCommand(
      { package: '/workspace/pkg', json: true },
      { projectRoot: '/workspace', fileSystem }
    );

    expect(payload.input.mode).toBe('directory');
    expect(JSON.parse(logs[0])).toEqual(payload);
  });

  test('runScenePackageValidateCommand strict mode promotes warnings to errors', async () => {
    const { fileSystem } = createDirectoryFs({
      contract: createValidContract({
        capabilities: {
          provides: [],
          requires: []
        }
      })
    });

    const payload = await runScenePackageValidateCommand(
      { package: '/workspace/pkg', strict: true, json: true },
      { projectRoot: '/workspace', fileSystem }
    );

    expect(payload.valid).toBe(false);
    expect(payload.warnings).toEqual([]);
    expect(payload.errors).toContain('capabilities.provides is empty');
    expect(payload.strict).toBe(true);
    expect(process.exitCode).toBe(1);
  });
});
