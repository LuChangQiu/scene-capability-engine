const path = require('path');
const zlib = require('zlib');

const {
  buildPackageDiff,
  normalizeSceneDiffOptions,
  validateSceneDiffOptions,
  printSceneDiffSummary,
  runSceneDiffCommand,
  createTarBuffer
} = require('../../../lib/commands/scene');

describe('Scene diff command helpers', () => {
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

  test('buildPackageDiff categorizes added removed modified and unchanged files', () => {
    const diff = buildPackageDiff(
      [
        { relativePath: 'keep.txt', content: Buffer.from('same\nvalue\n', 'utf8') },
        { relativePath: 'remove.txt', content: Buffer.from('gone\n', 'utf8') },
        { relativePath: 'change.txt', content: Buffer.from('line1\nline2\n', 'utf8') }
      ],
      [
        { relativePath: 'keep.txt', content: Buffer.from('same\nvalue\n', 'utf8') },
        { relativePath: 'add.txt', content: Buffer.from('new\n', 'utf8') },
        { relativePath: 'change.txt', content: Buffer.from('line1\nlineX\nline3\n', 'utf8') }
      ]
    );

    expect(diff.added).toEqual(['add.txt']);
    expect(diff.removed).toEqual(['remove.txt']);
    expect(diff.unchanged).toEqual(['keep.txt']);
    expect(diff.modified).toEqual([{ path: 'change.txt', changedLines: 2 }]);
  });

  test('buildPackageDiff marks binary modifications without line counts', () => {
    const diff = buildPackageDiff(
      [{ relativePath: 'bin.dat', content: Buffer.from([0, 1, 2, 3]) }],
      [{ relativePath: 'bin.dat', content: Buffer.from([0, 1, 9, 3]) }]
    );

    expect(diff.modified).toEqual([{ path: 'bin.dat', changedLines: -1 }]);
  });

  test('normalizeSceneDiffOptions trims values and applies defaults', () => {
    expect(normalizeSceneDiffOptions({
      name: ' demo ',
      from: ' 1.0.0 ',
      to: ' 1.1.0 ',
      registry: ' custom/registry ',
      json: true,
      stat: true
    })).toEqual({
      name: 'demo',
      from: '1.0.0',
      to: '1.1.0',
      registry: 'custom/registry',
      json: true,
      stat: true
    });

    expect(normalizeSceneDiffOptions()).toEqual({
      name: undefined,
      from: undefined,
      to: undefined,
      registry: '.sce/registry',
      json: false,
      stat: false
    });
  });

  test('validateSceneDiffOptions enforces required arguments and distinct versions', () => {
    expect(validateSceneDiffOptions({})).toBe('--name is required');
    expect(validateSceneDiffOptions({ name: 'demo' })).toBe('--from is required');
    expect(validateSceneDiffOptions({ name: 'demo', from: '1.0.0' })).toBe('--to is required');
    expect(validateSceneDiffOptions({ name: 'demo', from: '1.0.0', to: '1.0.0' }))
      .toBe('--from and --to must be different versions');
    expect(validateSceneDiffOptions({ name: 'demo', from: '1.0.0', to: '1.1.0' })).toBeNull();
  });

  test('printSceneDiffSummary omits detail suffixes in stat mode', () => {
    const logs = [];
    console.log = jest.fn((...args) => logs.push(args.join(' ')));

    printSceneDiffSummary(
      { stat: true, json: false },
      {
        name: 'demo',
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        summary: { added: 1, removed: 0, modified: 1, unchanged: 0 },
        files: {
          added: ['new.txt'],
          removed: [],
          modified: [{ path: 'change.txt', changedLines: 3 }],
          unchanged: []
        }
      }
    );

    const output = logs.join('\n');
    expect(output).toContain('Scene Package Diff: demo 1.0.0');
    expect(output).toContain('+ new.txt');
    expect(output).toContain('~ change.txt');
    expect(output).not.toContain('lines changed');
    expect(output).not.toContain('binary content differs');
  });

  test('runSceneDiffCommand returns structured diff payload', async () => {
    const fromTarball = zlib.gzipSync(createTarBuffer([
      { relativePath: 'scene-package.json', content: Buffer.from('{"version":"1.0.0"}', 'utf8') },
      { relativePath: 'notes.txt', content: Buffer.from('stable', 'utf8') }
    ]));
    const toTarball = zlib.gzipSync(createTarBuffer([
      { relativePath: 'scene-package.json', content: Buffer.from('{"version":"1.1.0"}', 'utf8') },
      { relativePath: 'new.txt', content: Buffer.from('added', 'utf8') }
    ]));

    const registryRoot = path.join('/project', '.sce/registry');
    const mockFs = {
      pathExists: jest.fn().mockResolvedValue(true),
      readJson: jest.fn().mockResolvedValue({
        packages: {
          'demo-scene': {
            versions: {
              '1.0.0': { tarball: 'packages/demo-scene/1.0.0/demo-scene-1.0.0.tgz' },
              '1.1.0': { tarball: 'packages/demo-scene/1.1.0/demo-scene-1.1.0.tgz' }
            }
          }
        }
      }),
      readFile: jest.fn(async (targetPath) => {
        if (targetPath === path.join(registryRoot, 'packages/demo-scene/1.0.0/demo-scene-1.0.0.tgz')) {
          return fromTarball;
        }
        if (targetPath === path.join(registryRoot, 'packages/demo-scene/1.1.0/demo-scene-1.1.0.tgz')) {
          return toTarball;
        }
        throw new Error(`unexpected path: ${targetPath}`);
      })
    };

    const result = await runSceneDiffCommand(
      { name: 'demo-scene', from: '1.0.0', to: '1.1.0' },
      { fileSystem: mockFs, projectRoot: '/project' }
    );

    expect(result).toEqual({
      success: true,
      name: 'demo-scene',
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      summary: {
        added: 1,
        removed: 1,
        modified: 1,
        unchanged: 0
      },
      files: {
        added: ['new.txt'],
        removed: ['notes.txt'],
        modified: [{ path: 'scene-package.json', changedLines: 1 }],
        unchanged: []
      }
    });
    expect(process.exitCode).toBeUndefined();
  });

  test('runSceneDiffCommand reports validation failures through exitCode', async () => {
    const result = await runSceneDiffCommand({ name: 'demo-scene', from: '1.0.0', to: '1.0.0' });

    expect(result).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalled();
  });
});
