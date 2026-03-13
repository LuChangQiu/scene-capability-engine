'use strict';

const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const {
  createTarBuffer,
  buildRegistryTarballPath
} = require('../../../lib/commands/scene');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createTarballBundle(files) {
  const normalizedFiles = files.map((file) => ({
    relativePath: file.relativePath,
    content: Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content), 'utf8')
  }));
  const tarball = zlib.gzipSync(createTarBuffer(normalizedFiles));
  const integrity = `sha256-${crypto.createHash('sha256').update(tarball).digest('hex')}`;

  return {
    tarball,
    integrity,
    files: normalizedFiles
  };
}

function buildRegistryIndex(versions, latest, packageName = 'demo-scene') {
  return {
    apiVersion: 'sce.scene.registry/v0.1',
    packages: {
      [packageName]: {
        name: packageName,
        group: 'sce.scene',
        description: 'Demo package',
        latest,
        versions
      }
    }
  };
}

function createInstallFs({
  projectRoot = '/project',
  registry = '.sce/registry',
  index,
  tarballs = {},
  existingPaths = []
}) {
  const registryRoot = path.isAbsolute(registry)
    ? registry
    : path.join(projectRoot, registry);
  const indexPath = path.normalize(path.join(registryRoot, 'registry-index.json'));
  const tarballMap = new Map(
    Object.entries(tarballs).map(([targetPath, buffer]) => [path.normalize(targetPath), buffer])
  );
  const pathSet = new Set(existingPaths.map((targetPath) => path.normalize(targetPath)));
  const ensuredDirs = new Set();
  const writtenFiles = new Map();

  pathSet.add(indexPath);
  for (const tarballPath of tarballMap.keys()) {
    pathSet.add(tarballPath);
  }

  function rememberParents(targetPath) {
    let current = path.normalize(targetPath);
    while (current && !ensuredDirs.has(current)) {
      ensuredDirs.add(current);
      const parent = path.dirname(current);
      if (!parent || parent === current) {
        break;
      }
      current = parent;
    }
  }

  return {
    registryRoot,
    indexPath,
    writtenFiles,
    ensuredDirs,
    fileSystem: {
      pathExists: jest.fn(async (targetPath) => {
        const normalized = path.normalize(targetPath);
        return pathSet.has(normalized)
          || ensuredDirs.has(normalized)
          || writtenFiles.has(normalized);
      }),
      pathExistsSync: jest.fn((targetPath) => {
        const normalized = path.normalize(targetPath);
        return pathSet.has(normalized)
          || ensuredDirs.has(normalized)
          || writtenFiles.has(normalized);
      }),
      readJson: jest.fn(async (targetPath) => {
        const normalized = path.normalize(targetPath);
        if (normalized !== indexPath) {
          throw new Error(`unexpected JSON path: ${targetPath}`);
        }
        return clone(index);
      }),
      readFile: jest.fn(async (targetPath) => {
        const normalized = path.normalize(targetPath);
        if (tarballMap.has(normalized)) {
          return tarballMap.get(normalized);
        }
        if (writtenFiles.has(normalized)) {
          return writtenFiles.get(normalized);
        }
        throw new Error(`unexpected file path: ${targetPath}`);
      }),
      ensureDirSync: jest.fn((targetPath) => {
        rememberParents(targetPath);
      }),
      writeFileSync: jest.fn((targetPath, content) => {
        const normalized = path.normalize(targetPath);
        rememberParents(path.dirname(normalized));
        writtenFiles.set(
          normalized,
          Buffer.isBuffer(content) ? Buffer.from(content) : Buffer.from(String(content), 'utf8')
        );
        pathSet.add(normalized);
      })
    }
  };
}

function buildTarballPath(registryRoot, packageName, version) {
  return path.join(registryRoot, buildRegistryTarballPath(packageName, version));
}

module.exports = {
  clone,
  createTarballBundle,
  buildRegistryIndex,
  createInstallFs,
  buildTarballPath
};
