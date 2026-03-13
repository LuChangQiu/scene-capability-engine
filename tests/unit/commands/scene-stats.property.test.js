const fc = require('fast-check');

const { runSceneStatsCommand } = require('../../../lib/commands/scene');

const packageNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/);
const isoDateArb = fc
  .integer({ min: Date.parse('2025-01-01T00:00:00.000Z'), max: Date.parse('2026-12-31T23:59:59.000Z') })
  .map((value) => new Date(value).toISOString());

const packageEntryArb = fc.record({
  owner: fc.oneof(fc.string({ maxLength: 12 }), fc.constant(undefined)),
  deprecated: fc.boolean(),
  tags: fc.option(fc.dictionary(fc.stringMatching(/^[a-z]{1,8}$/), fc.stringMatching(/^\d+\.\d+\.\d+$/), { maxKeys: 4 }), { nil: undefined }),
  versions: fc.dictionary(
    fc.stringMatching(/^\d+\.\d+\.\d+$/),
    fc.record({ published_at: fc.option(isoDateArb, { nil: undefined }) }),
    { maxKeys: 4 }
  )
});

describe('Scene stats properties', () => {
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

  test('aggregate counts match the package registry contents', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(packageNameArb, packageEntryArb, { maxKeys: 8 }),
        async (packages) => {
          const fileSystem = {
            pathExists: jest.fn().mockResolvedValue(true),
            readJson: jest.fn().mockResolvedValue({
              apiVersion: 'sce.scene.registry/v0.1',
              packages
            })
          };

          const payload = await runSceneStatsCommand({ json: true }, {
            projectRoot: '/workspace',
            fileSystem
          });

          const expectedTotalVersions = Object.values(packages)
            .reduce((sum, pkg) => sum + Object.keys(pkg.versions || {}).length, 0);
          const expectedTotalTags = Object.values(packages)
            .reduce((sum, pkg) => sum + Object.keys(pkg.tags || {}).length, 0);
          const expectedDeprecated = Object.values(packages)
            .filter((pkg) => pkg.deprecated).length;

          expect(payload.totalPackages).toBe(Object.keys(packages).length);
          expect(payload.totalVersions).toBe(expectedTotalVersions);
          expect(payload.totalTags).toBe(expectedTotalTags);
          expect(payload.deprecatedPackages).toBe(expectedDeprecated);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('packagesWithOwner and packagesWithoutOwner always partition the registry', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(packageNameArb, packageEntryArb, { maxKeys: 8 }),
        async (packages) => {
          const fileSystem = {
            pathExists: jest.fn().mockResolvedValue(true),
            readJson: jest.fn().mockResolvedValue({
              apiVersion: 'sce.scene.registry/v0.1',
              packages
            })
          };

          const payload = await runSceneStatsCommand({ json: true }, {
            projectRoot: '/workspace',
            fileSystem
          });

          expect(payload.packagesWithOwner + payload.packagesWithoutOwner).toBe(payload.totalPackages);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('mostRecentlyPublished matches the maximum published_at across all versions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(packageNameArb, packageEntryArb, { maxKeys: 8 }),
        async (packages) => {
          const fileSystem = {
            pathExists: jest.fn().mockResolvedValue(true),
            readJson: jest.fn().mockResolvedValue({
              apiVersion: 'sce.scene.registry/v0.1',
              packages
            })
          };

          const payload = await runSceneStatsCommand({ json: true }, {
            projectRoot: '/workspace',
            fileSystem
          });

          let expected = null;
          for (const [pkgName, pkg] of Object.entries(packages)) {
            for (const [version, entry] of Object.entries(pkg.versions || {})) {
              if (!entry.published_at) {
                continue;
              }
              if (!expected || entry.published_at > expected.publishedAt) {
                expected = {
                  package: pkgName,
                  version,
                  publishedAt: entry.published_at
                };
              }
            }
          }

          expect(payload.mostRecentlyPublished).toEqual(expected);
        }
      ),
      { numRuns: 100 }
    );
  });
});
