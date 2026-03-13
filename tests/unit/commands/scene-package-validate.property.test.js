const path = require('path');
const semver = require('semver');
const fc = require('fast-check');

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

function createDirectoryFs({ packageDir = '/workspace/pkg', contract, existingFiles = ['scene.yaml', 'scene-package.json'] }) {
  const manifestPath = path.join(packageDir, 'scene-package.json');
  const existing = new Set(existingFiles.map((file) => path.normalize(path.join(packageDir, file))));
  existing.add(path.normalize(packageDir));
  if (existingFiles.includes('scene-package.json')) {
    existing.add(path.normalize(manifestPath));
  }

  return {
    fileSystem: {
      readJson: jest.fn(async (targetPath) => {
        if (path.normalize(targetPath) !== path.normalize(manifestPath)) {
          throw new Error(`unexpected path: ${targetPath}`);
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

const safeTextArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/);
const versionStringArb = fc.stringMatching(/^[A-Za-z0-9.+-]{1,10}$/);

describe('Scene package validate properties', () => {
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

  test('required metadata fields produce errors when missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          missingGroup: fc.boolean(),
          missingName: fc.boolean(),
          missingVersion: fc.boolean()
        }).filter((flags) => flags.missingGroup || flags.missingName || flags.missingVersion),
        async (flags) => {
          const contract = createValidContract({
            metadata: {
              group: flags.missingGroup ? '' : 'sce.scene',
              name: flags.missingName ? '' : 'demo-scene',
              version: flags.missingVersion ? '' : '1.0.0'
            }
          });
          const { fileSystem } = createDirectoryFs({ contract });
          const result = await validateScenePackageDirectory('/workspace/pkg', fileSystem);

          if (flags.missingGroup) expect(result.errors).toContain('metadata.group is required');
          if (flags.missingName) expect(result.errors).toContain('metadata.name is required');
          if (flags.missingVersion) expect(result.errors).toContain('metadata.version is required');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('semver validation is consistent with semver.valid', async () => {
    await fc.assert(
      fc.asyncProperty(versionStringArb, async (version) => {
        const contract = createValidContract({
          metadata: { version }
        });
        const { fileSystem } = createDirectoryFs({ contract });
        const result = await validateScenePackageDirectory('/workspace/pkg', fileSystem);
        const hasSemverError = result.errors.some((error) => error.includes(`metadata.version "${version}" is not valid semver`) || error === 'metadata.version must be semantic version (x.y.z)');
        const expectedInvalid = semver.valid(version) === null;

        expect(hasSemverError).toBe(expectedInvalid);
      }),
      { numRuns: 100 }
    );
  });

  test('file existence checks report exactly the missing referenced files', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeTextArb,
        fc.uniqueArray(safeTextArb.map((name) => `${name}.yaml`), { maxLength: 4 }),
        fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
        async (entryScene, generatedFiles, flags) => {
          const generates = generatedFiles.slice(0, 3);
          const allFiles = [entryScene, ...generates];
          const existsByIndex = allFiles.map((file, index) => ({ file, exists: flags[index] }));
          const existingFiles = ['scene-package.json', ...existsByIndex.filter((entry) => entry.exists).map((entry) => entry.file)];
          const contract = createValidContract({
            artifacts: {
              entry_scene: entryScene,
              generates
            }
          });
          const { fileSystem } = createDirectoryFs({ contract, existingFiles });
          const result = await validateScenePackageDirectory('/workspace/pkg', fileSystem);
          const missingFiles = existsByIndex.filter((entry) => !entry.exists).map((entry) => entry.file).sort();
          const missingErrors = result.errors
            .filter((error) => error.startsWith('referenced file not found: '))
            .map((error) => error.replace('referenced file not found: ', ''))
            .sort();

          expect(missingErrors).toEqual(missingFiles);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('valid flag matches whether errors are present and expected errors are collected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          missingName: fc.boolean(),
          badVersion: fc.boolean(),
          missingEntryScene: fc.boolean(),
          missingParameterId: fc.boolean(),
          missingParameterType: fc.boolean()
        }),
        async (flags) => {
          const contract = createValidContract({
            metadata: {
              name: flags.missingName ? '' : 'demo-scene',
              version: flags.badVersion ? 'bad-version' : '1.0.0'
            },
            parameters: [{
              id: flags.missingParameterId ? '' : 'env',
              type: flags.missingParameterType ? '' : 'string',
              required: true
            }]
          });
          const existingFiles = flags.missingEntryScene
            ? ['scene-package.json']
            : ['scene-package.json', 'scene.yaml'];
          const { fileSystem } = createDirectoryFs({ contract, existingFiles });
          const result = await validateScenePackageDirectory('/workspace/pkg', fileSystem);

          expect(result.valid).toBe(result.errors.length === 0);
          if (flags.missingName) expect(result.errors).toContain('metadata.name is required');
          if (flags.badVersion) expect(result.errors.some((error) => error.includes('metadata.version'))).toBe(true);
          if (flags.missingEntryScene) expect(result.errors).toContain('referenced file not found: scene.yaml');
          if (flags.missingParameterId) expect(result.errors).toContain('parameters[0].id is required');
          if (flags.missingParameterType) expect(result.errors).toContain('parameters[0].type is required');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('strict mode promotes warnings to errors', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const contract = createValidContract({
          capabilities: {
            provides: [],
            requires: []
          }
        });
        const { fileSystem } = createDirectoryFs({ contract });
        const payload = await runScenePackageValidateCommand(
          { package: '/workspace/pkg', strict: true, json: true },
          { projectRoot: '/workspace', fileSystem }
        );

        expect(payload.valid).toBe(false);
        expect(payload.warnings).toEqual([]);
        expect(payload.errors).toContain('capabilities.provides is empty');
      }),
      { numRuns: 100 }
    );
  });
});
