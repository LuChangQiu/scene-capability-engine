const childProcess = require('child_process');

const {
  normalizeSceneInstantiateOptions,
  validateSceneInstantiateOptions,
  runSceneInstantiateCommand
} = require('../../../lib/commands/scene');

function normalizePath(value) {
  return String(value).replace(/\\/g, '/');
}

function buildTemplateContract(name, overrides = {}) {
  const contract = {
    name,
    apiVersion: 'sce.scene.package/v0.1',
    kind: 'scene-template',
    metadata: {
      group: 'sce.scene',
      name,
      version: '1.0.0',
      description: `${name} template`
    },
    compatibility: {
      min_sce_version: '>=1.0.0',
      scene_api_version: 'sce.scene/v0.2'
    },
    capabilities: {
      provides: [`scene.${name}.render`],
      requires: []
    },
    parameters: [],
    artifacts: {
      entry_scene: 'scene.yaml',
      generates: ['README.md']
    },
    governance: {
      risk_level: 'low',
      approval_required: false,
      rollback_supported: true
    },
    variables: [],
    files: ['README.md']
  };

  return {
    ...contract,
    ...overrides,
    metadata: {
      ...contract.metadata,
      ...(overrides.metadata || {})
    },
    compatibility: {
      ...contract.compatibility,
      ...(overrides.compatibility || {})
    },
    capabilities: {
      ...contract.capabilities,
      ...(overrides.capabilities || {})
    },
    artifacts: {
      ...contract.artifacts,
      ...(overrides.artifacts || {})
    },
    governance: {
      ...contract.governance,
      ...(overrides.governance || {})
    }
  };
}

describe('Scene template instantiation', () => {
  let originalLog;
  let originalError;
  let originalWarn;
  let originalExitCode;

  beforeEach(() => {
    originalLog = console.log;
    originalError = console.error;
    originalWarn = console.warn;
    originalExitCode = process.exitCode;
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    delete process.exitCode;
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    process.exitCode = originalExitCode;
    jest.restoreAllMocks();
  });

  describe('option normalization and validation', () => {
    test('normalizeSceneInstantiateOptions trims values and applies defaults', () => {
      expect(normalizeSceneInstantiateOptions({
        package: ' demo ',
        values: ' {"name":"Ada"} ',
        out: ' ./generated ',
        list: true,
        dryRun: true,
        interactive: true,
        json: true
      })).toEqual({
        package: 'demo',
        values: '{"name":"Ada"}',
        out: './generated',
        templateDir: '.sce/templates/scene-packages',
        list: true,
        dryRun: true,
        interactive: true,
        json: true
      });
    });

    test('validateSceneInstantiateOptions handles list, interactive, and missing required fields', () => {
      expect(validateSceneInstantiateOptions({ list: true })).toBeNull();
      expect(validateSceneInstantiateOptions({ package: null, out: './out', values: '{}' })).toBe('--package is required');
      expect(validateSceneInstantiateOptions({ package: 'demo', out: null, values: '{}' })).toBe('--out is required');
      expect(validateSceneInstantiateOptions({ package: 'demo', out: './out', interactive: false })).toBe('--values is required unless --interactive is set');
      expect(validateSceneInstantiateOptions({ package: 'demo', out: './out', interactive: true })).toBeNull();
      expect(validateSceneInstantiateOptions({ package: 'demo', out: './out', values: '{}' })).toBeNull();
    });
  });

  describe('command runner integration', () => {
    test('runSceneInstantiateCommand lists registry packages in JSON mode', async () => {
      const root = '/workspace/.sce/templates/scene-packages';
      const contracts = {
        [`${root}/alpha/scene-package.json`]: buildTemplateContract('alpha'),
        [`${root}/beta/scene-package.json`]: buildTemplateContract('beta')
      };
      const fileSystem = {
        pathExists: jest.fn(async (targetPath) => {
          const normalized = normalizePath(targetPath);
          return normalized === root
            || normalized === `${root}/alpha/scene-package.json`
            || normalized === `${root}/beta/scene-package.json`;
        }),
        readdir: jest.fn(async () => ['alpha', 'beta']),
        readJson: jest.fn(async (targetPath) => contracts[normalizePath(targetPath)])
      };

      const payload = await runSceneInstantiateCommand({ list: true, json: true }, {
        projectRoot: '/workspace',
        fileSystem
      });

      expect(payload.mode).toBe('list');
      expect(payload.templates).toHaveLength(2);
      expect(payload.templates.map((item) => item.name).sort()).toEqual(['alpha', 'beta']);
      expect(JSON.parse(console.log.mock.calls[0][0])).toEqual(payload);
    });

    test('runSceneInstantiateCommand returns dry-run payload without writing files', async () => {
      const root = '/workspace/.sce/templates/scene-packages';
      const contracts = {
        [`${root}/demo/scene-package.json`]: buildTemplateContract('demo', {
          variables: [{ name: 'title', type: 'string', required: true, description: 'Title' }],
          files: ['README.md'],
          post_instantiate_hook: 'npm install'
        })
      };
      const fileSystem = {
        pathExists: jest.fn(async (targetPath) => {
          const normalized = normalizePath(targetPath);
          return normalized === root || normalized in contracts;
        }),
        readdir: jest.fn(async () => ['demo']),
        readJson: jest.fn(async (targetPath) => contracts[normalizePath(targetPath)]),
        ensureDir: jest.fn(),
        writeJson: jest.fn(),
        writeFile: jest.fn()
      };

      const payload = await runSceneInstantiateCommand({
        package: 'demo',
        values: '{"title":"Hello"}',
        out: './generated',
        dryRun: true,
        json: true
      }, {
        projectRoot: '/workspace',
        fileSystem
      });

      expect(payload).toEqual({
        instantiated: false,
        mode: 'dry-run',
        package_name: 'demo',
        inheritance_chain: ['demo'],
        variables: { title: 'Hello' },
        files_planned: ['README.md'],
        hook_command: 'npm install',
        errors: []
      });
      expect(fileSystem.ensureDir).not.toHaveBeenCalled();
      expect(fileSystem.writeJson).not.toHaveBeenCalled();
      expect(fileSystem.writeFile).not.toHaveBeenCalled();
    });

    test('runSceneInstantiateCommand completes normal execution and records manifest, log, and hook', async () => {
      const root = '/workspace/.sce/templates/scene-packages';
      const packageDir = `${root}/demo`;
      const contract = buildTemplateContract('demo', {
        variables: [{ name: 'name', type: 'string', required: true, description: 'Name' }],
        files: ['README.md'],
        post_instantiate_hook: 'echo ready'
      });
      const directories = new Set([root, packageDir]);
      const fileContents = {
        [`${packageDir}/scene-package.json`]: JSON.stringify(contract),
        [`${packageDir}/README.md`]: 'Hello {{name}}'
      };
      const fileSystem = {
        pathExists: jest.fn(async (targetPath) => {
          const normalized = normalizePath(targetPath);
          return directories.has(normalized) || normalized in fileContents;
        }),
        readdir: jest.fn(async (targetPath) => {
          const normalized = normalizePath(targetPath);
          if (normalized === root) {
            return ['demo'];
          }
          if (normalized === packageDir) {
            return ['scene-package.json', 'README.md'];
          }
          return [];
        }),
        readJson: jest.fn(async (targetPath) => JSON.parse(fileContents[normalizePath(targetPath)])),
        readFile: jest.fn(async (targetPath) => fileContents[normalizePath(targetPath)]),
        ensureDir: jest.fn().mockResolvedValue(undefined),
        writeFile: jest.fn().mockResolvedValue(undefined),
        writeJson: jest.fn().mockResolvedValue(undefined),
        stat: jest.fn(async (targetPath) => ({
          isDirectory: () => directories.has(normalizePath(targetPath))
        }))
      };
      jest.spyOn(childProcess, 'execSync').mockReturnValue(Buffer.from('ok'));

      const payload = await runSceneInstantiateCommand({
        package: 'demo',
        values: '{"name":"Ada"}',
        out: './generated',
        json: true
      }, {
        projectRoot: '/workspace',
        fileSystem
      });

      expect(payload.instantiated).toBe(true);
      expect(payload.package_name).toBe('demo');
      expect(payload.hook).toEqual({ executed: true, exit_code: 0 });
      expect(payload.summary.total_files).toBe(2);
      expect(fileSystem.writeFile.mock.calls.some((call) =>
        normalizePath(call[0]) === '/workspace/generated/README.md'
        && call[1] === 'Hello Ada'
      )).toBe(true);
      expect(fileSystem.writeJson.mock.calls.some((call) =>
        normalizePath(call[0]) === '/workspace/generated/instantiation-manifest.json'
        && call[2] && call[2].spaces === 2
      )).toBe(true);
      expect(fileSystem.writeJson.mock.calls.some((call) =>
        normalizePath(call[0]) === '/workspace/generated/instantiation-log.json'
        && call[2] && call[2].spaces === 2
      )).toBe(true);
    });

    test('runSceneInstantiateCommand supports interactive prompting with JSON output', async () => {
      const root = '/workspace/.sce/templates/scene-packages';
      const packageDir = `${root}/demo`;
      const contract = buildTemplateContract('demo', {
        variables: [{ name: 'name', type: 'string', required: true, description: 'Name' }],
        files: ['README.md']
      });
      const directories = new Set([root, packageDir]);
      const fileContents = {
        [`${packageDir}/scene-package.json`]: JSON.stringify(contract),
        [`${packageDir}/README.md`]: 'Hello {{name}}'
      };
      const fileSystem = {
        pathExists: jest.fn(async (targetPath) => {
          const normalized = normalizePath(targetPath);
          return directories.has(normalized) || normalized in fileContents;
        }),
        readdir: jest.fn(async (targetPath) => {
          const normalized = normalizePath(targetPath);
          if (normalized === root) {
            return ['demo'];
          }
          if (normalized === packageDir) {
            return ['scene-package.json', 'README.md'];
          }
          return [];
        }),
        readJson: jest.fn(async (targetPath) => JSON.parse(fileContents[normalizePath(targetPath)])),
        readFile: jest.fn(async (targetPath) => fileContents[normalizePath(targetPath)]),
        ensureDir: jest.fn().mockResolvedValue(undefined),
        writeFile: jest.fn().mockResolvedValue(undefined),
        writeJson: jest.fn().mockResolvedValue(undefined),
        stat: jest.fn(async (targetPath) => ({
          isDirectory: () => directories.has(normalizePath(targetPath))
        }))
      };
      const prompter = jest.fn().mockResolvedValue({ name: 'Prompted User' });

      const payload = await runSceneInstantiateCommand({
        package: 'demo',
        out: './generated',
        interactive: true,
        json: true
      }, {
        projectRoot: '/workspace',
        fileSystem,
        prompter
      });

      expect(payload.instantiated).toBe(true);
      expect(payload.variables).toEqual({ name: 'Prompted User' });
      expect(prompter).toHaveBeenCalledTimes(1);
      expect(JSON.parse(console.log.mock.calls[0][0])).toEqual(payload);
    });

    test('runSceneInstantiateCommand fails when package is missing', async () => {
      const root = '/workspace/.sce/templates/scene-packages';
      const fileSystem = {
        pathExists: jest.fn(async (targetPath) => normalizePath(targetPath) === root),
        readdir: jest.fn(async () => []),
        readJson: jest.fn()
      };

      const payload = await runSceneInstantiateCommand({
        package: 'missing',
        values: '{}',
        out: './generated'
      }, {
        projectRoot: '/workspace',
        fileSystem
      });

      expect(payload).toBeNull();
      expect(process.exitCode).toBe(1);
      expect(console.error.mock.calls.join(' ')).toContain('not found in registry');
    });

    test('runSceneInstantiateCommand fails on variable validation errors without writing files', async () => {
      const root = '/workspace/.sce/templates/scene-packages';
      const contracts = {
        [`${root}/demo/scene-package.json`]: buildTemplateContract('demo', {
          variables: [{ name: 'name', type: 'string', required: true, description: 'Name' }]
        })
      };
      const fileSystem = {
        pathExists: jest.fn(async (targetPath) => {
          const normalized = normalizePath(targetPath);
          return normalized === root || normalized in contracts;
        }),
        readdir: jest.fn(async () => ['demo']),
        readJson: jest.fn(async (targetPath) => contracts[normalizePath(targetPath)]),
        ensureDir: jest.fn(),
        writeFile: jest.fn(),
        writeJson: jest.fn()
      };

      const payload = await runSceneInstantiateCommand({
        package: 'demo',
        values: '{}',
        out: './generated'
      }, {
        projectRoot: '/workspace',
        fileSystem
      });

      expect(payload).toBeNull();
      expect(process.exitCode).toBe(1);
      expect(fileSystem.writeFile).not.toHaveBeenCalled();
      expect(fileSystem.writeJson).not.toHaveBeenCalled();
    });

    test('runSceneInstantiateCommand fails on malformed inline values JSON', async () => {
      const root = '/workspace/.sce/templates/scene-packages';
      const contracts = {
        [`${root}/demo/scene-package.json`]: buildTemplateContract('demo')
      };
      const fileSystem = {
        pathExists: jest.fn(async (targetPath) => {
          const normalized = normalizePath(targetPath);
          return normalized === root || normalized in contracts;
        }),
        readdir: jest.fn(async () => ['demo']),
        readJson: jest.fn(async (targetPath) => contracts[normalizePath(targetPath)])
      };

      const payload = await runSceneInstantiateCommand({
        package: 'demo',
        values: '{broken-json}',
        out: './generated'
      }, {
        projectRoot: '/workspace',
        fileSystem
      });

      expect(payload).toBeNull();
      expect(process.exitCode).toBe(1);
      expect(console.error.mock.calls.join(' ')).toContain('failed to parse inline JSON values');
    });
  });
});
