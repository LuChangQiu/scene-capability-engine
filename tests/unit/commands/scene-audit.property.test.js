const path = require('path');
const crypto = require('crypto');
const fc = require('fast-check');

const {
  buildRegistryTarballPath,
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
  let savedIndex = null;

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
    removedPaths,
    getSavedIndex: () => savedIndex,
    pathExists: jest.fn(async (targetPath) => {
      const normalized = path.normalize(targetPath);
      return normalized === path.normalize(indexPath)
        || fileMap.has(normalized)
        || directories.has(normalized);
    }),
    readJson: jest.fn(async () => liveIndex),
    readdir: jest.fn(async (dirPath) => {
      const normalizedDir = path.normalize(dirPath);
      const prefix = normalizedDir.endsWith(path.sep) ? normalizedDir : `${normalizedDir}${path.sep}`;
      const children = new Set();

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
      savedIndex = clone(nextIndex);
    })
  };

  return { mockFs, liveIndex, registryRoot };
}

const packageNameArb = fc.stringMatching(/^pkg-[a-z0-9]{1,6}$/);
const versionArb = fc
  .tuple(
    fc.integer({ min: 0, max: 3 }),
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 })
  )
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);
const messageArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,16}$/);

const versionSpecArb = fc.uniqueArray(fc.record({
  packageName: packageNameArb,
  version: versionArb,
  exists: fc.boolean(),
  matchIntegrity: fc.boolean(),
  deprecated: fc.option(messageArb, { nil: undefined })
}), {
  selector: (entry) => `${entry.packageName}@${entry.version}`,
  maxLength: 6
});

const orphanVersionArb = fc.uniqueArray(versionArb, { maxLength: 4 })
  .map((versions) => versions.map((version, index) => ({
    packageName: `orphan-${index}`,
    version
  })));

function buildScenario(versionSpecs, orphanSpecs) {
  const index = { apiVersion: 'sce.scene.registry/v0.1', packages: {} };
  const files = {};

  for (const spec of versionSpecs) {
    if (!index.packages[spec.packageName]) {
      index.packages[spec.packageName] = { versions: {} };
    }
    const tarball = buildRegistryTarballPath(spec.packageName, spec.version);
    const content = Buffer.from(`${spec.packageName}@${spec.version}`, 'utf8');
    index.packages[spec.packageName].versions[spec.version] = {
      tarball,
      integrity: spec.matchIntegrity ? sha256(content) : 'sha256-mismatch',
      ...(spec.deprecated ? { deprecated: spec.deprecated } : {})
    };
    if (spec.exists) {
      files[tarball] = content;
    }
  }

  for (const orphan of orphanSpecs) {
    files[buildRegistryTarballPath(orphan.packageName, orphan.version)] = Buffer.from(
      `${orphan.packageName}@${orphan.version}`,
      'utf8'
    );
  }

  return { index, files };
}

function sortJson(value) {
  return JSON.stringify(value.slice().sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
}

describe('Scene audit properties', () => {
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

  test('summary counts remain consistent with index contents', async () => {
    await fc.assert(
      fc.asyncProperty(versionSpecArb, orphanVersionArb, async (versionSpecs, orphanSpecs) => {
        const { index, files } = buildScenario(versionSpecs, orphanSpecs);
        const { mockFs } = createAuditFs({ index, files });

        const result = await runSceneAuditCommand({}, { fileSystem: mockFs, projectRoot: '/project' });
        const expectedPackages = new Set(versionSpecs.map((entry) => entry.packageName)).size;
        const missingCount = versionSpecs.filter((entry) => !entry.exists).length;
        const mismatchCount = versionSpecs.filter((entry) => entry.exists && !entry.matchIntegrity).length;

        expect(result.summary.totalPackages).toBe(expectedPackages);
        expect(result.summary.totalVersions).toBe(versionSpecs.length);
        expect(result.summary.healthyVersions).toBe(versionSpecs.length - missingCount - mismatchCount);
        expect(result.summary.issues).toBe(missingCount + mismatchCount + orphanSpecs.length);
      }),
      { numRuns: 100 }
    );
  });

  test('missing tarball detection is exact', async () => {
    await fc.assert(
      fc.asyncProperty(versionSpecArb, async (versionSpecs) => {
        const { index, files } = buildScenario(versionSpecs, []);
        const { mockFs } = createAuditFs({ index, files });
        const result = await runSceneAuditCommand({}, { fileSystem: mockFs, projectRoot: '/project' });
        const expectedMissing = versionSpecs
          .filter((entry) => !entry.exists)
          .map((entry) => ({
            package: entry.packageName,
            version: entry.version,
            tarball: buildRegistryTarballPath(entry.packageName, entry.version)
          }));

        expect(sortJson(result.missing)).toBe(sortJson(expectedMissing));
      }),
      { numRuns: 100 }
    );
  });

  test('integrity mismatch detection is exact', async () => {
    await fc.assert(
      fc.asyncProperty(versionSpecArb, async (versionSpecs) => {
        const { index, files } = buildScenario(versionSpecs, []);
        const { mockFs } = createAuditFs({ index, files });
        const result = await runSceneAuditCommand({}, { fileSystem: mockFs, projectRoot: '/project' });
        const expectedMismatches = versionSpecs
          .filter((entry) => entry.exists && !entry.matchIntegrity)
          .map((entry) => ({
            package: entry.packageName,
            version: entry.version,
            expected: 'sha256-mismatch',
            actual: sha256(Buffer.from(`${entry.packageName}@${entry.version}`, 'utf8'))
          }));

        expect(sortJson(result.integrityMismatches)).toBe(sortJson(expectedMismatches));
      }),
      { numRuns: 100 }
    );
  });

  test('orphaned tarball detection is exact', async () => {
    await fc.assert(
      fc.asyncProperty(versionSpecArb, orphanVersionArb, async (versionSpecs, orphanSpecs) => {
        const { index, files } = buildScenario(versionSpecs, orphanSpecs);
        const { mockFs } = createAuditFs({ index, files });
        const result = await runSceneAuditCommand({}, { fileSystem: mockFs, projectRoot: '/project' });
        const expectedOrphans = orphanSpecs.map((entry) => buildRegistryTarballPath(entry.packageName, entry.version));

        expect(result.orphanedTarballs.slice().sort()).toEqual(expectedOrphans.slice().sort());
      }),
      { numRuns: 100 }
    );
  });

  test('deprecated version reporting is exact', async () => {
    await fc.assert(
      fc.asyncProperty(versionSpecArb, async (versionSpecs) => {
        const { index, files } = buildScenario(versionSpecs, []);
        const { mockFs } = createAuditFs({ index, files });
        const result = await runSceneAuditCommand({}, { fileSystem: mockFs, projectRoot: '/project' });
        const expectedDeprecated = versionSpecs
          .filter((entry) => entry.deprecated)
          .map((entry) => ({
            package: entry.packageName,
            version: entry.version,
            message: entry.deprecated
          }));

        expect(sortJson(result.deprecated)).toBe(sortJson(expectedDeprecated));
      }),
      { numRuns: 100 }
    );
  });

  test('fix mode removes orphaned tarballs and missing-tarball entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        versionSpecArb.filter((entries) => entries.some((entry) => !entry.exists)),
        orphanVersionArb,
        async (versionSpecs, orphanSpecs) => {
          const { index, files } = buildScenario(versionSpecs, orphanSpecs);
          const { mockFs } = createAuditFs({ index, files });

          const result = await runSceneAuditCommand(
            { fix: true },
            { fileSystem: mockFs, projectRoot: '/project' }
          );

          const expectedEntriesRemoved = versionSpecs.filter((entry) => !entry.exists).length;
          expect(result.fixes.entriesRemoved).toBe(expectedEntriesRemoved);
          expect(result.fixes.orphansRemoved).toBe(orphanSpecs.length);
          expect(mockFs.removedPaths).toHaveLength(orphanSpecs.length);

          const savedIndex = mockFs.getSavedIndex();
          if (expectedEntriesRemoved > 0) {
            for (const entry of versionSpecs.filter((item) => !item.exists)) {
              expect(
                savedIndex.packages[entry.packageName]
                && savedIndex.packages[entry.packageName].versions
                && savedIndex.packages[entry.packageName].versions[entry.version]
              ).toBeFalsy();
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
