const fc = require('fast-check');
const path = require('path');
const zlib = require('zlib');
const semver = require('semver');

const {
  extractTarBuffer,
  bundlePackageTarball,
  buildRegistryTarballPath,
  buildTarballFilename,
  resolveLatestVersion,
  validatePackageForPublish,
  addVersionToIndex,
  removeVersionFromIndex,
  storeToRegistry,
  runScenePackageRegistryPublishCommand,
  runSceneUnpublishCommand
} = require('../../../lib/commands/scene');

function bufferMap(entries) {
  return entries
    .slice()
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .map((entry) => ({
      relativePath: entry.relativePath,
      content: entry.content.toString('base64')
    }));
}

const packageNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/);
const semverArb = fc
  .tuple(
    fc.integer({ min: 0, max: 5 }),
    fc.integer({ min: 0, max: 10 }),
    fc.integer({ min: 0, max: 10 }),
    fc.option(fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/), { nil: undefined })
  )
  .map(([major, minor, patch, prerelease]) => (
    prerelease
      ? `${major}.${minor}.${patch}-${prerelease}`
      : `${major}.${minor}.${patch}`
  ));

const relativeFilePathArb = fc
  .tuple(
    fc.array(fc.stringMatching(/^[a-z]{1,6}$/), { minLength: 0, maxLength: 2 }),
    fc.stringMatching(/^[a-z]{1,8}$/),
    fc.constantFrom('.txt', '.md', '.json', '.yaml')
  )
  .map(([segments, base, extension]) => [...segments, `${base}${extension}`].join('/'));

const fileEntryArb = fc.record({
  relativePath: relativeFilePathArb,
  content: fc.uint8Array({ maxLength: 64 }).map((value) => Buffer.from(value))
});

const uniqueFilesArb = fc.uniqueArray(fileEntryArb, {
  selector: (entry) => entry.relativePath,
  minLength: 0,
  maxLength: 8
});

const versionStringArb = fc.oneof(
  semverArb,
  fc.string({ minLength: 1, maxLength: 16 })
);

describe('Scene package publish properties', () => {
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

  test('tarball round-trip preserves relative paths and file contents', async () => {
    await fc.assert(
      fc.property(uniqueFilesArb, (files) => {
        const bundle = bundlePackageTarball(files);
        const extracted = extractTarBuffer(zlib.gunzipSync(bundle.tarball));

        expect(bufferMap(extracted)).toEqual(bufferMap(files));
      }),
      { numRuns: 100 }
    );
  });

  test('bundlePackageTarball produces deterministic sha256 integrity for same input', async () => {
    await fc.assert(
      fc.property(uniqueFilesArb, (files) => {
        const first = bundlePackageTarball(files);
        const second = bundlePackageTarball(files);

        expect(first.integrity).toBe(second.integrity);
        expect(first.tarball.equals(second.tarball)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test('tarball naming and registry path construction follow the documented pattern', async () => {
    await fc.assert(
      fc.property(packageNameArb, semverArb, (name, version) => {
        expect(buildTarballFilename(name, version)).toBe(`${name}-${version}.tgz`);
        expect(buildRegistryTarballPath(name, version)).toBe(`packages/${name}/${version}/${name}-${version}.tgz`);
      }),
      { numRuns: 100 }
    );
  });

  test('validatePackageForPublish semver acceptance matches semver.valid', async () => {
    await fc.assert(
      fc.asyncProperty(versionStringArb, async (version) => {
        const contract = {
          apiVersion: 'sce.scene.package/v0.1',
          kind: 'scene-template',
          metadata: {
            group: 'sce.scene',
            name: 'demo-scene',
            version
          },
          compatibility: {
            min_sce_version: '>=1.24.0',
            scene_api_version: 'sce.scene/v0.2'
          },
          capabilities: {
            provides: ['scene.demo.query'],
            requires: ['binding:http']
          },
          parameters: [
            { id: 'entity_name', type: 'string', required: true }
          ],
          artifacts: {
            entry_scene: 'custom/scene.yaml',
            generates: ['templates/readme.md']
          },
          governance: {
            risk_level: 'low',
            approval_required: false,
            rollback_supported: true
          }
        };
        const existing = new Set([
          path.join('/pkg', 'custom/scene.yaml'),
          path.join('/pkg', 'templates/readme.md')
        ]);
        const fileSystem = {
          readJson: jest.fn().mockResolvedValue(contract),
          pathExists: jest.fn(async (targetPath) => existing.has(targetPath))
        };

        const result = await validatePackageForPublish('/pkg', fileSystem);
        expect(result.valid).toBe(semver.valid(version) !== null);
      }),
      { numRuns: 100 }
    );
  });

  test('validatePackageForPublish fails iff at least one referenced file is missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 2, maxLength: 5 }).chain((flags) => fc.tuple(
          fc.uniqueArray(relativeFilePathArb, { minLength: Math.max(0, flags.length - 1), maxLength: Math.max(0, flags.length - 1) }),
          fc.constant(flags)
        )),
        async ([generatedFiles, flags]) => {
          const files = ['custom/scene.yaml', ...generatedFiles];
          const entryScene = files[0];
          const generates = files.slice(1);
          const existing = new Set();
          files.forEach((filePath, index) => {
            if (flags[index]) {
              existing.add(path.join('/pkg', filePath));
            }
          });

          const contract = {
            apiVersion: 'sce.scene.package/v0.1',
            kind: 'scene-template',
            metadata: {
              group: 'sce.scene',
              name: 'demo-scene',
              version: '1.2.3'
            },
            compatibility: {
              min_sce_version: '>=1.24.0',
              scene_api_version: 'sce.scene/v0.2'
            },
            capabilities: {
              provides: ['scene.demo.query'],
              requires: ['binding:http']
            },
            parameters: [
              { id: 'entity_name', type: 'string', required: true }
            ],
            artifacts: {
              entry_scene: entryScene,
              generates
            },
            governance: {
              risk_level: 'low',
              approval_required: false,
              rollback_supported: true
            }
          };

          const fileSystem = {
            readJson: jest.fn().mockResolvedValue(contract),
            pathExists: jest.fn(async (targetPath) => existing.has(targetPath))
          };

          const result = await validatePackageForPublish('/pkg', fileSystem);
          expect(result.valid).toBe(files.every((filePath) => existing.has(path.join('/pkg', filePath))));
        }
      ),
      { numRuns: 100 }
    );
  });

  test('resolveLatestVersion returns the highest semver in a non-empty version set', async () => {
    await fc.assert(
      fc.property(fc.uniqueArray(semverArb, { minLength: 1, maxLength: 8 }), (versions) => {
        const versionMap = Object.fromEntries(versions.map((version) => [version, { published_at: '2026-03-12T00:00:00.000Z' }]));
        const expected = versions.slice().sort(semver.rcompare)[0];

        expect(resolveLatestVersion(versionMap)).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  test('addVersionToIndex writes complete package metadata for the published version', async () => {
    await fc.assert(
      fc.property(packageNameArb, semverArb, fc.string({ maxLength: 24 }), (name, version, description) => {
        const publishedAt = '2026-03-12T00:00:00.000Z';
        const integrity = 'sha256-demo1234';
        const index = addVersionToIndex({
          apiVersion: 'sce.scene.registry/v0.1',
          packages: {}
        }, {
          metadata: {
            name,
            group: 'sce.scene',
            description,
            version
          }
        }, integrity, publishedAt);

        expect(index.packages[name]).toEqual({
          name,
          group: 'sce.scene',
          description: description.trim(),
          latest: version,
          versions: {
            [version]: {
              published_at: publishedAt,
              integrity,
              tarball: buildRegistryTarballPath(name, version)
            }
          }
        });
      }),
      { numRuns: 100 }
    );
  });

  test('removeVersionFromIndex removes the requested version and updates latest', async () => {
    await fc.assert(
      fc.property(
        packageNameArb,
        fc.uniqueArray(semverArb, { minLength: 2, maxLength: 8 }),
        fc.integer({ min: 0, max: 7 }),
        (name, versions, removeIndexRaw) => {
          const removeIndex = removeIndexRaw % versions.length;
          const index = { apiVersion: 'sce.scene.registry/v0.1', packages: {} };
          versions.forEach((version) => {
            addVersionToIndex(index, {
              metadata: {
                name,
                group: 'sce.scene',
                description: '',
                version
              }
            }, `sha256-${version.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`, '2026-03-12T00:00:00.000Z');
          });

          const removedVersion = versions[removeIndex];
          const result = removeVersionFromIndex(index, name, removedVersion);
          const remaining = versions.filter((version) => version !== removedVersion).sort(semver.rcompare);

          expect(result.removed).toBe(true);
          expect(result.index.packages[name].versions[removedVersion]).toBeUndefined();
          expect(result.index.packages[name].latest).toBe(remaining[0]);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('storeToRegistry rejects duplicate versions without force and allows overwrite with force', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, semverArb, fc.uint8Array({ maxLength: 32 }), async (name, version, tarballBytes) => {
        const tarball = Buffer.from(tarballBytes);
        const fileSystem = {
          pathExists: jest.fn().mockResolvedValue(true),
          ensureDir: jest.fn().mockResolvedValue(),
          writeFile: jest.fn().mockResolvedValue()
        };

        await expect(storeToRegistry(name, version, tarball, '/registry', { force: false }, fileSystem))
          .rejects.toThrow('already exists in registry');

        const result = await storeToRegistry(name, version, tarball, '/registry', { force: true }, fileSystem);
        expect(result.overwritten).toBe(true);
        expect(result.path).toBe(path.join('/registry', buildRegistryTarballPath(name, version)));
      }),
      { numRuns: 100 }
    );
  });

  test('registry index JSON serialize/parse round-trip is lossless for valid index objects', async () => {
    const packageEntryArb = fc
      .tuple(
        packageNameArb,
        fc.string({ maxLength: 32 }),
        fc.dictionary(
          semverArb,
          fc.record({
            published_at: fc.integer({ min: 946684800000, max: 4102444800000 }).map((value) => new Date(value).toISOString()),
            integrity: fc.stringMatching(/^sha256-[a-z0-9]{8}$/)
          }),
          { minKeys: 1, maxKeys: 6 }
        )
      )
      .map(([name, description, versions]) => ({
        name,
        group: 'sce.scene',
        description,
        latest: resolveLatestVersion(versions),
        versions: Object.fromEntries(
          Object.entries(versions).map(([version, entry]) => [
            version,
            {
              ...entry,
              tarball: buildRegistryTarballPath(name, version)
            }
          ])
        )
      }));
    const indexArb = fc.record({
      apiVersion: fc.constant('sce.scene.registry/v0.1'),
      packages: fc.dictionary(packageNameArb, packageEntryArb, { maxKeys: 5 })
    });

    await fc.assert(
      fc.property(indexArb, (index) => {
        expect(JSON.parse(JSON.stringify(index))).toEqual(index);
      }),
      { numRuns: 100 }
    );
  });

  test('runScenePackageRegistryPublishCommand dry-run produces no filesystem side effects', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, semverArb, async (name, version) => {
        const contract = {
          apiVersion: 'sce.scene.package/v0.1',
          kind: 'scene-template',
          metadata: {
            group: 'sce.scene',
            name,
            version,
            description: 'Demo package'
          },
          compatibility: {
            min_sce_version: '>=1.24.0',
            scene_api_version: 'v0.1'
          },
          capabilities: {
            provides: ['scene.demo.query'],
            requires: []
          },
          parameters: [],
          artifacts: {
            entry_scene: 'scene.yaml',
            generates: ['output.txt']
          },
          governance: {
            risk_level: 'low',
            approval_required: false,
            rollback_supported: true
          }
        };

        const fileSystem = {
          readJson: jest.fn().mockResolvedValue(contract),
          readFile: jest.fn(async (targetPath) => {
            if (String(targetPath).endsWith('scene-package.json')) {
              return Buffer.from(JSON.stringify(contract), 'utf8');
            }
            return Buffer.from('content', 'utf8');
          }),
          pathExists: jest.fn(async (targetPath) => {
            const normalized = String(targetPath).replace(/\\/g, '/');
            return normalized.endsWith('/scene.yaml') || normalized.endsWith('/output.txt');
          }),
          ensureDir: jest.fn().mockResolvedValue(),
          writeFile: jest.fn().mockResolvedValue(),
          writeJson: jest.fn().mockResolvedValue()
        };

        const result = await runScenePackageRegistryPublishCommand({
          package: 'packages/demo',
          dryRun: true,
          json: true
        }, {
          projectRoot: '/project',
          fileSystem
        });

        expect(result).not.toBeNull();
        expect(result.published).toBe(false);
        expect(result.dry_run).toBe(true);
        expect(fileSystem.ensureDir).not.toHaveBeenCalled();
        expect(fileSystem.writeFile).not.toHaveBeenCalled();
        expect(fileSystem.writeJson).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  test('runSceneUnpublishCommand leaves registry unchanged for missing package/version coordinates', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, semverArb, async (name, version) => {
        const fileSystem = {
          pathExists: jest.fn().mockResolvedValue(true),
          readJson: jest.fn().mockResolvedValue({ packages: {} }),
          writeJson: jest.fn().mockResolvedValue(),
          remove: jest.fn().mockResolvedValue(),
          readdir: jest.fn().mockResolvedValue([])
        };

        const result = await runSceneUnpublishCommand(
          { name, version, json: true },
          { projectRoot: '/project', fileSystem }
        );

        expect(result).toBeNull();
        expect(process.exitCode).toBe(1);
        expect(fileSystem.writeJson).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });
});
