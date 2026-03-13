'use strict';

const path = require('path');
const fc = require('fast-check');

const {
  normalizeSceneInstallOptions,
  buildInstallManifest,
  printSceneInstallSummary,
  runSceneInstallCommand
} = require('../../../lib/commands/scene');
const {
  createTarballBundle,
  buildRegistryIndex,
  createInstallFs,
  buildTarballPath
} = require('../utils/scene-install-fixture');

const packageNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/);
const semverArb = fc
  .tuple(
    fc.integer({ min: 0, max: 5 }),
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 })
  )
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);
const fileNameArb = fc.stringMatching(/^[a-z][a-z0-9/-]{0,15}\.(yml|yaml|md|json)$/);

describe('Scene install properties', () => {
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

  test('install manifest completeness holds for arbitrary valid inputs', async () => {
    await fc.assert(
      fc.property(
        packageNameArb,
        semverArb,
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.stringMatching(/^sha256-[0-9a-f]{8,64}$/),
        fc.array(fileNameArb, { maxLength: 6 }),
        (packageName, version, registryDir, integrity, files) => {
          const manifest = buildInstallManifest(packageName, version, registryDir, integrity, files);

          expect(manifest).toHaveProperty('packageName', packageName);
          expect(manifest).toHaveProperty('version', version);
          expect(manifest).toHaveProperty('registryDir', registryDir);
          expect(manifest).toHaveProperty('integrity', integrity);
          expect(manifest).toHaveProperty('files', files);
          expect(Number.isNaN(Date.parse(manifest.installedAt))).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('install manifest JSON round-trip is lossless', async () => {
    await fc.assert(
      fc.property(
        packageNameArb,
        semverArb,
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.stringMatching(/^sha256-[0-9a-f]{8,64}$/),
        fc.array(fileNameArb, { maxLength: 6 }),
        (packageName, version, registryDir, integrity, files) => {
          const manifest = buildInstallManifest(packageName, version, registryDir, integrity, files);
          expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('missing package or version always produces an install error', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, semverArb, async (packageName, version) => {
        const tarballBundle = createTarballBundle([
          { relativePath: 'scene.yaml', content: 'kind: scene\n' }
        ]);
        const projectRoot = '/project';
        const registryRoot = path.join(projectRoot, '.sce/registry');
        const tarballPath = buildTarballPath(registryRoot, packageName, version);

        const missingPackageFs = createInstallFs({
          projectRoot,
          index: { apiVersion: 'sce.scene.registry/v0.1', packages: {} },
          tarballs: {
            [tarballPath]: tarballBundle.tarball
          }
        });
        const missingVersionFs = createInstallFs({
          projectRoot,
          index: buildRegistryIndex({}, null, packageName),
          tarballs: {}
        });

        const missingPackage = await runSceneInstallCommand(
          { name: packageName, dryRun: true },
          { fileSystem: missingPackageFs.fileSystem, projectRoot }
        );
        expect(missingPackage).toBeNull();
        expect(process.exitCode).toBe(1);
        delete process.exitCode;

        const missingVersion = await runSceneInstallCommand(
          { name: packageName, version, dryRun: true },
          { fileSystem: missingVersionFs.fileSystem, projectRoot }
        );
        expect(missingVersion).toBeNull();
        expect(process.exitCode).toBe(1);
        delete process.exitCode;
      }),
      { numRuns: 60 }
    );
  });

  test('integrity mismatch always aborts installation', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, semverArb, async (packageName, version) => {
        const projectRoot = '/project';
        const tarballBundle = createTarballBundle([
          { relativePath: 'scene.yaml', content: 'kind: scene\n' }
        ]);
        const registryRoot = path.join(projectRoot, '.sce/registry');
        const tarballPath = buildTarballPath(registryRoot, packageName, version);
        const fixture = createInstallFs({
          projectRoot,
          index: buildRegistryIndex({
            [version]: {
              published_at: '2026-03-01T00:00:00.000Z',
              integrity: 'sha256-deadbeef',
              tarball: path.relative(registryRoot, tarballPath).replace(/\\/g, '/')
            }
          }, version, packageName),
          tarballs: {
            [tarballPath]: tarballBundle.tarball
          }
        });

        const result = await runSceneInstallCommand(
          { name: packageName },
          { fileSystem: fixture.fileSystem, projectRoot }
        );

        expect(result).toBeNull();
        expect(process.exitCode).toBe(1);
        delete process.exitCode;
      }),
      { numRuns: 60 }
    );
  });

  test('existing target directories require force and force restores success', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, semverArb, async (packageName, version) => {
        const projectRoot = '/project';
        const targetDir = path.join(projectRoot, packageName);
        const tarballBundle = createTarballBundle([
          { relativePath: 'scene.yaml', content: 'kind: scene\n' }
        ]);
        const registryRoot = path.join(projectRoot, '.sce/registry');
        const tarballPath = buildTarballPath(registryRoot, packageName, version);
        const index = buildRegistryIndex({
          [version]: {
            published_at: '2026-03-01T00:00:00.000Z',
            integrity: tarballBundle.integrity,
            tarball: path.relative(registryRoot, tarballPath).replace(/\\/g, '/')
          }
        }, version, packageName);

        const withoutForceFs = createInstallFs({
          projectRoot,
          index,
          tarballs: {
            [tarballPath]: tarballBundle.tarball
          },
          existingPaths: [targetDir]
        });
        const withForceFs = createInstallFs({
          projectRoot,
          index,
          tarballs: {
            [tarballPath]: tarballBundle.tarball
          },
          existingPaths: [targetDir]
        });

        const withoutForce = await runSceneInstallCommand(
          { name: packageName },
          { fileSystem: withoutForceFs.fileSystem, projectRoot }
        );
        expect(withoutForce).toBeNull();
        expect(process.exitCode).toBe(1);
        delete process.exitCode;

        const withForce = await runSceneInstallCommand(
          { name: packageName, force: true },
          { fileSystem: withForceFs.fileSystem, projectRoot }
        );
        expect(withForce.installed).toBe(true);
        expect(withForce.overwritten).toBe(true);
      }),
      { numRuns: 60 }
    );
  });

  test('default target directory is always projectRoot/packageName', async () => {
    await fc.assert(
      fc.asyncProperty(packageNameArb, semverArb, async (packageName, version) => {
        const projectRoot = '/project';
        const tarballBundle = createTarballBundle([
          { relativePath: 'scene.yaml', content: 'kind: scene\n' }
        ]);
        const registryRoot = path.join(projectRoot, '.sce/registry');
        const tarballPath = buildTarballPath(registryRoot, packageName, version);
        const fixture = createInstallFs({
          projectRoot,
          index: buildRegistryIndex({
            [version]: {
              published_at: '2026-03-01T00:00:00.000Z',
              integrity: tarballBundle.integrity,
              tarball: path.relative(registryRoot, tarballPath).replace(/\\/g, '/')
            }
          }, version, packageName),
          tarballs: {
            [tarballPath]: tarballBundle.tarball
          }
        });

        const result = await runSceneInstallCommand(
          { name: packageName, dryRun: true },
          { fileSystem: fixture.fileSystem, projectRoot }
        );

        expect(result.target_dir).toBe(packageName);
      }),
      { numRuns: 60 }
    );
  });

  test('dry-run writes no files while still returning the extracted file list', async () => {
    await fc.assert(
      fc.asyncProperty(
        packageNameArb,
        semverArb,
        fc.array(fileNameArb, { minLength: 1, maxLength: 4 }),
        async (packageName, version, files) => {
          const projectRoot = '/project';
          const tarballBundle = createTarballBundle(
            files.map((fileName) => ({
              relativePath: fileName,
              content: `content:${fileName}`
            }))
          );
          const registryRoot = path.join(projectRoot, '.sce/registry');
          const tarballPath = buildTarballPath(registryRoot, packageName, version);
          const fixture = createInstallFs({
            projectRoot,
            index: buildRegistryIndex({
              [version]: {
                published_at: '2026-03-01T00:00:00.000Z',
                integrity: tarballBundle.integrity,
                tarball: path.relative(registryRoot, tarballPath).replace(/\\/g, '/')
              }
            }, version, packageName),
            tarballs: {
              [tarballPath]: tarballBundle.tarball
            }
          });

          const result = await runSceneInstallCommand(
            { name: packageName, dryRun: true },
            { fileSystem: fixture.fileSystem, projectRoot }
          );

          expect(result.installed).toBe(false);
          expect(result.files).toEqual(files);
          expect(fixture.fileSystem.writeFileSync).not.toHaveBeenCalled();
          expect(fixture.writtenFiles.size).toBe(0);
        }
      ),
      { numRuns: 60 }
    );
  });

  test('json output mode always emits parseable install payloads', async () => {
    await fc.assert(
      fc.property(fc.jsonValue(), (payload) => {
        const logs = [];
        console.log = jest.fn((value) => logs.push(value));
        printSceneInstallSummary({ json: true }, payload);
        expect(JSON.parse(logs[0])).toEqual(payload);
      }),
      { numRuns: 100 }
    );
  });

  test('normalizeSceneInstallOptions preserves trimmed custom paths and booleans', async () => {
    await fc.assert(
      fc.property(
        packageNameArb,
        fc.string({ minLength: 1, maxLength: 20 }).filter((value) => value.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 20 }).filter((value) => value.trim().length > 0),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (name, out, registry, force, dryRun, json) => {
          expect(normalizeSceneInstallOptions({
            name: ` ${name} `,
            out: ` ${out} `,
            registry: ` ${registry} `,
            force,
            dryRun,
            json
          })).toEqual({
            name,
            version: undefined,
            out: out.trim(),
            registry: registry.trim(),
            force,
            dryRun,
            json
          });
        }
      ),
      { numRuns: 60 }
    );
  });
});
