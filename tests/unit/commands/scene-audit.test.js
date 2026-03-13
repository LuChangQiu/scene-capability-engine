const path = require('path');
const crypto = require('crypto');

const {
  buildRegistryTarballPath,
  normalizeSceneAuditOptions,
  validateSceneAuditOptions,
  collectTgzFiles,
  computeFileIntegrity,
  printSceneAuditSummary,
  runSceneAuditCommand
} = require('../../../lib/commands/scene');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(buffer) {
  return `sha256-${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function createAuditFs({ projectRoot = '/project', registry = '.sce/registry', index, files = {} }) {
  const registryRoot = path.join(projectRoot, registry);
  const indexPath = path.join(registryRoot, 'registry-index.json');
  const fileMap = new Map();
  const directories = new Set();
  const removedPaths = [];
  const savedIndexes = [];

  function addDirectory(dirPath) {
    let current = path.normalize(dirPath);
    while (true) {
      directories.add(current);
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  function addFile(relativePath, content) {
    const absolutePath = path.normalize(path.join(registryRoot, relativePath));
    fileMap.set(absolutePath, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'));
    addDirectory(path.dirname(absolutePath));
  }

  addDirectory(registryRoot);
  addDirectory(path.join(registryRoot, 'packages'));
  for (const [relativePath, content] of Object.entries(files)) {
    addFile(relativePath, content);
  }

  const liveIndex = clone(index);
  const mockFs = {
    savedIndexes,
    removedPaths,
    pathExists: jest.fn(async (targetPath) => {
      const normalized = path.normalize(targetPath);
      return normalized === path.normalize(indexPath)
        || fileMap.has(normalized)
        || directories.has(normalized);
    }),
    readJson: jest.fn(async (targetPath) => {
      if (path.normalize(targetPath) !== path.normalize(indexPath)) {
        throw new Error(`unexpected readJson path: ${targetPath}`);
      }
      return liveIndex;
    }),
    readdir: jest.fn(async (dirPath) => {
      const normalizedDir = path.normalize(dirPath);
      const children = new Set();
      const prefix = normalizedDir.endsWith(path.sep) ? normalizedDir : `${normalizedDir}${path.sep}`;

      for (const directory of directories) {
        if (!directory.startsWith(prefix)) {
          continue;
        }
        const remainder = directory.slice(prefix.length);
        if (!remainder || remainder.includes(path.sep)) {
          continue;
        }
        children.add(remainder);
      }

      for (const filePath of fileMap.keys()) {
        if (!filePath.startsWith(prefix)) {
          continue;
        }
        const remainder = filePath.slice(prefix.length);
        if (!remainder || remainder.includes(path.sep)) {
          continue;
        }
        children.add(remainder);
      }

      return Array.from(children);
    }),
    stat: jest.fn(async (targetPath) => {
      const normalized = path.normalize(targetPath);
      return {
        isDirectory: () => directories.has(normalized),
        isFile: () => fileMap.has(normalized)
      };
    }),
    readFile: jest.fn(async (targetPath) => {
      const normalized = path.normalize(targetPath);
      if (!fileMap.has(normalized)) {
        throw new Error(`ENOENT: ${targetPath}`);
      }
      return fileMap.get(normalized);
    }),
    unlink: jest.fn(async (targetPath) => {
      const normalized = path.normalize(targetPath);
      fileMap.delete(normalized);
      removedPaths.push(normalized);
    }),
    writeJson: jest.fn(async (_targetPath, nextIndex) => {
      savedIndexes.push(clone(nextIndex));
    })
  };

  return { registryRoot, liveIndex, mockFs };
}

describe('Scene audit command helpers', () => {
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

  test('normalizeSceneAuditOptions trims values and applies defaults', () => {
    expect(normalizeSceneAuditOptions({
      registry: ' custom/registry ',
      json: true,
      fix: true
    })).toEqual({
      registry: 'custom/registry',
      json: true,
      fix: true
    });

    expect(normalizeSceneAuditOptions({})).toEqual({
      registry: '.sce/registry',
      json: false,
      fix: false
    });
  });

  test('validateSceneAuditOptions always returns null', () => {
    expect(validateSceneAuditOptions({})).toBeNull();
    expect(validateSceneAuditOptions({ registry: '.sce/custom', fix: true })).toBeNull();
  });

  test('collectTgzFiles returns all tarballs recursively', async () => {
    const { registryRoot, mockFs } = createAuditFs({
      index: { apiVersion: 'sce.scene.registry/v0.1', packages: {} },
      files: {
        'packages/demo/1.0.0/demo-1.0.0.tgz': 'demo',
        'packages/demo/1.0.0/readme.txt': 'skip',
        'packages/other/2.0.0/other-2.0.0.tgz': 'other'
      }
    });

    const files = await collectTgzFiles(path.join(registryRoot, 'packages'), mockFs);

    expect(files.map((targetPath) => targetPath.split('\\').join('/')).sort()).toEqual([
      `${registryRoot}/packages/demo/1.0.0/demo-1.0.0.tgz`.split('\\').join('/'),
      `${registryRoot}/packages/other/2.0.0/other-2.0.0.tgz`.split('\\').join('/')
    ]);
  });

  test('computeFileIntegrity returns a sha256 digest', async () => {
    const { registryRoot, mockFs } = createAuditFs({
      index: { apiVersion: 'sce.scene.registry/v0.1', packages: {} },
      files: {
        'packages/demo/1.0.0/demo-1.0.0.tgz': 'demo'
      }
    });

    const filePath = path.join(registryRoot, 'packages/demo/1.0.0/demo-1.0.0.tgz');
    expect(await computeFileIntegrity(filePath, mockFs)).toBe(sha256(Buffer.from('demo', 'utf8')));
  });

  test('runSceneAuditCommand returns zero counts for an empty registry', async () => {
    const { mockFs } = createAuditFs({
      index: { apiVersion: 'sce.scene.registry/v0.1', packages: {} }
    });

    const result = await runSceneAuditCommand({}, { fileSystem: mockFs, projectRoot: '/project' });

    expect(result.summary).toEqual({
      totalPackages: 0,
      totalVersions: 0,
      healthyVersions: 0,
      issues: 0
    });
    expect(result.missing).toEqual([]);
    expect(result.integrityMismatches).toEqual([]);
    expect(result.orphanedTarballs).toEqual([]);
    expect(result.deprecated).toEqual([]);
    expect(result.fixes).toBeNull();
  });

  test('runSceneAuditCommand reports a healthy registry correctly', async () => {
    const versionAPath = buildRegistryTarballPath('demo-scene', '1.0.0');
    const versionBPath = buildRegistryTarballPath('demo-scene', '1.1.0');
    const versionABuffer = Buffer.from('version-a', 'utf8');
    const versionBBuffer = Buffer.from('version-b', 'utf8');
    const { mockFs } = createAuditFs({
      index: {
        apiVersion: 'sce.scene.registry/v0.1',
        packages: {
          'demo-scene': {
            versions: {
              '1.0.0': { tarball: versionAPath, integrity: sha256(versionABuffer) },
              '1.1.0': { tarball: versionBPath, integrity: sha256(versionBBuffer) }
            }
          }
        }
      },
      files: {
        [versionAPath]: versionABuffer,
        [versionBPath]: versionBBuffer
      }
    });

    const result = await runSceneAuditCommand({}, { fileSystem: mockFs, projectRoot: '/project' });

    expect(result.summary).toEqual({
      totalPackages: 1,
      totalVersions: 2,
      healthyVersions: 2,
      issues: 0
    });
  });

  test('runSceneAuditCommand detects missing tarballs, integrity mismatches, orphans, and deprecated versions', async () => {
    const missingPath = buildRegistryTarballPath('demo-scene', '1.0.0');
    const mismatchPath = buildRegistryTarballPath('demo-scene', '1.1.0');
    const mismatchBuffer = Buffer.from('actual-mismatch', 'utf8');
    const orphanPath = 'packages/orphan-scene/0.1.0/orphan-scene-0.1.0.tgz';
    const { mockFs } = createAuditFs({
      index: {
        apiVersion: 'sce.scene.registry/v0.1',
        packages: {
          'demo-scene': {
            versions: {
              '1.0.0': { tarball: missingPath, integrity: 'sha256-missing' },
              '1.1.0': { tarball: mismatchPath, integrity: 'sha256-expected', deprecated: 'use 2.0.0' }
            }
          }
        }
      },
      files: {
        [mismatchPath]: mismatchBuffer,
        [orphanPath]: Buffer.from('orphan', 'utf8')
      }
    });

    const result = await runSceneAuditCommand({}, { fileSystem: mockFs, projectRoot: '/project' });

    expect(result.missing).toEqual([
      { package: 'demo-scene', version: '1.0.0', tarball: missingPath }
    ]);
    expect(result.integrityMismatches).toEqual([
      {
        package: 'demo-scene',
        version: '1.1.0',
        expected: 'sha256-expected',
        actual: sha256(mismatchBuffer)
      }
    ]);
    expect(result.orphanedTarballs).toEqual([orphanPath]);
    expect(result.deprecated).toEqual([
      { package: 'demo-scene', version: '1.1.0', message: 'use 2.0.0' }
    ]);
    expect(result.summary.issues).toBe(3);
  });

  test('runSceneAuditCommand fix mode removes orphaned tarballs and missing entries', async () => {
    const missingPath = buildRegistryTarballPath('demo-scene', '1.0.0');
    const healthyPath = buildRegistryTarballPath('demo-scene', '1.1.0');
    const healthyBuffer = Buffer.from('healthy', 'utf8');
    const orphanPath = 'packages/orphan-scene/0.1.0/orphan-scene-0.1.0.tgz';
    const { mockFs, liveIndex } = createAuditFs({
      index: {
        apiVersion: 'sce.scene.registry/v0.1',
        packages: {
          'demo-scene': {
            versions: {
              '1.0.0': { tarball: missingPath, integrity: 'sha256-missing' },
              '1.1.0': { tarball: healthyPath, integrity: sha256(healthyBuffer) }
            }
          }
        }
      },
      files: {
        [healthyPath]: healthyBuffer,
        [orphanPath]: Buffer.from('orphan', 'utf8')
      }
    });

    const result = await runSceneAuditCommand(
      { fix: true },
      { fileSystem: mockFs, projectRoot: '/project' }
    );

    expect(result.fixes).toEqual({ orphansRemoved: 1, entriesRemoved: 1 });
    expect(mockFs.removedPaths).toEqual([path.normalize(path.join('/project', '.sce/registry', orphanPath))]);
    expect(liveIndex.packages['demo-scene'].versions).toEqual({
      '1.1.0': { tarball: healthyPath, integrity: sha256(healthyBuffer) }
    });
    expect(mockFs.writeJson).toHaveBeenCalled();
  });

  test('printSceneAuditSummary outputs JSON payloads unchanged', () => {
    const logs = [];
    console.log = jest.fn((value) => logs.push(value));

    const payload = {
      success: true,
      registry: '.sce/registry',
      summary: { totalPackages: 1, totalVersions: 1, healthyVersions: 1, issues: 0 },
      missing: [],
      integrityMismatches: [],
      orphanedTarballs: [],
      deprecated: [],
      fixes: null
    };

    printSceneAuditSummary({ json: true }, payload);

    expect(JSON.parse(logs[0])).toEqual(payload);
  });
});
