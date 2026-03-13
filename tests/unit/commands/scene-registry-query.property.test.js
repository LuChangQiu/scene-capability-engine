const fc = require('fast-check');

const {
  buildRegistryPackageList,
  filterRegistryPackages,
  printSceneListSummary,
  printSceneSearchSummary
} = require('../../../lib/commands/scene');

const packageNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/);

const packageRecordArb = fc.record({
  name: packageNameArb,
  group: fc.stringMatching(/^[a-z.]{3,20}$/),
  description: fc.string({ maxLength: 24 }),
  latest: fc.stringMatching(/^\d+\.\d+\.\d+$/),
  version_count: fc.integer({ min: 0, max: 10 })
});

const registryPackagesArb = fc.dictionary(
  packageNameArb,
  fc.record({
    name: packageNameArb,
    group: fc.stringMatching(/^[a-z.]{3,20}$/),
    description: fc.string({ maxLength: 24 }),
    latest: fc.stringMatching(/^\d+\.\d+\.\d+$/),
    versions: fc.dictionary(fc.stringMatching(/^\d+\.\d+\.\d+$/), fc.constant({}), { maxKeys: 5 })
  }),
  { maxKeys: 8 }
);

describe('Scene registry query properties', () => {
  let originalLog;

  beforeEach(() => {
    originalLog = console.log;
    console.log = jest.fn();
  });

  afterEach(() => {
    console.log = originalLog;
  });

  test('buildRegistryPackageList preserves all registry entries', async () => {
    await fc.assert(
      fc.property(registryPackagesArb, (registryPackages) => {
        const result = buildRegistryPackageList(registryPackages);
        expect(result).toHaveLength(Object.keys(registryPackages).length);
        expect(result.map((entry) => entry.name).sort()).toEqual(
          Object.values(registryPackages).map((entry) => entry.name || '').sort()
        );
      }),
      { numRuns: 100 }
    );
  });

  test('filterRegistryPackages matches exactly the packages satisfying the case-insensitive predicate', async () => {
    await fc.assert(
      fc.property(fc.uniqueArray(packageRecordArb, { selector: (entry) => entry.name, maxLength: 8 }), fc.string({ maxLength: 12 }), (packages, query) => {
        const actual = filterRegistryPackages(packages, query);
        const lower = query.toLowerCase();
        const expected = !query
          ? packages
          : packages.filter((pkg) =>
            pkg.name.toLowerCase().includes(lower)
            || pkg.description.toLowerCase().includes(lower)
            || pkg.group.toLowerCase().includes(lower)
          );

        expect(actual).toEqual(expected);
      }),
      { numRuns: 100 }
    );
  });

  test('filterRegistryPackages returns all packages when query is empty', async () => {
    await fc.assert(
      fc.property(fc.uniqueArray(packageRecordArb, { selector: (entry) => entry.name, maxLength: 8 }), (packages) => {
        expect(filterRegistryPackages(packages, '')).toEqual(packages);
      }),
      { numRuns: 100 }
    );
  });

  test('list and search JSON outputs round-trip through JSON.parse', async () => {
    await fc.assert(
      fc.property(
        fc.uniqueArray(packageRecordArb, { selector: (entry) => entry.name, maxLength: 8 }),
        fc.string({ maxLength: 12 }),
        (packages, query) => {
          const listPayload = { packages, total: packages.length };
          printSceneListSummary({ json: true }, listPayload);
          expect(JSON.parse(console.log.mock.calls.pop()[0])).toEqual(listPayload);

          const searchPayload = { query, packages, total: packages.length };
          printSceneSearchSummary({ json: true }, searchPayload);
          expect(JSON.parse(console.log.mock.calls.pop()[0])).toEqual(searchPayload);
        }
      ),
      { numRuns: 100 }
    );
  });
});
