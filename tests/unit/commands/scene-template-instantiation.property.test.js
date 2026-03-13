const childProcess = require('child_process');
const fc = require('fast-check');

const {
  validateScenePackageContract,
  buildInstantiationManifest,
  appendInstantiationLog,
  executePostInstantiateHook,
  promptMissingVariables,
  parseInstantiateValues,
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
    }
  };
}

describe('Scene template instantiation properties', () => {
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

  test('buildInstantiationManifest always returns a complete manifest shape', async () => {
    const renderedFilesArb = fc.array(
      fc.record({
        target: fc.stringMatching(/^[a-z0-9/_-]{1,24}\.(md|txt|json)$/),
        size: fc.integer({ min: 0, max: 5000 })
      }),
      { maxLength: 6 }
    );

    await fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/),
        fc.array(fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/), { maxLength: 5 }),
        fc.dictionary(fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/), fc.string({ maxLength: 12 }), { maxKeys: 5 }),
        renderedFilesArb,
        fc.stringMatching(/^[./a-z0-9_-]{1,24}$/),
        (packageName, chain, resolvedValues, renderedFiles, outputDir) => {
          const manifest = buildInstantiationManifest(packageName, chain, resolvedValues, renderedFiles, outputDir);

          expect(manifest.package_name).toBe(packageName);
          expect(manifest.inheritance_chain).toEqual(chain);
          expect(manifest.variables_used).toEqual(resolvedValues);
          expect(manifest.files_generated).toEqual(renderedFiles.map((file) => ({
            path: file.target,
            size: file.size
          })));
          expect(manifest.output_directory).toBe(outputDir);
          expect(new Date(manifest.generated_at).toISOString()).toBe(manifest.generated_at);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('appendInstantiationLog appends to an existing log without losing prior entries', async () => {
    const entryArb = fc.record({
      package_name: fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/),
      inheritance_chain: fc.array(fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/), { maxLength: 4 }),
      variables_used: fc.dictionary(fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/), fc.string({ maxLength: 12 }), { maxKeys: 4 }),
      files_generated_count: fc.integer({ min: 0, max: 10 }),
      generated_at: fc.constant('2026-03-12T00:00:00.000Z'),
      output_directory: fc.stringMatching(/^[./a-z0-9_-]{1,24}$/)
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(entryArb, { maxLength: 4 }),
        entryArb,
        async (existing, nextEntry) => {
          const existingSnapshot = JSON.parse(JSON.stringify(existing));
          let writtenPayload = null;
          const fileSystem = {
            pathExists: jest.fn().mockResolvedValue(existing.length > 0),
            readJson: jest.fn().mockResolvedValue(existing),
            ensureDir: jest.fn().mockResolvedValue(undefined),
            writeJson: jest.fn(async (_logPath, payload) => {
              writtenPayload = payload;
            })
          };

          await appendInstantiationLog('/workspace/out/instantiation-log.json', nextEntry, fileSystem);

          expect(writtenPayload).toEqual([...existingSnapshot, nextEntry]);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('executePostInstantiateHook reports non-zero exit codes as warnings instead of throwing', async () => {
    await fc.assert(
      fc.property(fc.integer({ min: 1, max: 255 }), (exitCode) => {
        jest.spyOn(childProcess, 'execSync').mockImplementation(() => {
          const error = new Error('hook failed');
          error.status = exitCode;
          throw error;
        });

        expect(executePostInstantiateHook('npm test', '/workspace/out')).toEqual({
          executed: true,
          exit_code: exitCode,
          warning: `post-hook exited with code ${exitCode}`
        });
      }),
      { numRuns: 100 }
    );
  });

  test('parseInstantiateValues dispatches between inline JSON and .json file paths', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/), fc.string({ maxLength: 12 }), { maxKeys: 5 }),
        async (payload) => {
          const inline = await parseInstantiateValues(JSON.stringify(payload), '/workspace', {});
          expect(inline).toEqual(payload);

          const fileSystem = {
            readJson: jest.fn().mockResolvedValue(payload)
          };
          const fromFile = await parseInstantiateValues('values.json', '/workspace', fileSystem);
          expect(fromFile).toEqual(payload);
          expect(normalizePath(fileSystem.readJson.mock.calls[0][0])).toBe('/workspace/values.json');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('promptMissingVariables merges prompted answers for required values missing from current input', async () => {
    const schemaArb = fc.uniqueArray(
      fc.record({
        name: fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/),
        type: fc.constant('string'),
        required: fc.constant(true),
        description: fc.stringMatching(/^[A-Za-z0-9 _.-]{1,20}$/)
      }),
      {
        selector: (entry) => entry.name,
        minLength: 1,
        maxLength: 6
      }
    );

    await fc.assert(
      fc.asyncProperty(schemaArb, async (schema) => {
        const currentValues = {};
        const promptedAnswers = Object.fromEntries(schema.map((entry) => [entry.name, `${entry.name}-value`]));
        const prompter = jest.fn().mockResolvedValue(promptedAnswers);

        const result = await promptMissingVariables(schema, currentValues, prompter);

        expect(result).toEqual(promptedAnswers);
        expect(prompter).toHaveBeenCalledTimes(1);
        expect(prompter.mock.calls[0][0]).toHaveLength(schema.length);
      }),
      { numRuns: 100 }
    );
  });

  test('runSceneInstantiateCommand dry-run never writes files or logs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/),
        fc.stringMatching(/^[A-Za-z0-9 _.-]{1,12}$/),
        async (packageName, value) => {
          const root = '/workspace/.sce/templates/scene-packages';
          const contracts = {
            [`${root}/${packageName}/scene-package.json`]: buildTemplateContract(packageName, {
              variables: [{ name: 'title', type: 'string', required: true, description: 'Title' }],
              files: ['README.md']
            })
          };
          const fileSystem = {
            pathExists: jest.fn(async (targetPath) => {
              const normalized = normalizePath(targetPath);
              return normalized === root || normalized in contracts;
            }),
            readdir: jest.fn(async () => [packageName]),
            readJson: jest.fn(async (targetPath) => contracts[normalizePath(targetPath)]),
            ensureDir: jest.fn(),
            writeFile: jest.fn(),
            writeJson: jest.fn()
          };

          const payload = await runSceneInstantiateCommand({
            package: packageName,
            values: JSON.stringify({ title: value }),
            out: './generated',
            dryRun: true,
            json: true
          }, {
            projectRoot: '/workspace',
            fileSystem
          });

          expect(payload.mode).toBe('dry-run');
          expect(fileSystem.ensureDir).not.toHaveBeenCalled();
          expect(fileSystem.writeFile).not.toHaveBeenCalled();
          expect(fileSystem.writeJson).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('runSceneInstantiateCommand returns missing-package errors for names absent from the registry', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/), { maxLength: 6 }),
        fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/),
        async (registryNames, targetName) => {
          fc.pre(!registryNames.includes(targetName));
          const root = '/workspace/.sce/templates/scene-packages';
          const contracts = Object.fromEntries(
            registryNames.map((name) => [
              `${root}/${name}/scene-package.json`,
              buildTemplateContract(name)
            ])
          );
          const fileSystem = {
            pathExists: jest.fn(async (targetPath) => {
              const normalized = normalizePath(targetPath);
              return normalized === root || normalized in contracts;
            }),
            readdir: jest.fn(async () => registryNames),
            readJson: jest.fn(async (targetPath) => contracts[normalizePath(targetPath)])
          };

          const payload = await runSceneInstantiateCommand({
            package: targetName,
            values: '{}',
            out: './generated'
          }, {
            projectRoot: '/workspace',
            fileSystem
          });

          expect(payload).toBeNull();
          expect(process.exitCode).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('runSceneInstantiateCommand reports validation errors for missing required variables in non-interactive mode', async () => {
    await fc.assert(
      fc.asyncProperty(fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/), async (variableName) => {
        const root = '/workspace/.sce/templates/scene-packages';
        const contracts = {
          [`${root}/demo/scene-package.json`]: buildTemplateContract('demo', {
            variables: [{ name: variableName, type: 'string', required: true, description: 'Required variable' }]
          })
        };
        const fileSystem = {
          pathExists: jest.fn(async (targetPath) => {
            const normalized = normalizePath(targetPath);
            return normalized === root || normalized in contracts;
          }),
          readdir: jest.fn(async () => ['demo']),
          readJson: jest.fn(async (targetPath) => contracts[normalizePath(targetPath)]),
          writeFile: jest.fn(),
          writeJson: jest.fn(),
          ensureDir: jest.fn()
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
      }),
      { numRuns: 100 }
    );
  });

  test('runSceneInstantiateCommand list mode includes every registry package exactly once', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/), { maxLength: 6 }),
        async (names) => {
          const root = '/workspace/.sce/templates/scene-packages';
          const contracts = Object.fromEntries(
            names.map((name) => [
              `${root}/${name}/scene-package.json`,
              buildTemplateContract(name)
            ])
          );
          const fileSystem = {
            pathExists: jest.fn(async (targetPath) => {
              const normalized = normalizePath(targetPath);
              return normalized === root || normalized in contracts;
            }),
            readdir: jest.fn(async () => names),
            readJson: jest.fn(async (targetPath) => contracts[normalizePath(targetPath)])
          };

          const payload = await runSceneInstantiateCommand({ list: true, json: true }, {
            projectRoot: '/workspace',
            fileSystem
          });

          expect(payload.templates.map((item) => item.name).sort()).toEqual(names.slice().sort());
        }
      ),
      { numRuns: 100 }
    );
  });

  test('existing contracts without post_instantiate_hook remain valid under contract validation', async () => {
    await fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/),
        fc.integer({ min: 0, max: 20 }),
        (name, patch) => {
          const contract = {
            apiVersion: 'sce.scene.package/v0.1',
            kind: 'scene-template',
            metadata: {
              group: 'sce.scene',
              name,
              version: `1.0.${patch}`,
              description: 'Legacy-compatible template'
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
            }
          };

          expect(validateScenePackageContract(contract).valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
