const {
  buildRegistryPackageList,
  filterRegistryPackages,
  normalizeSceneListOptions,
  validateSceneListOptions,
  runSceneListCommand,
  printSceneListSummary,
  normalizeSceneSearchOptions,
  validateSceneSearchOptions,
  runSceneSearchCommand,
  printSceneSearchSummary
} = require('../../../lib/commands/scene');

describe('Scene registry query helpers', () => {
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

  test('buildRegistryPackageList maps fields and sorts by package name', () => {
    const result = buildRegistryPackageList({
      zebra: {
        name: 'zebra',
        group: 'sce.scene',
        description: 'Last package',
        latest: '2.0.0',
        versions: { '1.0.0': {}, '2.0.0': {} }
      },
      alpha: {
        name: 'alpha',
        group: 'sce.scene',
        description: 'First package',
        latest: '1.0.0',
        versions: { '1.0.0': {} }
      }
    });

    expect(result).toEqual([
      {
        name: 'alpha',
        group: 'sce.scene',
        description: 'First package',
        latest: '1.0.0',
        version_count: 1
      },
      {
        name: 'zebra',
        group: 'sce.scene',
        description: 'Last package',
        latest: '2.0.0',
        version_count: 2
      }
    ]);
  });

  test('filterRegistryPackages matches query case-insensitively across name description and group', () => {
    const packages = [
      { name: 'alpha', description: 'ERP workflow', group: 'sce.scene', latest: '1.0.0', version_count: 1 },
      { name: 'beta', description: 'robot playbook', group: 'sce.robot', latest: '1.0.0', version_count: 1 }
    ];

    expect(filterRegistryPackages(packages, 'erp')).toEqual([packages[0]]);
    expect(filterRegistryPackages(packages, 'ROBOT')).toEqual([packages[1]]);
    expect(filterRegistryPackages(packages, 'sce.scene')).toEqual([packages[0]]);
    expect(filterRegistryPackages(packages, 'missing')).toEqual([]);
    expect(filterRegistryPackages(packages, '')).toEqual(packages);
  });

  test('normalizeSceneListOptions and validateSceneListOptions handle defaults', () => {
    expect(normalizeSceneListOptions({ registry: ' .sce/custom ', json: true })).toEqual({
      registry: '.sce/custom',
      json: true
    });
    expect(normalizeSceneListOptions({})).toEqual({
      registry: '.sce/registry',
      json: false
    });
    expect(validateSceneListOptions({})).toBeNull();
  });

  test('runSceneListCommand returns list payload from registry index', async () => {
    const fileSystem = {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockResolvedValue({
        packages: {
          beta: { name: 'beta', group: 'sce.scene', description: 'Beta', latest: '2.0.0', versions: { '1.0.0': {}, '2.0.0': {} } },
          alpha: { name: 'alpha', group: 'sce.scene', description: 'Alpha', latest: '1.0.0', versions: { '1.0.0': {} } }
        }
      })
    };

    const result = await runSceneListCommand({ json: true }, { projectRoot: '/project', fileSystem });

    expect(result).toEqual({
      packages: [
        { name: 'alpha', group: 'sce.scene', description: 'Alpha', latest: '1.0.0', version_count: 1 },
        { name: 'beta', group: 'sce.scene', description: 'Beta', latest: '2.0.0', version_count: 2 }
      ],
      total: 2
    });
  });

  test('printSceneListSummary handles empty and json outputs', () => {
    const logs = [];
    console.log = jest.fn((...args) => logs.push(args.join(' ')));

    printSceneListSummary({ json: false }, { packages: [], total: 0 });
    expect(logs[0]).toContain('No packages found');

    logs.length = 0;
    printSceneListSummary({ json: true }, { packages: [{ name: 'alpha' }], total: 1 });
    expect(JSON.parse(logs[0])).toEqual({ packages: [{ name: 'alpha' }], total: 1 });
  });

  test('normalizeSceneSearchOptions and validateSceneSearchOptions handle defaults', () => {
    expect(normalizeSceneSearchOptions({ query: ' erp ', registry: ' .sce/custom ', json: true })).toEqual({
      query: 'erp',
      registry: '.sce/custom',
      json: true
    });
    expect(normalizeSceneSearchOptions({})).toEqual({
      query: '',
      registry: '.sce/registry',
      json: false
    });
    expect(validateSceneSearchOptions({})).toBeNull();
  });

  test('runSceneSearchCommand filters packages and supports empty query', async () => {
    const fileSystem = {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockResolvedValue({
        packages: {
          alpha: { name: 'alpha', group: 'sce.scene', description: 'ERP query', latest: '1.0.0', versions: { '1.0.0': {} } },
          beta: { name: 'beta', group: 'sce.robot', description: 'Robot flow', latest: '2.0.0', versions: { '1.0.0': {}, '2.0.0': {} } }
        }
      })
    };

    const filtered = await runSceneSearchCommand({ query: 'robot', json: true }, { projectRoot: '/project', fileSystem });
    expect(filtered).toEqual({
      query: 'robot',
      packages: [
        { name: 'beta', group: 'sce.robot', description: 'Robot flow', latest: '2.0.0', version_count: 2 }
      ],
      total: 1
    });

    const all = await runSceneSearchCommand({ query: '', json: true }, { projectRoot: '/project', fileSystem });
    expect(all.total).toBe(2);
  });

  test('printSceneSearchSummary handles no matches and json output', () => {
    const logs = [];
    console.log = jest.fn((...args) => logs.push(args.join(' ')));

    printSceneSearchSummary({ json: false }, { query: 'missing', packages: [], total: 0 });
    expect(logs[0]).toContain("No packages matching 'missing'");

    logs.length = 0;
    printSceneSearchSummary({ json: true }, { query: 'erp', packages: [{ name: 'alpha' }], total: 1 });
    expect(JSON.parse(logs[0])).toEqual({ query: 'erp', packages: [{ name: 'alpha' }], total: 1 });
  });
});
