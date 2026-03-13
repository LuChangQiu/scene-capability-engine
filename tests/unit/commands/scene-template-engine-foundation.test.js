const path = require('path');

const {
  validateTemplateVariableSchema,
  validateTemplateVariables,
  renderTemplateFiles,
  resolveTemplateInheritance,
  normalizeSceneTemplateRenderOptions,
  validateSceneTemplateRenderOptions,
  normalizeSceneTemplateValidateOptions,
  validateSceneTemplateValidateOptions,
  normalizeSceneTemplateResolveOptions,
  validateSceneTemplateResolveOptions,
  runSceneTemplateValidateCommand,
  runSceneTemplateResolveCommand,
  runSceneTemplateRenderCommand
} = require('../../../lib/commands/scene');

function normalizePath(value) {
  return String(value).replace(/\\/g, '/');
}

function buildValidTemplateContract(overrides = {}) {
  const contract = {
    apiVersion: 'sce.scene.package/v0.1',
    kind: 'scene-template',
    metadata: {
      group: 'sce.scene',
      name: 'demo-template',
      version: '1.0.0',
      description: 'Demo template'
    },
    compatibility: {
      min_sce_version: '>=1.0.0',
      scene_api_version: 'sce.scene/v0.2'
    },
    capabilities: {
      provides: ['scene.demo.render'],
      requires: []
    },
    parameters: [],
    artifacts: {
      entry_scene: 'scene.yaml',
      generates: ['output.md']
    },
    governance: {
      risk_level: 'low',
      approval_required: false,
      rollback_supported: true
    },
    variables: []
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

describe('Scene template engine foundation', () => {
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

  describe('schema and variable validation edge cases', () => {
    test('validateTemplateVariableSchema accepts an empty schema array', () => {
      expect(validateTemplateVariableSchema([])).toEqual({
        valid: true,
        errors: [],
        warnings: [],
        summary: {
          variable_count: 0,
          type_breakdown: {}
        }
      });
    });

    test('validateTemplateVariables accepts an empty values object for an empty schema', () => {
      expect(validateTemplateVariables([], {})).toEqual({
        valid: true,
        errors: [],
        resolved: {}
      });
    });

    test('validateTemplateVariableSchema reports missing name and type fields', () => {
      const result = validateTemplateVariableSchema([{}]);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('variables[0]: missing required field "name"');
      expect(result.errors).toContain('variables[0]: missing required field "type"');
      expect(result.warnings).toContain('variables[0]: no description provided for "index 0"');
    });

    test('validateTemplateVariables enforces boolean and array value types', () => {
      const schema = [
        { name: 'enabled', type: 'boolean', required: true, description: 'Feature flag' },
        { name: 'items', type: 'array', required: true, description: 'Output items' }
      ];

      const invalid = validateTemplateVariables(schema, { enabled: 'yes', items: 'nope' });
      expect(invalid.valid).toBe(false);
      expect(invalid.errors).toContain('variable "enabled": expected type "boolean" but got "string"');
      expect(invalid.errors).toContain('variable "items": expected type "array" but got "string"');

      const valid = validateTemplateVariables(schema, { enabled: true, items: ['a', 'b'] });
      expect(valid).toEqual({
        valid: true,
        errors: [],
        resolved: {
          enabled: true,
          items: ['a', 'b']
        }
      });
    });
  });

  describe('renderTemplateFiles', () => {
    test('returns validation errors before any filesystem writes occur', async () => {
      const fileSystem = {
        readdir: jest.fn(),
        stat: jest.fn(),
        readFile: jest.fn(),
        ensureDir: jest.fn(),
        writeFile: jest.fn()
      };

      const result = await renderTemplateFiles('/templates', {
        schema: [{ name: 'title', type: 'string', required: true, description: 'Title' }],
        values: {}
      }, '/output', fileSystem);

      expect(result.rendered).toBe(false);
      expect(result.errors).toContain('variable "title": required but not provided');
      expect(fileSystem.readdir).not.toHaveBeenCalled();
      expect(fileSystem.writeFile).not.toHaveBeenCalled();
    });

    test('preserves nested directory structure when rendering files', async () => {
      const directories = new Set(['/templates', '/templates/nested']);
      const fileContents = {
        '/templates/scene-package.json': '{"name":"demo"}',
        '/templates/nested/readme.md': 'Hello {{name}}'
      };
      const fileSystem = {
        readdir: jest.fn(async (targetPath) => {
          const normalized = normalizePath(targetPath);
          if (normalized === '/templates') {
            return ['scene-package.json', 'nested'];
          }
          if (normalized === '/templates/nested') {
            return ['readme.md'];
          }
          return [];
        }),
        stat: jest.fn(async (targetPath) => ({
          isDirectory: () => directories.has(normalizePath(targetPath))
        })),
        readFile: jest.fn(async (targetPath) => fileContents[normalizePath(targetPath)]),
        ensureDir: jest.fn().mockResolvedValue(undefined),
        writeFile: jest.fn().mockResolvedValue(undefined)
      };

      const result = await renderTemplateFiles('/templates', {
        schema: [{ name: 'name', type: 'string', required: true, description: 'Project name' }],
        values: { name: 'World' }
      }, '/output', fileSystem);

      expect(result.rendered).toBe(true);
      expect(result.summary.total_files).toBe(2);
      expect(result.files).toEqual(expect.arrayContaining([
        expect.objectContaining({ source: 'scene-package.json', target: 'scene-package.json' }),
        expect.objectContaining({ source: path.join('nested', 'readme.md'), target: path.join('nested', 'readme.md') })
      ]));
      expect(fileSystem.ensureDir).toHaveBeenCalledWith(path.join('/output', 'nested'));
      expect(fileSystem.writeFile.mock.calls.some((call) =>
        normalizePath(call[0]) === '/output/scene-package.json'
        && call[1] === '{"name":"demo"}'
        && call[2] === 'utf8'
      )).toBe(true);
      expect(fileSystem.writeFile.mock.calls.some((call) =>
        normalizePath(call[0]) === '/output/nested/readme.md'
        && call[1] === 'Hello World'
        && call[2] === 'utf8'
      )).toBe(true);
    });

    test('handles an empty template directory without errors', async () => {
      const fileSystem = {
        readdir: jest.fn().mockResolvedValue([]),
        stat: jest.fn(),
        readFile: jest.fn(),
        ensureDir: jest.fn(),
        writeFile: jest.fn()
      };

      const result = await renderTemplateFiles('/templates', {
        schema: [],
        values: {}
      }, '/output', fileSystem);

      expect(result).toEqual({
        rendered: true,
        errors: [],
        files: [],
        summary: {
          total_files: 0,
          total_bytes: 0,
          variables_used: 0
        }
      });
      expect(fileSystem.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('resolveTemplateInheritance edge cases', () => {
    test('returns an error when a parent package is missing', () => {
      const result = resolveTemplateInheritance([
        {
          name: 'child',
          contract: { extends: 'missing-parent', variables: [], files: [] }
        }
      ], 'child');

      expect(result.resolved).toBe(false);
      expect(result.errors[0]).toContain('missing-parent');
    });

    test('resolves a single-level package without extends', () => {
      const result = resolveTemplateInheritance([
        {
          name: 'base',
          contract: {
            variables: [{ name: 'name', type: 'string' }],
            files: ['scene.yaml']
          }
        }
      ], 'base');

      expect(result).toEqual({
        resolved: true,
        chain: ['base'],
        mergedVariables: [{ name: 'name', type: 'string' }],
        mergedFiles: ['scene.yaml'],
        errors: []
      });
    });

    test('resolves a deeply nested inheritance chain with child overrides', () => {
      const registry = [
        {
          name: 'instance',
          contract: {
            extends: 'domain',
            variables: [{ name: 'entity', type: 'string', description: 'Entity name' }],
            files: ['instance.txt']
          }
        },
        {
          name: 'domain',
          contract: {
            extends: 'base',
            variables: [{ name: 'shared', type: 'number', description: 'Child override' }],
            files: ['domain.txt', 'shared.txt']
          }
        },
        {
          name: 'base',
          contract: {
            variables: [{ name: 'shared', type: 'string', description: 'Base value' }],
            files: ['shared.txt', 'base.txt']
          }
        }
      ];

      const result = resolveTemplateInheritance(registry, 'instance');

      expect(result.resolved).toBe(true);
      expect(result.chain).toEqual(['instance', 'domain', 'base']);
      expect(result.mergedVariables).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'entity', type: 'string' }),
        expect.objectContaining({ name: 'shared', type: 'number' })
      ]));
      expect(result.mergedFiles.sort()).toEqual(['base.txt', 'domain.txt', 'instance.txt', 'shared.txt']);
    });
  });

  describe('template CLI option normalization and validation', () => {
    test('normalizes and validates template-render options', () => {
      expect(normalizeSceneTemplateRenderOptions({
        package: '  demo  ',
        values: ' {"name":"demo"} ',
        out: ' ./out ',
        json: true
      })).toEqual({
        package: 'demo',
        values: '{"name":"demo"}',
        out: './out',
        templateDir: '.sce/templates/scene-packages',
        json: true
      });

      expect(validateSceneTemplateRenderOptions({ package: '', values: '{}', out: './out' })).toBe('--package is required');
      expect(validateSceneTemplateRenderOptions({ package: 'demo', values: '', out: './out' })).toBe('--values is required');
      expect(validateSceneTemplateRenderOptions({ package: 'demo', values: '{}', out: '' })).toBe('--out is required');
    });

    test('normalizes and validates template-validate options', () => {
      expect(normalizeSceneTemplateValidateOptions({ package: ' ./pkg ', json: true })).toEqual({
        package: './pkg',
        json: true
      });

      expect(validateSceneTemplateValidateOptions({ package: '' })).toBe('--package is required');
      expect(validateSceneTemplateValidateOptions({ package: './pkg' })).toBeNull();
    });

    test('normalizes and validates template-resolve options', () => {
      expect(normalizeSceneTemplateResolveOptions({ package: ' demo ', json: true })).toEqual({
        package: 'demo',
        templateDir: '.sce/templates/scene-packages',
        json: true
      });

      expect(validateSceneTemplateResolveOptions({ package: '' })).toBe('--package is required');
      expect(validateSceneTemplateResolveOptions({ package: 'demo' })).toBeNull();
    });
  });

  describe('template CLI runners', () => {
    test('runSceneTemplateValidateCommand returns a JSON payload on success', async () => {
      const contract = buildValidTemplateContract({
        variables: [
          { name: 'title', type: 'string', required: true, description: 'Document title' }
        ]
      });
      const fileSystem = {
        stat: jest.fn().mockResolvedValue({ isDirectory: () => true }),
        readJson: jest.fn().mockResolvedValue(contract)
      };

      const payload = await runSceneTemplateValidateCommand({
        package: 'templates/demo',
        json: true
      }, {
        projectRoot: '/workspace',
        fileSystem
      });

      expect(payload.valid).toBe(true);
      expect(payload.summary.variable_count).toBe(1);
      expect(JSON.parse(console.log.mock.calls[0][0])).toEqual(payload);
    });

    test('runSceneTemplateValidateCommand returns null on read failure', async () => {
      const fileSystem = {
        stat: jest.fn().mockRejectedValue(new Error('ENOENT')),
        readJson: jest.fn().mockRejectedValue(new Error('ENOENT'))
      };

      const payload = await runSceneTemplateValidateCommand({
        package: 'missing',
        json: true
      }, {
        projectRoot: '/workspace',
        fileSystem
      });

      expect(payload).toBeNull();
      expect(process.exitCode).toBe(1);
    });

    test('runSceneTemplateResolveCommand returns a JSON payload for a resolved inheritance chain', async () => {
      const contracts = {
        '/workspace/.sce/templates/scene-packages/base/scene-package.json': buildValidTemplateContract({
          metadata: { name: 'base' },
          variables: [{ name: 'shared', type: 'string', description: 'Base shared value' }],
          files: ['shared.txt']
        }),
        '/workspace/.sce/templates/scene-packages/child/scene-package.json': buildValidTemplateContract({
          metadata: { name: 'child' },
          extends: 'base',
          variables: [{ name: 'shared', type: 'number', description: 'Child shared value' }],
          files: ['shared.txt', 'child.txt']
        })
      };
      const fileSystem = {
        pathExists: jest.fn(async (targetPath) => normalizePath(targetPath) in contracts || normalizePath(targetPath) === '/workspace/.sce/templates/scene-packages'),
        readdir: jest.fn().mockResolvedValue(['base', 'child']),
        readJson: jest.fn(async (targetPath) => contracts[normalizePath(targetPath)])
      };

      const payload = await runSceneTemplateResolveCommand({
        package: 'child',
        json: true
      }, {
        projectRoot: '/workspace',
        fileSystem
      });

      expect(payload.resolved).toBe(true);
      expect(payload.chain).toEqual(['child', 'base']);
      expect(JSON.parse(console.log.mock.calls[0][0])).toEqual(payload);
    });

    test('runSceneTemplateResolveCommand returns a failed payload when inheritance cannot be resolved', async () => {
      const contracts = {
        '/workspace/.sce/templates/scene-packages/child/scene-package.json': buildValidTemplateContract({
          metadata: { name: 'child' },
          extends: 'missing-parent'
        })
      };
      const fileSystem = {
        pathExists: jest.fn(async (targetPath) => normalizePath(targetPath) in contracts || normalizePath(targetPath) === '/workspace/.sce/templates/scene-packages'),
        readdir: jest.fn().mockResolvedValue(['child']),
        readJson: jest.fn(async (targetPath) => contracts[normalizePath(targetPath)])
      };

      const payload = await runSceneTemplateResolveCommand({
        package: 'child',
        json: true
      }, {
        projectRoot: '/workspace',
        fileSystem
      });

      expect(payload.resolved).toBe(false);
      expect(payload.errors[0]).toContain('missing-parent');
      expect(process.exitCode).toBe(1);
    });

    test('runSceneTemplateRenderCommand renders files and emits a JSON payload', async () => {
      const packageRoot = '/workspace/.sce/templates/scene-packages/demo';
      const fileContents = {
        [`${packageRoot}/scene-package.json`]: JSON.stringify(buildValidTemplateContract({
          metadata: { name: 'demo' },
          variables: [{ name: 'name', type: 'string', required: true, description: 'User name' }]
        })),
        [`${packageRoot}/README.md`]: 'Hello {{name}}',
        [`${packageRoot}/nested/info.txt`]: 'User={{name}}'
      };
      const directories = new Set([
        '/workspace/.sce/templates/scene-packages',
        packageRoot,
        `${packageRoot}/nested`
      ]);
      const fileSystem = {
        pathExists: jest.fn(async (targetPath) => {
          const normalized = normalizePath(targetPath);
          return directories.has(normalized) || normalized in fileContents;
        }),
        readdir: jest.fn(async (targetPath) => {
          const normalized = normalizePath(targetPath);
          if (normalized === '/workspace/.sce/templates/scene-packages') {
            return ['demo'];
          }
          if (normalized === packageRoot) {
            return ['scene-package.json', 'README.md', 'nested'];
          }
          if (normalized === `${packageRoot}/nested`) {
            return ['info.txt'];
          }
          return [];
        }),
        readJson: jest.fn(async (targetPath) => JSON.parse(fileContents[normalizePath(targetPath)])),
        readFile: jest.fn(async (targetPath) => fileContents[normalizePath(targetPath)]),
        ensureDir: jest.fn().mockResolvedValue(undefined),
        writeFile: jest.fn().mockResolvedValue(undefined),
        stat: jest.fn(async (targetPath) => ({
          isDirectory: () => directories.has(normalizePath(targetPath))
        }))
      };

      const payload = await runSceneTemplateRenderCommand({
        package: 'demo',
        values: '{"name":"Ada"}',
        out: './generated',
        json: true
      }, {
        projectRoot: '/workspace',
        fileSystem
      });

      expect(payload.rendered).toBe(true);
      expect(payload.summary.total_files).toBe(3);
      expect(fileSystem.writeFile.mock.calls.some((call) =>
        normalizePath(call[0]) === '/workspace/generated/README.md'
        && call[1] === 'Hello Ada'
        && call[2] === 'utf8'
      )).toBe(true);
      expect(fileSystem.writeFile.mock.calls.some((call) =>
        normalizePath(call[0]) === '/workspace/generated/nested/info.txt'
        && call[1] === 'User=Ada'
        && call[2] === 'utf8'
      )).toBe(true);
      expect(JSON.parse(console.log.mock.calls[0][0])).toEqual(payload);
    });

    test('runSceneTemplateRenderCommand returns null when --values is not valid JSON', async () => {
      const fileSystem = {
        pathExists: jest.fn(),
        readdir: jest.fn(),
        readJson: jest.fn(),
        readFile: jest.fn(),
        ensureDir: jest.fn(),
        writeFile: jest.fn(),
        stat: jest.fn()
      };

      const payload = await runSceneTemplateRenderCommand({
        package: 'demo',
        values: '{bad-json}',
        out: './generated',
        json: true
      }, {
        projectRoot: '/workspace',
        fileSystem
      });

      expect(payload).toBeNull();
      expect(process.exitCode).toBe(1);
      expect(fileSystem.writeFile).not.toHaveBeenCalled();
    });
  });
});
